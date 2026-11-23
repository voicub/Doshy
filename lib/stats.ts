// Pure helpers for the statistics panel and /api/ha/history. Imports only pure modules (relative, with extension): the node test runner loads this file directly.
import { isRecord } from "./guards.ts";
import { within } from "./requestTimeout.ts";

type NumSeries = { kind: "num"; t: number[]; v: number[] };
type StateSeries = { kind: "state"; changes: { t: number; s: string }[] };
export type Series = NumSeries | StateSeries;
export type Interval = { start: number; end: number };

export const MIN = 60_000;
export const HOUR = 60 * MIN;
const UNKNOWN = ["unavailable", "unknown", ""];

export const isNumeric = (s: string) => !UNKNOWN.includes(s) && Number.isFinite(Number(s));

/**
 * Time-weighted bucket average of a step function (a sample holds until the next one, the last until `to`).
 * Returns the raw samples when there are at most `points`. Buckets before the first sample are skipped.
 */
export function resample(t: number[], v: number[], from: number, to: number, points: number): NumSeries {
  if (t.length <= points || to <= from) return { kind: "num", t: [...t], v: [...v] };
  const bw = (to - from) / points;
  const ot: number[] = [];
  const ov: number[] = [];
  let i = 0; // index of the sample holding at the bucket start
  for (let b = 0; b < points; b++) {
    const lo = from + b * bw;
    const hi = lo + bw;
    while (i + 1 < t.length && t[i + 1] <= lo) i++;
    if (t[i] >= hi) continue; // nothing seen yet
    let acc = 0;
    let cur = Math.max(lo, t[i]);
    for (let k = i; k < t.length && cur < hi; k++) {
      const next = Math.min(hi, k + 1 < t.length ? t[k + 1] : hi);
      acc += v[k] * (next - cur);
      cur = next;
    }
    const covered = hi - Math.max(lo, t[i]);
    if (covered <= 0) continue;
    ot.push(lo + bw / 2);
    ov.push(acc / covered);
  }
  return { kind: "num", t: ot, v: ov };
}


/** Collapse consecutive duplicates; first entry kept. */
function pushChange(out: { t: number; s: string }[], t: number, s: string) {
  if (!out.length || out[out.length - 1].s !== s) out.push({ t, s });
}

/**
 * Turn Home Assistant's `/api/history/period` payload into series.
 * Numeric entities become `num` (resampled to <= points); everything else `state` changes.
 * For each name in `attrs`, an entity carrying that attribute also yields a `state` series keyed `entity|attr`.
 * Times use last_updated (it moves on attribute changes; last_changed does not) and are clamped to `from`.
 */
export function parseHistory(raw: unknown, from: number, to: number, points: number, attrs: string[] = []): Record<string, Series> {
  const out: Record<string, Series> = {};
  if (!Array.isArray(raw)) return out;
  for (const list of raw) {
    if (!Array.isArray(list) || !list.length) continue;
    const first: unknown = list[0];
    const id = isRecord(first) && typeof first.entity_id === "string" ? first.entity_id : "";
    if (!id) continue;
    const nt: number[] = [];
    const nv: number[] = [];
    const changes: { t: number; s: string }[] = [];
    const attrChanges: Record<string, { t: number; s: string }[]> = {};
    for (const item of list) {
      if (!isRecord(item)) continue;
      const stamp = item.last_updated ?? item.last_changed;
      const t = Math.max(from, Date.parse(typeof stamp === "string" ? stamp : ""));
      if (!Number.isFinite(t) || typeof item.state !== "string") continue;
      if (isNumeric(item.state)) { nt.push(t); nv.push(Number(item.state)); }
      pushChange(changes, t, item.state);
      for (const a of attrs) {
        const val = isRecord(item.attributes) ? item.attributes[a] : undefined;
        if (val != null) pushChange((attrChanges[a] ??= []), t, String(val));
      }
    }
    const nonNumeric = changes.filter((c) => !isNumeric(c.s) && !UNKNOWN.includes(c.s)).length;
    out[id] = nt.length && !nonNumeric ? resample(nt, nv, from, to, points) : { kind: "state", changes };
    for (const [a, c] of Object.entries(attrChanges)) out[`${id}|${a}`] = { kind: "state", changes: c };
  }
  return out;
}

/** Intervals within [from, to] during which the state satisfies `on`. The last state holds until `to`. */
export function onIntervals(changes: { t: number; s: string }[], from: number, to: number, on: (s: string) => boolean): Interval[] {
  const out: Interval[] = [];
  let start: number | null = null;
  const close = (end: number) => {
    if (start === null) return;
    const a = Math.max(start, from);
    const b = Math.min(end, to);
    if (b > a) out.push({ start: a, end: b });
    start = null;
  };
  for (const c of changes) {
    const hit = on(c.s);
    if (hit && start === null) start = c.t;
    else if (!hit) close(c.t);
  }
  close(to);
  return out;
}

export const totalMs = (iv: Interval[]) => iv.reduce((n, i) => n + (i.end - i.start), 0);
/** Share of [from, to] covered by the intervals, 0..100. */
export const dutyPct = (iv: Interval[], from: number, to: number) => (to > from ? (100 * totalMs(iv)) / (to - from) : 0);

/** Stepped numeric samples from a state series (non-numeric changes dropped), held to `to`. */
export function numericSteps(changes: { t: number; s: string }[], to: number): { t: number; v: number }[] {
  const pts = changes.filter((c) => isNumeric(c.s)).map((c) => ({ t: c.t, v: Number(c.s) }));
  if (pts.length && pts[pts.length - 1].t < to) pts.push({ t: to, v: pts[pts.length - 1].v });
  return pts;
}

/** Value of a numeric series at `t`, holding the previous sample (undefined before the first). */
export function sampleAt(s: NumSeries, t: number): number | undefined {
  let lo = 0;
  let hi = s.t.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] <= t) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at < 0 ? undefined : s.v[at];
}

/** Sample several series on one time axis (for tooltips and merged tables). */
export const alignAt = (series: NumSeries[], t: number) => series.map((s) => sampleAt(s, t));

export function minMaxAvg(v: number[]): { min: number; max: number; avg: number } | null {
  if (!v.length) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const x of v) { if (x < min) min = x; if (x > max) max = x; sum += x; }
  return { min, max, avg: sum / v.length };
}

/** Multiplier that turns a value in `unit` into kWh (1 for unknown). */
export const kwhFactor = (unit?: string) => (unit === "Wh" ? 0.001 : unit === "MWh" ? 1000 : 1);

/** Energy used across a cumulative meter series: sum of its rises. Drops (meter reset or glitch) add nothing. */
export function energyDelta(v: number[]): number {
  let sum = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[i - 1]) sum += v[i] - v[i - 1];
  return sum;
}

/* ---------- formatting ---------- */

export const fmtNum = (n: number, digits = 1) => n.toFixed(digits);

export function fmtDuration(ms: number): string {
  const m = Math.round(ms / MIN);
  if (m < 1) return ms >= 1000 ? `${Math.round(ms / 1000)}s` : "0m";
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const two = (n: number) => String(n).padStart(2, "0");
export const fmtClock = (t: number) => { const d = new Date(t); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
export const fmtDay = (t: number) => { const d = new Date(t); return `${DAYS[d.getDay()]} ${d.getDate()}`; };
/** Axis label: clock time for short spans, weekday + day for long ones. */
export const fmtAxisTime = (t: number, spanMs: number) => (spanMs <= 36 * HOUR ? fmtClock(t) : fmtDay(t));
export const fmtStamp = (t: number) => `${fmtDay(t)} ${fmtClock(t)}`;

/** Round numeric ticks (1, 2, 5 x 10^n) covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): { ticks: number[]; lo: number; hi: number } {
  if (!(max > min)) { const c = Number.isFinite(min) ? min : 0; min = c - 1; max = c + 1; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let x = lo; x <= hi + step / 2; x += step) ticks.push(Math.round(x / step) * step);
  return { ticks, lo, hi };
}

const TICK_STEPS = [10 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR, 48 * HOUR];
/** Time ticks aligned to local clock boundaries, about `count` of them. */
export function timeTicks(from: number, to: number, count = 5): number[] {
  const step = TICK_STEPS.find((s) => (to - from) / s <= count) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const off = new Date(from).getTimezoneOffset() * MIN;
  const out: number[] = [];
  for (let t = Math.ceil((from - off) / step) * step + off; t <= to; t += step) out.push(t);
  return out;
}

/* ---------- client ---------- */

type HistoryResult = { from: number; to: number; series: Record<string, Series> };
/** The server gives Home Assistant 30 s for a history query (app/api/ha/history/route.ts): its answer, or its error, arrives before this. */
const HISTORY_TIMEOUT_MS = 40_000;

/** Browser-side GET /api/ha/history. Series keys are entity ids, or `entity|attr` for each requested attribute. Throws the server's message. */
export async function fetchHistory(entities: string[], hours: number, opts: { points?: number; attrs?: string[]; signal?: AbortSignal } = {}): Promise<HistoryResult> {
  const q = new URLSearchParams({ entities: entities.join(","), hours: String(hours), points: String(opts.points ?? 240) });
  if (opts.attrs?.length) q.set("attrs", opts.attrs.join(","));
  const res = await fetch(`/api/ha/history?${q}`, { cache: "no-store", signal: within(HISTORY_TIMEOUT_MS, opts.signal) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
  return res.json();
}
