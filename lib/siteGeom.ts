// Polygon helpers for the Site feature, shared by the scene and the panel. Rings are arrays of [x, y] points, closed implicitly, either winding.
// Pure; the node test runner loads this file directly: imports carry a .ts extension or are type-only.
import type { XY } from "./siteTypes.ts";

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Signed shoelace area: positive when the ring runs clockwise on screen (x east, y south). */
export function signedArea(ring: readonly XY[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    s += ax * by - bx * ay;
  }
  return s / 2;
}

export const polygonArea = (ring: readonly XY[]): number => Math.abs(signedArea(ring));

/** Centre of mass of the ring's area; the mean of the points when the ring is degenerate (no area). */
export function polygonCentroid(ring: readonly XY[]): XY {
  const a = signedArea(ring);
  if (Math.abs(a) < 1e-9) {
    const n = ring.length || 1;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    const f = ax * by - bx * ay;
    cx += (ax + bx) * f;
    cy += (ay + by) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

export function polygonBounds(ring: readonly XY[]): Rect {
  const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [x, y] of ring) {
    if (x < r.x0) r.x0 = x;
    if (x > r.x1) r.x1 = x;
    if (y < r.y0) r.y0 = y;
    if (y > r.y1) r.y1 = y;
  }
  return r;
}

/** Even-odd test: is the point inside the ring? (Points exactly on an edge may go either way.) */
export function pointInPolygon(p: XY, ring: readonly XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outline and outside every hole. */
export const pointInShape = (p: XY, ring: readonly XY[], holes?: readonly (readonly XY[])[]): boolean => pointInPolygon(p, ring) && !holes?.some((h) => pointInPolygon(p, h));

const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Do the segments a-b and c-d cross or touch? */
export function segmentsIntersect(a: XY, b: XY, c: XY, d: XY): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p: XY, q: XY, r: XY) => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  return (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d));
}

/** Does the polygon touch the rectangle (any overlap, a polygon swallowing the rectangle, or the other way round)? */
export function polygonOverlapsRect(ring: readonly XY[], rect: Rect): boolean {
  if (ring.length < 3) return false;
  const b = polygonBounds(ring);
  if (b.x1 < rect.x0 || b.x0 > rect.x1 || b.y1 < rect.y0 || b.y0 > rect.y1) return false;
  if (ring.some(([x, y]) => x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1)) return true;
  const corners: XY[] = [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x1, rect.y1], [rect.x0, rect.y1]];
  if (corners.some((c) => pointInPolygon(c, ring))) return true;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const z = ring[(i + 1) % ring.length];
    for (let k = 0; k < 4; k++) if (segmentsIntersect(a, z, corners[k], corners[(k + 1) % 4])) return true;
  }
  return false;
}

/** The ring turned clockwise (on screen) by `deg` about `about` (the origin by default). */
export function rotateRing(ring: readonly XY[], deg: number, about: XY = [0, 0]): XY[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return ring.map(([x, y]) => {
    const dx = x - about[0];
    const dy = y - about[1];
    return [about[0] + dx * c - dy * s, about[1] + dx * s + dy * c];
  });
}

/** Width and depth of the ring along its own longest edge: [long, short] metres. Tells a 6 x 30 m terrace from a 14 x 14 m house. */
export function ringSpan(ring: readonly XY[]): [number, number] {
  let best = 0;
  let angle = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > best) {
      best = len;
      angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  }
  const r = polygonBounds(rotateRing(ring, (-angle * 180) / Math.PI));
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  return w >= h ? [w, h] : [h, w];
}

/** Remove consecutive duplicate points (and a repeated closing point). */
export function dedupeRing(ring: readonly XY[], eps = 1e-6): XY[] {
  const out: XY[] = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > eps || Math.abs(q[1] - p[1]) > eps) out.push(p);
  }
  const f = out[0];
  const l = out[out.length - 1];
  if (out.length > 1 && Math.abs(f[0] - l[0]) <= eps && Math.abs(f[1] - l[1]) <= eps) out.pop();
  return out;
}

/** Does the open line touch the rectangle (a point inside it, or a segment crossing its edge)? */
export function polylineOverlapsRect(pts: readonly XY[], rect: Rect): boolean {
  const inside = (p: XY) => p[0] >= rect.x0 && p[0] <= rect.x1 && p[1] >= rect.y0 && p[1] <= rect.y1;
  if (pts.some(inside)) return true;
  const corners: XY[] = [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x1, rect.y1], [rect.x0, rect.y1]];
  for (let i = 0; i + 1 < pts.length; i++) for (let k = 0; k < 4; k++) if (segmentsIntersect(pts[i], pts[i + 1], corners[k], corners[(k + 1) % 4])) return true;
  return false;
}
