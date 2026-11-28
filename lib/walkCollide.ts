// First-person walking: where a person can stand in a plan and how they move through it. Pure (no browser, no three.js): the walkthrough (components/scene/walk)
// asks `stepWalker` for each frame's move and draws the camera at the answer; the tests pin the rules. Plan metres, x and y as in the plan (the world's z is the plan's y).
//
// A person is a circle (WALK_RADIUS) on a floor. They are stopped by wall slabs (thickness included; doors, arches and open passages are gaps, windows are not), by
// furniture footprints (not rugs, not pieces on the wall or high up, not animals) and by holes in the floor; they slide along what stops them. Stairs are ramps: walk
// into the foot of a staircase and the floor rises to the next storey (or down a basement stair); the steps of a raised house's front door work the same way.
// ponytail: a turning staircase (L, U, winder, spiral) is climbed in a straight line over its footprint, so the eye's height does not follow its treads exactly.
import { CATALOG, type Def } from "./catalog.ts";
import { WALL_T, planBounds, wallLen } from "./geometry.ts";
import { clamp } from "./mathUtil.ts";
import { findLevel, levelIdOf, onLevel, sortedLevels } from "./levels.ts";
import { hallwayOf, hallwayToPlan, entrySteps, type Hallway } from "./hallway.ts";
import { levelAbove, levelBelow } from "./voids.ts";
import type { Item, Opening, Plan, Wall } from "./types.ts";

/** The person's width: a circle of this radius (m). */
export const WALK_RADIUS = 0.25;
/** A door sill, kerb or step this high is stepped over; anything higher is a wall to a walker (a raised floor needs stairs). */
const STEP_H = 0.35;
/** Furniture, mats and decor lower than this are walked over (rugs, door mats, LED strips). */
const FLOOR_DECOR_H = 0.12;
/** Pieces lifted this far off the floor hang on a wall or stand on something that already blocks: nobody bumps into them. */
const HIGH_ELEV = 0.35;
/** Pieces smaller than this in both directions are not obstacles (sensors, plugs). */
const MIN_FOOTPRINT = 0.15;
/** A part whose underside is higher than this clears a standing person's head. */
const HEAD = 1.8;
/** A wall lower than this is a kerb, not a wall. */
const LOW_WALL = 0.3;
const MIN_SPAN = 1e-3;
/** A move is split into pieces no longer than this, so a fast frame cannot jump through a thin wall. */
const MAX_SUB = 0.1;
/** Rooms count this far beyond their rectangle as floor (the wall's thickness, the door sill). */
const FLOOR_MARGIN = 0.25;
/** How far from the building the garden may be walked. */
const WORLD_MARGIN = 20;
const LATERAL_SLACK = 0.1;
/** A stair's footprint is solid except at its mouths; the solid part starts this far in so a person reaches the mouth before touching it. */
const MOUTH = WALK_RADIUS + 0.02;
/** Trees collide with their trunk, not their crown. */
const TREE = /tree|conifer|palm|birch|maple|oak|pine|cypress|willow|olive|poplar|spruce|fir\b/i;
const TRUNK = 0.4;

type Seg = { ax: number; ay: number; bx: number; by: number; r: number };
/** A rectangle: centre, unit vector of its long axis `a`, half extents along `a` and across it. */
type Obb = { cx: number; cy: number; ax: number; ay: number; ha: number; hb: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };
type End = { level: string; y: number };

/** A staircase seen from above: `u` points from its foot to its head; walking in at the foot (on `lower.level`) or the head (on `upper.level`) puts a person on it. */
export type Ramp = { id: string; cx: number; cy: number; ux: number; uy: number; len: number; wid: number; lower: End; upper: End };

type LevelWorld = { id: string; elevation: number; segs: Seg[]; boxes: Obb[]; rooms: Rect[]; ramps: Ramp[] };
export type WalkWorld = { levels: ReadonlyMap<string, LevelWorld>; order: readonly string[]; ramps: readonly Ramp[]; ground: string | null; raised: boolean; limit: Rect; hall: Obb | null };

/** Where a person is: on `level`, `h` metres above the ground (the floor under their feet), and on the staircase `ramp` while they climb one. */
export type Walker = { x: number; y: number; level: string; h: number; ramp: string | null };

// ---- what blocks ----

/** Doors, arches and open passages let a person through; windows never do, and a door raised above a step cannot be stepped into. */
export const passes = (o: Pick<Opening, "type" | "sill">): boolean => o.type === "door" && (o.sill ?? 0) <= STEP_H;

export type Span = { s0: number; s1: number };
/** The solid stretches of a wall, in metres along it, once the openings a person can walk through are left out. */
export function solidSpans(w: Wall, openings: readonly Opening[]): Span[] {
  const len = wallLen(w);
  const gaps = openings
    .filter((o) => o.wallId === w.id && passes(o))
    .map((o) => ({ s0: Math.max(0, o.t * len - o.width / 2), s1: Math.min(len, o.t * len + o.width / 2) }))
    .sort((p, q) => p.s0 - q.s0);
  const out: Span[] = [];
  let cur = 0;
  for (const g of gaps) {
    if (g.s0 > cur + MIN_SPAN) out.push({ s0: cur, s1: g.s0 });
    cur = Math.max(cur, g.s1);
  }
  if (len - cur > MIN_SPAN) out.push({ s0: cur, s1: len });
  return out;
}

function wallSegs(w: Wall, openings: readonly Opening[]): Seg[] {
  if (w.height !== undefined && w.height < LOW_WALL) return [];
  const len = wallLen(w);
  if (len < MIN_SPAN) return [];
  const [dx, dy] = [(w.b.x - w.a.x) / len, (w.b.y - w.a.y) / len];
  const r = (w.thickness ?? WALL_T) / 2;
  return solidSpans(w, openings).map((s) => ({ ax: w.a.x + dx * s.s0, ay: w.a.y + dy * s.s0, bx: w.a.x + dx * s.s1, by: w.a.y + dy * s.s1, r }));
}

/** Height of the lowest part of a piece above its own base (m) at its placed size: a pendant or ceiling lamp hangs well above a head. */
function lowestPart(item: Pick<Item, "h">, def: Def): number {
  const k = item.h / def.h;
  return def.parts.length ? Math.min(...def.parts.map((p) => (p.p[1] - (p.shape === "sph" ? p.s[0] : p.s[1]) / 2) * k)) : 0;
}

/** Does this piece stop a walker? Not decor under a hand's breadth, not what hangs on a wall, sits high or hangs from the ceiling, not stairs (they are ramps) or animals. */
export function blocksWalker(item: Pick<Item, "w" | "d" | "h" | "elev">, def: Def | undefined): boolean {
  if (!def || def.wall || def.critter || def.stair) return false;
  if ((item.elev ?? 0) >= HIGH_ELEV || item.h < FLOOR_DECOR_H) return false;
  if (Math.max(item.w, item.d) < MIN_FOOTPRINT) return false;
  return lowestPart(item, def) + (item.elev ?? 0) < HEAD;
}

const DEG = Math.PI / 180;
/** The rectangle a piece occupies. `rot` is clockwise in the plan (y down), so the piece's own x axis points (cos, sin). */
function itemBox(item: Item, def: Def): Obb {
  const tree = TREE.test(`${item.kind} ${def.label}`);
  const [w, d] = tree ? [Math.min(item.w, TRUNK), Math.min(item.d, TRUNK)] : [item.w, item.d];
  return { cx: item.x, cy: item.y, ax: Math.cos(item.rot * DEG), ay: Math.sin(item.rot * DEG), ha: w / 2, hb: d / 2 };
}

// ---- stairs ----

/** Position along a ramp (s from the foot, 0..len) and across it (l from the centre line). */
function onRampAxes(r: Ramp, x: number, y: number): { s: number; l: number } {
  const [dx, dy] = [x - r.cx, y - r.cy];
  return { s: dx * r.ux + dy * r.uy + r.len / 2, l: -dx * r.uy + dy * r.ux };
}
const rampY = (r: Ramp, s: number): number => r.lower.y + clamp(s / r.len, 0, 1) * (r.upper.y - r.lower.y);

/** The solid part of a ramp's footprint on `levelId`: all of it except the mouth where the staircase is entered from that level. */
function rampBox(r: Ramp, levelId: string): Obb {
  const [lo, hi] = [r.lower.level === levelId ? MOUTH : 0, r.upper.level === levelId ? r.len - MOUTH : r.len];
  const mid = (lo + hi) / 2 - r.len / 2;
  return { cx: r.cx + r.ux * mid, cy: r.cy + r.uy * mid, ax: r.ux, ay: r.uy, ha: Math.max(0, (hi - lo) / 2), hb: r.wid / 2 };
}

function stairRamps(plan: Plan): Ramp[] {
  const out: Ramp[] = [];
  for (const it of plan.items) {
    const kind = CATALOG[it.kind]?.stair;
    if (kind !== "up" && kind !== "down") continue;
    const own = findLevel(plan, levelIdOf(plan, it));
    const other = kind === "up" ? levelAbove(plan, own.id) : levelBelow(plan, own.id);
    if (!other) continue;
    const th = it.rot * DEG;
    // a stair climbs toward its local -z: the foot is at the front for a stair up, at the back for a basement stair
    const [fx, fy] = [Math.sin(th), -Math.cos(th)];
    const up = kind === "up";
    out.push({
      id: it.id,
      cx: it.x,
      cy: it.y,
      ux: up ? fx : -fx,
      uy: up ? fy : -fy,
      len: it.d,
      wid: it.w,
      lower: up ? { level: own.id, y: own.elevation } : { level: other.id, y: other.elevation },
      upper: up ? { level: other.id, y: other.elevation } : { level: own.id, y: own.elevation },
    });
  }
  return out;
}

/** The front steps of a raised house, where its entry is by steps: from the ground up to the door, no change of storey. */
function entranceRamps(plan: Plan, groundId: string): Ramp[] {
  return entrySteps(plan).flatMap((s) => {
    const len = s.blocks.at(-1)?.s1;
    const wall = plan.walls.find((w) => w.id === plan.openings.find((o) => o.id === s.openingId)?.wallId);
    if (!len || !wall) return [];
    const from = (wall.thickness ?? WALL_T) / 2 + len / 2; // the steps start at the wall's outer face
    return [{ id: `entry:${s.openingId}`, cx: s.x + s.nx * from, cy: s.y + s.ny * from, ux: -s.nx, uy: -s.ny, len, wid: s.width, lower: { level: groundId, y: 0 }, upper: { level: groundId, y: s.elevation } }];
  });
}

/** The shared corridor of a flat entered from the building's hallway: its floor lies at the flat's own height. A rectangle turned with the flat's wall. */
function hallFloor(h: Hallway): Obb {
  const c = hallwayToPlan(h, (h.x0 + h.x1) / 2, (h.face + h.depth) / 2);
  return { cx: c.x, cy: c.y, ax: h.ny, ay: -h.nx, ha: (h.x1 - h.x0) / 2, hb: (h.face + h.depth) / 2 };
}

/** The corridor's far wall and two end walls (its fourth side is the flat's own wall). */
function hallWalls(h: Hallway): Seg[] {
  const z = h.face + h.depth;
  const [a, b, c, d] = [hallwayToPlan(h, h.x0, h.face), hallwayToPlan(h, h.x1, h.face), hallwayToPlan(h, h.x1, z), hallwayToPlan(h, h.x0, z)];
  return [[b, c], [c, d], [d, a]].map(([s, e]) => ({ ax: s.x, ay: s.y, bx: e.x, by: e.y, r: 0 }));
}

// ---- the world ----

/** Everything a walker can bump into, per storey. Rebuild it when the plan changes (it is cheap: a few hundred rectangles). */
export function buildWalkWorld(plan: Plan): WalkWorld {
  const levels = sortedLevels(plan);
  const ground = levels.find((l) => l.elevation >= -0.01) ?? null; // the storey whose floor meets the garden
  const raised = !!ground && ground.elevation > 0.01;
  const ramps = [...stairRamps(plan), ...(ground && raised ? entranceRamps(plan, ground.id) : [])];
  const hall = ground ? hallwayOf(plan) : null;
  const world = new Map<string, LevelWorld>();
  for (const lv of levels) {
    const c = onLevel(plan, lv.id);
    const boxes: Obb[] = [];
    for (const it of c.items) {
      const def = CATALOG[it.kind];
      if (def && blocksWalker(it, def)) boxes.push(itemBox(it, def));
    }
    for (const v of plan.voids ?? []) {
      if (v.auto || levelIdOf(plan, v) !== lv.id || !levelBelow(plan, lv.id)) continue; // a stair's own opening is the ramp; the lowest storey's holes do nothing
      boxes.push({ cx: v.x + v.w / 2, cy: v.y + v.h / 2, ax: Math.cos((v.rot ?? 0) * DEG), ay: Math.sin((v.rot ?? 0) * DEG), ha: v.w / 2, hb: v.h / 2 });
    }
    const mine = ramps.filter((r) => r.lower.level === lv.id || r.upper.level === lv.id);
    for (const r of mine) boxes.push(rampBox(r, lv.id));
    world.set(lv.id, {
      id: lv.id,
      elevation: lv.elevation,
      segs: [...c.walls.flatMap((w) => wallSegs(w, c.openings)), ...(hall && lv.id === ground?.id ? hallWalls(hall) : [])],
      boxes,
      rooms: c.rooms.map((r) => ({ x0: r.x - FLOOR_MARGIN, y0: r.y - FLOOR_MARGIN, x1: r.x + r.w + FLOOR_MARGIN, y1: r.y + r.h + FLOOR_MARGIN })),
      ramps: mine,
    });
  }
  const b = planBounds(plan) ?? { x0: 0, y0: 0, x1: 10, y1: 10 };
  const limit = { x0: b.x0 - WORLD_MARGIN, y0: b.y0 - WORLD_MARGIN, x1: b.x1 + WORLD_MARGIN, y1: b.y1 + WORLD_MARGIN };
  return { levels: world, order: levels.map((l) => l.id), ramps, ground: ground?.id ?? null, raised, limit, hall: hall ? hallFloor(hall) : null };
}

const inRect = (r: Rect, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
const inObb = (b: Obb, x: number, y: number) => {
  const [dx, dy] = [x - b.cx, y - b.cy];
  return Math.abs(dx * b.ax + dy * b.ay) <= b.ha && Math.abs(-dx * b.ay + dy * b.ax) <= b.hb;
};

/** The floor height under (x, y) on a storey, or null where there is no floor (outside the rooms of an upper storey, beyond the garden's limit). */
export function floorAt(world: WalkWorld, levelId: string, x: number, y: number): number | null {
  const lv = world.levels.get(levelId);
  if (!lv) return null;
  const inside = lv.rooms.some((r) => inRect(r, x, y)) || (levelId === world.ground && world.hall !== null && inObb(world.hall, x, y));
  if (levelId !== world.ground) return inside ? lv.elevation : null;
  if (inside) return lv.elevation;
  return inRect(world.limit, x, y) ? 0 : null; // the garden is the ground, which is below a raised floor
}

// ---- resolving a move ----

function pushFromSeg(s: Seg, px: number, py: number, r: number): [number, number] | null {
  const [dx, dy] = [s.bx - s.ax, s.by - s.ay];
  const t = clamp(((px - s.ax) * dx + (py - s.ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  const [qx, qy] = [s.ax + dx * t, s.ay + dy * t];
  const [ex, ey] = [px - qx, py - qy];
  const d = Math.hypot(ex, ey);
  const reach = r + s.r;
  if (d >= reach) return null;
  if (d > 1e-9) return [(ex / d) * (reach - d), (ey / d) * (reach - d)];
  const len = Math.hypot(dx, dy) || 1;
  return [(-dy / len) * reach, (dx / len) * reach]; // exactly on the wall's line: out of its face
}

function pushFromBox(b: Obb, px: number, py: number, r: number): [number, number] | null {
  const [dx, dy] = [px - b.cx, py - b.cy];
  const [lx, ly] = [dx * b.ax + dy * b.ay, -dx * b.ay + dy * b.ax];
  const [qx, qy] = [clamp(lx, -b.ha, b.ha), clamp(ly, -b.hb, b.hb)];
  const [ex, ey] = [lx - qx, ly - qy];
  const d = Math.hypot(ex, ey);
  if (d >= r) return null;
  let [mx, my]: [number, number] = d > 1e-9 ? [(ex / d) * (r - d), (ey / d) * (r - d)] : [0, 0];
  if (d <= 1e-9) {
    // the centre is inside: leave by the nearest face
    const [ox, oy] = [b.ha - Math.abs(lx), b.hb - Math.abs(ly)];
    if (ox < oy) mx = Math.sign(lx || 1) * (ox + r);
    else my = Math.sign(ly || 1) * (oy + r);
  }
  return [mx * b.ax - my * b.ay, mx * b.ay + my * b.ax];
}

/** Pushes a circle out of every wall (and, unless `onStairs`, furniture and floor holes) it overlaps; a few passes settle a corner. */
function resolve(lv: LevelWorld, x: number, y: number, withBoxes: boolean): [number, number] {
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const s of lv.segs) {
      const p = pushFromSeg(s, x, y, WALK_RADIUS);
      if (p) [x, y, moved] = [x + p[0], y + p[1], true];
    }
    if (withBoxes) {
      for (const b of lv.boxes) {
        const p = pushFromBox(b, x, y, WALK_RADIUS);
        if (p) [x, y, moved] = [x + p[0], y + p[1], true];
      }
    }
    if (!moved) break;
  }
  return [x, y];
}

function enterRamp(lv: LevelWorld, w: Walker, nx: number, ny: number): Walker | null {
  for (const r of lv.ramps) {
    const a = onRampAxes(r, nx, ny);
    if (Math.abs(a.l) > r.wid / 2 - LATERAL_SLACK || a.s < 0 || a.s > r.len) continue;
    const s0 = onRampAxes(r, w.x, w.y).s;
    const atFoot = r.lower.level === lv.id && s0 < 0;
    const atHead = r.upper.level === lv.id && s0 > r.len;
    if (atFoot || atHead) return { x: nx, y: ny, level: lv.id, h: rampY(r, a.s), ramp: r.id };
  }
  return null;
}

/** One step on a staircase: stay between its sides, follow its slope, and step off at either end onto that end's storey. */
function stepOnRamp(world: WalkWorld, w: Walker, r: Ramp, dx: number, dy: number): Walker {
  const a = onRampAxes(r, w.x + dx, w.y + dy);
  const l = clamp(a.l, -(r.wid / 2 - LATERAL_SLACK), r.wid / 2 - LATERAL_SLACK);
  let [x, y] = [r.cx + r.ux * (a.s - r.len / 2) - r.uy * l, r.cy + r.uy * (a.s - r.len / 2) + r.ux * l];
  const lv = world.levels.get(a.s < r.len / 2 ? r.lower.level : r.upper.level);
  if (lv) [x, y] = resolve(lv, x, y, false); // the walls beside the stairs still stop a person
  const s = onRampAxes(r, x, y).s;
  if (s < 0) return { x, y, level: r.lower.level, h: r.lower.y, ramp: null };
  if (s > r.len) return { x, y, level: r.upper.level, h: r.upper.y, ramp: null };
  return { x, y, level: lv?.id ?? w.level, h: rampY(r, s), ramp: r.id };
}

function subStep(world: WalkWorld, w: Walker, dx: number, dy: number): Walker {
  if (w.ramp !== null) {
    const r = world.ramps.find((q) => q.id === w.ramp);
    return r ? stepOnRamp(world, w, r, dx, dy) : { ...w, ramp: null };
  }
  const lv = world.levels.get(w.level);
  if (!lv) return w;
  const [nx, ny] = [w.x + dx, w.y + dy];
  const entered = enterRamp(lv, w, nx, ny);
  if (entered) return entered;
  const offFloor = floorAt(world, w.level, w.x, w.y) === null; // already somewhere without a floor: any move is allowed, to get back
  const tryAt = (x: number, y: number): Walker | null => {
    const [rx, ry] = resolve(lv, x, y, true);
    const h = floorAt(world, w.level, rx, ry);
    return h !== null && (offFloor || Math.abs(h - w.h) <= STEP_H) ? { ...w, x: rx, y: ry, h } : null;
  };
  return tryAt(nx, ny) ?? tryAt(nx, w.y) ?? tryAt(w.x, ny) ?? w; // sliding along an edge of the floor: one axis at a time
}

/** Moves a walker by (dx, dy) plan metres, stopped and slid by whatever is in the way. Long moves are taken in short pieces. */
export function stepWalker(world: WalkWorld, from: Walker, dx: number, dy: number): Walker {
  const n = clamp(Math.ceil(Math.hypot(dx, dy) / MAX_SUB), 1, 60);
  let w = from;
  for (let i = 0; i < n; i++) w = subStep(world, w, dx / n, dy / n);
  return w;
}

// ---- where to stand ----

/** Is there room for a person at (x, y) on this storey: a floor, and clear of every wall and piece. */
export function isFree(world: WalkWorld, levelId: string, x: number, y: number): boolean {
  const lv = world.levels.get(levelId);
  if (!lv || floorAt(world, levelId, x, y) === null) return false;
  const [rx, ry] = resolve(lv, x, y, true);
  return Math.hypot(rx - x, ry - y) < 1e-6;
}

/** The free spot nearest to (x, y) on a storey: the point itself, else the nearest clear ground in a widening ring. Null when the storey has none. */
export function nearestFree(world: WalkWorld, levelId: string, x: number, y: number, reach = 6): { x: number; y: number } | null {
  if (isFree(world, levelId, x, y)) return { x, y };
  for (let ring = 0.25; ring <= reach; ring += 0.25) {
    const n = Math.max(8, Math.round(ring * 16));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const [px, py] = [x + Math.cos(a) * ring, y + Math.sin(a) * ring];
      if (isFree(world, levelId, px, py)) return { x: px, y: py };
    }
  }
  return null;
}

/** A walker standing at (x, y) on a storey, at its floor height; null where there is no floor. */
export function standAt(world: WalkWorld, levelId: string, x: number, y: number): Walker | null {
  const h = floorAt(world, levelId, x, y);
  return h === null ? null : { x, y, level: levelId, h, ramp: null };
}
