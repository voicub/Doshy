// Where a measuring click lands: on a wall corner, a wall end or a room corner when one is close, else on the grid, and exactly under the pointer with Alt.
// Pure: the node test runner loads this file directly.
import { wallFaces } from "./measureWalls.ts";
import type { Pt, Room, Wall } from "./types.ts";

export type SnapKind = "corner" | "end" | "room" | "grid" | "free";
/** The points a click can lock onto: the corners of the wall faces (where walls really meet), wall end points on the centre line, room corners. */
export type SnapPoints = { corners: Pt[]; ends: Pt[]; rooms: Pt[] };
export type Snapped = { p: Pt; kind: SnapKind };
export type SnapOptions = { radius: number; /** Grid step in metres; 0 = none. */ grid: number; /** Alt: no snapping at all. */ free?: boolean };

const TIE = 0.002; // two candidates this close in distance are a tie: the more specific kind wins
const RANK = { corner: 0, end: 1, room: 2 } as const;

const unique = (pts: Pt[]): Pt[] => {
  const seen = new Set<string>();
  return pts.filter((p) => {
    const k = `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** The snap points of one level's walls and rooms. */
export function snapPoints(walls: readonly Wall[], rooms: readonly Room[]): SnapPoints {
  return {
    corners: unique(wallFaces(walls).flatMap((f) => [f.a, f.b])),
    ends: unique(walls.flatMap((w) => [w.a, w.b])),
    rooms: unique(rooms.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }])),
  };
}

/** The point a click at `raw` means. The nearest candidate within `radius` wins (a tie goes to corner, then end, then room corner); none close: the grid. */
export function snapPoint(raw: Pt, pts: SnapPoints, o: SnapOptions): Snapped {
  if (o.free) return { p: raw, kind: "free" };
  let best: Snapped | null = null;
  let bestScore = Infinity;
  for (const kind of ["corner", "end", "room"] as const) {
    const list = kind === "corner" ? pts.corners : kind === "end" ? pts.ends : pts.rooms;
    for (const q of list) {
      const d = Math.hypot(q.x - raw.x, q.y - raw.y);
      const score = d + RANK[kind] * TIE;
      if (d <= o.radius && score < bestScore) {
        best = { p: q, kind };
        bestScore = score;
      }
    }
  }
  if (best) return best;
  if (o.grid <= 0) return { p: raw, kind: "free" };
  const g = (v: number) => +(Math.round(v / o.grid) * o.grid).toFixed(4);
  return { p: { x: g(raw.x), y: g(raw.y) }, kind: "grid" };
}
