// The anomaly watch ("Home health"): what looks odd about the home right now, in plain words. Deterministic and local (no model, no network): per-sensor baselines learned from the
// last weeks of hourly history (lib/anomalyStats.ts), the rules that read them (lib/anomalyRules.ts) and the rules that need only the live state (lib/anomalyLive.ts).
// The browser runs `inspect` one sensor at a time with a pause between sensors (lib/anomalyScan.ts), so a Raspberry Pi's screen never freezes. Pure.
import { HISTORY_KINDS, SEVERITY_RANK, type Anomaly, type Kind, type RuleId, type Subject } from "./anomalyTypes.ts";
import { contextOf, learnedRules } from "./anomalyRules.ts";
import { liveRules, type Live } from "./anomalyLive.ts";
import { toSI } from "./anomalyText.ts";
import type { AnomalyWire, Series } from "./anomalyWire.ts";
import type { HAState } from "./ha.ts";
import { usableZone } from "./routinesTime.ts";

export type Watch = {
  now: number;
  /** the home's time zone (null: this machine's) */
  zone: string | null;
  states: Record<string, HAState>;
  subjects: readonly Subject[];
  /** the last weeks of hours; null before the first scan, then only the live rules run */
  wire: AnomalyWire | null;
  /** entity -> how much wider than usual its bands are (set by "This is normal"); absent = 1 */
  tolerance: Readonly<Record<string, number>>;
};

export type Prepared = Watch & { live: Live; roomTemp: Map<string, number> };

/** What a reading can plausibly be: anything outside is a broken sensor, not a home, and is left out of the baseline. */
const RANGE: Partial<Record<Kind, [number, number]>> = { temp: [-60, 90], fridge: [-60, 60], freezer: [-60, 40], humidity: [0, 100], power: [-1e6, 1e6], water_meter: [0, 1e9], water_flow: [0, 1e6] };

function valuesOf(s: Subject, series: Series): (number | null)[] | null {
  const range = RANGE[s.kind];
  const out: (number | null)[] = [];
  for (const raw of series.v) {
    const v = raw === null ? null : toSI(s.kind, s.unit, raw);
    if (raw !== null && v === null) return null; // a unit the rules do not understand: the sensor is not judged
    out.push(v !== null && range && (v < range[0] || v > range[1]) ? null : v);
  }
  return out;
}

/** Sensors that changed value at least five times over the weeks: the ones that can be called silent. */
function chattySet(subjects: readonly Subject[], wire: AnomalyWire | null): Set<string> {
  const out = new Set<string>();
  if (!wire) return out;
  for (const s of subjects) {
    const series = wire.series[s.entity];
    if (series && s.kind !== "water_meter" && new Set(series.v.filter((v) => v !== null)).size >= 5) out.add(s.entity);
  }
  return out;
}

export function prepare(w: Watch): Prepared {
  const roomTemp = new Map<string, number>();
  for (const s of w.subjects) {
    const st = w.states[s.entity];
    const v = s.kind === "temp" && s.roomId && st ? toSI("temp", s.unit, Number(st.state)) : null;
    if (s.roomId && v !== null && Number.isFinite(v) && !roomTemp.has(s.roomId)) roomTemp.set(s.roomId, v);
  }
  return { ...w, roomTemp, live: { now: w.now, zone: w.zone, states: w.states, subjects: w.subjects, seen: w.wire?.seen ?? {}, chatty: chattySet(w.subjects, w.wire) } };
}

/** Everything the rules find about one sensor. */
export function inspect(p: Prepared, s: Subject): Anomaly[] {
  const out = liveRules(s, p.live);
  const series = p.wire?.series[s.entity];
  if (series && HISTORY_KINDS.includes(s.kind)) {
    const values = valuesOf(s, series);
    if (values) out.push(...learnedRules(contextOf(s, series.h0, values, p.now, usableZone(p.zone ?? undefined), p.tolerance[s.entity] ?? 1, s.roomId ? p.roomTemp.get(s.roomId) : undefined)));
  }
  return out;
}

/** Rules that need the history; the others are re-evaluated every minute from the live states. */
export const LEARNED: readonly RuleId[] = ["level", "drift", "humidity", "standby", "water_night"];

const ORDER: readonly RuleId[] = ["water_night", "humidity", "drift", "level", "standby", "window_heating", "garage_night", "battery", "unavailable", "stale"];

/** One card per sensor (the most serious thing about it), the most serious cards first, newest first among equals. */
export function finish(list: readonly Anomaly[]): Anomaly[] {
  const best = new Map<string, Anomaly>();
  for (const a of list) {
    const have = best.get(a.entity);
    if (!have || SEVERITY_RANK[a.severity] < SEVERITY_RANK[have.severity] || (a.severity === have.severity && ORDER.indexOf(a.rule) < ORDER.indexOf(have.rule))) best.set(a.entity, a);
  }
  return [...best.values()].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.since - a.since || a.id.localeCompare(b.id));
}

/** The whole analysis at once (the browser uses `inspect` in slices; tests and small plans use this). */
export function analyse(w: Watch): Anomaly[] {
  const p = prepare(w);
  return finish(p.subjects.flatMap((s) => inspect(p, s)));
}
