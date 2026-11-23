import { shellWalls } from "./fences.ts";
import { WALL_T } from "./geometry.ts";
import { onLevel } from "./levels.ts";
import { entryOf } from "./planOps.ts";
import { entranceDoors, entranceStairs, type EntranceDoor, type Rect, type StairSpec } from "./stairs.ts";
import type { Plan, Pt } from "./types.ts";

/** Clear width of the shared corridor, and the length it aims for (centred on the flat's door). */
export const HALL_W = 1.8;
export const HALL_LEN = 7;
/** Thickness of the corridor's own walls (far wall and the two end walls). */
export const HALL_WALL = 0.12;
const DOOR_CLEAR = 0.15; // room kept beside the flat's door on each side
const MIN_LEN = 3.2;
const GAP = 0.02;
const TOL = 0.03; // overlaps thinner than this are walls touching, not a collision
const CASING = 0.08; // free wall kept around an opening on the flat's wall

export { entryOf };

export type HallFeature = {
  kind: "lift" | "neighbour" | "stairwell" | "window" | "extinguisher" | "mailboxes";
  /** which wall carries it: the far wall opposite the flat, the flat's own wall, or an end wall */
  wall: "far" | "near" | "end";
  /** centre along the corridor (local x); for an end wall, which end */
  x: number;
  /** neighbours: their flat number; doormat in front of it */
  number?: number;
  mat?: boolean;
};

/**
 * The shared building corridor outside a flat's front door. Local frame: origin at the door centre on the wall's centre line, x along the
 * wall (plan direction (ny, -nx)), z straight out of the building (plan direction (nx, ny)), y up from the floor.
 */
export type Hallway = {
  openingId: string;
  wallId: string;
  /** door centre on the wall's centre line (plan m) and the unit normal pointing out of the building */
  x: number;
  y: number;
  nx: number;
  ny: number;
  /** half the flat wall's thickness: the corridor starts at its outer face */
  face: number;
  /** clear interior extent along local x, and the clear depth */
  x0: number;
  x1: number;
  depth: number;
  doorW: number;
  /** the end (+1 = x1, -1 = x0) with the stairwell door and the lift beside it */
  stairEnd: 1 | -1;
  /** height of the flat's floor above the ground */
  elevation: number;
  /** which face (0 = A, 1 = B) of the flat's wall looks out: the corridor's outer walls take its look */
  facade: 0 | 1;
  /** plan rectangle of the whole shell, walls included, from the flat's wall line out */
  shell: Rect;
  /** the clear interior as a plan polygon */
  outline: Pt[];
  /** stretches of the flat's wall free of the front door and other openings (local x ranges) */
  spans: [number, number][];
  features: HallFeature[];
};

/** Local (x along, z out) to plan metres. */
export const hallwayToPlan = (h: Pick<Hallway, "x" | "y" | "nx" | "ny">, lx: number, lz: number): Pt => ({ x: h.x + h.ny * lx + h.nx * lz, y: h.y - h.nx * lx + h.ny * lz });

const FAR_D = [3.4, 4.9, 6.4]; // neighbours' doors, metres from the stairwell end wall
const LIFT_D = 1.7;

function features(h: { x0: number; x1: number; stairEnd: 1 | -1; spans: [number, number][] }): HallFeature[] {
  const len = h.x1 - h.x0;
  const at = (d: number) => (h.stairEnd === 1 ? h.x1 - d : h.x0 + d);
  const inSpan = (x: number, half: number) => h.spans.some(([a, b]) => x - half >= a && x + half <= b);
  const out: HallFeature[] = [{ kind: "stairwell", wall: "end", x: h.stairEnd }, { kind: "window", wall: "end", x: -h.stairEnd }];
  if (len >= LIFT_D + 0.7 + 0.3) out.push({ kind: "lift", wall: "far", x: at(LIFT_D) });
  const neighbours = FAR_D.filter((d) => d + 0.55 <= len - 0.25);
  neighbours.forEach((d, i) => out.push({ kind: "neighbour", wall: "far", x: at(d), number: 4 + 2 * i, mat: i === Math.min(1, neighbours.length - 1) }));
  if (inSpan(at(0.7), 0.2)) out.push({ kind: "extinguisher", wall: "near", x: at(0.7) });
  if (inSpan(at(2.4), 0.6)) out.push({ kind: "mailboxes", wall: "near", x: at(2.4) });
  return out;
}

type Box = { x0: number; x1: number; z0: number; z1: number };
/** Plan point to the door's frame: x along the wall, z out of the facade. */
type ToLocal = (p: Pt) => { x: number; z: number };

/** Everything else on the level that stands in the corridor's way: rooms and the other walls. */
function blockersOf(plan: Plan, d: EntranceDoor, loc: ToLocal): Box[] {
  const lvl = onLevel(plan, d.level.id);
  const blockers: Box[] = [];
  for (const r of lvl.rooms) {
    const p = [loc({ x: r.x, y: r.y }), loc({ x: r.x + r.w, y: r.y + r.h })];
    blockers.push({ x0: Math.min(p[0].x, p[1].x), x1: Math.max(p[0].x, p[1].x), z0: Math.min(p[0].z, p[1].z), z1: Math.max(p[0].z, p[1].z) });
  }
  for (const w of shellWalls(lvl.walls)) {
    if (w.id === d.wall.id) continue;
    const t = (w.thickness ?? WALL_T) / 2;
    const p = [loc(w.a), loc(w.b)];
    blockers.push({ x0: Math.min(p[0].x, p[1].x) - t, x1: Math.max(p[0].x, p[1].x) + t, z0: Math.min(p[0].z, p[1].z) - t, z1: Math.max(p[0].z, p[1].z) + t });
  }
  return blockers;
}

/** The corridor's local x range: the facade's length, cut back by whatever stands beside it. Null when the door itself is blocked or too little is left. */
function corridorRange(plan: Plan, d: EntranceDoor, loc: ToLocal, face: number, zEnd: number): [number, number] | null {
  const half = d.opening.width / 2;
  const a = loc(d.wall.a).x;
  const b = loc(d.wall.b).x;
  let x0 = Math.max(-HALL_LEN / 2, Math.min(a, b) + HALL_WALL);
  let x1 = Math.min(HALL_LEN / 2, Math.max(a, b) - HALL_WALL);
  for (const k of blockersOf(plan, d, loc)) {
    if (k.z1 <= face + TOL || k.z0 >= zEnd - TOL) continue;
    if (k.x0 < half + DOOR_CLEAR && k.x1 > -half - DOOR_CLEAR) return null;
    if (k.x1 <= 0) x0 = Math.max(x0, k.x1 + HALL_WALL + GAP);
    else x1 = Math.min(x1, k.x0 - HALL_WALL - GAP);
  }
  if (x0 > -half - DOOR_CLEAR || x1 < half + DOOR_CLEAR || x1 - x0 < MIN_LEN) return null;
  return [x0, x1];
}

/** Free stretches of the flat's wall: the whole corridor length minus the front door and any other opening on that wall. */
function freeSpans(plan: Plan, d: EntranceDoor, loc: ToLocal, x0: number, x1: number): [number, number][] {
  const taken = plan.openings
    .filter((o) => o.wallId === d.wall.id)
    .map((o) => {
      const c = loc({ x: d.wall.a.x + (d.wall.b.x - d.wall.a.x) * o.t, y: d.wall.a.y + (d.wall.b.y - d.wall.a.y) * o.t }).x;
      return [c - o.width / 2 - CASING, c + o.width / 2 + CASING] as [number, number];
    })
    .sort((p, q) => p[0] - q[0]);
  const spans: [number, number][] = [];
  let at = x0;
  for (const [s, e] of taken) {
    if (s > at) spans.push([at, Math.min(s, x1)]);
    at = Math.max(at, e);
  }
  if (at < x1) spans.push([at, x1]);
  return spans;
}

function build(plan: Plan, d: EntranceDoor): Hallway | null {
  if (Math.min(Math.abs(d.nx), Math.abs(d.ny)) > 1e-3) return null; // a slanted facade keeps its steps
  const n = { x: Math.round(d.nx), y: Math.round(d.ny) };
  const loc: ToLocal = (p) => ({ x: (p.x - d.x) * n.y - (p.y - d.y) * n.x, z: (p.x - d.x) * n.x + (p.y - d.y) * n.y });
  const face = (d.wall.thickness ?? WALL_T) / 2;
  const zEnd = face + HALL_W + HALL_WALL;
  const range = corridorRange(plan, d, loc, face, zEnd);
  if (!range) return null;
  const [x0, x1] = range;
  const spans = freeSpans(plan, d, loc, x0, x1);

  const stairEnd: 1 | -1 = x1 <= -x0 ? 1 : -1; // lift and stairwell go to the shorter side, the neighbours get the longer stretch
  const nWall = { x: (d.wall.b.y - d.wall.a.y), y: -(d.wall.b.x - d.wall.a.x) }; // wall's left normal, unnormalised
  const h: Hallway = {
    openingId: d.opening.id,
    wallId: d.wall.id,
    x: d.x,
    y: d.y,
    nx: n.x,
    ny: n.y,
    face,
    x0,
    x1,
    depth: HALL_W,
    doorW: d.opening.width,
    stairEnd,
    elevation: d.level.elevation,
    facade: n.x * nWall.x + n.y * nWall.y > 0 ? 1 : 0,
    shell: { x: 0, y: 0, w: 0, h: 0 },
    outline: [],
    spans: spans.filter(([s, e]) => e - s > 0.05),
    features: [],
  };
  h.features = features(h);
  const toPlan = (lx: number, lz: number) => hallwayToPlan(h, lx, lz);
  const c = [toPlan(x0 - HALL_WALL, 0), toPlan(x1 + HALL_WALL, zEnd)];
  h.shell = { x: Math.min(c[0].x, c[1].x), y: Math.min(c[0].y, c[1].y), w: Math.abs(c[1].x - c[0].x), h: Math.abs(c[1].y - c[0].y) };
  h.outline = [toPlan(x0, face), toPlan(x1, face), toPlan(x1, face + HALL_W), toPlan(x0, face + HALL_W)];
  return h;
}

const cache = new WeakMap<Plan, Hallway | null>();

/**
 * The shared corridor outside a flat's front door when the building's entrance is "Building hallway" (the default for an apartment): built outside the
 * narrowest exterior door with a sill at floor level on the lowest level. Null for the other entrances, with no exterior door, or when something stands in its way.
 */
export function hallwayOf(plan: Plan): Hallway | null {
  const hit = cache.get(plan);
  if (hit !== undefined) return hit;
  let h: Hallway | null = null;
  if (entryOf(plan.building) === "hallway") {
    const door = [...entranceDoors(plan)].sort((p, q) => p.opening.width - q.opening.width)[0];
    h = door ? build(plan, door) : null;
  }
  cache.set(plan, h);
  return h;
}

/** Plan rectangle of the block that carries a raised corridor: the shell, inset like the flat's own plinth so the slab reads as a drip edge, and tucked under the flat's wall. */
export function hallwayPlinth(h: Hallway, inset: number): Rect {
  const c = [hallwayToPlan(h, h.x0 - HALL_WALL + inset, 0), hallwayToPlan(h, h.x1 + HALL_WALL - inset, h.face + h.depth + HALL_WALL - inset)];
  return { x: Math.min(c[0].x, c[1].x), y: Math.min(c[0].y, c[1].y), w: Math.abs(c[1].x - c[0].x), h: Math.abs(c[1].y - c[0].y) };
}

/** The entrance steps to draw: all of them for "stairs", none for "door", and for "hallway" every door but the one the corridor opens from (a blocked corridor leaves its door its steps). */
export function entrySteps(plan: Plan): StairSpec[] {
  const mode = entryOf(plan.building);
  if (mode === "door") return [];
  const hall = hallwayOf(plan);
  return entranceStairs(plan).filter((s) => s.openingId !== hall?.openingId);
}
