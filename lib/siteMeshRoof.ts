// Roof shapes: the oriented box round an outline, the roof height over it, and the triangle/edge splitting that keeps every roof piece planar.
import { clamp } from "./mathUtil.ts";
import type { RoofShape, XY } from "./siteTypes.ts";

/** Smallest rectangle round the ring (any turn): its centre, its two unit axes (u along the longer side) and half-lengths. */
type OrientedBox = { cx: number; cy: number; ux: number; uy: number; vx: number; vy: number; hl: number; hw: number };

/** Extent of the ring along the unit axis (ux, uy): [min, max]. */
function extent(ring: readonly XY[], ux: number, uy: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, y] of ring) {
    const u = x * ux + y * uy;
    lo = Math.min(lo, u);
    hi = Math.max(hi, u);
  }
  return [lo, hi];
}

export function orientedBox(ring: readonly XY[]): OrientedBox {
  let bestArea = Infinity;
  let bestAngle = 0;
  const step = Math.max(1, Math.floor(ring.length / 48));
  for (let i = 0; i < ring.length; i += step) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const [u0, u1] = extent(ring, Math.cos(a), Math.sin(a));
    const [v0, v1] = extent(ring, -Math.sin(a), Math.cos(a));
    if ((u1 - u0) * (v1 - v0) < bestArea - 1e-9) {
      bestArea = (u1 - u0) * (v1 - v0);
      bestAngle = a;
    }
  }
  let ux = Math.cos(bestAngle), uy = Math.sin(bestAngle), vx = -uy, vy = ux;
  let [u0, u1] = extent(ring, ux, uy);
  let [v0, v1] = extent(ring, vx, vy);
  if (v1 - v0 > u1 - u0) {
    [ux, uy, vx, vy] = [vx, vy, -ux, -uy];
    [u0, u1] = extent(ring, ux, uy);
    [v0, v1] = extent(ring, vx, vy);
  }
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  return { cx: cu * ux + cv * vx, cy: cu * uy + cv * vy, ux, uy, vx, vy, hl: (u1 - u0) / 2, hw: (v1 - v0) / 2 };
}

export type Plane = [number, number, number]; // a x + b y + c = 0, unit normal
export type Roof = { rise: number; height: (x: number, y: number) => number; creases: Plane[] };

/** Roof pitch when OpenStreetMap gives none: about 35 degrees, within sane limits. */
export function defaultRise(shape: RoofShape, hw: number): number {
  if (shape === "skillion") return clamp(0.35 * 2 * hw, 0.5, 3);
  if (shape === "dome") return clamp(0.5 * hw, 1, 12);
  return clamp(0.7 * hw, 0.8, 5);
}

/** Roof height (above the eaves) as a function of the plan point, plus the crease planes where its slope changes (so triangles can be split along them and stay planar). */
export function roofOf(shape: RoofShape, box: OrientedBox, roofHeight: number): Roof | null {
  if (shape === "flat" || shape === "dome") return null;
  const hw = Math.max(box.hw, 0.25);
  const hl = Math.max(box.hl, hw);
  const rise = roofHeight > 0 ? clamp(roofHeight, 0.2, 14) : defaultRise(shape, hw);
  const u = (x: number, y: number) => (x - box.cx) * box.ux + (y - box.cy) * box.uy;
  const v = (x: number, y: number) => (x - box.cx) * box.vx + (y - box.cy) * box.vy;
  /** the plane  alpha u + beta v + gamma = 0 */
  const plane = (al: number, be: number, ga: number): Plane => {
    const a = al * box.ux + be * box.vx;
    const b = al * box.uy + be * box.vy;
    const l = Math.hypot(a, b) || 1;
    return [a / l, b / l, (ga - al * (box.cx * box.ux + box.cy * box.uy) - be * (box.cx * box.vx + box.cy * box.vy)) / l];
  };
  switch (shape) {
    case "gabled":
      return { rise, height: (x, y) => rise * Math.max(0, 1 - Math.abs(v(x, y)) / hw), creases: [plane(0, 1, 0)] };
    case "hipped": {
      const k = hl - hw;
      return {
        rise,
        height: (x, y) => rise * Math.max(0, Math.min(1 - Math.abs(v(x, y)) / hw, (hl - Math.abs(u(x, y))) / hw)),
        creases: [plane(0, 1, 0), plane(1, -1, -k), plane(1, 1, -k), plane(1, 1, k), plane(1, -1, k)],
      };
    }
    case "pyramidal":
      return { rise, height: (x, y) => rise * Math.max(0, 1 - Math.max(Math.abs(u(x, y)) / hl, Math.abs(v(x, y)) / hw)), creases: [plane(1 / hl, -1 / hw, 0), plane(1 / hl, 1 / hw, 0)] };
    case "skillion":
      return { rise, height: (x, y) => (rise * (v(x, y) + hw)) / (2 * hw), creases: [] };
  }
}

const EPS = 1e-6;

/** A convex polygon cut by a plane into its two sides (one polygon when the plane misses it). */
function cut(poly: XY[], pl: Plane): XY[][] {
  const d = poly.map((p) => pl[0] * p[0] + pl[1] * p[1] + pl[2]);
  if (d.every((x) => x >= -EPS) || d.every((x) => x <= EPS)) return [poly];
  const pos: XY[] = [];
  const neg: XY[] = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const p = poly[i];
    const q = poly[j];
    if (d[i] > EPS) pos.push(p);
    else if (d[i] < -EPS) neg.push(p);
    else {
      pos.push(p);
      neg.push(p);
    }
    if ((d[i] > EPS && d[j] < -EPS) || (d[i] < -EPS && d[j] > EPS)) {
      const t = d[i] / (d[i] - d[j]);
      const x: XY = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      pos.push(x);
      neg.push(x);
    }
  }
  return [pos, neg].filter((r) => r.length >= 3);
}

/** Triangles cut along every plane, so each piece lies wholly on one side of every crease. */
export function splitTriangles(tris: XY[][], planes: readonly Plane[]): XY[][] {
  let cur = tris;
  for (const pl of planes) cur = cur.flatMap((t) => cut(t, pl));
  // fan every convex piece back into triangles
  return cur.flatMap((poly) => Array.from({ length: poly.length - 2 }, (_, i) => [poly[0], poly[i + 1], poly[i + 2]] as XY[]));
}

/** The points where a wall edge A-B crosses the creases, as fractions along it (sorted, without the ends). */
export function edgeCuts(a: XY, b: XY, planes: readonly Plane[]): number[] {
  const ts: number[] = [];
  for (const pl of planes) {
    const da = pl[0] * a[0] + pl[1] * a[1] + pl[2];
    const db = pl[0] * b[0] + pl[1] * b[1] + pl[2];
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) ts.push(da / (da - db));
  }
  return ts.sort((x, y) => x - y);
}
