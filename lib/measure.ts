// Distances, polygon area and perimeter, and the numbers a room label carries. Pure: the node test runner loads this file directly.
// Everything is metric (the app has no units setting): the three `format*` helpers are the one place a future setting would plug in.
import type { Plan, Pt, Room } from "./types.ts";

export type Rect = { x: number; y: number; w: number; h: number };
/** A distance the Ruler kept for this session (not saved in the plan): `level` is the level it was measured on. */
export type Measure = { id: string; a: Pt; b: Pt; level: string };
/** How many kept measures (and drawn areas) the Ruler remembers. */
export const MAX_KEPT = 8;

export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

/** The horizontal and vertical part of a distance, always positive. */
export const spread = (a: Pt, b: Pt): { dx: number; dy: number } => ({ dx: Math.abs(b.x - a.x), dy: Math.abs(b.y - a.y) });

/** Area of a simple polygon, either winding (shoelace). Fewer than 3 points: 0. */
export function polygonArea(pts: readonly Pt[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

/** Length around a polygon (closed) or along a polyline (open). */
export function polygonPerimeter(pts: readonly Pt[], closed = true): number {
  let sum = 0;
  for (let i = 0; i + 1 < pts.length; i++) sum += dist(pts[i], pts[i + 1]);
  return closed && pts.length > 2 ? sum + dist(pts[pts.length - 1], pts[0]) : sum;
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

/** Length of the outline of the union of axis-aligned rectangles (an L-shaped room is a host plus an extension): the edges between covered and uncovered cells of the grid their edges make. */
export function rectUnionPerimeter(rects: readonly Rect[]): number {
  const live = rects.filter((r) => r.w > 0 && r.h > 0);
  const xs = [...new Set(live.flatMap((r) => [round(r.x), round(r.x + r.w)]))].sort((a, b) => a - b);
  const ys = [...new Set(live.flatMap((r) => [round(r.y), round(r.y + r.h)]))].sort((a, b) => a - b);
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const covered = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= cols || j >= rows) return false;
    const cx = (xs[i] + xs[i + 1]) / 2;
    const cy = (ys[j] + ys[j + 1]) / 2;
    return live.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h);
  };
  let sum = 0;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      if (!covered(i, j)) continue;
      const w = xs[i + 1] - xs[i];
      const h = ys[j + 1] - ys[j];
      if (!covered(i - 1, j)) sum += h;
      if (!covered(i + 1, j)) sum += h;
      if (!covered(i, j - 1)) sum += w;
      if (!covered(i, j + 1)) sum += w;
    }
  return sum;
}

/** The rectangles a room label counts: the room and its child areas of at least 0.5 m2 (smaller ones are door thresholds), exactly the set `roomArea` (lib/blueprint.ts) adds up. */
export function roomParts(plan: Pick<Plan, "rooms">, room: Room): Rect[] {
  const kids = plan.rooms.filter((c) => c.parent === room.id && c.w * c.h >= 0.5);
  return [room, ...kids].map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
}

/** Length around a room and its extensions together (the outline of their union). */
export const roomPerimeter = (plan: Pick<Plan, "rooms">, room: Room): number => rectUnionPerimeter(roomParts(plan, room));

/** Width and depth of the box around a room and its extensions. */
export function roomSpan(plan: Pick<Plan, "rooms">, room: Room): { w: number; h: number } {
  const parts = roomParts(plan, room);
  const x0 = Math.min(...parts.map((r) => r.x));
  const y0 = Math.min(...parts.map((r) => r.y));
  return { w: Math.max(...parts.map((r) => r.x + r.w)) - x0, h: Math.max(...parts.map((r) => r.y + r.h)) - y0 };
}

/** The room a tap meant: an extension counts as its host room. */
export const hostOf = (plan: Pick<Plan, "rooms">, room: Room): Room => (room.parent && plan.rooms.find((r) => r.id === room.parent)) || room;

export const formatLength = (m: number): string => `${m.toFixed(2)} m`;
/** A small gap or clearance, the way people say it: whole centimetres. */
export const formatGap = (m: number): string => `${Math.round(m * 100)} cm`;
export const formatArea = (m2: number): string => `${m2.toFixed(2)} m²`;

/** `list` with `m` first, newest 8 only (the session's kept measures). */
export const keepNewest = <T>(list: readonly T[], item: T, max = MAX_KEPT): T[] => [item, ...list].slice(0, max);
