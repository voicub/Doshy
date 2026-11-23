import { isFence } from "./fences.ts";
import { isOutdoorFloor } from "./materials.ts";
import { onLevel, planOfLevel, sortedLevels } from "./levels.ts";
import { outwardFacing } from "./planOps.ts";
import type { Level, Opening, Plan, Room, Wall } from "./types.ts";

/** Building-code-ish stair geometry for the entrance steps of a raised ground floor. */
export const MAX_RISER = 0.17;
export const TREAD = 0.3;
export const LANDING_D = 0.9;
const STAIR_SIDE = 0.25; // extra width beside the door, each side
const HANDRAIL_H = 0.9;
const EPS = 1e-6;

/** Number of risers to climb `elevation` metres with risers no taller than `maxRiser`. */
export const stairCount = (elevation: number, maxRiser = MAX_RISER) => (elevation <= 0.01 ? 0 : Math.ceil(elevation / maxRiser - EPS));

export type Rect = { x: number; y: number; w: number; h: number };
export const expandRect = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });

const OPEN_AIR = /balcon|terra|patio|garden|lawn|porch/i;
/** A room with no roof: lawn / paving, or a balcony, terrace or patio (by floor, name or Home Assistant area). */
export const isOpenAir = (r: Room) => isOutdoorFloor(r.floor) || OPEN_AIR.test(r.name) || !!r.areas?.some((a) => OPEN_AIR.test(a));

export type Edge = { x0: number; y0: number; x1: number; y1: number; nx: number; ny: number };

const within = (r: Rect, x: number, y: number) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;

/**
 * Outline of the union of rectangles: the parts of each rectangle's border with nothing on the other side.
 * Each edge carries its outward unit normal (nx, ny).
 */
export function exposedEdges(rects: Rect[], probe = 0.01): Edge[] {
  const out: Edge[] = [];
  rects.forEach((r, i) => {
    const sides: { a: number; b: number; fixed: number; horizontal: boolean; n: number }[] = [
      { a: r.x, b: r.x + r.w, fixed: r.y, horizontal: true, n: -1 },
      { a: r.x, b: r.x + r.w, fixed: r.y + r.h, horizontal: true, n: 1 },
      { a: r.y, b: r.y + r.h, fixed: r.x, horizontal: false, n: -1 },
      { a: r.y, b: r.y + r.h, fixed: r.x + r.w, horizontal: false, n: 1 },
    ];
    for (const s of sides) {
      const cuts = new Set<number>([s.a, s.b]);
      rects.forEach((q, j) => {
        if (j === i) return;
        const lo = s.horizontal ? q.x : q.y;
        const hi = lo + (s.horizontal ? q.w : q.h);
        for (const c of [lo, hi]) if (c > s.a && c < s.b) cuts.add(c);
      });
      const xs = [...cuts].sort((p, q) => p - q);
      for (let k = 0; k < xs.length - 1; k++) {
        const m = (xs[k] + xs[k + 1]) / 2;
        const px = s.horizontal ? m : s.fixed + s.n * probe;
        const py = s.horizontal ? s.fixed + s.n * probe : m;
        if (rects.some((q, j) => j !== i && within(q, px, py))) continue;
        const last = out[out.length - 1];
        const seg: Edge = s.horizontal
          ? { x0: xs[k], y0: s.fixed, x1: xs[k + 1], y1: s.fixed, nx: 0, ny: s.n }
          : { x0: s.fixed, y0: xs[k], x1: s.fixed, y1: xs[k + 1], nx: s.n, ny: 0 };
        // merge with the previous piece when it continues the same border
        if (last && last.nx === seg.nx && last.ny === seg.ny && Math.abs(last.x1 - seg.x0) < EPS && Math.abs(last.y1 - seg.y0) < EPS && (s.horizontal ? last.y0 === seg.y0 : last.x0 === seg.x0)) {
          last.x1 = seg.x1;
          last.y1 = seg.y1;
        } else out.push(seg);
      }
    }
  });
  return out;
}

/** Roofed rooms of a level expanded by `margin`: the footprint a slab or plinth must cover. */
export const buildingRects = (rooms: Room[], margin: number): Rect[] => rooms.filter((r) => !isOpenAir(r)).map((r) => expandRect(r, margin));

type StepBlock = {
  /** distance from the wall's outer face, outward (m) */
  s0: number;
  s1: number;
  /** top surface height above the ground (m); the block is solid down to y = 0 */
  top: number;
};

export type StairSpec = {
  openingId: string;
  /** door centre on the wall line (plan m) */
  x: number;
  y: number;
  /** unit normal pointing away from the building */
  nx: number;
  ny: number;
  /** half the wall thickness: the stair starts at the outer face */
  width: number;
  elevation: number;
  count: number;
  riser: number;
  blocks: StepBlock[];
  /** handrails (per side): rail segments in (s, height) and the post positions */
  rails: { s0: number; y0: number; s1: number; y1: number }[];
  posts: { s: number; top: number }[];
};

/** Landing + treads for a stair that climbs `elevation` metres. The landing top sits just below the door threshold. */
export function stairBlocks(elevation: number, count = stairCount(elevation)): { blocks: StepBlock[]; riser: number } {
  if (count <= 0) return { blocks: [], riser: 0 };
  const riser = elevation / count;
  const blocks: StepBlock[] = [{ s0: 0, s1: LANDING_D, top: elevation - 0.02 }];
  for (let i = 1; i < count; i++) blocks.push({ s0: LANDING_D + (i - 1) * TREAD, s1: LANDING_D + i * TREAD, top: elevation - i * riser });
  return { blocks, riser };
}

export function stairHandrails(elevation: number, count: number, riser = elevation / Math.max(1, count)) {
  const run = LANDING_D + Math.max(0, count - 1) * TREAD;
  const yEnd = elevation - Math.max(0, count - 1) * riser + HANDRAIL_H;
  const yTop = elevation + HANDRAIL_H;
  const rails = [
    { s0: 0.05, y0: yTop, s1: LANDING_D, y1: yTop },
    { s0: LANDING_D, y0: yTop, s1: run, y1: yEnd },
  ];
  const posts = [{ s: 0.05, top: yTop }, { s: LANDING_D, top: yTop }];
  for (let i = 2; i < count; i += 2) posts.push({ s: LANDING_D + (i - 1) * TREAD, top: elevation - i * riser + HANDRAIL_H });
  posts.push({ s: run, top: yEnd });
  return { rails, posts };
}

/** An exterior door with a sill at floor level on the lowest level: `x`, `y` = its centre on the wall line, `nx`, `ny` = unit normal pointing away from the building. */
export type EntranceDoor = { opening: Opening; wall: Wall; x: number; y: number; nx: number; ny: number; level: Level };

/** Doors with a sill at floor level on the lowest level that open to the outside (a wall with a room on one side only), raised or not. */
export function entranceDoors(plan: Plan): EntranceDoor[] {
  const level = sortedLevels(plan)[0];
  if (!level) return [];
  const lp = planOfLevel(plan, level.id);
  const found: EntranceDoor[] = [];
  for (const o of onLevel(plan, level.id).openings) {
    if (o.type !== "door" || o.sill > 0.05) continue;
    const w = lp.walls.find((x) => x.id === o.wallId);
    if (!w || isFence(w.style)) continue; // a garden gate is not the building's entrance
    const face = outwardFacing(lp, o.wallId, o.t);
    if (!face) continue;
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const n0 = { x: dy / len, y: -dx / len };
    const r = ((face.deg - (plan.bearing ?? 0)) * Math.PI) / 180;
    const out = { x: Math.sin(r), y: -Math.cos(r) };
    const sign = n0.x * out.x + n0.y * out.y >= 0 ? 1 : -1;
    found.push({ opening: o, wall: w, x: w.a.x + dx * o.t, y: w.a.y + dy * o.t, nx: n0.x * sign, ny: n0.y * sign, level });
  }
  return found;
}

/** Doors with a sill at floor level on the lowest, raised level that open to the outside: each gets an entrance staircase down to the ground. */
export function entranceStairs(plan: Plan): StairSpec[] {
  const doors = entranceDoors(plan);
  const elevation = doors[0]?.level.elevation ?? 0;
  if (elevation <= 0.01) return [];
  const count = stairCount(elevation);
  const { blocks, riser } = stairBlocks(elevation, count);
  const { rails, posts } = stairHandrails(elevation, count, riser);
  return doors.map((d) => ({
    openingId: d.opening.id,
    x: d.x,
    y: d.y,
    nx: d.nx,
    ny: d.ny,
    width: d.opening.width + STAIR_SIDE * 2,
    elevation,
    count,
    riser,
    blocks,
    rails,
    posts,
  }));
}

/** Elevation of the lowest level (0 for an unraised or legacy plan). */
export const baseElevation = (plan: Pick<Plan, "levels">) => sortedLevels(plan)[0]?.elevation ?? 0;
