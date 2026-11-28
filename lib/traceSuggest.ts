// From walls found in the picture (image pixels) to walls on the plan (metres): through the image's place and scale, onto the 0.05 m grid, plus the
// points a wall being drawn locks onto. Pure. The node test runner loads this file directly: .ts import extensions.
import type { Seg } from "./traceDetect.ts";
import { imageToPlan, type Placed } from "./traceGeom.ts";
import type { Pt } from "./types.ts";

export type PlanSeg = { a: Pt; b: Pt };
const GRID = 0.05; // the plan's finest grid: a suggested wall lands where a drawn one could
const MIN_WALL_M = 0.1; // a "wall" shorter than this after snapping is a pen mark, not a wall
const SAME_M = 0.01;

const onGrid = (v: number) => Math.round(Math.round(v / GRID) * GRID * 100) / 100;
const gridPt = (p: Pt): Pt => ({ x: onGrid(p.x), y: onGrid(p.y) });

/** A suggestion as a plan wall: both ends through the image's transform, onto the grid. Null when it would be shorter than 0.1 m. Ends that are one pixel apart in the picture are one point on the plan. */
export function toPlanSeg(s: Seg, t: Placed): PlanSeg | null {
  const a = gridPt(imageToPlan(t, { x: s.x1, y: s.y1 }));
  const b = gridPt(imageToPlan(t, { x: s.x2, y: s.y2 }));
  return Math.hypot(b.x - a.x, b.y - a.y) < MIN_WALL_M ? null : { a, b };
}

const samePt = (p: Pt, q: Pt) => Math.abs(p.x - q.x) < SAME_M && Math.abs(p.y - q.y) < SAME_M;

/** The walls of `segs` that are not already on the plan (either way round) and not repeated among themselves. */
export function freshWalls(existing: readonly PlanSeg[], segs: readonly PlanSeg[]): PlanSeg[] {
  const out: PlanSeg[] = [];
  for (const s of segs) {
    const twin = (w: PlanSeg) => (samePt(w.a, s.a) && samePt(w.b, s.b)) || (samePt(w.a, s.b) && samePt(w.b, s.a));
    if (!existing.some(twin) && !out.some(twin)) out.push(s);
  }
  return out;
}

const horizontal = (s: Seg) => s.y1 === s.y2;

/** The ends of the suggestions and the points where a horizontal one crosses a vertical one, in plan metres on the grid, each once. */
export function snapPoints(segs: readonly Seg[], t: Placed): Pt[] {
  const raw: Pt[] = [];
  for (const s of segs) raw.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
  const [hs, vs] = [segs.filter(horizontal), segs.filter((s) => !horizontal(s))];
  for (const h of hs) {
    for (const v of vs) {
      const [x0, x1] = [Math.min(h.x1, h.x2), Math.max(h.x1, h.x2)];
      const [y0, y1] = [Math.min(v.y1, v.y2), Math.max(v.y1, v.y2)];
      if (v.x1 >= x0 && v.x1 <= x1 && h.y1 >= y0 && h.y1 <= y1) raw.push({ x: v.x1, y: h.y1 });
    }
  }
  const out: Pt[] = [];
  for (const p of raw) {
    const q = gridPt(imageToPlan(t, p));
    if (!out.some((o) => samePt(o, q))) out.push(q);
  }
  return out;
}

/** The point of `points` nearest to `p` within `reach` metres (and not one `skip` refuses), or null. */
export function nearestPoint(points: readonly Pt[], p: Pt, reach: number, skip?: (q: Pt) => boolean): Pt | null {
  let [best, bd]: [Pt | null, number] = [null, reach];
  for (const q of points) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd && !skip?.(q)) [best, bd] = [q, d];
  }
  return best;
}
