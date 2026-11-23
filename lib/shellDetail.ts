import { isFence } from "./fences.ts";
import { wallSides } from "./materials.ts";
import { styleOf } from "./openings.ts";
import type { Opening, Plan, Wall } from "./types.ts";

// Pure geometry of the building shell's trims: skirting boards, crown moulding, door and window casings (architraves), sills, plinths.
// A trim is a small 2D profile swept along a line; mitred ends make casings meet at 45 degrees. No three.js here: plain typed arrays so it runs
// under node (lib/shellDetail.test.ts) and the scene turns the arrays into one BufferGeometry per wall.

/** Polygon of a trim's cross-section: [d, z] pairs, d = across the strip (up a wall for a skirting, outward from an opening for a casing), z = how far it stands proud of the wall. */
export type Profile = readonly (readonly [number, number])[];
/** `groups` (when a mesh needs several materials): index ranges in `indices`, `tag` = material index. */
export type MeshData = { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array; groups?: { start: number; count: number; tag: number }[] };
type Vec3 = readonly [number, number, number];
/** Where a swept strip lives: `s` is the direction it runs, `d` the profile's across direction, `z` the profile's proud direction (all unit vectors), `o` where s = d = z = 0 is. */
type Basis = { o: Vec3; s: Vec3; d: Vec3; z: Vec3 };

// ---- profiles (metres) ------------------------------------------------------------------------------------------------------

/** Classic skirting board: 9 cm tall, 1.6 cm proud, a rounded top edge (stepped) and a small bead. */
export const SKIRTING: Profile = [[0, 0], [0, 0.016], [0.062, 0.016], [0.07, 0.013], [0.078, 0.013], [0.086, 0.007], [0.09, 0.003], [0.09, 0]];
/** Door and window casing: 7 cm wide, 1.4 cm proud at the inner edge stepping down to the wall, a rounded outer edge. */
export const CASING: Profile = [[0, 0], [0, 0.014], [0.006, 0.016], [0.05, 0.016], [0.062, 0.011], [0.07, 0.004], [0.07, 0]];
/** Crown moulding: a 5 cm cove where the wall meets the ceiling. d runs down from the ceiling. */
const CROWN: Profile = [[0, 0], [0, 0.002], [0.004, 0.02], [0.016, 0.036], [0.034, 0.046], [0.05, 0.05], [0.05, 0]];
/** Outside base course of a wall: a 20 cm band standing 2 cm proud with a sloped top. */
export const PLINTH: Profile = [[0, 0], [0, 0.022], [0.19, 0.022], [0.2, 0.01], [0.2, 0]];
/** Window sill (inside the room): a 3 cm board with a rounded nose. d = across the nose (toward the room), z = height. */
export const SILL_IN: Profile = [[0, 0], [0.095, 0], [0.105, 0.004], [0.11, 0.013], [0.11, 0.022], [0.105, 0.03], [0.095, 0.034], [0, 0.034]];
/** Stone sill outside: 4 cm thick with a sloped top shedding water and a drip groove under the nose. */
export const SILL_OUT: Profile = [[0, 0], [0.025, 0], [0.025, 0.006], [0.095, 0.006], [0.095, 0], [0.12, 0], [0.12, 0.03], [0, 0.045]];

export const SKIRT_H = SKIRTING[SKIRTING.length - 1][0];
export const CASING_W = CASING[CASING.length - 1][0];
const CROWN_H = CROWN[CROWN.length - 1][0];
const PLINTH_H = PLINTH[PLINTH.length - 1][0];

// ---- sweeping a profile -------------------------------------------------------------------------------------------------------

const add = (p: Vec3, v: Vec3, k: number): [number, number, number] => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];
const scale = (v: Vec3, k: number): [number, number, number] => [v[0] * k, v[1] * k, v[2] * k];

/** Signed area of a profile (shoelace): which way round its points go decides which side of each edge is "outside". */
function area(p: Profile): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % p.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

class Builder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  buckets = new Map<number, number[]>();
  /** A triangle whose winding is flipped when it disagrees with the wanted normal `n`, so faces stay lit from the outside whatever handedness the basis has. `tag` picks its material group. */
  tri(a: Vec3, b: Vec3, c: Vec3, n: Vec3, uv: readonly [number, number][], tag = 0) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0;
    const base = this.positions.length / 3;
    const pts = flip ? [a, c, b] : [a, b, c];
    const t = flip ? [uv[0], uv[2], uv[1]] : uv;
    pts.forEach((p, i) => {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.uvs.push(t[i][0], t[i][1]);
    });
    let list = this.buckets.get(tag);
    if (!list) this.buckets.set(tag, (list = []));
    list.push(base, base + 1, base + 2);
  }
  done(): MeshData {
    const tags = [...this.buckets.keys()].sort((x, y) => x - y);
    const indices = Uint32Array.from(tags.flatMap((t) => this.buckets.get(t) ?? []));
    let start = 0;
    const groups = tags.map((tag) => {
      const count = (this.buckets.get(tag) ?? []).length;
      const g = { start, count, tag };
      start += count;
      return g;
    });
    return { positions: new Float32Array(this.positions), normals: new Float32Array(this.normals), uvs: new Float32Array(this.uvs), indices, ...(groups.length > 1 ? { groups } : {}) };
  }
}

const unit = (v: Vec3): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

type SweepOpts = {
  /** Also build the edges that lie on z = 0 (the back of a strip is normally against the wall and left out). */
  back?: boolean;
  /** Material group of profile edge `i` (default 0). */
  tag?: (edge: number) => number;
  /** Material groups of the start and end caps (default 0). */
  capTags?: readonly [number, number];
};

function sweepInto(out: Builder, profile: Profile, from: number, to: number, mit0: number, mit1: number, basis: Basis, opts: SweepOpts = {}) {
  const sign = area(profile) >= 0 ? 1 : -1;
  const at = (s: number, d: number, z: number) => add(add(add(basis.o, basis.s, s), basis.d, d), basis.z, z);
  const n = profile.length;
  let run = 0;
  for (let i = 0; i < n; i++) {
    const [d0, z0] = profile[i];
    const [d1, z1] = profile[(i + 1) % n];
    const len = Math.hypot(d1 - d0, z1 - z0);
    if (len < 1e-9) continue;
    if (!opts.back && z0 === 0 && z1 === 0) { run += len; continue; } // the back, against the wall
    // outward normal of the edge in the (d, z) plane
    const nd = ((z1 - z0) / len) * sign;
    const nz = (-(d1 - d0) / len) * sign;
    const nrm = unit(add(scale(basis.d, nd), basis.z, nz));
    const s00 = from - mit0 * d0, s01 = to + mit1 * d0;
    const s10 = from - mit0 * d1, s11 = to + mit1 * d1;
    const p0 = at(s00, d0, z0), p1 = at(s01, d0, z0), p2 = at(s11, d1, z1), p3 = at(s10, d1, z1);
    const tag = opts.tag?.(i) ?? 0;
    out.tri(p0, p1, p2, nrm, [[s00, run], [s01, run], [s11, run + len]], tag);
    out.tri(p0, p2, p3, nrm, [[s00, run], [s11, run + len], [s10, run + len]], tag);
    run += len;
  }
  // end caps: fan from the profile's middle; the end plane leans with the mitre
  const cd = profile.reduce((a, p) => a + p[0], 0) / n;
  const cz = profile.reduce((a, p) => a + p[1], 0) / n;
  const cap = (mit: number, dir: 1 | -1, tag: number) => {
    const nrm = unit(add(scale(basis.s, dir), basis.d, -mit));
    const pos = (d: number) => (dir === 1 ? to + mit * d : from - mit * d);
    const c = at(pos(cd), cd, cz);
    for (let i = 0; i < n; i++) {
      const [d0, z0] = profile[i];
      const [d1, z1] = profile[(i + 1) % n];
      out.tri(c, at(pos(d0), d0, z0), at(pos(d1), d1, z1), nrm, [[0, 0], [1, 0], [1, 1]], tag);
    }
  };
  cap(mit0, -1, opts.capTags?.[0] ?? 0);
  cap(mit1, 1, opts.capTags?.[1] ?? 0);
}

/**
 * `profile` swept along `basis.s` from `from` to `to` (metres along the strip at its inner edge d = 0). `mit0`/`mit1` are 0 for a square cut and
 * +1 for a 45 degree mitre that lengthens the strip toward its outer edge (two such strips meeting at a corner close exactly).
 */
export function sweepProfile(profile: Profile, from: number, to: number, mit0: 0 | 1, mit1: 0 | 1, basis: Basis, opts?: SweepOpts): MeshData {
  const b = new Builder();
  sweepInto(b, profile, from, to, mit0, mit1, basis, opts);
  return b.done();
}

/** Several meshes in one set of arrays (one draw call). */
export function mergeMeshData(parts: readonly MeshData[]): MeshData {
  const v = parts.reduce((a, p) => a + p.positions.length, 0);
  const i = parts.reduce((a, p) => a + p.indices.length, 0);
  const out: MeshData = { positions: new Float32Array(v), normals: new Float32Array(v), uvs: new Float32Array((v / 3) * 2), indices: new Uint32Array(i) };
  let vo = 0;
  let io = 0;
  for (const p of parts) {
    out.positions.set(p.positions, vo);
    out.normals.set(p.normals, vo);
    out.uvs.set(p.uvs, (vo / 3) * 2);
    for (let k = 0; k < p.indices.length; k++) out.indices[io + k] = p.indices[k] + vo / 3;
    vo += p.positions.length;
    io += p.indices.length;
  }
  return out;
}

// ---- where trims go along a wall ----------------------------------------------------------------------------------------------

/** An opening in a wall's own frame: s0..s1 metres along the wall, `sill` to `sill + height` above the floor. */
export type Span = { s0: number; s1: number; sill: number; top: number; casing: boolean };
export type Run = { s0: number; s1: number };

/** Styles that get a rectangular casing: arches, round and bay windows, garage doors, gates and floor-to-ceiling glass have their own surrounds. */
const NO_CASING: Record<string, true> = { arch: true, arched: true, round: true, bay: true, garageSectional: true, garageRoller: true, gate: true, wicket: true, shopfront: true };
export const hasCasing = (style: string) => !NO_CASING[style];

/**
 * The stretches of a wall (0..len) a strip at heights y0..y1 runs along: the whole length minus every opening that crosses that band,
 * and minus `gap` either side of an opening that wears a casing (the strip butts into the casing, not under it). Zero-length runs are dropped.
 */
export function runsAround(len: number, spans: readonly Span[], y0: number, y1: number, gap: number): Run[] {
  const cuts = spans
    .filter((o) => o.sill < y1 && o.top > y0)
    .map((o) => ({ s0: o.s0 - (o.casing ? gap : 0), s1: o.s1 + (o.casing ? gap : 0) }))
    .sort((a, b) => a.s0 - b.s0);
  const out: Run[] = [];
  let cur = 0;
  for (const c of cuts) {
    if (c.s0 > cur + 1e-6) out.push({ s0: cur, s1: Math.min(c.s0, len) });
    cur = Math.max(cur, c.s1);
  }
  if (cur < len - 1e-6) out.push({ s0: cur, s1: len });
  return out.filter((r) => r.s1 - r.s0 > 1e-3);
}

/** Wall-local basis for a strip on one face: x along the wall, y up, face `side` (+1 = local +z) at z = side * t / 2. */
const faceBasis = (x: number, y: number, t: number, side: 1 | -1, s: Vec3, d: Vec3): Basis => ({ o: [x, y, (side * t) / 2], s, d, z: [0, 0, side] });

/** A skirting-like strip lying along the wall on one face over the given runs, `y` above the floor. `down` hangs it from y instead of standing it on y. */
export function stripAlongWall(profile: Profile, runs: readonly Run[], y: number, t: number, side: 1 | -1, down = false): MeshData {
  return mergeMeshData(runs.map((r) => sweepProfile(profile, 0, r.s1 - r.s0, 0, 0, faceBasis(r.s0, y, t, side, [1, 0, 0], [0, down ? -1 : 1, 0]))));
}

/** Casing around a rectangular opening on one face: two jambs and a head, mitred where they meet (a window's casing has no bottom strip: its sill closes it). `head` false leaves the lintel off (a cut-away wall ends below it). */
export function casingAround(o: Span, floor: number, t: number, side: 1 | -1, head = true, profile: Profile = CASING): MeshData {
  const y0 = o.sill <= floor + 1e-6 ? floor : o.sill;
  const m = head ? 1 : 0;
  const parts: MeshData[] = [
    sweepProfile(profile, 0, o.top - y0, 0, m, faceBasis(o.s0, y0, t, side, [0, 1, 0], [-1, 0, 0])),
    sweepProfile(profile, 0, o.top - y0, 0, m, faceBasis(o.s1, y0, t, side, [0, 1, 0], [1, 0, 0])),
  ];
  if (head) parts.push(sweepProfile(profile, 0, o.s1 - o.s0, 1, 1, faceBasis(o.s0, o.top, t, side, [1, 0, 0], [0, 1, 0])));
  return mergeMeshData(parts);
}

/** A copy of `m` moved `dx` along x. */
function shiftX(m: MeshData, dx: number): MeshData {
  const positions = Float32Array.from(m.positions);
  for (let i = 0; i < positions.length; i += 3) positions[i] += dx;
  return { ...m, positions };
}

export const FLOOR_T = 0.06; // RoomFloor's slab: skirting stands on it
/** The faces of a wall that get trim: `inside` = faces looking into a room (+1 = local +z), `outside` = the face looking out (0 = none). */
export type TrimFaces = { inside: readonly (1 | -1)[]; outside: 1 | -1 | 0 };

/** The openings of a wall as spans in its own frame (metres from the wall's start, 0..len), tops clipped to `top` in cut-away. One entirely beyond the wall's ends is dropped. */
export function openingSpans(openings: readonly Opening[], len: number, top: number): Span[] {
  const out: Span[] = [];
  for (const o of openings) {
    const s0 = Math.max(0, o.t * len - o.width / 2);
    const s1 = Math.min(len, o.t * len + o.width / 2);
    if (o.sill < top && s1 > s0) out.push({ s0, s1, sill: o.sill, top: Math.min(o.sill + o.height, top), casing: hasCasing(styleOf(o)) });
  }
  return out;
}

/** Which faces of `wall` carry trim: skirting on the faces that look into a room, the base course and a thin casing on the one that looks out; fences and walls between no rooms carry none. */
export function trimFaces(plan: Plan, wall: Wall): TrimFaces {
  if (isFence(wall.style)) return { inside: [], outside: 0 };
  const s = wallSides(plan, wall);
  const sign = (f: "A" | "B" | undefined) => (f === "A" ? 1 : -1);
  return s.kind === "interior" ? { inside: [1, -1], outside: 0 } : s.kind === "exterior" ? { inside: [sign(s.inside)], outside: sign(s.outside) } : { inside: [], outside: 0 };
}

type WallTrimInput = { len: number; t: number; height: number; top: number; spans: readonly Span[]; faces: TrimFaces; ground: boolean; crown: boolean };

/**
 * Every trim of one wall (`height` tall, cut at `top` in cut-away) in the wall's own frame as the scene draws it: x runs along the wall from -len/2 to len/2
 * (its middle is the origin, like the wall slab and its openings), y up from the floor, z across (the faces sit at +-t/2). `paint` = skirting, crown moulding
 * and casings (one painted colour), `base` = the dark base course of a ground-floor outside face; each null when there is nothing to draw.
 * A casing's lintel is left off when it would not fit under the wall's top.
 */
export function wallTrims({ len, t, height, top, spans, faces, ground, crown }: WallTrimInput): { paint: MeshData | null; base: MeshData | null } {
  const casings = (side: 1 | -1) => spans.filter((o) => o.casing).map((o) => casingAround(o, FLOOR_T, t, side, o.top + CASING_W <= top));
  const paint: MeshData[] = [];
  for (const side of faces.inside) {
    paint.push(stripAlongWall(SKIRTING, runsAround(len, spans, FLOOR_T, FLOOR_T + SKIRT_H, CASING_W), FLOOR_T, t, side));
    if (crown) paint.push(stripAlongWall(CROWN, runsAround(len, spans, height - CROWN_H, height, CASING_W), height, t, side, true));
    paint.push(...casings(side));
  }
  if (faces.outside) paint.push(...casings(faces.outside));
  const base = ground && faces.outside ? [stripAlongWall(PLINTH, runsAround(len, spans, 0, PLINTH_H, CASING_W), 0, t, faces.outside)] : [];
  const centred = (parts: MeshData[]) => (parts.length ? shiftX(mergeMeshData(parts), -len / 2) : null);
  return { paint: centred(paint), base: centred(base) };
}

// ---- texture coordinates in metres ---------------------------------------------------------------------------------------------

/**
 * Rewrite `uv` of a box-like mesh (a wall, a floor slab) so one texture tile spans `tile` metres: each vertex is projected along the axis its
 * normal mostly points down, so the grain keeps its size whatever the box measures. `tileFor` gives the tile (and whether to swap u and v,
 * for vertical grain) per face direction; `o` is the world position of the local origin, so neighbouring pieces line up.
 */
export type FaceTile = { tile: number; swap?: boolean };
export function metricUv(position: ArrayLike<number>, normal: ArrayLike<number>, uv: Float32Array, o: Vec3, tileFor: (nx: number, ny: number, nz: number) => FaceTile): void {
  const n = uv.length / 2;
  for (let i = 0; i < n; i++) {
    const x = position[i * 3] + o[0];
    const y = position[i * 3 + 1] + o[1];
    const z = position[i * 3 + 2] + o[2];
    const nx = normal[i * 3], ny = normal[i * 3 + 1], nz = normal[i * 3 + 2];
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const { tile, swap } = tileFor(nx, ny, nz);
    let u: number, v: number;
    if (az >= ax && az >= ay) { u = x; v = y; } else if (ax >= ay) { u = z; v = y; } else { u = x; v = z; }
    uv[i * 2] = (swap ? v : u) / tile;
    uv[i * 2 + 1] = (swap ? u : v) / tile;
  }
}

// ---- wall ends ------------------------------------------------------------------------------------------------------------------

type Seg = { id: string; a: { x: number; y: number }; b: { x: number; y: number } };
const MEET = 0.02; // metres: wall end points closer than this are the same point

/**
 * Which ends of `wall` (start, end) need no overshoot. Walls normally reach half a thickness past their end so an L corner closes, but where the end
 * meets another wall's middle (a T) or runs on collinearly into one, that overshoot would lie inside or on the other wall and draw coplanar faces on
 * top of each other (flicker): such an end stops exactly at its point.
 */
export function buttEnds(wall: Seg, others: readonly Seg[]): [boolean, boolean] {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const butts = (p: { x: number; y: number }, out: 1 | -1) =>
    others.some((o) => {
      if (o.id === wall.id) return false;
      const ex = o.b.x - o.a.x;
      const ey = o.b.y - o.a.y;
      const el = Math.hypot(ex, ey) || 1;
      const along = ((p.x - o.a.x) * ex + (p.y - o.a.y) * ey) / el; // metres from o's start
      const off = Math.abs((p.x - o.a.x) * ey - (p.y - o.a.y) * ex) / el;
      if (off < MEET && along > MEET && el - along > MEET) return true; // p lies in the middle of o: a T
      // direction of `o` leaving the shared end point, compared with the direction `wall` continues in
      for (const [q, far] of [[o.a, o.b], [o.b, o.a]] as const) {
        if (Math.hypot(q.x - p.x, q.y - p.y) > MEET) continue;
        const ox = far.x - q.x;
        const oy = far.y - q.y;
        const cross = (dx * oy - dy * ox) / (len * el);
        const dot = ((dx * ox + dy * oy) / (len * el)) * out;
        if (Math.abs(cross) < 0.01 && dot > 0.99) return true;
      }
      return false;
    });
  return [butts(wall.a, -1), butts(wall.b, 1)];
}

// ---- the wall itself ------------------------------------------------------------------------------------------------------------

/** Material groups of a wall slab, the same order as a three.js box: +x end, -x end, top, bottom, +z face (A), -z face (B). */
const WALL_TAG = { endPlus: 0, endMinus: 1, top: 2, bottom: 3, faceA: 4, faceB: 5 } as const;

/**
 * A wall segment `w` long (x), `h` tall (y), `t` thick (z), centred on its own origin: a box whose two top edges along its length are rounded
 * (radius `r`, `seg` steps) and whose ends are flat. Neighbouring segments of one wall (either side of a door) therefore meet without a
 * groove between them, unlike a box rounded on every edge. Faces are grouped like WALL_TAG.
 */
export function wallSlab(w: number, h: number, t: number, r: number, seg: number): MeshData {
  const rad = seg > 0 ? Math.min(r, t / 2 - 1e-4, h - 1e-4) : 0;
  const steps = rad > 0 ? seg : 0;
  const pts: [number, number][] = [[-t / 2, 0], [t / 2, 0]];
  const arc = (cx: number, from: number) => {
    for (let i = 0; i <= steps; i++) {
      const a = from + (i / steps) * (Math.PI / 2);
      pts.push([cx + rad * Math.cos(a), h - rad + rad * Math.sin(a)]);
    }
  };
  if (steps > 0) {
    arc(t / 2 - rad, 0);
    arc(-t / 2 + rad, Math.PI / 2);
  } else {
    pts.push([t / 2, h], [-t / 2, h]);
  }
  const last = pts.length - 1;
  const tag = (i: number) => (i === 0 ? WALL_TAG.bottom : i === 1 ? WALL_TAG.faceA : i === last ? WALL_TAG.faceB : WALL_TAG.top);
  return sweepProfile(pts, -w / 2, w / 2, 0, 0, { o: [0, -h / 2, 0], s: [1, 0, 0], d: [0, 0, 1], z: [0, 1, 0] }, { back: true, tag, capTags: [WALL_TAG.endMinus, WALL_TAG.endPlus] });
}
