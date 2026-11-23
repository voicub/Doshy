import { WALL_T, planBounds } from "./geometry.ts";
import { onLevel, sortedLevels } from "./levels.ts";
import { expandRect, exposedEdges, isOpenAir, type Edge, type Rect } from "./stairs.ts";
import type { V3 } from "./mathUtil.ts";
import type { Building, Plan, Roof, RoofType } from "./types.ts";

/**
 * Automatic roof of a house, as plain data. Coordinates are [x, height above the top level's wall tops, z] with plan x/y as x/z.
 *
 * Limits (kept simple on purpose): the roof covers the TOP level's footprint only (a larger ground floor under a smaller upper
 * floor gets no roof of its own); a non-rectangular footprint is cut into rectangles and each gets the chosen roof type with
 * its ridge along its longer side. Where two rectangles meet the roofs just intersect (no real valley or hip junction), and a
 * side that touches a neighbour gets no overhang. A hip roof keeps one overhang for all four sides (0 unless every side is outer).
 */

export const ROOF_TYPES: readonly RoofType[] = ["gable", "hip", "shed", "flat"];
export const ROOF_DEFAULTS: Roof = { type: "gable", pitch: 30, overhang: 0.4 };
export const MIN_PITCH = 5;
export const MAX_PITCH = 60;
export const MAX_OVERHANG = 1.5;

const clampNum = (v: unknown, fallback: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** A complete, in-range roof from whatever was saved (absent fields fall back to the defaults). */
export const normalizeRoof = (r: Partial<Roof> | undefined): Roof => ({
  type: r?.type && ROOF_TYPES.includes(r.type) ? r.type : ROOF_DEFAULTS.type,
  pitch: clampNum(r?.pitch, ROOF_DEFAULTS.pitch, MIN_PITCH, MAX_PITCH),
  overhang: clampNum(r?.overhang, ROOF_DEFAULTS.overhang, 0, MAX_OVERHANG),
});

/** The roof of a plan's building: only a house has one. */
export const roofOf = (plan: { building?: Building }): Roof | null => (plan.building?.type === "house" ? normalizeRoof(plan.building.roof) : null);

// ---- footprint ----

const SNAP = 0.02; // plan coordinates closer than this are one grid line (rooms drawn a hair off each other)
const MIN_ROOM_SIDE = 0.3; // thinner "rooms" are door thresholds / opening strips, not part of the building's shape

/** Outer shape of a level as rectangles: its roofed rooms grown to the outside face of their walls, else the walls' bounds. Empty when the level has neither. */
export function roofFootprint(plan: Plan, levelId: string): Rect[] {
  const on = onLevel(plan, levelId);
  const rooms = on.rooms.filter((r) => !isOpenAir(r) && Math.min(r.w, r.h) >= MIN_ROOM_SIDE).map((r) => expandRect(r, WALL_T));
  if (rooms.length) return rooms;
  const b = planBounds({ walls: on.walls, openings: [], rooms: [], items: [] });
  return b ? [expandRect({ x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }, WALL_T / 2)] : [];
}

/** Sorted grid lines; values within SNAP of the previous line merge into it. */
function gridLines(vals: number[]): number[] {
  const out: number[] = [];
  for (const v of [...vals].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > SNAP) out.push(v);
  return out;
}

type Strip = { a0: number; a1: number; b0: number; b1: number };

/** Runs of covered cells along `a`, merged across consecutive `b` rows when they have the same extent. cov[b][a] */
function strips(cov: boolean[][], nA: number, nB: number): Strip[] {
  const out: Strip[] = [];
  let open = new Map<string, Strip>();
  for (let b = 0; b < nB; b++) {
    const next = new Map<string, Strip>();
    for (let a = 0; a < nA; ) {
      if (!cov[b][a]) {
        a++;
        continue;
      }
      let e = a;
      while (e < nA && cov[b][e]) e++;
      const key = `${a}:${e}`;
      const s = open.get(key);
      if (s) s.b1 = b + 1;
      else out.push({ a0: a, a1: e, b0: b, b1: b + 1 });
      next.set(key, s ?? out[out.length - 1]);
      a = e;
    }
    open = next;
  }
  return out;
}

/**
 * Cut the union of `rects` into non-overlapping rectangles that together cover exactly the union (no gaps, no overlaps).
 * Tries horizontal and vertical cuts and keeps the one with fewer pieces (then the one with bigger pieces).
 * ponytail: greedy strip merge, not the minimum rectangle partition; a plus shape gives 3 or 4 pieces either way.
 */
export function decomposeRects(rects: Rect[]): Rect[] {
  if (!rects.length) return [];
  const xs = gridLines(rects.flatMap((r) => [r.x, r.x + r.w]));
  const ys = gridLines(rects.flatMap((r) => [r.y, r.y + r.h]));
  const covered = (i: number, j: number) => {
    const cx = (xs[i] + xs[i + 1]) / 2;
    const cy = (ys[j] + ys[j + 1]) / 2;
    return rects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h);
  };
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const rows = Array.from({ length: ny }, (_, j) => Array.from({ length: nx }, (_, i) => covered(i, j)));
  const cols = Array.from({ length: nx }, (_, i) => rows.map((row) => row[i]));
  const h: Rect[] = strips(rows, nx, ny).map((s) => ({ x: xs[s.a0], y: ys[s.b0], w: xs[s.a1] - xs[s.a0], h: ys[s.b1] - ys[s.b0] }));
  const v: Rect[] = strips(cols, ny, nx).map((s) => ({ x: xs[s.b0], y: ys[s.a0], w: xs[s.b1] - xs[s.b0], h: ys[s.a1] - ys[s.a0] }));
  const score = (l: Rect[]) => l.reduce((n, r) => n + (r.w * r.h) ** 2, 0);
  return v.length < h.length || (v.length === h.length && score(v) > score(h) + 1e-9) ? v : h;
}

// ---- geometry ----

/** A flat polygon (3 or 4 points, counter-clockwise seen from outside) with its unit outward normal. */
export type RoofFace = { pts: V3[]; normal: V3 };
type RoofGeometry = { faces: RoofFace[]; rects: Rect[]; /** highest point above the wall tops (m) */ peak: number };

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Polygon with its normal, wound so the normal points the way of `out` (a rough outward direction). Null when degenerate. */
function face(pts: V3[], out: V3): RoofFace | null {
  const p = pts.filter((q, i) => {
    const n = pts[(i + 1) % pts.length];
    return Math.hypot(q[0] - n[0], q[1] - n[1], q[2] - n[2]) > 1e-9;
  });
  if (p.length < 3) return null;
  const n: V3 = [0, 0, 0]; // Newell: robust for any planar polygon
  p.forEach((a, i) => {
    const b = p[(i + 1) % p.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  });
  const len = Math.hypot(...n);
  if (len < 1e-9) return null;
  const flip = dot(n, out) < 0;
  return { pts: flip ? p.reverse() : p, normal: n.map((c) => (flip ? -c : c) / len) as V3 };
}

type Sides = { w: boolean; e: boolean; n: boolean; s: boolean };

/** Which sides of `r` face the outside (not the middle of another rectangle). */
function exposedSides(r: Rect, all: Rect[]): Sides {
  const free = (x: number, y: number) => !all.some((q) => q !== r && x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const p = 0.01;
  return { w: free(r.x - p, cy), e: free(r.x + r.w + p, cy), n: free(cx, r.y - p), s: free(cx, r.y + r.h + p) };
}

const FLAT_T = 0.12; // flat roof slab thickness above the wall tops
const PARAPET_H = 0.35;
const PARAPET_T = 0.15;

/** Slab of a flat roof over one rectangle, with a fascia along its outer sides. */
function flatSlab(r: Rect, ex: Sides, ovh: number): RoofFace[] {
  const x0 = r.x - (ex.w ? ovh : 0);
  const x1 = r.x + r.w + (ex.e ? ovh : 0);
  const z0 = r.y - (ex.n ? ovh : 0);
  const z1 = r.y + r.h + (ex.s ? ovh : 0);
  const T = FLAT_T;
  return [
    face([[x0, T, z0], [x1, T, z0], [x1, T, z1], [x0, T, z1]], [0, 1, 0]),
    ex.w && face([[x0, 0, z0], [x0, T, z0], [x0, T, z1], [x0, 0, z1]], [-1, 0, 0]),
    ex.e && face([[x1, 0, z0], [x1, T, z0], [x1, T, z1], [x1, 0, z1]], [1, 0, 0]),
    ex.n && face([[x0, 0, z0], [x1, 0, z0], [x1, T, z0], [x0, T, z0]], [0, 0, -1]),
    ex.s && face([[x0, 0, z1], [x1, 0, z1], [x1, T, z1], [x0, T, z1]], [0, 0, 1]),
  ].filter((f): f is RoofFace => !!f);
}

/** Low wall around the outer edge of a flat roof, standing on the slab. */
function parapet(edges: Edge[]): RoofFace[] {
  const top = FLAT_T + PARAPET_H;
  return edges
    .flatMap((e) => {
      const ix = -e.nx * PARAPET_T;
      const iz = -e.ny * PARAPET_T;
      return [
        face([[e.x0, FLAT_T, e.y0], [e.x1, FLAT_T, e.y1], [e.x1, top, e.y1], [e.x0, top, e.y0]], [e.nx, 0, e.ny]),
        face([[e.x0 + ix, FLAT_T, e.y0 + iz], [e.x1 + ix, FLAT_T, e.y1 + iz], [e.x1 + ix, top, e.y1 + iz], [e.x0 + ix, top, e.y0 + iz]], [-e.nx, 0, -e.ny]),
        face([[e.x0, top, e.y0], [e.x1, top, e.y1], [e.x1 + ix, top, e.y1 + iz], [e.x0 + ix, top, e.y0 + iz]], [0, 1, 0]),
      ];
    })
    .filter((f): f is RoofFace => !!f);
}

/** One rectangle's pitched roof. Canonical frame: u along the longer side (the ridge), v across it, h up. */
function pitchedRoof(r: Rect, ex: Sides, roof: Roof): RoofFace[] {
  const alongX = r.w >= r.h;
  const [L, S] = alongX ? [r.w, r.h] : [r.h, r.w];
  const [eu0, eu1, ev0, ev1] = alongX ? [ex.w, ex.e, ex.n, ex.s] : [ex.n, ex.s, ex.w, ex.e];
  const o = { u0: eu0 ? roof.overhang : 0, u1: eu1 ? roof.overhang : 0, v0: ev0 ? roof.overhang : 0, v1: ev1 ? roof.overhang : 0 };
  const t = Math.tan((roof.pitch * Math.PI) / 180);
  const F = (pts: V3[], out: V3) =>
    face(
      pts.map(([u, v, h]): V3 => (alongX ? [r.x + u, h, r.y + v] : [r.x + v, h, r.y + u])),
      alongX ? [out[0], out[2], out[1]] : [out[1], out[2], out[0]],
    );
  const rise = (S / 2) * t;
  let faces: (RoofFace | null)[];
  if (roof.type === "gable") {
    faces = [
      F([[-o.u0, -o.v0, -o.v0 * t], [L + o.u1, -o.v0, -o.v0 * t], [L + o.u1, S / 2, rise], [-o.u0, S / 2, rise]], [0, -t, 1]),
      F([[-o.u0, S + o.v1, -o.v1 * t], [L + o.u1, S + o.v1, -o.v1 * t], [L + o.u1, S / 2, rise], [-o.u0, S / 2, rise]], [0, t, 1]),
      F([[0, 0, 0], [0, S, 0], [0, S / 2, rise]], [-1, 0, 0]), // gable ends close the wall tops under the verge
      F([[L, 0, 0], [L, S, 0], [L, S / 2, rise]], [1, 0, 0]),
    ];
  } else if (roof.type === "hip") {
    const ov = Math.min(o.u0, o.u1, o.v0, o.v1);
    const a = S / 2;
    faces = [
      F([[-ov, -ov, -ov * t], [L + ov, -ov, -ov * t], [L - a, a, rise], [a, a, rise]], [0, -t, 1]),
      F([[-ov, S + ov, -ov * t], [L + ov, S + ov, -ov * t], [L - a, a, rise], [a, a, rise]], [0, t, 1]),
      F([[-ov, -ov, -ov * t], [-ov, S + ov, -ov * t], [a, a, rise]], [-t, 0, 1]),
      F([[L + ov, -ov, -ov * t], [L + ov, S + ov, -ov * t], [L - a, a, rise]], [t, 0, 1]),
    ];
  } else {
    // shed: the high edge is the v = 0 side, the roof drops across the whole span
    const R = S * t;
    faces = [
      F([[-o.u0, -o.v0, (S + o.v0) * t], [L + o.u1, -o.v0, (S + o.v0) * t], [L + o.u1, S + o.v1, -o.v1 * t], [-o.u0, S + o.v1, -o.v1 * t]], [0, t, 1]),
      F([[0, 0, 0], [L, 0, 0], [L, 0, R], [0, 0, R]], [0, -1, 0]), // wall carried up to the high edge
      F([[0, 0, 0], [0, S, 0], [0, 0, R]], [-1, 0, 0]),
      F([[L, 0, 0], [L, S, 0], [L, 0, R]], [1, 0, 0]),
    ];
  }
  return faces.filter((f): f is RoofFace => !!f);
}

/** Roof over a footprint (any set of rectangles; overlaps and tiny gaps are healed by `decomposeRects`). */
export function buildRoof(footprint: Rect[], roof: Roof): RoofGeometry {
  const rects = decomposeRects(footprint);
  const slabs = (r: Rect) => (roof.type === "flat" ? flatSlab(r, exposedSides(r, rects), roof.overhang) : pitchedRoof(r, exposedSides(r, rects), roof));
  const faces = [...rects.flatMap(slabs), ...(roof.type === "flat" ? parapet(exposedEdges(rects)) : [])];
  return { faces, rects, peak: Math.max(0, ...faces.flatMap((f) => f.pts.map((p) => p[1]))) };
}

/** The roof of a plan: null for an apartment (or a house with nothing built on its top level). Sits on the highest level. */
export function roofForPlan(plan: Plan): RoofGeometry | null {
  const roof = roofOf(plan);
  if (!roof) return null;
  const top = sortedLevels(plan).at(-1);
  if (!top) return null;
  const footprint = roofFootprint(plan, top.id);
  return footprint.length ? buildRoof(footprint, roof) : null;
}

/** Flat-shaded triangle buffers for three.js. UVs are metres on the face (first edge = u), so a texture's repeat is 1 / tile size. */
export function roofBuffers(faces: RoofFace[]) {
  const verts = faces.reduce((s, f) => s + f.pts.length, 0);
  const positions = new Float32Array(verts * 3);
  const normals = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const indices = new Uint32Array(faces.reduce((s, f) => s + (f.pts.length - 2) * 3, 0));
  let v = 0;
  let k = 0;
  for (const f of faces) {
    const [p0, p1] = f.pts;
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) || 1;
    const e1: V3 = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len, (p1[2] - p0[2]) / len];
    const n = f.normal;
    const e2: V3 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    const base = v;
    for (const p of f.pts) {
      const d: V3 = [p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]];
      positions.set(p, v * 3);
      normals.set(n, v * 3);
      uvs.set([dot(d, e1), dot(d, e2)], v * 2);
      v++;
    }
    for (let i = 1; i < f.pts.length - 1; i++, k += 3) indices.set([base, base + i, base + i + 1], k);
  }
  return { positions, normals, uvs, indices };
}
