// The statistics under the anomaly watch, all robust (median and MAD, never mean and standard deviation: one spike in the weeks of history must not move what is "normal"),
// all on the hour grid of the wire (lib/anomalyWire.ts) and all in the home's wall clock, so a daily habit keeps its hour across a clock change. Pure.
import { HOUR_MS } from "./anomalyWire.ts";
import { localOf, median } from "./routinesTime.ts";
import { WEEKDAY_IDS } from "./weekdays.ts";

export { median };

/** One hour of the grid as the wall clock of the home shows it. */
export type Hour = { t: number; /** weekday * 24 + hour, Monday first */ slot: number; /** 0 weekday, 1 weekend */ daytype: 0 | 1; /** hour of day */ hod: number; /** local YYYY-MM-DD */ day: string };

let memo: { key: string; table: Hour[] } | null = null;

/** The calendar of `n` hours from hour `h0` (since 1970): looked up once per scan and shared by every sensor, since all of them sit on the same grid. */
export function calendar(h0: number, n: number, zone: string): Hour[] {
  const key = `${h0}|${n}|${zone}`;
  if (memo?.key === key) return memo.table;
  const table = Array.from({ length: n }, (_, i): Hour => {
    const t = (h0 + i) * HOUR_MS;
    const l = localOf(t, zone);
    const wd = WEEKDAY_IDS.indexOf(l.weekday);
    const hod = Math.floor(l.minute / 60);
    return { t, slot: wd * 24 + hod, daytype: wd >= 5 ? 1 : 0, hod, day: l.day };
  });
  memo = { key, table };
  return table;
}

/** The spread of values around their median, scaled so it equals a standard deviation for bell-shaped data (MAD * 1.4826). */
export function mad(values: readonly number[]): number {
  if (!values.length) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m))) * 1.4826;
}

/** Slope per step of the median of all pairwise slopes (Theil-Sen): a single odd day cannot tilt it. */
export function theilSen(ys: readonly number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < ys.length; i++) for (let j = i + 1; j < ys.length; j++) slopes.push((ys[j] - ys[i]) / (j - i));
  return slopes.length ? median(slopes) : 0;
}

/** At least this many hours with a reading before anything is judged against them (four days): too little history means "still learning", never an alert. */
export const MIN_BASE_HOURS = 96;
/** A table cell of the baseline needs this many readings before it is trusted. */
const MIN_SAMPLES = 3;

export type Baseline = {
  /** what this hour normally reads, or null when there is no history for it at all */
  at: (h: Hour) => number | null;
  /** the usual scatter around `at` (a standard deviation's worth) */
  spread: number;
  /** hours with a reading the baseline rests on */
  hours: number;
};

function medians(cells: Map<number, number[]>, size: number): (number | null)[] {
  return Array.from({ length: size }, (_, k) => {
    const list = cells.get(k);
    return list && list.length >= MIN_SAMPLES ? median(list) : null;
  });
}

/**
 * What each hour of the week normally reads, from `values[0..end)`. Three tiers, the most specific one with enough readings wins: this hour of this weekday (a weekly rhythm),
 * this hour on weekdays or at the weekend, this hour of any day. A month gives each weekday hour four readings, a fortnight two, so the coarser tiers are what a short history rests on.
 * Null when fewer than MIN_BASE_HOURS hours have a reading.
 */
export function learn(values: readonly (number | null)[], cal: readonly Hour[], end: number): Baseline | null {
  const week = new Map<number, number[]>();
  const kind = new Map<number, number[]>();
  const day = new Map<number, number[]>();
  const add = (m: Map<number, number[]>, k: number, v: number) => (m.get(k) ?? m.set(k, []).get(k))!.push(v);
  let hours = 0;
  for (let i = 0; i < end; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    hours++;
    add(week, cal[i].slot, v);
    add(kind, cal[i].daytype * 24 + cal[i].hod, v);
    add(day, cal[i].hod, v);
  }
  if (hours < MIN_BASE_HOURS) return null;
  const w = medians(week, 168);
  const k = medians(kind, 48);
  const d = medians(day, 24);
  const at = (h: Hour): number | null => w[h.slot] ?? k[h.daytype * 24 + h.hod] ?? d[h.hod];
  const resid: number[] = [];
  for (let i = 0; i < end; i++) {
    const v = values[i];
    const b = v === null || v === undefined ? null : at(cal[i]);
    if (v !== null && v !== undefined && b !== null) resid.push(v - b);
  }
  return { at, spread: mad(resid), hours };
}

export type Run = { start: number; end: number; /** hours covered, holes included */ span: number; /** median of the values inside the run */ typical: number };

/**
 * The stretch that ends now and stays beyond the band: `norm[i]` is how far hour i is from normal in units of the allowed band (1 = at its edge), `sign` the direction that counts.
 * Hysteresis: a run needs its middle to pass `enter` (1) but is only broken by hours that fall back under `stay` (0.6) for more than `maxHole` hours in a row, so a reading
 * that dips for an hour does not cut a three-day stretch in two, and a reading that just crosses the edge does not start one. Null when the newest readings are back inside, or
 * when the sensor has been silent for more than 3 hours (that is the "has not reported" rule, not a deviation).
 */
export function trailingRun(norm: readonly (number | null)[], sign: 1 | -1, enter = 1, stay = 0.6, maxHole = 1): Run | null {
  let end = norm.length - 1;
  while (end >= 0 && norm[end] === null) end--;
  if (end < 0 || norm.length - 1 - end > 3 || sign * (norm[end] as number) <= stay) return null;
  let start = end;
  let gap = 0;
  const inside: number[] = [];
  for (let i = end; i >= 0; i--) {
    const v = norm[i];
    if (v !== null && sign * v > stay) {
      start = i;
      gap = 0;
      inside.push(sign * v);
    } else if (v !== null && ++gap > maxHole) break;
  }
  const typical = median(inside);
  return typical >= enter ? { start, end, span: end - start + 1, typical } : null;
}

export type Day = { day: string; /** first hour of the day on the grid */ t: number; median: number; hours: number };

/** Daily medians of the local days that have at least `minHours` readings, oldest first. */
export function dailyMedians(values: readonly (number | null)[], cal: readonly Hour[], minHours: number, end = values.length): Day[] {
  const days = new Map<string, { t: number; list: number[] }>();
  for (let i = 0; i < end; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    const entry = days.get(cal[i].day) ?? days.set(cal[i].day, { t: cal[i].t, list: [] }).get(cal[i].day)!;
    entry.list.push(v);
  }
  return [...days.entries()].filter(([, e]) => e.list.length >= minHours).map(([day, e]) => ({ day, t: e.t, median: median(e.list), hours: e.list.length })).sort((a, b) => a.t - b.t);
}
