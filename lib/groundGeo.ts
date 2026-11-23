import { ShapeUtils, Vector2 } from "three";
import { areaCorners, pathOutline, toAreaLocal, type EdgeDef } from "./ground.ts";
import type { GroundArea, GroundPath, Pt } from "./types.ts";

/** Flat triangles (three numbers per vertex), ready for a non-indexed BufferGeometry. */
export type Tris = { pos: number[]; uv: number[] };
type V = [number, number, number];

/** A triangle whose normal faces up (plan x, y are world x, z; world y is up). */
function up(out: Tris, a: V, b: V, c: V, uv: (p: V) => [number, number]) {
  const flip = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) < 0;
  for (const p of flip ? [a, c, b] : [a, b, c]) {
    out.pos.push(...p);
    out.uv.push(...uv(p));
  }
}

/**
 * The flat top of a polygon at height 0 (earcut, so bends are fine). `uvOf` maps a plan point to texture coordinates in tiles.
 */
function surfaceTris(poly: Pt[], uvOf: (p: Pt) => [number, number]): Tris {
  const out: Tris = { pos: [], uv: [] };
  const contour = poly.map((p) => new Vector2(p.x, p.y));
  for (const [i, j, k] of ShapeUtils.triangulateShape(contour, [])) {
    const [a, b, c] = [poly[i], poly[j], poly[k]];
    up(out, [a.x, 0, a.y], [b.x, 0, b.y], [c.x, 0, c.y], (p) => uvOf({ x: p[0], y: p[2] }));
  }
  return out;
}

/** An area's surface: texture tiles follow the area's own turn and start at its top-left corner. `tileM` = metres per tile. */
export function areaSurface(a: GroundArea, tileM: number): Tris {
  return surfaceTris(areaCorners(a), (p) => {
    const l = toAreaLocal(a, p);
    return [(l.x + a.w / 2) / tileM, (l.y + a.h / 2) / tileM];
  });
}

/** A path's surface: texture tiles are laid on the plan grid, so a path made of several pieces looks like one. */
export const pathSurface = (p: GroundPath, tileM: number): Tris => surfaceTris(pathOutline(p), (q) => [q.x / tileM, q.y / tileM]);

const signedArea = (poly: Pt[]) => poly.reduce((s, p, i) => s + p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y, 0) / 2;

/** A box standing on the ring `ring` (four ground points) from height 0 to `h`: top and four sides, normals pointing away from the middle. */
function prism(out: Tris, ring: V[], h: number) {
  const top = ring.map((p): V => [p[0], h, p[2]]);
  const mid: V = [ring.reduce((s, p) => s + p[0], 0) / 4, h / 2, ring.reduce((s, p) => s + p[2], 0) / 4];
  const tri = (a: V, b: V, c: V) => {
    const n: V = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    const to: V = [(a[0] + b[0] + c[0]) / 3 - mid[0], (a[1] + b[1] + c[1]) / 3 - mid[1], (a[2] + b[2] + c[2]) / 3 - mid[2]];
    for (const p of n[0] * to[0] + n[1] * to[1] + n[2] * to[2] < 0 ? [a, c, b] : [a, b, c]) out.pos.push(...p);
  };
  tri(top[0], top[1], top[2]);
  tri(top[0], top[2], top[3]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tri(ring[i], ring[j], top[j]);
    tri(ring[i], top[j], top[i]);
  }
}

/**
 * The rim around a polygon: one box per edge, standing just outside the surface (its inner face on the outline), `def.t` wide and `def.h` high, each
 * reaching `def.t` past both ends so the corners close. Round bends of a path are many short edges and come out round.
 */
export function edgeTris(poly: Pt[], def: EdgeDef): Tris {
  const out: Tris = { pos: [], uv: [] };
  if (def.h <= 0 || poly.length < 3) return out;
  const sign = signedArea(poly) >= 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1e-6) continue;
    const [dx, dy] = [(b.x - a.x) / l, (b.y - a.y) / l];
    const [nx, ny] = [sign * dy, -sign * dx]; // outward
    const at = (p: Pt, along: number, out_: number): V => [p.x + dx * along + nx * out_, 0, p.y + dy * along + ny * out_];
    prism(out, [at(a, -def.t / 2, 0), at(b, def.t / 2, 0), at(b, def.t / 2, def.t), at(a, -def.t / 2, def.t)], def.h);
  }
  return out;
}
