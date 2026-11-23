import { KIND, Mesh, add, cross, dot, lin, mul, norm, ribbon, sub, tube, card, type Level } from "./vegBuilder.ts";
import { lerp, type Rng, type V3 } from "./mathUtil.ts";

/**
 * Helpers shared by the houseplant builders (lib/vegPlantFamilies.ts, lib/vegPlants.ts). Everything is KIND.house: the colour comes from the vertex tone,
 * indoor plants never follow the seasons, the snow or the wind. Pure: no DOM, runs under `node --test`.
 */
export type Ctx = { m: Mesh; rng: Rng; q: number; level: Level };
export const UP: V3 = [0, 1, 0];
export const GOLDEN = 2.399963;
/** leaf-count multiplier per foliage level (a gentler curve than LEVEL_MULT: a houseplant stays under about 3000 triangles at level 3) */
const DENSITY: Record<Level, number> = { 0: 1, 1: 1.6, 2: 2.4, 3: 3.2 };
/** number of items for `base` at level 0: grows with the foliage level, shrinks for far (low q) copies */
export const cnt = (c: Ctx, base: number) => Math.max(1, Math.round(base * DENSITY[c.level] * Math.min(1, c.q + 0.2)));
/** vertices of a leaf: a leaf texture is mid grey, so the leaf colour is lifted to land on the nominal colour after the texture */
export const lt = (hex: string, k = 1): V3 => mul(lin(hex), 1.7 * k);
export const solid = (hex: string): V3 => lin(hex);
/** brightness +-a and a little hue wobble */
export function vary(c: Ctx, t: V3, a: number): V3 {
  const k = 1 + a * (c.rng() * 2 - 1);
  return [t[0] * k * (1 + a * 0.35 * (c.rng() - 0.5)), t[1] * k, t[2] * k * (1 + a * 0.35 * (c.rng() - 0.5))];
}
/** younger growth at the top: lighter and a touch yellower (u 0 = old, 1 = new) */
export const fresh = (t: V3, u: number): V3 => [t[0] * (1 + 0.28 * u), t[1] * (1 + 0.2 * u), t[2] * (1 - 0.1 * u)];
export const range = (c: Ctx, a: number, b: number) => a + (b - a) * c.rng();

/** quadratic curve base -> top bulging by `bulge`, n + 1 points */
export function curve(base: V3, top: V3, bulge: V3, n: number): V3[] {
  const ctrl = add(mul(add(base, top), 0.5), bulge);
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
    return [a * base[0] + b * ctrl[0] + d * top[0], a * base[1] + b * ctrl[1] + d * top[1], a * base[2] + b * ctrl[2] + d * top[2]];
  });
}
/** point and unit direction at fraction u of a polyline */
export function along(pts: V3[], u: number): [V3, V3] {
  const f = Math.min(0.9999, Math.max(0, u)) * (pts.length - 1), i = Math.floor(f), t = f - i;
  const p = add(mul(pts[i], 1 - t), mul(pts[i + 1], t));
  return [p, norm(sub(pts[i + 1], pts[i]))];
}
export const outOf = (yaw: number): V3 => [Math.cos(yaw), 0, Math.sin(yaw)];
export const dirOf = (yaw: number, elev: number): V3 => [Math.cos(elev) * Math.cos(yaw), Math.sin(elev), Math.cos(elev) * Math.sin(yaw)];

type LeafO = {
  tile: number;
  tone: V3;
  len: number;
  wid: number;
  /** direction it points at: azimuth and elevation (0 = horizontal, pi / 2 = straight up) */
  yaw: number;
  elev: number;
  /** how many radians the leaf bends towards the ground along its length */
  droop?: number;
  /** roll about its own axis (a leaf tilting to one side) */
  twist?: number;
  segs?: number;
  /** darkening of the base (inner shadow) */
  base?: number;
};

/** One leaf: a ribbon from `p` along (yaw, elev) bending down by `droop`; the tile paints the outline. Returns the tip. */
export function leafAt(c: Ctx, p: V3, o: LeafO): V3 {
  const n = o.segs ?? (o.len < 0.1 ? 1 : c.level >= 2 ? 4 : 3);
  const pts: V3[] = [p];
  let e = o.elev, cur = p;
  const step = o.len / n;
  for (let i = 0; i < n; i++) {
    e = o.elev - (o.droop ?? 0) * ((i + 0.5) / n);
    cur = add(cur, mul(dirOf(o.yaw, e), step));
    pts.push(cur);
  }
  const dir = dirOf(o.yaw, o.elev - (o.droop ?? 0) * 0.5);
  let side: V3 = [Math.sin(o.yaw), 0, -Math.cos(o.yaw)];
  if (o.twist) side = add(mul(side, Math.cos(o.twist)), mul(cross(dir, side), Math.sin(o.twist)));
  let nrm = norm(cross(side, dir));
  if (nrm[1] < -0.3 || (Math.abs(nrm[1]) <= 0.3 && dot(nrm, outOf(o.yaw)) < 0)) nrm = mul(nrm, -1);
  nrm = norm(add(nrm, [0, 0.55, 0])); // lit from the sky like the rest of the room, not from the side
  ribbon(c.m, pts, pts.map(() => o.wid), side, nrm, { tile: o.tile, tone: o.tone, kind: KIND.house, r: c.rng(), slot: 0, base: o.base ?? 0.2 });
  return cur;
}

/** A smooth coloured stem along `pts`, radius r0 at the base to r1 at the tip. */
export function stem(c: Ctx, pts: V3[], r0: number, r1: number, tone: V3, sides = 0) {
  const s = sides || (c.level >= 2 ? 6 : 5);
  tube(c.m, pts, pts.map((_, i) => lerp(r0, r1, i / (pts.length - 1))), s, tone, 0, { kind: KIND.house, rough: 0 });
}

/** An upright or tilted card (flowers, sprigs, plumes) of width `w` and height `h`, base at `p`, facing out of `yaw`; `lean` tips it away from the vertical. */
export function sprig(c: Ctx, p: V3, o: { tile: number; tone: V3; w: number; h: number; yaw: number; lean: number; base?: number }) {
  const up = norm(add(mul(UP, Math.cos(o.lean)), mul(outOf(o.yaw), Math.sin(o.lean))));
  const side: V3 = [Math.sin(o.yaw), 0, -Math.cos(o.yaw)];
  const nrm = norm(add(norm(cross(side, up)), [0, 0.55, 0]));
  card(c.m, add(p, mul(up, o.h / 2)), mul(side, o.w / 2), mul(up, o.h / 2), nrm, { tile: o.tile, tone: o.tone, kind: KIND.house, r: c.rng(), slot: 0, base: o.base ?? 0.15 });
}

/** Houseplants are not wind-swayed (flex 0); the reference height and radius only keep the sway maths sane. */
export function init(m: Mesh, h: number, r: number) {
  m.H = h;
  m.R = r;
  m.flex = 0;
}
