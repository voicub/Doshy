// Convex polygons in plan metres for the "Does it fit here?" check: overlap, the nearest gap between two of them, and the sector a door sweeps.
// Pure: the node test runner loads this file directly.
import type { Pt } from "./types.ts";

export type Poly = Pt[];
/** Pieces that overlap by less than this (2 mm) only touch: the ghost sits flush against a wall without being "inside" it. */
export const TOUCH = 0.002;

const edgeNormals = (p: Poly): Pt[] =>
  p.map((a, i) => {
    const b = p[(i + 1) % p.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  });

const spanOn = (p: Poly, n: Pt): [number, number] => {
  const d = p.map((q) => q.x * n.x + q.y * n.y);
  return [Math.min(...d), Math.max(...d)];
};

/** Do two convex polygons (either winding) overlap by more than touching? Separating axis test over every edge. */
export function convexOverlap(a: Poly, b: Poly): boolean {
  for (const n of [...edgeNormals(a), ...edgeNormals(b)]) {
    const [a0, a1] = spanOn(a, n);
    const [b0, b1] = spanOn(b, n);
    if (Math.min(a1, b1) - Math.max(a0, b0) <= TOUCH) return false;
  }
  return true;
}

/** The closest point to `p` on segment a-b. */
function onSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export type Gap = { dist: number; /** The closest point on the first polygon. */ from: Pt; /** The closest point on the second. */ to: Pt };

/** The shortest way across the empty space between two convex polygons that do not overlap: its length and both end points. Overlapping or touching polygons: 0. */
export function polyGap(a: Poly, b: Poly): Gap {
  let best: Gap | null = null;
  const consider = (p: Pt, edge: [Pt, Pt], swap: boolean) => {
    const q = onSegment(p, edge[0], edge[1]);
    const dist = Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || dist < best.dist) best = swap ? { dist, from: q, to: p } : { dist, from: p, to: q };
  };
  for (const p of a) b.forEach((q, i) => consider(p, [q, b[(i + 1) % b.length]], false));
  for (const p of b) a.forEach((q, i) => consider(p, [q, a[(i + 1) % a.length]], true));
  const g = best as Gap | null;
  if (!g || convexOverlap(a, b)) return { dist: 0, from: g?.from ?? a[0], to: g?.to ?? b[0] };
  return g;
}

/** The pie slice swept from direction `from` to direction `to` (unit vectors, a quarter turn apart for a door) around `centre`, as a convex polygon. */
export function sectorPoly(centre: Pt, from: Pt, to: Pt, radius: number, steps = 8): Poly {
  const pts: Poly = [centre];
  for (let k = 0; k <= steps; k++) {
    const th = (k / steps) * (Math.PI / 2);
    const c = Math.cos(th);
    const s = Math.sin(th);
    pts.push({ x: centre.x + (from.x * c + to.x * s) * radius, y: centre.y + (from.y * c + to.y * s) * radius });
  }
  return pts;
}
