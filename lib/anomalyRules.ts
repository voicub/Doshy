// The rules that learn from history: each takes one sensor's hours (already in °C, W, % or litres) and the baseline learned from the weeks before, and answers with at most one
// Anomaly in plain words. Everything is deterministic and local; thresholds are per kind with a minimum absolute size, so a wobble of a watt or a tenth of a degree never speaks.
// `tol` is the sensor's tolerance factor (1 by default, raised by "This is normal"): it widens every band of that sensor. Pure.
import type { Anomaly, AnomalySeverity, Kind, RuleId, SparkLine, Subject } from "./anomalyTypes.ts";
import { calendar, dailyMedians, learn, median, theilSen, trailingRun, type Baseline, type Hour, type Run } from "./anomalyStats.ts";
import { duration, fromSI, fromSIDelta, num, since, subjectName } from "./anomalyText.ts";
import { HOUR_MS } from "./anomalyWire.ts";

/** The last four days are what is judged; everything before them is what "normal" is learned from (a shorter history keeps its last two days out instead). */
const RECENT_HOURS = 96;
const SHORT_RECENT_HOURS = 48;
const SPARK_HOURS = 14 * 24;
const DAY_MS = 86_400_000;

export type Ctx = {
  now: number;
  zone: string | null;
  s: Subject;
  /** one value per hour of the grid, in the engine's unit; null = nothing usable */
  values: (number | null)[];
  cal: Hour[];
  /** null: not enough history yet, so the learned rules stay silent */
  base: Baseline | null;
  tol: number;
  /** the room's temperature (°C) when the room has a thermometer: lets the humidity rule talk about the dew point */
  roomTemp?: number;
};

/** The grid and the baseline for one sensor. */
export function contextOf(s: Subject, h0: number, values: (number | null)[], now: number, zone: string, tol: number, roomTemp?: number): Ctx {
  const cal = calendar(h0, values.length, zone);
  const learnFrom = (end: number) => learn(values, cal, Math.max(0, end));
  return { now, zone, s, values, cal, base: learnFrom(values.length - RECENT_HOURS) ?? learnFrom(values.length - SHORT_RECENT_HOURS), tol, roomTemp };
}

type Side = { sign: 1 | -1; z: number; minAbs: number; minRel: number; hours: number };
const UP = (minAbs: number, hours: number, minRel = 0): Side => ({ sign: 1, z: 3, minAbs, minRel, hours });
const DOWN = (minAbs: number, hours: number, minRel = 0): Side => ({ ...UP(minAbs, hours, minRel), sign: -1 });
const LEVELS: Partial<Record<Kind, Side[]>> = {
  freezer: [UP(3, 3)],
  fridge: [UP(2, 3)],
  temp: [UP(4, 6), DOWN(4, 6)],
  humidity: [UP(15, 6)],
  // a device that is always on drawing 60% less (a fridge that stopped) is as telling as one drawing 35% more; a washing machine's near-zero hours never reach the 25 W floor
  power: [UP(20, 6, 0.35), DOWN(15, 6, 0.6)],
};
const STEADY_POWER_W = 25;

const enterAt = (side: Side, spread: number, at: number, tol: number): number => tol * Math.max(side.z * spread, side.minAbs, side.minRel * Math.abs(at));

function make(c: Ctx, rule: RuleId, severity: AnomalySeverity, title: string, message: string, hints: string[], startedAt: number, ratio: number): Anomaly {
  const { entity, name, roomId, roomName, itemId, openingId } = c.s;
  return { id: `${rule}:${entity}`, rule, entity, name, roomId, roomName, itemId, openingId, severity, title, message, hints, since: startedAt, teachable: true, ratio };
}

/** The last 14 days in two-hour steps with the band the sensor normally stays in, for the card's little chart. */
function sparkOf(c: Ctx, side: Side): SparkLine | undefined {
  const b = c.base;
  if (!b) return undefined;
  const first = Math.max(0, c.values.length - SPARK_HOURS);
  const v: (number | null)[] = [];
  const lo: (number | null)[] = [];
  const hi: (number | null)[] = [];
  for (let i = first; i < c.values.length; i += 2) {
    const pair = [c.values[i], c.values[i + 1]].filter((x): x is number => typeof x === "number");
    v.push(pair.length ? fromSI(c.s, pair.reduce((a, x) => a + x, 0) / pair.length) : null);
    const at = b.at(c.cal[i]);
    const e = at === null ? 0 : enterAt(side, b.spread, at, c.tol);
    lo.push(at === null ? null : fromSI(c.s, at - e));
    hi.push(at === null ? null : fromSI(c.s, at + e));
  }
  return { t0: c.cal[first].t, stepMs: 2 * HOUR_MS, v, lo, hi, unit: c.s.unit };
}

const withSpark = (a: Anomaly, c: Ctx, side: Side | undefined): Anomaly => ({ ...a, spark: side ? sparkOf(c, side) : undefined });

/** Deviation from the usual level, held for hours: a freezer 4 degrees warmer, a fridge drawing 40% more power, the bedroom 6 degrees colder than usual. */
export function levelRule(c: Ctx): Anomaly | null {
  const b = c.base;
  const sides = LEVELS[c.s.kind];
  if (!b || !sides) return null;
  for (const side of sides) {
    const norm = c.values.map((v, i) => {
      const at = v === null ? null : b.at(c.cal[i]);
      return v === null || at === null ? null : (v - at) / enterAt(side, b.spread, at, c.tol);
    });
    const run = trailingRun(norm, side.sign);
    if (!run || run.span < side.hours) continue;
    const found = describeLevel(c, b, side, run);
    if (found) return withSpark(found, c, side);
  }
  return null;
}

function describeLevel(c: Ctx, b: Baseline, side: Side, run: Run): Anomaly | null {
  const idx: number[] = [];
  for (let i = run.start; i <= run.end; i++) if (c.values[i] !== null) idx.push(i);
  const now = median(idx.map((i) => c.values[i] as number));
  const usual = median(idx.map((i) => b.at(c.cal[i]) ?? 0));
  const startedAt = c.cal[run.start].t;
  const when = since(startedAt, c.now, c.zone, run.start === 0);
  const { kind } = c.s;
  const up = side.sign > 0;
  const diff = Math.abs(now - usual);
  if (kind === "power") {
    if (!up && usual < STEADY_POWER_W) return null;
    const label = subjectName(c.s.name, "power");
    const text = up
      ? `${label} power is ${Math.round((diff / Math.max(usual, 1)) * 100)}% above its usual level ${when} (about ${num(fromSI(c.s, now))} ${c.s.unit} instead of ${num(fromSI(c.s, usual))})`
      : `${label} power has dropped to about ${num(fromSI(c.s, now))} ${c.s.unit} ${when} (usually ${num(fromSI(c.s, usual))})`;
    const cold = /fridge|freez|congel|frigider/i.test(c.s.name);
    const hints = up
      ? ["Look for something that was left on or is running more than before.", "A fridge or freezer working harder can mean a door that does not seal or dusty coils.", "If this is the new normal (a new device, a cold spell), press This is normal."]
      : ["Check the device is still switched on and plugged in.", "For a fridge or freezer, check the food is still cold: a stopped compressor is quickly a problem."];
    return make(c, "level", !up && cold ? "warning" : "notice", up ? "Using more power than usual" : "Using less power than usual", text, hints, startedAt, run.typical);
  }
  const label = subjectName(c.s.name, "temperature");
  const d = `${num(fromSIDelta(c.s, diff))} ${c.s.unit}`;
  if (kind === "freezer" || kind === "fridge") {
    const freezer = kind === "freezer";
    const hints = ["Check the door is fully shut and the seal is clean.", "Make sure nothing blocks the air vents and the back is not against a wall.", "If you stocked it with warm food or defrosted it, it will settle by itself; otherwise check the food is still cold."];
    return make(c, "level", diff >= (freezer ? 4 : 5) ? "warning" : "notice", `${freezer ? "Freezer" : "Fridge"} warmer than usual`, `${label} is ${d} warmer than normal ${when}`, hints, startedAt, run.typical);
  }
  if (kind === "temp") {
    const hints = up ? ["Is the heating on more than normal, or a window shut that is usually open?", "Direct sun through a window can add several degrees."] : ["Is a window or door open, or the heating off?", "Check the thermostat and the radiator valves."];
    return make(c, "level", "notice", up ? "Warmer than usual" : "Colder than usual", `${label} is ${d} ${up ? "warmer" : "colder"} than usual ${when}`, hints, startedAt, run.typical);
  }
  return make(c, "level", "notice", "Higher than usual", `${subjectName(c.s.name, "humidity")} is ${num(diff)} points above its usual level ${when}`, ["Cooking, showers and drying clothes indoors raise humidity; open a window to let it out."], startedAt, run.typical);
}

const DRIFT: Partial<Record<Kind, { slope: number; rise: number }>> = { freezer: { slope: 0.5, rise: 2 }, fridge: { slope: 0.4, rise: 1.5 }, humidity: { slope: 1.2, rise: 4 } };
const HUMID_WARN = 75;
const HUMID_MIN = 60;
/** A wall a few degrees colder than the room reaches the dew point (and grows mould) once the room's own dew point is within this many degrees of its air temperature. */
const DAMP_MARGIN = 6;
const MIN_DAY_HOURS = 8;

/** Dew point in °C (Magnus formula) of air at `tempC` and `rh` percent. */
export function dewPoint(tempC: number, rh: number): number {
  const a = 17.62;
  const b = 243.12;
  const g = Math.log(Math.max(rh, 1) / 100) + (a * tempC) / (b + tempC);
  return (b * g) / (a - g);
}

/** The mould-risk card: the dew point when the room's temperature is known, and a warning when the air is close to saturating on a cool wall. */
function mould(c: Ctx, message: string, humidity: number, startedAt: number, ratio: number): Anomaly {
  const dew = c.roomTemp === undefined ? null : dewPoint(c.roomTemp, humidity);
  const damp = dew !== null && c.roomTemp !== undefined && c.roomTemp - dew < DAMP_MARGIN;
  const hints = ["Air the room for ten minutes with the window wide open, and keep furniture a hand's width from outside walls.", "Dry clothes outdoors or in a ventilated room; run the bathroom or kitchen fan while showering and cooking."];
  if (dew !== null) hints.unshift(`The dew point is about ${num(dew)} °C: any surface colder than that, such as a cold outside wall, will get damp.`);
  return withSpark(make(c, "humidity", humidity >= HUMID_WARN || damp ? "warning" : "notice", "Mould risk", message, hints, startedAt, ratio), c, LEVELS.humidity?.[0]);
}

/** A slow climb over days: a freezer creeping up half a degree a day (a failing compressor), a bedroom's humidity rising for three days (mould). Daily medians, Theil-Sen slope. */
export function driftRule(c: Ctx): Anomaly | null {
  const cfg = DRIFT[c.s.kind];
  if (!cfg) return null;
  const days = dailyMedians(c.values, c.cal, MIN_DAY_HOURS);
  for (const k of [5, 4, 3]) {
    const last = days.slice(-k);
    if (last.length < k || c.now - last[0].t > (k + 1) * DAY_MS || last.some((d, i) => i > 0 && d.t - last[i - 1].t > 1.5 * DAY_MS)) continue;
    const ys = last.map((d) => d.median);
    const rise = ys[k - 1] - ys[0];
    // a creep rises every day; a jump (flat, flat, +4) is the level rule's business
    const steady = ys.every((y, i) => i === 0 || y - ys[i - 1] >= cfg.slope * 0.4 * c.tol);
    if (theilSen(ys) < cfg.slope * c.tol || rise < cfg.rise * c.tol || !steady) continue;
    const ratio = rise / (cfg.rise * c.tol);
    if (c.s.kind === "humidity") {
      if (ys[k - 1] < HUMID_MIN) return null;
      return mould(c, `${subjectName(c.s.name, "humidity")} has climbed for ${k} days (now ${Math.round(ys[k - 1])}%): mould risk`, ys[k - 1], last[0].t, ratio);
    }
    const freezer = c.s.kind === "freezer";
    const hints = ["A slow climb is often a door that does not quite close, a worn seal, ice build-up or a tired compressor.", "Check the food is still properly cold."];
    const a = make(c, "drift", rise >= (freezer ? 4 : 5) ? "warning" : "notice", `${freezer ? "Freezer" : "Fridge"} creeping warmer`, `${subjectName(c.s.name, "temperature")} has crept up ${num(fromSIDelta(c.s, rise))} ${c.s.unit} over ${k} days`, hints, last[0].t, ratio);
    return withSpark(a, c, LEVELS[c.s.kind]?.[0]);
  }
  return null;
}

/** Humid for hours on end, whatever the trend: 75% or more for the last half day. "This is normal" lifts the line (a bathroom). */
export function humidityHighRule(c: Ctx): Anomaly | null {
  if (c.s.kind !== "humidity") return null;
  const recent = c.values.slice(-12).filter((v): v is number => v !== null);
  const line = Math.min(98, HUMID_WARN + (c.tol - 1) * 8);
  if (recent.length < 8 || median(recent) < line) return null;
  const now = median(recent);
  return mould(c, `${subjectName(c.s.name, "humidity")} has stayed above ${HUMID_WARN}% for the last 12 hours (now ${Math.round(now)}%): mould risk`, now, c.cal[c.cal.length - 12].t, now / line);
}

const NIGHT = { from: 1, to: 5 };
const MIN_NIGHTS = 5;

/** The lowest hour of each night (01:00 to 05:00) is what the home draws when "nothing" is on: the standby. Oldest night first. */
function nightMinima(c: Ctx): { w: number; t: number }[] {
  const byDay = new Map<string, { t: number; list: number[] }>();
  c.values.forEach((v, i) => {
    const h = c.cal[i];
    if (v === null || h.hod < NIGHT.from || h.hod >= NIGHT.to) return;
    (byDay.get(h.day) ?? byDay.set(h.day, { t: h.t, list: [] }).get(h.day)!).list.push(v);
  });
  return [...byDay.values()].filter((e) => e.list.length >= 3).map((e) => ({ w: Math.min(...e.list), t: e.t })).sort((a, b) => a.t - b.t);
}

/** "Standby power at night rose from 82 W to 140 W": the last two nights both above the usual night minimum by a margin. */
export function standbyRule(c: Ctx): Anomaly | null {
  if (!c.s.whole) return null;
  const nights = nightMinima(c);
  if (nights.length < MIN_NIGHTS + 2) return null;
  const usual = median(nights.slice(0, -2).map((n) => n.w));
  const lately = Math.min(...nights.slice(-2).map((n) => n.w));
  const margin = c.tol * Math.max(40, usual * 0.25);
  if (lately - usual < margin) return null;
  const hints = ["Walk round at night looking for something that is on and should not be: a heater, a charger, a dehumidifier, an old TV.", "The change began about two nights ago."];
  const a = make(c, "standby", "notice", "More standby power at night", `Standby power at night rose from ${num(fromSI(c.s, usual))} ${c.s.unit} to ${num(fromSI(c.s, lately))} ${c.s.unit}`, hints, nights[nights.length - 2].t, (lately - usual) / margin);
  return withSpark(a, c, LEVELS.power?.[0]);
}

const WATER = { fromHour: 0, toHour: 6, minPerHour: 5, minRunHours: 3, lookbackHours: 36, habitNights: 2 };

/** Litres per hour for each hour: a meter's hour-to-hour rise, or a flow sensor's mean rate. The hour in progress is left out of a meter (a part-hour mean rises less). */
function litresPerHour(c: Ctx): (number | null)[] {
  if (c.s.kind === "water_flow") return c.values.map((v) => (v === null ? null : Math.max(0, v)));
  return c.values.map((v, i) => {
    const prev = i > 0 ? c.values[i - 1] : null;
    return i === c.values.length - 1 || v === null || prev === null || v < prev ? null : v - prev;
  });
}

type Night = { start: number; end: number };

/** Runs of consecutive hours with water running, inside the small hours (00:00 to 05:59), at least three long, within [from, to). */
function waterRuns(c: Ctx, lph: (number | null)[], from: number, to: number, minPerHour: number): Night[] {
  const out: Night[] = [];
  let start = -1;
  const close = (end: number) => {
    if (start >= 0 && end - start + 1 >= WATER.minRunHours) out.push({ start, end });
    start = -1;
  };
  for (let i = from; i < to; i++) {
    const night = c.cal[i].hod >= WATER.fromHour && c.cal[i].hod < WATER.toHour;
    if (night && (lph[i] ?? 0) >= minPerHour) start = start < 0 ? i : start;
    else close(i - 1);
  }
  close(to - 1);
  return out;
}

/** Water running for three hours or more in the small hours is rarely a person; a home where it happens most nights (irrigation, a softener, a pool) is left alone. */
export function waterNightRule(c: Ctx): Anomaly | null {
  if (c.s.kind !== "water_meter" && c.s.kind !== "water_flow") return null;
  const lph = litresPerHour(c);
  const n = lph.length;
  const minPerHour = WATER.minPerHour * c.tol;
  const recent = waterRuns(c, lph, Math.max(0, n - WATER.lookbackHours), n, minPerHour);
  if (!recent.length || waterRuns(c, lph, 0, Math.max(0, n - WATER.lookbackHours), minPerHour).length >= WATER.habitNights) return null;
  const run = recent[recent.length - 1];
  const litres = lph.slice(run.start, run.end + 1).reduce<number>((a, x) => a + (x ?? 0), 0);
  const length = duration((run.end - run.start + 1) * HOUR_MS);
  const message = run.end >= n - 3
    ? `Water has been flowing for ${length} overnight (possible leak): about ${num(litres)} litres so far`
    : `Water flowed for ${length} overnight (possible leak): about ${num(litres)} litres`;
  const hints = [`Nobody needs ${length} of water at night. A running toilet is the usual cause: listen at each one and check the taps.`, "Look for damp patches, a dripping boiler or a garden tap left on; turn the main valve off if you cannot find it."];
  return make(c, "water_night", "warning", "Water running at night", message, hints, c.cal[run.start].t, (run.end - run.start + 1) / WATER.minRunHours);
}

/** Every learned rule for one sensor; the caller keeps the most serious. */
export function learnedRules(c: Ctx): Anomaly[] {
  return [levelRule(c), driftRule(c), humidityHighRule(c), standbyRule(c), waterNightRule(c)].filter((a): a is Anomaly => a !== null);
}
