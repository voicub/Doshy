// Finding "about the same time" in a list of times: the densest window of a given width, counted in different days (a light flicked twice on one evening is one evening).
// Works on the 24 h circle (23:55 and 00:05 belong together) or on a plain line (minutes from sunset). Deterministic: ties go to the earliest window. Pure.
import { DAY_MIN, circularGap, median } from "./routinesTime.ts";

export type Pt = { v: number; day: string; id: number };
export type Cluster = { centre: number; members: Pt[]; days: number; /** the farthest member from the centre, in minutes */ spread: number };

const dayCount = (pts: readonly Pt[]): number => new Set(pts.map((p) => p.day)).size;

/**
 * The window of `2 * tol` minutes that holds points from the most different days, then the points within `tol` of the median of what it held.
 * `circular`: times of day (0..1440), else a line. Null for no points.
 */
export function densest(points: readonly Pt[], tol: number, circular: boolean): Cluster | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a.v - b.v || a.id - b.id);
  const rel = (v: number, start: number) => (circular ? (((v - start) % DAY_MIN) + DAY_MIN) % DAY_MIN : v - start);
  const within = (p: Pt, start: number) => {
    const r = rel(p.v, start);
    return r >= 0 && r <= 2 * tol;
  };
  let bestStart = sorted[0].v;
  let bestDays = 0;
  let bestSize = 0;
  for (const { v: start } of sorted) {
    const inside = sorted.filter((p) => within(p, start));
    const days = dayCount(inside);
    if (days > bestDays || (days === bestDays && inside.length > bestSize)) {
      bestStart = start;
      bestDays = days;
      bestSize = inside.length;
    }
  }
  const middle = median(sorted.filter((p) => within(p, bestStart)).map((p) => rel(p.v, bestStart)));
  const centre = circular ? (bestStart + middle) % DAY_MIN : bestStart + middle;
  const gap = (v: number) => (circular ? circularGap(v, centre) : Math.abs(v - centre));
  const members = sorted.filter((p) => gap(p.v) <= tol);
  return { centre, members, days: dayCount(members), spread: members.reduce((m, p) => Math.max(m, gap(p.v)), 0) };
}
