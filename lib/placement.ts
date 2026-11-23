import { CATALOG } from "./catalog.ts";
import { WALL_T } from "./geometry.ts";
import { firstLevelId, levelIdOf, onLevel } from "./levels.ts";
import type { Item, Plan, Wall } from "./types.ts";

type V = { x: number; y: number };
export type Footprint = { x: number; y: number; w: number; d: number; rot: number };
export type Settled = { x: number; y: number; rot: number };

/**
 * How an item relates to walls:
 *  floor    stands on the floor: blocked by walls, snaps flush to them
 *  mounted  hangs on a wall (curtain, wall cabinet, poster): blocked, and turns its back to the nearest wall
 *  ceiling  hangs from the ceiling: walls never matter
 *  flat     rugs and mats: walls never matter
 */
export type Placement = "floor" | "mounted" | "ceiling" | "flat";

export const FLAT_MAX_H = 0.05;
const EPS = 1e-6;
const STEP = 0.04; // a drag is replayed in steps this small so an item slides along a wall instead of jumping through it
const SNAP_REACH = 0.12; // flush-to-wall snapping distance
const SNAP_ANGLE = 12; // degrees within which an item squares up to a wall
const MOUNT_REACH = 0.8; // a wall-mounted item looks for a wall this close

export function classify(def: { wall?: boolean; h: number }, kind: string): Placement {
  if (/ceiling/.test(kind)) return "ceiling";
  if (def.wall) return "mounted";
  return def.h <= FLAT_MAX_H ? "flat" : "floor";
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const normDeg = (d: number) => ((d % 360) + 360) % 360;

/** Plan view has y pointing south and `rot` turns clockwise, so local +x is (cos, sin) and the front (+z) is (-sin, cos). */
const axesOf = (rot: number) => ({ ux: { x: Math.cos(rad(rot)), y: Math.sin(rad(rot)) }, uy: { x: -Math.sin(rad(rot)), y: Math.cos(rad(rot)) } });

export function corners(f: Footprint): V[] {
  const { ux, uy } = axesOf(f.rot);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({
    x: f.x + (ux.x * f.w * sx + uy.x * f.d * sy) / 2,
    y: f.y + (ux.y * f.w * sx + uy.y * f.d * sy) / 2,
  }));
}

/** The solid slab a wall occupies in plan: its thickness, extended half a thickness past each end so corners close (as drawn). */
export function wallSlab(w: Wall): V[] {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = w.thickness ?? WALL_T;
  const u = { x: dx / len, y: dy / len };
  const n = { x: (-u.y * t) / 2, y: (u.x * t) / 2 };
  const e = t / 2;
  const a = { x: w.a.x - u.x * e, y: w.a.y - u.y * e };
  const b = { x: w.b.x + u.x * e, y: w.b.y + u.y * e };
  return [{ x: a.x + n.x, y: a.y + n.y }, { x: b.x + n.x, y: b.y + n.y }, { x: b.x - n.x, y: b.y - n.y }, { x: a.x - n.x, y: a.y - n.y }];
}

const edgeAxes = (p: V[]): V[] =>
  [0, 1].map((i) => {
    const a = p[i];
    const b = p[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  });

const span = (p: V[], axis: V): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const q of p) {
    const d = q.x * axis.x + q.y * axis.y;
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return [lo, hi];
};

/** Smallest translation that moves rectangle `a` out of rectangle `b`, or null when they only touch or are apart. */
export function separation(a: V[], b: V[]): V | null {
  let best = Infinity;
  let push: V | null = null;
  for (const axis of [...edgeAxes(a), ...edgeAxes(b)]) {
    const [a0, a1] = span(a, axis);
    const [b0, b1] = span(b, axis);
    const overlap = Math.min(a1, b1) - Math.max(a0, b0);
    if (overlap <= EPS) return null;
    if (overlap < best) {
      best = overlap;
      const sign = (a0 + a1) / 2 < (b0 + b1) / 2 ? -1 : 1;
      push = { x: axis.x * sign * overlap, y: axis.y * sign * overlap };
    }
  }
  return push;
}

/** True when the item's footprint cuts into any wall. */
export function hitsWall(f: Footprint, walls: Wall[]): boolean {
  const c = corners(f);
  return walls.some((w) => separation(c, wallSlab(w)) !== null);
}

/** Push an item out of every wall it overlaps (corners need a few passes). The item keeps the side its centre is on. */
export function resolveWalls(f: Footprint, walls: Wall[]): V {
  const slabs = walls.map(wallSlab);
  let x = f.x;
  let y = f.y;
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const slab of slabs) {
      const push = separation(corners({ ...f, x, y }), slab);
      if (push) {
        x += push.x;
        y += push.y;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, y };
}

/**
 * Move an item from where it validly is toward `to`, a small step at a time, sliding along any wall in the way.
 * Stepping matters: resolving only the final position would let a fast drag jump an item through a thin wall.
 * After a wall pushes the item back, the part of the remaining movement that points into that wall is dropped,
 * so the rest of the drag slides along the wall at full speed instead of crawling.
 */
export function slideTo(from: Footprint, to: V, walls: Wall[]): V {
  let p: V = { x: from.x, y: from.y };
  let away: V | null = null; // unit vector pointing out of the wall that last pushed the item
  const steps = Math.ceil(Math.hypot(to.x - p.x, to.y - p.y) / STEP) + 4;
  for (let i = 0; i < steps; i++) {
    let dx = to.x - p.x;
    let dy = to.y - p.y;
    if (away) {
      const into = dx * away.x + dy * away.y;
      if (into < 0) {
        dx -= into * away.x;
        dy -= into * away.y;
      }
    }
    const dist = Math.hypot(dx, dy);
    const k = dist > STEP ? STEP / dist : 1;
    const candidate = { x: p.x + dx * k, y: p.y + dy * k };
    const fixed = resolveWalls({ ...from, x: candidate.x, y: candidate.y }, walls);
    const px = fixed.x - candidate.x;
    const py = fixed.y - candidate.y;
    const push = Math.hypot(px, py);
    away = push > EPS ? { x: px / push, y: py / push } : null;
    p = fixed;
    if (dist < 1e-9 && !away) break;
  }
  return p;
}

type WallFace = { toward: V; dist: number };

/** For one wall, which way the item's centre must travel to reach the face on its side, how far, and the item's extent along the wall. */
function faceOf(f: Footprint, w: Wall): WallFace | null {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return null;
  const u = { x: dx / len, y: dy / len };
  const n = { x: -u.y, y: u.x };
  const s = (f.x - w.a.x) * n.x + (f.y - w.a.y) * n.y;
  const side = s >= 0 ? 1 : -1;
  const t = w.thickness ?? WALL_T;
  const dist = Math.abs(s) - t / 2;
  if (dist < -EPS) return null; // centre is inside the slab
  const proj = corners(f).map((q) => (q.x - w.a.x) * u.x + (q.y - w.a.y) * u.y);
  const lo = Math.min(...proj);
  const hi = Math.max(...proj);
  if (hi < -t / 2 || lo > len + t / 2) return null; // beside the wall, not facing it
  return { toward: { x: -n.x * side, y: -n.y * side }, dist };
}

/** Of the item's four sides, the one whose outward normal best matches `toward`, with how many degrees off it is. */
function facingSide(rot: number, toward: V): { normal: V; half: "w" | "d"; off: number } {
  const { ux, uy } = axesOf(rot);
  const sides = [
    { normal: ux, half: "w" as const },
    { normal: { x: -ux.x, y: -ux.y }, half: "w" as const },
    { normal: uy, half: "d" as const },
    { normal: { x: -uy.x, y: -uy.y }, half: "d" as const },
  ];
  let best = sides[0];
  let bestDot = -2;
  for (const s of sides) {
    const dot = s.normal.x * toward.x + s.normal.y * toward.y;
    if (dot > bestDot) {
      bestDot = dot;
      best = s;
    }
  }
  return { ...best, off: deg(Math.acos(Math.min(1, bestDot))) };
}

/** Squares an item to a wall that is within reach and slides it flush. Leaves it alone when no wall is close or nearly parallel. */
export function snapToWalls(f: Footprint, walls: Wall[], reach = SNAP_REACH): Settled {
  let cur: Settled = { x: f.x, y: f.y, rot: f.rot };
  for (const w of walls) {
    const here: Footprint = { ...f, ...cur };
    const face = faceOf(here, w);
    if (!face) continue;
    const side = facingSide(here.rot, face.toward);
    if (side.off > SNAP_ANGLE) continue;
    const turn = deg(Math.atan2(side.normal.x * face.toward.y - side.normal.y * face.toward.x, side.normal.x * face.toward.x + side.normal.y * face.toward.y));
    const squared: Footprint = { ...here, rot: here.rot + turn };
    const faceSq = faceOf(squared, w);
    if (!faceSq) continue;
    const sideSq = facingSide(squared.rot, faceSq.toward);
    const gap = faceSq.dist - (sideSq.half === "w" ? squared.w : squared.d) / 2;
    if (gap < -EPS || gap > reach) continue;
    cur = { x: squared.x + faceSq.toward.x * gap, y: squared.y + faceSq.toward.y * gap, rot: normDeg(squared.rot) };
  }
  return cur;
}

/** Hang a wall-mounted item on the nearest wall within reach: back to the wall, front into the room, flush against its face. */
export function mountOnWall(f: Footprint, walls: Wall[], reach = MOUNT_REACH): Settled {
  let best: { w: Wall; face: WallFace } | null = null;
  for (const w of walls) {
    const face = faceOf(f, w);
    if (face && face.dist <= reach && (!best || face.dist < best.face.dist)) best = { w, face };
  }
  if (!best) return { x: f.x, y: f.y, rot: f.rot };
  const { toward } = best.face;
  // back = -front = -(-sin, cos) must equal `toward`
  const rot = normDeg(deg(Math.atan2(toward.x, -toward.y)));
  const gap = best.face.dist - f.d / 2;
  return { x: f.x + toward.x * gap, y: f.y + toward.y * gap, rot };
}

/**
 * Where an item ends up when the user drags it from its current valid spot toward `to`.
 * Ceiling and flat items go exactly where asked; everything else is stopped by walls, and
 * (unless `snap` is off) squares up and sits flush against a wall it is placed beside.
 * `carry` lets a drag cross walls: when the spot under the pointer is free (the item fits there: another room, the garden, the drive), the item is carried
 * straight over, so a sofa can change room or a car leave the building without being squeezed through a door. Without it, or when the spot is blocked, the item slides along the walls.
 */
export function settleItem(from: Footprint, to: V, walls: Wall[], cls: Placement, snap = true, carry = false): Settled {
  if (cls === "ceiling" || cls === "flat") return { x: to.x, y: to.y, rot: from.rot };
  const free = resolveWalls({ ...from, ...to }, walls); // is the spot under the pointer clear of walls and solid items?
  const moved = carry && Math.hypot(free.x - to.x, free.y - to.y) < EPS ? { x: to.x, y: to.y } : slideTo(from, to, walls);
  const at: Footprint = { ...from, ...moved };
  if (!snap) return { ...moved, rot: from.rot };
  const placed = cls === "mounted" ? mountOnWall(at, walls) : snapToWalls(at, walls);
  const fixed = resolveWalls({ ...at, ...placed }, walls);
  return { x: fixed.x, y: fixed.y, rot: placed.rot };
}

/** Collision only: take an item where it is (after a rotation, resize or typed coordinate) and clear it from the walls. */
export function clearWalls(f: Footprint, walls: Wall[], cls: Placement): V {
  return cls === "ceiling" || cls === "flat" ? { x: f.x, y: f.y } : resolveWalls(f, walls);
}

type Clearance = { n: number | null; e: number | null; s: number | null; w: number | null };
const COMPASS = { e: { x: 1, y: 0 }, w: { x: -1, y: 0 }, s: { x: 0, y: 1 }, n: { x: 0, y: -1 } } as const;

/** How far rectangle `a` can travel along unit `dir` before it touches rectangle `b` (swept SAT), or null if it never does. */
function sweep(a: V[], b: V[], dir: V): number | null {
  let enter = 0;
  let exit = Infinity;
  for (const axis of [...edgeAxes(a), ...edgeAxes(b)]) {
    const [a0, a1] = span(a, axis);
    const [b0, b1] = span(b, axis);
    const v = dir.x * axis.x + dir.y * axis.y;
    if (Math.abs(v) < EPS) {
      if (a1 <= b0 + EPS || b1 <= a0 + EPS) return null;
      continue;
    }
    const t0 = (b0 - a1) / v;
    const t1 = (b1 - a0) / v;
    enter = Math.max(enter, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    if (enter > exit - EPS) return null;
  }
  return enter;
}

/** Free distance (metres) from the item to the nearest wall face in each plan direction (north = -y), null when no wall lies that way within `max`. */
export function wallClearance(f: Footprint, walls: Wall[], max = 12): Clearance {
  const c = corners(f);
  const slabs = walls.map(wallSlab);
  const out: Clearance = { n: null, e: null, s: null, w: null };
  for (const k of ["n", "e", "s", "w"] as const) {
    for (const slab of slabs) {
      const t = sweep(c, slab, COMPASS[k]);
      if (t !== null && t <= max && (out[k] === null || t < out[k]!)) out[k] = t;
    }
  }
  return out;
}

/**
 * Solid items (structural columns, the water column) as virtual walls, so every wall rule also applies to them.
 * Each is one short thick wall: thickness = the item's shorter side, running along its longer side, pulled in by half the
 * thickness at each end because wallSlab extends a wall that far past its ends. A square item gets the minimum 1 cm run.
 * `exceptId` leaves one item out, so the item being moved or edited does not collide with itself.
 */
export function obstacleWalls(items: Item[], defs: Record<string, { solid?: boolean }> = CATALOG, exceptId?: string): Wall[] {
  const out: Wall[] = [];
  for (const it of items) {
    if (it.id === exceptId || !defs[it.kind]?.solid) continue;
    const along = it.w >= it.d;
    const long = along ? it.w : it.d;
    const thickness = along ? it.d : it.w;
    const a = ((along ? it.rot : it.rot + 90) * Math.PI) / 180;
    const run = Math.max(0.01, long - thickness) / 2;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    out.push({
      id: `solid:${it.id}`,
      a: { x: it.x - u.x * run, y: it.y - u.y * run },
      b: { x: it.x + u.x * run, y: it.y + u.y * run },
      style: "plaster",
      thickness,
    });
  }
  return out;
}

/**
 * Everything on one level that blocks furniture: its walls and solid items, except `exceptId` (the item being moved).
 * The level is `levelId`, else the level of the `exceptId` item, else the first level (placing a new item: pass the active level).
 */
export function collisionWalls(plan: Plan, exceptId?: string, levelId?: string): Wall[] {
  const moving = exceptId ? plan.items.find((i) => i.id === exceptId) : undefined;
  const lv = levelId ?? (moving ? levelIdOf(plan, moving) : firstLevelId(plan));
  const here = onLevel(plan, lv);
  return [...here.walls, ...obstacleWalls(here.items, CATALOG, exceptId)];
}

export type DoorSwing = { hinge: V; leafEnd: V; arcStart: V; arcEnd: V; normal: V; side: "left" | "right" };

/**
 * Where a door's leaf is when open 90 degrees. `hinge` is the hinge point on the wall line, `arcStart` the other jamb (where the
 * closed leaf ends), `leafEnd`/`arcEnd` the open leaf's tip, `normal` the unit vector to the side the leaf opens toward.
 * "left" is the side you have on your left when walking the wall from a to b in plan view (y down): the smaller-y side of a
 * west-to-east wall. Absent `hinge`/`swing` mean hinge "start", swing "left".
 */
export function doorSwing(o: { t: number; width: number; hinge?: "start" | "end"; swing?: "left" | "right" }, w: Wall): DoorSwing {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len };
  const side = o.swing ?? "left";
  const normal = side === "left" ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
  const c = { x: w.a.x + u.x * o.t * len, y: w.a.y + u.y * o.t * len };
  const h = o.width / 2;
  const s = (o.hinge ?? "start") === "start" ? -1 : 1;
  const hinge = { x: c.x + u.x * h * s, y: c.y + u.y * h * s };
  const arcStart = { x: c.x - u.x * h * s, y: c.y - u.y * h * s };
  const leafEnd = { x: hinge.x + normal.x * o.width, y: hinge.y + normal.y * o.width };
  return { hinge, leafEnd, arcStart, arcEnd: leafEnd, normal, side };
}

/**
 * The swing a door should get for a pointer at `p` over wall `w` (opening centred at `t`): the leaf opens toward the pointer's side
 * of the wall and the hinge sits on the end nearer the pointer along the wall; `flip` swaps the hinge end.
 */
export function swingFor(w: Wall, t: number, p: V, flip = false): { hinge: "start" | "end"; swing: "left" | "right" } {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const along = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len - t * len;
  const across = ((p.y - w.a.y) * dx - (p.x - w.a.x) * dy) / len; // positive on the "right" side
  const nearEnd = along > 0;
  return { hinge: nearEnd !== flip ? "end" : "start", swing: across > 0 ? "right" : "left" };
}

/** Does the quarter disc a door sweeps (radius = door width, around the hinge, on the swing side) overlap this footprint? */
export function swingHitsFootprint(sw: DoorSwing, width: number, f: Footprint): boolean {
  const toJamb = { x: (sw.arcStart.x - sw.hinge.x) / width, y: (sw.arcStart.y - sw.hinge.y) / width };
  if (Math.hypot(f.x - sw.hinge.x, f.y - sw.hinge.y) > width + Math.hypot(f.w, f.d) / 2) return false;
  const ca = Math.cos(rad(-f.rot));
  const sa = Math.sin(rad(-f.rot));
  const step = 0.04;
  for (let r = step; r < width - 1e-9; r += step)
    for (let a = 0; a <= 1.0001; a += step / Math.max(r, step)) {
      const th = (a * Math.PI) / 2;
      const dir = { x: toJamb.x * Math.cos(th) + sw.normal.x * Math.sin(th), y: toJamb.y * Math.cos(th) + sw.normal.y * Math.sin(th) };
      const px = sw.hinge.x + dir.x * r - f.x;
      const py = sw.hinge.y + dir.y * r - f.y;
      if (Math.abs(px * ca - py * sa) < f.w / 2 && Math.abs(px * sa + py * ca) < f.d / 2) return true;
    }
  return false;
}
