import test from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, ZONE, anchor, at, changes, daysBefore, merge, noon, seeded, type Day } from "./routinesFixture.ts";
import { MAX_SUGGESTIONS, detectRoutines, hashId, judge, type DetectInput, type RoutineSuggestion, type Suggestion } from "./routines.ts";
import { dayBefore, minutesOf } from "./routinesTime.ts";
import { sunEventNear } from "./routinesSun.ts";
import type { ChangeEvent, Covered } from "./routinesWire.ts";
import { WEEKDAYS, WEEKEND } from "./weekdays.ts";

const TODAY = "2026-11-20"; // a Friday
const NOW = noon(TODAY);
const LAT = 44.43;
const LON = 26.1;

/** A finder input over `days` days of the given devices (plus the anchor sensor that gives the history its start). */
function input(entities: Record<string, ChangeEvent[]>, days = 21, extra: Partial<DetectInput> = {}): DetectInput {
  const from = NOW - (days + 2) * DAY_MS;
  return { entities: { "binary_sensor.anchor": anchor(from, NOW), ...entities }, from, to: NOW, now: NOW, windowDays: days, zone: ZONE, lat: LAT, lon: LON, ...extra };
}

const routines = (s: Suggestion[]): RoutineSuggestion[] => s.filter((x): x is RoutineSuggestion => x.kind === "routine");
const minuteOf = (s: RoutineSuggestion) => (s.when.kind === "clock" ? (minutesOf(s.when.time) ?? -1) : NaN);
const lightPair = (days: Day[], off: string, jitter: number[] = [0]) => merge(changes(days, "18:00", "on"), changes(days, off, "off", jitter));

test("a clean nightly switch-off becomes one suggestion at about that time, every night", () => {
  const days = daysBefore(TODAY, 21);
  const out = routines(detectRoutines(input({ "light.hall": lightPair(days, "23:10", [-4, 0, 3, 5, -2, 1, 0]) })));
  assert.equal(out.length, 1);
  const [s] = out;
  assert.deepEqual(s.action, { verb: "turn_off" });
  assert.equal(s.when.kind, "clock");
  assert.ok(Math.abs(minuteOf(s) - (23 * 60 + 10)) <= 5, `time ${JSON.stringify(s.when)}`);
  assert.equal(s.when.days.length, 7);
  assert.ok(s.support.n >= 19 && s.support.of <= 21 && s.support.n <= s.support.of, JSON.stringify(s.support));
  assert.ok(s.confidence > 0.8);
  assert.equal(s.strip.length, 14);
  assert.ok(s.strip.every((c) => c === "hit"));
  assert.ok(s.examples.length === 5 && s.examples[0].day === dayBefore(TODAY, 1).day);
});

test("random switching all over the day gives nothing", () => {
  const rnd = seeded(7);
  const days = daysBefore(TODAY, 21);
  const events: ChangeEvent[] = [];
  for (const d of days) {
    for (let k = 0; k < 3; k++) {
      const on = at(d.day, "06:00") + Math.floor(rnd() * 16 * 3_600_000);
      events.push([on, "on"], [on + 20 * 60_000 + Math.floor(rnd() * 3 * 3_600_000), "off"]);
    }
  }
  assert.deepEqual(detectRoutines(input({ "light.hall": merge(events) })), []);
});

test("too few occurrences give nothing", () => {
  const days = daysBefore(TODAY, 21).slice(-4);
  assert.deepEqual(detectRoutines(input({ "light.hall": lightPair(days, "23:10") })), []);
});

test("a habit seen on half the nights is not enough", () => {
  const days = daysBefore(TODAY, 20).filter((_, i) => i % 2 === 0);
  assert.deepEqual(detectRoutines(input({ "light.hall": lightPair(days, "23:10") }, 21)), []);
});

test("weekdays and the weekend at different times are two suggestions", () => {
  const days = daysBefore(TODAY, 28);
  const week = days.filter((d) => !["sat", "sun"].includes(d.weekday));
  const end = days.filter((d) => ["sat", "sun"].includes(d.weekday));
  const cover = merge(changes(week, "07:00", "open", [-3, 2, 0, 4, -1]), changes(end, "09:30", "open", [-5, 3]), changes(days, "21:00", "closed"));
  const out = routines(detectRoutines(input({ "cover.bedroom": cover }, 28))).filter((s) => s.action.verb === "open");
  assert.equal(out.length, 2);
  const wk = out.find((s) => s.when.days.length === 5);
  const we = out.find((s) => s.when.days.length === 2);
  assert.ok(wk && we);
  assert.deepEqual(wk.when.days, [...WEEKDAYS]);
  assert.deepEqual(we.when.days, [...WEEKEND]);
  assert.ok(Math.abs(minuteOf(wk) - 420) <= 5);
  assert.ok(Math.abs(minuteOf(we) - 570) <= 5);
  assert.notEqual(wk.id, we.id, "told apart even in the same part of the day");
});

test("a weekday-only habit is not offered as every day", () => {
  const days = daysBefore(TODAY, 28);
  const week = days.filter((d) => !["sat", "sun"].includes(d.weekday));
  const out = routines(detectRoutines(input({ "light.office": merge(changes(week, "08:30", "on", [-3, 2, 4]), changes(days, "18:30", "off", [0, 8, -6])) }, 28))).filter((s) => s.action.verb === "turn_on");
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].when.days, [...WEEKDAYS]);
});

test("a clock change does not move a habit that stays at the same wall-clock time", () => {
  // Romania left summer time on 2026-10-25: the instants shift an hour, the wall clock does not
  const today = "2026-11-12";
  const days = daysBefore(today, 28);
  assert.ok(days.some((d) => d.day < "2026-10-25") && days.some((d) => d.day > "2026-10-25"));
  const now = noon(today);
  const from = now - 30 * DAY_MS;
  const light = merge(changes(days, "18:00", "on"), changes(days, "23:10", "off", [-3, 0, 4]));
  const out = routines(detectRoutines({ entities: { "binary_sensor.anchor": anchor(from, now), "light.hall": light }, from, to: now, now, windowDays: 28, zone: ZONE, lat: LAT, lon: LON }));
  const off = out.find((s) => s.action.verb === "turn_off");
  assert.ok(off && Math.abs(minuteOf(off) - 1390) <= 5, JSON.stringify(off?.when));
});

test("23:55 and 00:05 are the same habit", () => {
  const days = daysBefore(TODAY, 21);
  // half the nights the light goes off at 23:55, the other half at 00:05 of the next day
  const early = days.filter((_, i) => i % 2);
  const late = days.filter((_, i) => !(i % 2)).map((d) => ({ day: dayBefore(d.day, -1).day }));
  const out = routines(detectRoutines(input({ "light.hall": merge(changes(days, "18:00", "on"), changes(early, "23:55", "off"), changes(late, "00:05", "off")) })));
  const off = out.find((s) => s.action.verb === "turn_off");
  assert.ok(off, "found across midnight");
  const m = minuteOf(off);
  assert.ok(m >= 1435 || m <= 5, JSON.stringify(off.when));
  assert.ok(off.support.n >= 17);
});

test("curtains closed with the sunset are found as sunset, not as a clock time", () => {
  const today = "2026-10-12"; // the sunset moves about two minutes a day here
  const days = daysBefore(today, 30);
  const now = noon(today);
  const from = now - 32 * DAY_MS;
  const close: ChangeEvent[] = days.map((d, i): ChangeEvent => {
    const sunset = sunEventNear(at(d.day, "17:00"), LAT, LON, "sunset");
    assert.ok(sunset !== null);
    return [sunset + (5 + [-3, 0, 4, 1][i % 4]) * 60_000, "closed"];
  });
  const open = changes(days, "08:00", "open", [0, 20, -15, 30]);
  const out = routines(detectRoutines({ entities: { "binary_sensor.anchor": anchor(from, now), "cover.living": merge(close, open) }, from, to: now, now, windowDays: 30, zone: ZONE, lat: LAT, lon: LON }));
  const s = out.find((x) => x.action.verb === "close");
  assert.ok(s, "found");
  assert.equal(s.when.kind, "sun");
  assert.ok(s.when.kind === "sun" && s.when.event === "sunset" && Math.abs(s.when.offset - 5) <= 5, JSON.stringify(s.when));
});

test("when the sunset barely moves, a sun routine still wins if it is twice as tight as the clock, and a fixed clock habit stays a clock habit", () => {
  const today = "2026-11-27"; // the sunset moves under a minute a day: the clock window still holds every evening
  const days = daysBefore(today, 21);
  const now = noon(today);
  const from = now - 23 * DAY_MS;
  const sunsetClose: ChangeEvent[] = days.map((d, i): ChangeEvent => [(sunEventNear(at(d.day, "17:00"), LAT, LON, "sunset") as number) + (5 + [-3, 0, 3][i % 3]) * 60_000, "closed"]);
  const clockClose = merge(changes(days, "17:05", "closed", [-3, 0, 4, 1, -2, 3]), changes(days, "08:00", "open", [0, 20, -15, 30]));
  const run = (entities: Record<string, ChangeEvent[]>) => routines(detectRoutines({ entities: { "binary_sensor.anchor": anchor(from, now), ...entities }, from, to: now, now, windowDays: 21, zone: ZONE, lat: LAT, lon: LON })).find((s) => s.action.verb === "close");
  assert.equal(run({ "cover.living": merge(sunsetClose, changes(days, "08:00", "open", [0, 20, -15, 30])) })?.when.kind, "sun");
  assert.equal(run({ "cover.living": clockClose })?.when.kind, "clock");
});

test("without the home's place the same evenings are a clock time or nothing, never a sun routine", () => {
  const today = "2026-10-12";
  const days = daysBefore(today, 30);
  const now = noon(today);
  const from = now - 32 * DAY_MS;
  const close: ChangeEvent[] = days.map((d): ChangeEvent => [sunEventNear(at(d.day, "17:00"), LAT, LON, "sunset") as number, "closed"]);
  const out = routines(detectRoutines({ entities: { "binary_sensor.anchor": anchor(from, now), "cover.living": merge(close, changes(days, "08:00", "open")) }, from, to: now, now, windowDays: 30, zone: ZONE }));
  assert.ok(out.every((s) => s.when.kind === "clock"));
});

test("opposite actions around the same time on one device cancel each other", () => {
  const days = daysBefore(TODAY, 21);
  assert.deepEqual(detectRoutines(input({ "light.hall": merge(changes(days, "18:00", "on"), changes(days, "18:10", "off")) })), []);
});

test("a pattern that exact is a schedule, not a person", () => {
  const days = daysBefore(TODAY, 21);
  const exact = merge(changes(days, "18:00:00", "on"), changes(days, "23:00:01", "off"));
  assert.deepEqual(detectRoutines(input({ "light.hall": exact })), []);
});

test("locks, alarms and sensors are never suggested", () => {
  const days = daysBefore(TODAY, 21);
  const lock = merge(changes(days, "08:00", "unlocked"), changes(days, "22:00", "locked"));
  const sensor = merge(changes(days, "08:00", "on"), changes(days, "22:00", "off"));
  assert.deepEqual(detectRoutines(input({ "lock.front": lock, "binary_sensor.door": sensor, "alarm_control_panel.home": merge(changes(days, "23:00", "armed_night"), changes(days, "07:00", "disarmed")) })), []);
});

test("an existing automation at about the same time covers it; one at another time does not", () => {
  const days = daysBefore(TODAY, 21);
  const entities = { "light.hall": lightPair(days, "23:10", [-3, 0, 3]) };
  const cover = (min: number): Covered => ({ entity: "light.hall", verbs: ["turn_off"], at: [min], sun: [], sensors: [] });
  assert.equal(detectRoutines(input(entities, 21, { covers: [cover(23 * 60 + 25)] })).length, 0);
  assert.equal(detectRoutines(input(entities, 21, { covers: [cover(6 * 60)] })).length, 1);
  assert.equal(detectRoutines(input(entities, 21, { covers: [{ ...cover(23 * 60 + 10), verbs: ["turn_on"] }] })).length, 1, "another action is not the same routine");
  assert.equal(detectRoutines(input(entities, 21, { covers: [{ entity: "light.hall", verbs: ["turn_off"], at: [], sun: [], sensors: [] }] })).length, 1, "an automation with no time of its own does not cover a time");
});

test("a sun automation that already exists covers the same evenings", () => {
  const today = "2026-10-12";
  const days = daysBefore(today, 30);
  const now = noon(today);
  const from = now - 32 * DAY_MS;
  const close: ChangeEvent[] = days.map((d, i): ChangeEvent => [(sunEventNear(at(d.day, "17:00"), LAT, LON, "sunset") as number) + [-3, 0, 4][i % 3] * 60_000, "closed"]);
  const entities = { "binary_sensor.anchor": anchor(from, now), "cover.living": merge(close, changes(days, "08:00", "open", [0, 20, -15, 30])) };
  const base = { from, to: now, now, windowDays: 30, zone: ZONE, lat: LAT, lon: LON };
  const covered: Covered = { entity: "cover.living", verbs: ["close"], at: [], sun: [{ event: "sunset", offset: 0 }], sensors: [] };
  assert.ok(routines(detectRoutines({ ...base, entities })).some((s) => s.action.verb === "close"));
  assert.ok(!routines(detectRoutines({ ...base, entities, covers: [covered] })).some((s) => s.action.verb === "close"));
});

test("the same changes always give the same suggestions, in the same order, whatever the order they arrive in", () => {
  const days = daysBefore(TODAY, 21);
  const a = { "light.hall": lightPair(days, "23:10", [-3, 0, 4]), "light.desk": lightPair(days, "22:00", [2, -2, 0]), "cover.bed": merge(changes(days, "07:30", "open", [3, -4]), changes(days, "21:00", "closed")) };
  const first = detectRoutines(input(a));
  const again = detectRoutines(input(a));
  const reversed = detectRoutines(input(Object.fromEntries(Object.entries(a).reverse())));
  assert.deepEqual(again, first);
  assert.deepEqual(reversed, first);
  assert.ok(first.length >= 3);
});

test("an id survives the time drifting a little and changes with the device or the action", () => {
  const days = daysBefore(TODAY, 21);
  const idOf = (off: string, entity = "light.hall") => (routines(detectRoutines(input({ [entity]: lightPair(days, off, [-2, 0, 2]) })))[0] as RoutineSuggestion).id;
  assert.equal(idOf("23:10"), idOf("23:20"));
  assert.notEqual(idOf("23:10"), idOf("23:10", "light.desk"));
  assert.match(idOf("23:10"), /^r[0-9a-f]{8}$/);
  assert.equal(hashId("a"), hashId("a"));
  assert.notEqual(hashId("a"), hashId("b"));
});

test("a curtain that is parked half way is found as a position, and a thermostat as a set temperature", () => {
  const days = daysBefore(TODAY, 21);
  const half: ChangeEvent[] = days.flatMap((d, i): ChangeEvent[] => {
    const t = at(d.day, "13:00") + [-4, 0, 5][i % 3] * 60_000;
    return [[t - 20 * 60_000, "closed", 0], [t, "opening", 0], [t + 20_000, "open", 40]];
  });
  const heat: ChangeEvent[] = days.flatMap((d, i): ChangeEvent[] => [[at(d.day, "06:00") + [0, 4, -4][i % 3] * 60_000, "heat", 21], [at(d.day, "22:00") + [0, 3, -3][i % 3] * 60_000, "heat", 18]]);
  const out = routines(detectRoutines(input({ "cover.living": half, "climate.house": heat })));
  const pos = out.find((s) => s.entity === "cover.living");
  assert.deepEqual(pos?.action, { verb: "set_position", value: 40 });
  const night = out.find((s) => s.entity === "climate.house" && s.action.value === 18);
  assert.ok(night && night.action.verb === "set_temperature" && Math.abs(minuteOf(night) - 22 * 60) <= 5);
});

test("a thermostat tapped three times in a row is one change", () => {
  const days = daysBefore(TODAY, 21);
  const taps: ChangeEvent[] = days.flatMap((d, i): ChangeEvent[] => {
    const late = at(d.day, "22:00") + [-4, 0, 3][i % 3] * 60_000;
    return [[late, "heat", 19], [late + 20_000, "heat", 18.5], [late + 40_000, "heat", 18], [at(d.day, "07:00") + [2, -3, 0][i % 3] * 60_000, "heat", 21]];
  });
  const out = routines(detectRoutines(input({ "climate.house": merge(taps) })));
  assert.deepEqual(out.filter((s) => s.action.verb === "set_temperature").map((s) => s.action.value).sort(), [18, 21]);
});

test("a device that was unavailable and came back is not somebody pressing a button", () => {
  const days = daysBefore(TODAY, 21);
  const flaky: ChangeEvent[] = days.flatMap((d): ChangeEvent[] => [[at(d.day, "03:00"), "unavailable"], [at(d.day, "03:02"), "on"]]);
  assert.deepEqual(detectRoutines(input({ "light.garden": merge(flaky, changes(days, "03:01", "off")) })).filter((s) => s.entity === "light.garden").length, 0);
});

test("a light left on long after the last movement is suggested with the motion sensor's delay", () => {
  const days = daysBefore(TODAY, 21);
  const light: ChangeEvent[] = [[NOW - 22 * DAY_MS, "off"]]; // where it stood when the history starts
  const motion: ChangeEvent[] = [];
  days.forEach((d, i) => {
    light.push([at(d.day, "18:00"), "on"]);
    for (const [m, s] of [["18:05", "on"], ["18:20", "off"], ["19:30", "on"], ["19:40", "off"], ["20:30", "on"], ["20:35", "off"]] as const) motion.push([at(d.day, m), s]);
    // every third evening it is forgotten for hours, otherwise switched off 10 minutes after the last movement
    light.push([at(d.day, i % 3 === 0 ? "23:50" : "20:45"), "off"]);
  });
  const out = detectRoutines(input({ "light.kitchen": light, "binary_sensor.kitchen_motion": merge(motion) }, 21, { links: [{ light: "light.kitchen", motion: "binary_sensor.kitchen_motion" }] }));
  const idle = out.find((s) => s.kind === "idle");
  assert.ok(idle && idle.kind === "idle");
  assert.equal(idle.motion, "binary_sensor.kitchen_motion");
  assert.ok(idle.minutes >= 10 && idle.minutes <= 60 && idle.minutes % 5 === 0);
  assert.ok(idle.hoursLeftOn >= 3);
  assert.equal(idle.support.n, 7);
});

test("an existing 'off when nobody is moving' automation for that sensor covers the idea", () => {
  const days = daysBefore(TODAY, 21);
  const light: ChangeEvent[] = [[NOW - 22 * DAY_MS, "off"]];
  const motion: ChangeEvent[] = [];
  days.forEach((d, i) => {
    light.push([at(d.day, "18:00"), "on"], [at(d.day, i % 3 === 0 ? "23:50" : "19:00"), "off"]);
    motion.push([at(d.day, "18:05"), "on"], [at(d.day, "18:10"), "off"]);
  });
  const links = [{ light: "light.kitchen", motion: "binary_sensor.kitchen_motion" }];
  const entities = { "light.kitchen": light, "binary_sensor.kitchen_motion": merge(motion) };
  assert.equal(detectRoutines(input(entities, 21, { links })).filter((s) => s.kind === "idle").length, 1);
  const covers: Covered[] = [{ entity: "light.kitchen", verbs: ["turn_off"], at: [], sun: [], sensors: ["binary_sensor.kitchen_motion"] }];
  assert.equal(detectRoutines(input(entities, 21, { links, covers })).filter((s) => s.kind === "idle").length, 0);
});

test("only as many days as the history holds are judged", () => {
  // the recorder kept only the last 9 days: a nightly habit over those is still found, with 9 days as the base
  const days = daysBefore(TODAY, 9);
  const from = NOW - 23 * DAY_MS;
  const out = routines(detectRoutines({ entities: { "binary_sensor.anchor": anchor(NOW - 10 * DAY_MS, NOW), "light.hall": lightPair(days, "23:10", [-3, 0, 4]) }, from, to: NOW, now: NOW, windowDays: 21, zone: ZONE }));
  assert.equal(out.length, 1);
  assert.ok(out[0].support.of <= 9 && out[0].windowDays <= 9, JSON.stringify(out[0].support));
  assert.deepEqual(detectRoutines({ entities: {}, from, to: NOW, now: NOW, windowDays: 21 }), [], "no history, no ideas");
});

test("at most eight suggestions, two per device, best first", () => {
  const days = daysBefore(TODAY, 21);
  const entities: Record<string, ChangeEvent[]> = {};
  for (let i = 0; i < 12; i++) entities[`light.l${i}`] = lightPair(days, `${String(20 + (i % 4)).padStart(2, "0")}:${String(10 + i).padStart(2, "0")}`, [0, 2, -2]);
  const out = detectRoutines(input(entities));
  assert.equal(out.length, MAX_SUGGESTIONS);
  const scores = out.map((s) => s.confidence);
  assert.ok(scores.every((c, i) => i === 0 || c <= scores[i - 1] + 0.5));
  assert.ok(new Set(out.map((s) => s.id)).size === out.length);
});

test("judge: every day, weekdays, the weekend, a few particular days, or nothing", () => {
  const window = daysBefore("2026-11-29", 28).reverse(); // newest first
  const pick = (f: (w: string) => boolean) => new Set(window.filter((d) => f(d.weekday)).map((d) => d.day));
  assert.equal(judge(pick(() => true), window)?.days.length, 7);
  assert.deepEqual(judge(pick((w) => w !== "sat" && w !== "sun"), window)?.days, [...WEEKDAYS]);
  assert.deepEqual(judge(pick((w) => w === "sat" || w === "sun"), window)?.days, [...WEEKEND]);
  assert.deepEqual(judge(pick((w) => w === "tue" || w === "thu"), window)?.days, ["tue", "thu"]);
  assert.equal(judge(pick((w) => w === "tue"), window), null, "one weekday of four is too thin");
  assert.equal(judge(new Set(window.slice(0, 3).map((d) => d.day)), window), null);
});
