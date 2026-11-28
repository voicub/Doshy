import test from "node:test";
import assert from "node:assert/strict";
import { analyse, finish, type Watch } from "./anomaly.ts";
import { NOW, series, state, statesOf, wire, wobble, ZONE, at } from "./anomalyFixture.ts";
import { dewPoint } from "./anomalyRules.ts";
import type { Subject } from "./anomalyTypes.ts";
import type { Series } from "./anomalyWire.ts";

const sub = (entity: string, kind: Subject["kind"], name: string, unit: string, extra: Partial<Subject> = {}): Subject => ({ entity, kind, name, unit, whole: false, ...extra });
const FRIDGE = sub("sensor.fridge_power", "power", "Fridge power", "W");
const FREEZER = sub("sensor.freezer_temp", "freezer", "Freezer temperature", "°C");
const BEDROOM_RH = sub("sensor.bedroom_rh", "humidity", "Bedroom humidity", "%", { roomId: "Bedroom" });

const watch = (subjects: Subject[], entries: Record<string, Series>, over: Partial<Watch> = {}, extra: Parameters<typeof wire>[1] = {}): Watch => ({
  now: NOW, zone: ZONE, states: {}, subjects, wire: wire(entries, extra), tolerance: {}, ...over,
});
const find = (w: Watch, entity: string) => analyse(w).find((a) => a.entity === entity);

/** A fridge: 55 W at night, 63 W by day, a few watts of wobble. */
const fridge = (lift: (i: number, n: number) => number = () => 1) => {
  const noise = wobble(1, 3);
  return series((h, i, n) => (h.hod >= 7 && h.hod < 22 ? 63 : 55) * lift(i, n) + noise());
};
/** Last `hours` hours multiplied. */
const lastHours = (hours: number, by: number) => (i: number, n: number) => (i >= n - hours ? by : 1);

test("a normal fridge with its daily rhythm says nothing", () => {
  assert.equal(find(watch([FRIDGE], { [FRIDGE.entity]: fridge() }), FRIDGE.entity), undefined);
});

test("a fridge drawing 40% more for two days is found, with the size and the start", () => {
  const a = find(watch([FRIDGE], { [FRIDGE.entity]: fridge(lastHours(48, 1.4)) }), FRIDGE.entity);
  assert.ok(a);
  assert.equal(a.id, "level:sensor.fridge_power");
  assert.equal(a.severity, "notice");
  const pct = Number(/(\d+)%/.exec(a.message)?.[1]);
  assert.ok(pct >= 35 && pct <= 45, a.message);
  assert.ok(a.spark && a.spark.v.length === a.spark.lo.length && a.spark.v.length > 100);
  assert.ok(a.since >= NOW - 49 * 3_600_000 && a.since <= NOW - 40 * 3_600_000);
  assert.ok(a.ratio >= 1);
});

test("changes smaller than the minimum size never speak, however steady", () => {
  assert.equal(find(watch([FRIDGE], { [FRIDGE.entity]: fridge(lastHours(48, 1.08)) }), FRIDGE.entity), undefined);
});

test("a one-hour spike and a rise that ended hours ago are not anomalies; a rise still going is", () => {
  const spike = (i: number, n: number) => (i === n - 3 ? 3 : 1);
  assert.equal(find(watch([FRIDGE], { [FRIDGE.entity]: fridge(spike) }), FRIDGE.entity), undefined);
  const ended = (i: number, n: number) => (i >= n - 20 && i < n - 8 ? 1.5 : 1);
  assert.equal(find(watch([FRIDGE], { [FRIDGE.entity]: fridge(ended) }), FRIDGE.entity), undefined);
  assert.ok(find(watch([FRIDGE], { [FRIDGE.entity]: fridge(lastHours(8, 1.5)) }), FRIDGE.entity));
});

test("hysteresis: one hour dipping back inside does not cut a long stretch, a stretch needs hours not minutes", () => {
  const dip = (i: number, n: number) => (i >= n - 30 && i !== n - 14 ? 1.5 : 1);
  assert.ok(find(watch([FRIDGE], { [FRIDGE.entity]: fridge(dip) }), FRIDGE.entity));
  assert.equal(find(watch([FRIDGE], { [FRIDGE.entity]: fridge(lastHours(4, 1.5)) }), FRIDGE.entity), undefined);
});

test("a fridge that stopped drawing power is a warning", () => {
  const a = find(watch([FRIDGE], { [FRIDGE.entity]: fridge(lastHours(10, 0.05)) }), FRIDGE.entity);
  assert.ok(a);
  assert.equal(a.severity, "warning");
});

test("a freezer 4 degrees warmer than normal is a warning; a slow creep over days is found as a drift", () => {
  const noise = wobble(2, 0.3);
  const jump = series((_h, i, n) => -18 + (i >= n - 10 ? 4.5 : 0) + noise());
  const a = find(watch([FREEZER], { [FREEZER.entity]: jump }), FREEZER.entity);
  assert.ok(a);
  assert.equal(a.rule, "level");
  assert.equal(a.severity, "warning");
  assert.ok(a.message.includes("4") || a.message.includes("5"));

  const creep = series((_h, i, n) => -18 + Math.max(0, (i - (n - 96)) / 24) * 0.7 + noise());
  const d = find(watch([FREEZER], { [FREEZER.entity]: creep }), FREEZER.entity);
  assert.ok(d);
  assert.equal(d.rule, "drift");
});

test("humidity climbing for days is a mould risk; sitting still is not; very humid is a warning", () => {
  const noise = wobble(3, 1.5);
  const climb = (top: number) => series((_h, i, n) => 50 + Math.max(0, (i - (n - 100)) / 100) * top + noise());
  const a = find(watch([BEDROOM_RH], { [BEDROOM_RH.entity]: climb(21) }), BEDROOM_RH.entity);
  assert.ok(a);
  assert.equal(a.rule, "humidity");
  assert.ok(a.message.includes("days"));
  assert.equal(find(watch([BEDROOM_RH], { [BEDROOM_RH.entity]: series(() => 52 + noise()) }), BEDROOM_RH.entity), undefined);
  const wet = find(watch([BEDROOM_RH], { [BEDROOM_RH.entity]: climb(32) }), BEDROOM_RH.entity);
  assert.equal(wet?.severity, "warning");
});

test("the room's temperature turns the mould card into a dew point warning for a cool room", () => {
  const noise = wobble(4, 1);
  const humid = series((_h, i, n) => 50 + Math.max(0, (i - (n - 100)) / 100) * 21 + noise());
  const room = sub("sensor.bedroom_t", "temp", "Bedroom temperature", "°C", { roomId: "Bedroom" });
  const cool = find(watch([BEDROOM_RH, room], { [BEDROOM_RH.entity]: humid }, { states: statesOf(state(room.entity, "16")) }), BEDROOM_RH.entity);
  assert.ok(cool?.hints[0].includes("dew point"));
  assert.equal(cool?.severity, "warning");
  assert.ok(Math.abs(dewPoint(20, 50) - 9.3) < 0.2);
});

test("a weekend with more electricity than weekdays is normal; the same on a weekday is not", () => {
  const weekly = (now: number, extra: (i: number, n: number) => number = () => 0) => {
    const noise = wobble(5, 4);
    return series((h, i, n) => (h.daytype === 1 && h.hod >= 9 && h.hod < 20 ? 300 : 100) + extra(i, n) + noise(), 21, now);
  };
  const sundayNoon = at("2025-03-16", "12:00");
  assert.equal(find(watch([FRIDGE], { [FRIDGE.entity]: weekly(sundayNoon) }, { now: sundayNoon }, { to: sundayNoon }), FRIDGE.entity), undefined);
  assert.ok(find(watch([FRIDGE], { [FRIDGE.entity]: weekly(NOW, (i, n) => (i >= n - 12 ? 250 : 0)) }), FRIDGE.entity));
});

test("missing data: too little history stays quiet, gaps and a silent end never invent a deviation", () => {
  const short = series((h) => (h.hod >= 7 ? 63 : 55), 3);
  assert.equal(find(watch([FRIDGE], { [FRIDGE.entity]: short }), FRIDGE.entity), undefined);
  const noise = wobble(6, 3);
  const gappy = series((h, i) => (i % 7 === 0 ? null : (h.hod >= 7 ? 63 : 55) + noise()));
  assert.equal(find(watch([FRIDGE], { [FRIDGE.entity]: gappy }), FRIDGE.entity), undefined);
  const silentEnd = series((h, i, n) => (i >= n - 10 ? (i >= n - 5 ? null : 150) : (h.hod >= 7 ? 63 : 55) + noise()));
  assert.equal(find(watch([FRIDGE], { [FRIDGE.entity]: silentEnd }), FRIDGE.entity), undefined);
});

test("a clock change does not move a daily habit: normal before and after, an anomaly after still found", () => {
  const afterDst = at("2025-04-02", "12:00"); // the clock went forward on 30 March
  const habit = (extra: (i: number, n: number) => number = () => 0) => {
    const noise = wobble(7, 2);
    return series((h, i, n) => (h.hod >= 6 && h.hod < 9 ? 400 : h.hod >= 18 && h.hod < 23 ? 250 : 80) + extra(i, n) + noise(), 21, afterDst);
  };
  const w = (s: Series) => watch([FRIDGE], { [FRIDGE.entity]: s }, { now: afterDst }, { to: afterDst });
  assert.equal(find(w(habit()), FRIDGE.entity), undefined);
  assert.ok(find(w(habit((i, n) => (i >= n - 14 ? 90 : 0))), FRIDGE.entity));
});

test("standby power at night: both of the last two nights above the usual, not one", () => {
  const HOME = sub("sensor.house_power", "power", "House power", "W", { whole: true });
  const noise = wobble(8, 3);
  const home = (nights: number) =>
    series((h, i, n) => {
      const night = h.hod >= 1 && h.hod < 5;
      const recentNight = night && i >= n - 24 * nights - 12;
      return night ? (recentNight ? 140 : 82) + noise() : 400 + noise() * 10;
    });
  const two = find(watch([HOME], { [HOME.entity]: home(2) }), HOME.entity);
  assert.ok(two);
  assert.equal(two.rule, "standby");
  assert.equal(find(watch([HOME], { [HOME.entity]: home(0) }), HOME.entity), undefined);
});

test("water flowing for hours in the small hours is a leak warning, once-off flushes and nightly irrigation are not", () => {
  const METER = sub("sensor.water_meter", "water_meter", "Water meter", "m³");
  const meter = (flowing: (h: { hod: number }, i: number, n: number) => boolean) => {
    let total = 100;
    return series((h, i, n) => {
      if (flowing(h, i, n)) total += 0.012;
      else if (i % 24 === 8) total += 0.05;
      return total;
    });
  };
  const lastNight = (h: { hod: number }, i: number, n: number) => h.hod >= 1 && h.hod < 5 && i >= n - 24;
  const leak = find(watch([METER], { [METER.entity]: meter(lastNight) }), METER.entity);
  assert.ok(leak);
  assert.equal(leak.severity, "warning");
  assert.equal(leak.rule, "water_night");
  assert.equal(find(watch([METER], { [METER.entity]: meter((h, i, n) => h.hod === 2 && i >= n - 24) }), METER.entity), undefined);
  assert.equal(find(watch([METER], { [METER.entity]: meter((h) => h.hod >= 1 && h.hod < 5) }), METER.entity), undefined);
});

test("live rules: low battery, unavailable for a day, a window open with the heating on, the garage open at night, a sensor gone quiet", () => {
  const MOTION_BAT = sub("sensor.hall_motion_battery", "battery", "Hall motion battery", "%");
  const DEAD = sub("sensor.attic_temp", "temp", "Attic temperature", "°C");
  const WIN = sub("binary_sensor.bedroom_window", "window", "Bedroom window", "", { roomId: "Bedroom", roomName: "Bedroom" });
  const HEAT = sub("climate.bedroom", "climate", "Bedroom heating", "", { roomId: "Bedroom" });
  const GARAGE = sub("cover.garage", "garage", "Garage door", "");
  const night = at("2025-03-19", "23:40");
  const states = statesOf(
    state(MOTION_BAT.entity, "8", {}, 600, night),
    state(DEAD.entity, "unavailable", {}, 26 * 60, night),
    state(WIN.entity, "on", {}, 40, night),
    state(HEAT.entity, "heat", { hvac_action: "heating" }, 300, night),
    state(GARAGE.entity, "open", {}, 30, night),
  );
  const found = analyse({ now: night, zone: ZONE, states, subjects: [MOTION_BAT, DEAD, WIN, HEAT, GARAGE], wire: null, tolerance: {} });
  assert.deepEqual(found.map((a) => a.rule).sort(), ["battery", "garage_night", "unavailable", "window_heating"]);
  assert.ok(found.find((a) => a.rule === "unavailable")?.message.includes("26 hours"));
  assert.ok(found.find((a) => a.rule === "window_heating")?.message.includes("40 minutes"));

  const midday = at("2025-03-19", "13:00");
  const calm = analyse({ now: midday, zone: ZONE, states: statesOf(state(GARAGE.entity, "open", {}, 30, midday), state(WIN.entity, "on", {}, 40, midday), state(HEAT.entity, "off", { hvac_action: "idle" }, 300, midday), state(MOTION_BAT.entity, "80", {}, 0, midday)), subjects: [MOTION_BAT, WIN, HEAT, GARAGE], wire: null, tolerance: {} });
  assert.deepEqual(calm, []);

  const w = watch([DEAD], { [DEAD.entity]: series((_h, i) => 20 + (i % 9)) }, { states: statesOf(state(DEAD.entity, "21")) }, { seen: { [DEAD.entity]: NOW - 26 * 3_600_000 } });
  assert.ok(analyse(w).some((a) => a.rule === "stale" && a.message.includes("26 hours")));
});

test("This is normal: a wider tolerance silences a deviation of that size, but not a much bigger one", () => {
  const w = (lift: number, tol: number) => watch([FRIDGE], { [FRIDGE.entity]: fridge(lastHours(48, lift)) }, { tolerance: { [FRIDGE.entity]: tol } });
  assert.ok(find(w(1.4, 1), FRIDGE.entity));
  assert.equal(find(w(1.4, 2), FRIDGE.entity), undefined);
  assert.ok(find(w(2.5, 2), FRIDGE.entity));
});

test("a sensor in Fahrenheit is judged the same and told back in Fahrenheit", () => {
  const f = sub("sensor.freezer_f", "freezer", "Freezer temperature", "°F");
  const noise = wobble(9, 0.5);
  const a = find(watch([f], { [f.entity]: series((_h, i, n) => 0 + (i >= n - 10 ? 8 : 0) + noise()) }), f.entity);
  assert.ok(a?.message.includes("°F"));
  assert.ok(/\b(7|8|9)\b/.test(a?.message ?? ""));
});

test("one card per sensor, the most serious first", () => {
  const w = watch([FRIDGE], { [FRIDGE.entity]: fridge(lastHours(48, 1.4)) }, { states: statesOf(state(FRIDGE.entity, "unavailable", {}, 9 * 60)) });
  assert.equal(analyse(w).length, 1);
  const list = finish([
    { id: "battery:sensor.a", rule: "battery", entity: "sensor.a", name: "a", severity: "notice", title: "", message: "", hints: [], since: 5, teachable: false, ratio: 1 },
    { id: "water_night:sensor.b", rule: "water_night", entity: "sensor.b", name: "b", severity: "warning", title: "", message: "", hints: [], since: 1, teachable: true, ratio: 1 },
  ]);
  assert.deepEqual(list.map((a) => a.entity), ["sensor.b", "sensor.a"]);
});

test("the same history always gives the same findings", () => {
  const w = () => watch([FRIDGE, FREEZER], { [FRIDGE.entity]: fridge(lastHours(48, 1.4)), [FREEZER.entity]: series(() => -18) });
  assert.deepEqual(analyse(w()), analyse(w()));
});
