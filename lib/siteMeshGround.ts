// Ground height (flat near the plan, the real DEM far out) and the ground grid the terrain mesh is built from. Plan axes, metres.
import { clamp } from "./mathUtil.ts";
import { pointInShape, polygonBounds, type Rect } from "./siteGeom.ts";
import { smooth } from "./siteMeshBase.ts";
import type { SiteTerrain, XY } from "./siteTypes.ts";

/** The ground within this many metres of the plan's bounds is exactly the garden's own flat ground (height 0, the lawn the garden draws). */
export const HOME_FLAT_M = 12;
/** ... and over the next metres it blends into the real ground height. */
export const HOME_BLEND_M = 40;

/** Distance (m) from a point to a rectangle (0 inside it). */
export const rectDistance = (x: number, z: number, r: Rect): number => Math.hypot(Math.max(r.x0 - x, x - r.x1, 0), Math.max(r.y0 - z, z - r.y1, 0));

/** 0 within HOME_FLAT_M of the plan, easing to 1 HOME_BLEND_M further out: how much of the real ground height applies at that distance. */
export const terrainBlend = (distance: number): number => smooth((distance - HOME_FLAT_M) / HOME_BLEND_M);

/** Bilinear ground height of the DEM at a point in SITE axes (metres about the centre, y south). Clamped at the grid's edge. */
export function demAt(t: SiteTerrain, sx: number, sy: number): number {
  const last = t.n - 1;
  const fx = clamp(sx / t.step + last / 2, 0, last);
  const fy = clamp(sy / t.step + last / 2, 0, last);
  const i = Math.min(last - 1, Math.floor(fx));
  const j = Math.min(last - 1, Math.floor(fy));
  const u = fx - i;
  const v = fy - j;
  const h = (a: number, b: number) => {
    const w = t.h[b * t.n + a];
    return Number.isFinite(w) ? w : 0;
  };
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}

/** Height of the ground (m, 0 = the garden's ground) at a plan point. */
export type GroundFn = (x: number, z: number) => number;

/** The ground: flat (0) near the plan, the real height far out, a smooth blend between. Flat everywhere without terrain data. `toSite` is lib/geo.ts planToSite. */
export function groundFn(terrain: SiteTerrain | undefined, home: Rect, toSite: (p: XY) => XY): GroundFn {
  if (!terrain || terrain.n < 2 || terrain.h.length < terrain.n * terrain.n) return () => 0;
  return (x, z) => {
    const w = terrainBlend(rectDistance(x, z, home));
    if (w <= 0) return 0;
    const s = toSite([x, z]);
    return w * demAt(terrain, s[0], s[1]);
  };
}

/** The plan's footprint (bounds grown to whole `snap` metres, so editing a wall does not rebuild the world every pixel). */
export function homeRect(bounds: Rect | null | undefined, snap = 4): Rect {
  const b = bounds ?? { x0: 4, y0: 4, x1: 16, y1: 12 };
  return { x0: Math.floor(b.x0 / snap) * snap, y0: Math.floor(b.y0 / snap) * snap, x1: Math.ceil(b.x1 / snap) * snap, y1: Math.ceil(b.y1 / snap) * snap };
}

/** Is a plan point inside any of these outlines? (A quick bounds test first, so thousands of points against thousands of buildings stay cheap.) */
export function insideAny(list: readonly { ring: XY[]; holes: XY[][] }[]): (x: number, z: number) => boolean {
  const boxes = list.map((s) => ({ s, bb: polygonBounds(s.ring) }));
  return (x, z) => boxes.some(({ s, bb }) => x >= bb.x0 && x <= bb.x1 && z >= bb.y0 && z <= bb.y1 && pointInShape([x, z], s.ring, s.holes));
}

// ---------------------------------------------------------------- the ground grid

export type Grid = {
  /** vertices per side */
  n: number;
  /** metres between vertices */
  cell: number;
  positions: Float32Array;
  normals: Float32Array;
  /** each vertex in SITE axes (x east, y south), for texture coordinates */
  site: Float32Array;
  index: Uint16Array | Uint32Array;
};

/** A square grid of `2 * radius` metres about `center` (plan axes), `cell` metres apart, with heights from `ground`. */
export function terrainGrid(center: XY, radius: number, cell: number, ground: GroundFn, toSite: (p: XY) => XY): Grid {
  const n = Math.max(2, Math.ceil((2 * radius) / cell) + 1);
  const c = (2 * radius) / (n - 1);
  const heights = new Float32Array(n * n);
  const positions = new Float32Array(n * n * 3);
  const site = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = center[0] - radius + i * c;
      const z = center[1] - radius + j * c;
      const h = ground(x, z);
      const k = j * n + i;
      heights[k] = h;
      positions.set([x, h, z], k * 3);
      site.set(toSite([x, z]), k * 2);
    }
  }
  const normals = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dx = (heights[j * n + Math.min(n - 1, i + 1)] - heights[j * n + Math.max(0, i - 1)]) / (c * (Math.min(n - 1, i + 1) - Math.max(0, i - 1)));
      const dz = (heights[Math.min(n - 1, j + 1) * n + i] - heights[Math.max(0, j - 1) * n + i]) / (c * (Math.min(n - 1, j + 1) - Math.max(0, j - 1)));
      const l = Math.hypot(dx, 1, dz);
      normals.set([-dx / l, 1 / l, -dz / l], (j * n + i) * 3);
    }
  }
  const index = n * n > 65535 ? new Uint32Array((n - 1) * (n - 1) * 6) : new Uint16Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const d = a + n;
      const e = d + 1;
      // counter-clockwise seen from above (+y): x east, z south
      if ((i + j) % 2) index.set([a, d, e, a, e, b], q);
      else index.set([a, d, b, b, d, e], q);
      q += 6;
    }
  }
  return { n, cell: c, positions, normals, site, index };
}
