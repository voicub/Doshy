// The two faces of every wall as they really are where walls meet: an L corner shortens the inner face and lengthens the outer one, a T joint stops
// the stem's faces at the through wall and splits the through wall's face on that side, a free end is squared off a half thickness past its end point
// (as the wall is drawn). Pure: the node test runner loads this file directly.
import { WALL_T } from "./geometry.ts";
import type { Pt, Wall } from "./types.ts";

/** One straight stretch of a wall face. `side` "left" is the side of the left normal (-dy, dx) of a -> b (the side DimLine's positive offset goes to). `a` -> `b` runs the same way as the wall. */
export type WallFace = { wallId: string; side: "left" | "right"; a: Pt; b: Pt; length: number };

const TOL = 0.02; // wall ends closer than this to a point (or to another wall's line) are joined there
const MIN_WALL = 0.01;
const PARALLEL = 1e-3;
const TAU = Math.PI * 2;

type Dir = { x: number; y: number };
/** Another wall seen from a joint: the unit direction it leaves the joint in and half its thickness. */
type Arm = { d: Dir; h: number };

const half = (w: Wall) => (w.thickness ?? WALL_T) / 2;
const normal = (d: Dir): Dir => ({ x: -d.y, y: d.x });
const cross = (a: Dir, b: Dir) => a.x * b.y - a.y * b.x;
const dot = (a: Dir, b: Dir) => a.x * b.x + a.y * b.y;
const along = (w: Wall) => {
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  return { len, u: { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len } };
};

/** Where point `p` sits on wall `w`: distance along it from a, and across it from its centre line. */
function locate(w: Wall, p: Pt): { s: number; across: number } {
  const { u } = along(w);
  const v = { x: p.x - w.a.x, y: p.y - w.a.y };
  return { s: dot(v, u), across: cross(u, v) };
}

/** The other walls that meet point `p`: ends at it, and walls passing through it (both ways, they continue on either side). */
function armsAt(walls: readonly Wall[], self: Wall, p: Pt): Arm[] {
  const arms: Arm[] = [];
  for (const o of walls) {
    if (o.id === self.id) continue;
    const { len, u } = along(o);
    if (!(len > MIN_WALL)) continue;
    if (Math.hypot(o.a.x - p.x, o.a.y - p.y) < TOL) arms.push({ d: u, h: half(o) });
    else if (Math.hypot(o.b.x - p.x, o.b.y - p.y) < TOL) arms.push({ d: { x: -u.x, y: -u.y }, h: half(o) });
    else {
      const { s, across } = locate(o, p);
      if (Math.abs(across) < TOL && s > TOL && s < len - TOL) arms.push({ d: u, h: half(o) }, { d: { x: -u.x, y: -u.y }, h: half(o) });
    }
  }
  return arms;
}

/**
 * How far along the wall (from the joint, into the wall) its face on `side` (+1 = the side of the left normal of `d1`) starts.
 * Positive: the face is cut back (inside of a corner); negative: it runs past the joint (outside of a corner); 0 on a straight continuation.
 * The face meets the nearest neighbour on its side, on the neighbour's face that bounds the same wedge.
 */
function faceStart(d1: Dir, h1: number, side: 1 | -1, arms: readonly Arm[]): number {
  let best: Arm | null = null;
  let bestPhi = Infinity;
  for (const arm of arms) {
    const phi = (((side * Math.atan2(cross(d1, arm.d), dot(d1, arm.d))) % TAU) + TAU) % TAU; // turn from d1 toward its face side to reach the neighbour
    if (phi < PARALLEL || phi > TAU - PARALLEL || phi >= bestPhi) continue;
    best = arm;
    bestPhi = phi;
  }
  if (!best) return -h1; // free end: squared off a half thickness past the end point
  if (Math.abs(Math.sin(bestPhi)) < PARALLEL) return 0; // straight on: both walls carry on in line
  const n1 = normal(d1);
  const n2 = normal(best.d);
  const q1 = { x: n1.x * side * h1, y: n1.y * side * h1 };
  const q2 = { x: -n2.x * side * best.h, y: -n2.y * side * best.h };
  return cross({ x: q2.x - q1.x, y: q2.y - q1.y }, best.d) / cross(d1, best.d);
}

/** The stretches of `w`'s faces that a wall ending on its side (a T stem) covers: [side, from, to] along `w`. */
function stemCuts(walls: readonly Wall[], w: Wall): { side: 1 | -1; from: number; to: number }[] {
  const { len, u } = along(w);
  const n = normal(u);
  const hw = half(w);
  const cuts: { side: 1 | -1; from: number; to: number }[] = [];
  for (const v of walls) {
    if (v.id === w.id) continue;
    for (const [q, far] of [[v.a, v.b], [v.b, v.a]] as const) {
      const { s, across } = locate(w, q);
      if (Math.abs(across) >= TOL || s <= TOL || s >= len - TOL) continue;
      const lv = along(v);
      if (!(lv.len > MIN_WALL)) continue;
      const dv = { x: (far.x - q.x) / lv.len, y: (far.y - q.y) / lv.len };
      const tilt = dot(dv, n);
      if (Math.abs(tilt) < PARALLEL) continue; // lies along `w`: no stem
      const side = tilt > 0 ? 1 : -1;
      const nv = normal(dv);
      const edges = ([1, -1] as const).map((e) => {
        const reach = (side * hw - e * half(v) * dot(nv, n)) / tilt; // where this edge of the stem meets the face line of `w`
        return dot({ x: q.x + nv.x * e * half(v) + dv.x * reach - w.a.x, y: q.y + nv.y * e * half(v) + dv.y * reach - w.a.y }, u);
      });
      cuts.push({ side, from: Math.min(...edges), to: Math.max(...edges) });
    }
  }
  return cuts;
}

/** Every face stretch of every wall. */
export function wallFaces(walls: readonly Wall[]): WallFace[] {
  const out: WallFace[] = [];
  for (const w of walls) {
    const { len, u } = along(w);
    if (!(len > MIN_WALL)) continue;
    const n = normal(u);
    const hw = half(w);
    const armsA = armsAt(walls, w, w.a);
    const armsB = armsAt(walls, w, w.b);
    const cuts = stemCuts(walls, w);
    for (const side of [1, -1] as const) {
      const start = faceStart(u, hw, side, armsA);
      const end = len - faceStart({ x: -u.x, y: -u.y }, hw, (-side) as 1 | -1, armsB); // seen from the b end the same face is on the other side
      let from = start;
      const mine = cuts.filter((c) => c.side === side).sort((p, q) => p.from - q.from);
      const spans: [number, number][] = [];
      for (const c of mine) {
        if (c.from > from) spans.push([from, Math.min(c.from, end)]);
        from = Math.max(from, c.to);
      }
      spans.push([from, end]);
      for (const [s0, s1] of spans) {
        if (s1 - s0 < 1e-3) continue;
        const at = (s: number): Pt => ({ x: w.a.x + u.x * s + n.x * side * hw, y: w.a.y + u.y * s + n.y * side * hw });
        out.push({ wallId: w.id, side: side === 1 ? "left" : "right", a: at(s0), b: at(s1), length: s1 - s0 });
      }
    }
  }
  return out;
}
