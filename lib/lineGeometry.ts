import type { Tris } from "./groundGeo.ts";
import type { PavementSides, Pt, RoadMarks } from "./types.ts";

// Maths on a drawn polyline (plan metres, y down): length, even stations along it, a smooth curve through its points. Pure; the ribbons, markings and
// kerbs of roads are built on top of these (same file, below), the lamps of a lamp line use `stationsAlong`.

const EPS = 1e-6;
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Points with consecutive duplicates (closer than a micrometre) removed: a double click leaves two equal ones. */
export const distinctPoints = (pts: readonly Pt[]): Pt[] => pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > EPS);

/** Length of the polyline in metres. */
export function lineLength(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

/** A point on a line: `s` metres from its start, `angle` = the direction of travel there (radians, atan2(dy, dx) in plan axes). */
export type Station = { x: number; y: number; angle: number; s: number };

/** The point `s` metres along the polyline (clamped to its ends) with the direction of the segment it falls in. Null for fewer than two distinct points. */
export function pointAtLength(pts: readonly Pt[], s: number): Station | null {
  const line = distinctPoints(pts);
  if (line.length < 2) return null;
  let run = 0;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const l = dist(a, b);
    if (s <= run + l || i === line.length - 1) {
      const t = Math.min(1, Math.max(0, (s - run) / l));
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x), s: run + t * l };
    }
    run += l;
  }
  return null;
}

/**
 * Stations spaced evenly along the polyline, one at each end. The line is cut into `round(length / spacing)` equal spans (at least one), so the real gap is
 * the nearest even one to `spacing` and the remainder is shared out, never left as a short last gap. A line shorter than half a spacing still gets its two ends.
 */
export function stationsAlong(pts: readonly Pt[], spacing: number): Station[] {
  const len = lineLength(pts);
  if (!(len > EPS) || !(spacing > EPS)) return [];
  const spans = Math.max(1, Math.round(len / spacing));
  const out: Station[] = [];
  for (let i = 0; i <= spans; i++) {
    const st = pointAtLength(pts, (len * i) / spans);
    if (st) out.push(st);
  }
  return out;
}

const ALPHA = 0.5; // centripetal: no loops or overshoot at sharp bends
const CURVE_STEP = 0.6; // metres between the points of a smoothed line: round enough to the eye, cheap in triangles
const MAX_SUBDIV = 24;

/** Centripetal Catmull-Rom point at parameter `u` (0..1) between p1 and p2, with p0 and p3 their neighbours (Barry-Goldman form). */
function catmull(p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt {
  const t1 = dist(p0, p1) ** ALPHA;
  const t2 = t1 + dist(p1, p2) ** ALPHA;
  const t3 = t2 + dist(p2, p3) ** ALPHA;
  const t = t1 + (t2 - t1) * u;
  const mix = (a: Pt, b: Pt, ta: number, tb: number): Pt => {
    const k = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };
  const a1 = mix(p0, p1, 0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  return mix(mix(a1, a2, 0, t2), mix(a2, a3, t1, t3), t1, t2);
}

/**
 * A smooth curve through the points (every given point is on it): centripetal Catmull-Rom, sampled about every `CURVE_STEP` metres. Two points stay a straight
 * line. The first and last neighbours are mirrored, so the curve does not bulge at the ends.
 */
export function smoothLine(pts: readonly Pt[]): Pt[] {
  const line = distinctPoints(pts);
  if (line.length < 3) return line;
  const n = line.length;
  const out: Pt[] = [line[0]];
  for (let i = 0; i < n - 1; i++) {
    const p1 = line[i];
    const p2 = line[i + 1];
    const p0 = i > 0 ? line[i - 1] : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const p3 = i + 2 < n ? line[i + 2] : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    const steps = Math.min(MAX_SUBDIV, Math.max(2, Math.ceil(dist(p1, p2) / CURVE_STEP)));
    for (let k = 1; k < steps; k++) out.push(catmull(p0, p1, p2, p3, k / steps));
    out.push(p2);
  }
  return out;
}

// ---- offsets, ribbons and the parts of a road -----------------------------------------------------------------------------------

const MITRE_LIMIT = 2; // an offset corner lies at most this many offsets from its vertex: a sharp bend is bevelled, never a spike
const dirsOf = (line: readonly Pt[]): Pt[] =>
  line.slice(1).map((b, i) => {
    const l = dist(line[i], b);
    return { x: (b.x - line[i].x) / l, y: (b.y - line[i].y) / l };
  });

/**
 * The line moved sideways by `d` metres, one point per point of the (de-duplicated) input, so two offsets of one line always pair up point for point (a ribbon).
 * SIGN: `d > 0` is the LEFT of the direction of travel, first point to last, as the viewer sees the plan with y down: walking along +x, left is -y (up the screen).
 * That is `pavement: "left"` of a road. Corners are mitred (capped, see MITRE_LIMIT). On the inside of a bend tighter than the offset the mitre would swing
 * back past its neighbours and cross the line: such reversed stretches are collapsed to one point instead, so the result never doubles back.
 */
export function offsetLine(pts: readonly Pt[], d: number): Pt[] {
  const line = distinctPoints(pts);
  if (line.length < 2) return line;
  const dirs = dirsOf(line);
  const out = line.map((p, i): Pt => {
    const a = dirs[Math.max(0, i - 1)];
    const b = dirs[Math.min(dirs.length - 1, i)];
    const m = { x: a.y + b.y, y: -(a.x + b.x) }; // sum of the two left normals
    const ml = Math.hypot(m.x, m.y);
    if (ml < 1e-9) return { x: p.x + a.y * d, y: p.y - a.x * d }; // a full U-turn: no mitre exists
    const k = d / (ml * Math.max(ml / 2, 1 / MITRE_LIMIT));
    return { x: p.x + m.x * k, y: p.y + m.y * k };
  });
  // Collapse every run of reversed offset segments to its mean point; a collapse can reverse a neighbour, so repeat (each pass removes points: it ends).
  for (let pass = 0; pass < out.length; pass++) {
    let again = false;
    for (let i = 0; i < dirs.length; i++) {
      if ((out[i + 1].x - out[i].x) * dirs[i].x + (out[i + 1].y - out[i].y) * dirs[i].y >= -1e-9) continue;
      let j = i + 1;
      while (j < dirs.length && (out[j + 1].x - out[j].x) * dirs[j].x + (out[j + 1].y - out[j].y) * dirs[j].y < -1e-9) j++;
      const run = out.slice(i, j + 1);
      const mean = { x: run.reduce((s, q) => s + q.x, 0) / run.length, y: run.reduce((s, q) => s + q.y, 0) / run.length };
      for (let q = i; q <= j; q++) out[q] = mean;
      again = true;
      i = j;
    }
    if (!again) break;
  }
  return out;
}

type Vert = { x: number; z: number; u: number; v: number };

/** One triangle at height `y` with its normal up (plan x, y are world x, z). Collapsed (zero area) ones are skipped. */
function pushUp(out: Tris, y: number, p: Vert, q: Vert, r: Vert) {
  const cross = (q.z - p.z) * (r.x - p.x) - (q.x - p.x) * (r.z - p.z);
  if (Math.abs(cross) < 1e-9) return;
  for (const v of cross < 0 ? [p, r, q] : [p, q, r]) {
    out.pos.push(v.x, y, v.z);
    out.uv.push(v.u, v.v);
  }
}

/**
 * The flat strip between two polylines of the same point count (offsets of one line), at height `y`, facing up. uv = (metres along, metres across) / `tileM`, so a texture
 * keeps its scale on a long or wide strip and is never stretched; across is measured from `a`.
 */
export function ribbonTris(a: readonly Pt[], b: readonly Pt[], tileM = 1, y = 0): Tris {
  const out: Tris = { pos: [], uv: [] };
  const n = Math.min(a.length, b.length);
  if (n < 2 || !(tileM > EPS)) return out;
  let s = 0;
  const vert = (i: number, along: number): [Vert, Vert] => [
    { x: a[i].x, z: a[i].y, u: along / tileM, v: 0 },
    { x: b[i].x, z: b[i].y, u: along / tileM, v: dist(a[i], b[i]) / tileM },
  ];
  let [a0, b0] = vert(0, 0);
  for (let i = 1; i < n; i++) {
    s += (dist(a[i - 1], a[i]) + dist(b[i - 1], b[i])) / 2;
    const [a1, b1] = vert(i, s);
    pushUp(out, y, a0, a1, b0);
    pushUp(out, y, b0, a1, b1);
    [a0, b0] = [a1, b1];
  }
  return out;
}

/** A filled convex ring at height `y`, facing up, fanned from its centre. uv = plan metres / `tileM`, so its texture carries on from the ground around it. */
export function capTris(ring: readonly Pt[], y: number, tileM = 1): Tris {
  const out: Tris = { pos: [], uv: [] };
  if (ring.length < 3 || !(tileM > EPS)) return out;
  const c = { x: ring.reduce((s, p) => s + p.x, 0) / ring.length, y: ring.reduce((s, p) => s + p.y, 0) / ring.length };
  const vert = (p: Pt): Vert => ({ x: p.x, z: p.y, u: p.x / tileM, v: p.y / tileM });
  ring.forEach((p, i) => pushUp(out, y, vert(c), vert(p), vert(ring[(i + 1) % ring.length])));
  return out;
}

/**
 * A vertical wall standing on the polyline from height `y0` to `y1`, facing the `facing` side of the line (the same left / right as `offsetLine`). uv = (metres along,
 * metres up) / `tileM`. Used for the kerb of a pavement.
 */
export function faceTris(pts: readonly Pt[], y0: number, y1: number, facing: "left" | "right", tileM = 1): Tris {
  const out: Tris = { pos: [], uv: [] };
  const line = distinctPoints(pts);
  if (line.length < 2 || !(y1 > y0) || !(tileM > EPS)) return out;
  let s = 0;
  for (let i = 1; i < line.length; i++) {
    const [p, q] = [line[i - 1], line[i]];
    const l = dist(p, q);
    const at = (pt: Pt, y: number, along: number): number[] => [pt.x, y, pt.y, along / tileM, (y - y0) / tileM];
    // counter-clockwise (A, B, C) along the direction of travel faces the RIGHT; the left side takes the reverse order
    const [A, B, C, D] = [at(p, y0, s), at(q, y0, s + l), at(q, y1, s + l), at(p, y1, s)];
    for (const t of facing === "right" ? [[A, B, C], [A, C, D]] : [[A, C, B], [A, D, C]]) {
      for (const v of t) {
        out.pos.push(v[0], v[1], v[2]);
        out.uv.push(v[3], v[4]);
      }
    }
    s += l;
  }
  return out;
}

/** The part of the polyline from `s0` to `s1` metres along it, keeping the points in between (so a dash on a bend follows the bend). */
export function lineBetween(pts: readonly Pt[], s0: number, s1: number): Pt[] {
  const line = distinctPoints(pts);
  const [a, b] = [pointAtLength(line, s0), pointAtLength(line, s1)];
  if (!a || !b || s1 <= s0) return [];
  const out: Pt[] = [{ x: a.x, y: a.y }];
  let run = 0;
  for (let i = 1; i < line.length; i++) {
    run += dist(line[i - 1], line[i]);
    if (run > s0 + EPS && run < s1 - EPS) out.push(line[i]);
  }
  out.push({ x: b.x, y: b.y });
  return distinctPoints(out);
}

/** A painted strip: its centre line, how wide and which colour. */
export type MarkStrip = { pts: Pt[]; width: number; color: string };

export const MARK_WHITE = "#f1f0ea";
export const MARK_YELLOW = "#e6b92e";
const MARK_WIDTH = 0.12;
const DASH = 2;
const DASH_GAP = 3;
const EDGE_INSET = 0.25; // from the edge of the road to the middle of an edge line
const DOUBLE_WIDTH = 0.1;
const DOUBLE_GAP = 0.12;

/**
 * The paint on a road (`line` = its centre line, `roadWidth` its width). dashed: a white centre line of 2 m dashes with 3 m gaps, the gaps stretched a little so the line starts
 * and ends with a dash (a line too short for two dashes is one long dash); solid: one white centre line; edges: a white line along each edge, inset 0.25 m; double: two yellow
 * lines side by side in the middle. Dashes are separate strips. Nothing for "none", for a line that is not a line, or for edge lines on a road too narrow to hold them.
 */
export function roadMarkStrips(line: readonly Pt[], roadWidth: number, marks: RoadMarks): MarkStrip[] {
  const pts = distinctPoints(line);
  const len = lineLength(pts);
  if (marks === "none" || pts.length < 2 || !(len > EPS)) return [];
  if (marks === "solid") return [{ pts, width: MARK_WIDTH, color: MARK_WHITE }];
  if (marks === "dashed") {
    const n = Math.max(1, Math.round((len + DASH_GAP) / (DASH + DASH_GAP)));
    if (n === 1) return [{ pts, width: MARK_WIDTH, color: MARK_WHITE }];
    const gap = (len - n * DASH) / (n - 1);
    return Array.from({ length: n }, (_, i) => ({ pts: lineBetween(pts, i * (DASH + gap), i * (DASH + gap) + DASH), width: MARK_WIDTH, color: MARK_WHITE }));
  }
  if (marks === "edges") {
    const off = roadWidth / 2 - EDGE_INSET;
    if (off < 0.15) return [];
    return [off, -off].map((d) => ({ pts: offsetLine(pts, d), width: MARK_WIDTH, color: MARK_WHITE }));
  }
  const off = (DOUBLE_GAP + DOUBLE_WIDTH) / 2;
  return [off, -off].map((d) => ({ pts: offsetLine(pts, d), width: DOUBLE_WIDTH, color: MARK_YELLOW }));
}

/** One pavement beside a road: `inner` is its edge on the road, `outer` the far edge (paired point for point). */
export type PavementBand = { side: "left" | "right"; inner: Pt[]; outer: Pt[] };

/** The pavements of a road along `line` (its centre line, `roadWidth` wide), each `bandWidth` wide. left / right as seen walking from the first point to the last (see `offsetLine`). */
export function pavementBands(line: readonly Pt[], roadWidth: number, bandWidth: number, sides: PavementSides): PavementBand[] {
  const pts = distinctPoints(line);
  if (sides === "none" || pts.length < 2 || !(bandWidth > 0)) return [];
  const band = (side: "left" | "right"): PavementBand => {
    const sign = side === "left" ? 1 : -1;
    return { side, inner: offsetLine(pts, (sign * roadWidth) / 2), outer: offsetLine(pts, sign * (roadWidth / 2 + bandWidth)) };
  };
  return [...(sides === "left" || sides === "both" ? [band("left")] : []), ...(sides === "right" || sides === "both" ? [band("right")] : [])];
}

/** A stepping stone: its centre, the direction `angle` its length runs, `w` across the path and `l` along it. */
export type Stone = { x: number; y: number; angle: number; w: number; l: number };

const STONE_PITCH = 1.5; // times the path width, centre to centre
const STONE_ACROSS = 0.9;
const STONE_ALONG = 0.8;
const STONE_SHIFT = 0.05; // sideways wobble, times the width
const STONE_TURN = 0.12; // radians
const STONE_SIZE_VARY = 0.06;

/** A repeatable number in 0..1 for stone `i` (`salt` picks an independent one): the stones look hand-laid but never change between draws. */
function hash01(i: number, salt: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/**
 * Stepping stones along `line` for a path `width` wide: spaced evenly (about 1.5 widths apart, one at each end), each about a width across and 0.8 of it long, with a small
 * repeatable sideways shift, turn and size change. A line shorter than one pitch gets a single stone in the middle.
 */
export function stoneRects(line: readonly Pt[], width: number): Stone[] {
  const pts = distinctPoints(line);
  const len = lineLength(pts);
  if (pts.length < 2 || !(width > EPS) || !(len > EPS)) return [];
  const pitch = width * STONE_PITCH;
  const stations = len < pitch ? [pointAtLength(pts, len / 2)].filter((s): s is Station => s !== null) : stationsAlong(pts, pitch);
  return stations.map((st, i) => {
    const shift = (hash01(i, 1) * 2 - 1) * STONE_SHIFT * width;
    const size = 1 + (hash01(i, 3) * 2 - 1) * STONE_SIZE_VARY;
    return {
      x: st.x + Math.sin(st.angle) * shift, // the left normal of the direction of travel is (sin, -cos)
      y: st.y - Math.cos(st.angle) * shift,
      angle: st.angle + (hash01(i, 2) * 2 - 1) * STONE_TURN,
      w: width * STONE_ACROSS * size,
      l: width * STONE_ALONG * size,
    };
  });
}
