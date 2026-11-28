// Pure: from which side to look at a room when it is entered. Each candidate azimuth is scored by what the picture would show (walls in front of the room, furniture and devices hidden
// behind them or behind taller furniture, the room's doors on the walls that face the camera) and by how far the camera must turn to get there; the best one wins, with the room
// framed in the free part of the screen. The node test runner loads this file directly, so imports carry a .ts extension.
// 3D side: components/scene/Rig.tsx turns the camera there, components/scene/isoState.ts hands the azimuth to the walls (which stand and which are cut depends on it).
import { wallHeight } from "./fences.ts";
import { WALL_CUT_H, WALL_H } from "./geometry.ts";
import { DEFAULT_ELEVATION, frameRects, itemsIn, openingsIn, viewAxes, wallFacing, type Framing, type Inset, type WallFacing, type Zone } from "./roomIsolate.ts";
import type { Item, Opening, Plan, Wall } from "./types.ts";

/** The four classic isometric viewpoints: the camera over each corner of the plan. */
export const ISO_CORNERS: readonly number[] = [45, 135, 225, 315];

// Weights of what the picture shows (each part is 0..1) and the price of turning: a quarter turn must buy about 0.4 before the view spins.
const W_ITEMS = 3;
const W_WALLS = 3;
const W_DOORS = 1.5;
const W_FIT = 1;
const TURN_COST = 0.8; // for a half turn; linear in the angle
const SEE_FAR = 1; // how much of a door shows on a wall that faces the camera: all of it ...
const SEE_INNER = 0.5; // ... on a wall inside an open space (cut low, but seen from the side) ...
const SEE_NEAR = 0.15; // ... and on a wall between the room and the camera (cut away, or seen from outside)
const LOW_PIECE = 0.45; // m: a piece lower than this hides nothing behind it
const DEVICE_WEIGHT = 2; // a piece linked to a Home Assistant entity matters more than plain furniture
const EPS = 0.02; // m: a wall or piece right at the item is not in front of it

/** Signed shortest turn (degrees, -180..180) from azimuth `from` to `to`; a half turn counts as -180. */
export const turnBetween = (from: number, to: number): number => ((((to - from) % 360) + 540) % 360) - 180;
const norm = (deg: number): number => ((deg % 360) + 360) % 360;

type Gap = { s0: number; s1: number; y0: number; y1: number }; // an opening in a wall: metres along it, and heights
type Slab = { ax: number; az: number; dx: number; dz: number; len: number; top: number; gaps: Gap[] };

function slabOf(plan: Plan, w: Wall, top: number): Slab {
  const dx = w.b.x - w.a.x;
  const dz = w.b.y - w.a.y;
  const len = Math.hypot(dx, dz);
  const gaps = plan.openings.filter((o) => o.wallId === w.id).map((o) => ({ s0: o.t * len - o.width / 2, s1: o.t * len + o.width / 2, y0: o.sill, y1: o.sill + o.height }));
  return { ax: w.a.x, az: w.a.y, dx, dz, len, top, gaps };
}

/** Area (m2) of the wall that is solid: its face below `top`, minus the doors and windows cut through it. */
const solidArea = (s: Slab): number => s.len * s.top - s.gaps.reduce((a, g) => a + (g.s1 - g.s0) * Math.max(0, Math.min(g.y1, s.top) - g.y0), 0);

type Ray = { x: number; z: number; y: number; hx: number; hz: number; k: number }; // from a point toward the camera: horizontal direction (hx, hz), rising k per metre

/** Does the sight line run into this wall below its top and outside its doors and windows? */
function hitsSlab(r: Ray, s: Slab): boolean {
  const den = r.hx * s.dz - r.hz * s.dx;
  if (Math.abs(den) < 1e-9) return false; // running alongside the wall
  const qx = s.ax - r.x;
  const qz = s.az - r.z;
  const along = (qx * r.hz - qz * r.hx) / den; // 0..1 across the wall
  const dist = (qx * s.dz - qz * s.dx) / den; // metres from the point
  if (along < 0 || along > 1 || dist < EPS) return false;
  const y = r.y + dist * r.k;
  if (y > s.top) return false;
  const pos = along * s.len;
  return !s.gaps.some((g) => pos > g.s0 && pos < g.s1 && y > g.y0 && y < g.y1);
}

/** Does the sight line run into this piece (a box turned by `rot` degrees, clockwise in plan view)? A point inside the piece (something standing on it) is never hidden by it. */
function hitsItem(r: Ray, it: Item): boolean {
  const c = Math.cos((it.rot * Math.PI) / 180);
  const s = Math.sin((it.rot * Math.PI) / 180);
  const ox = r.x - it.x;
  const oz = r.z - it.y;
  const lx = ox * c + oz * s; // the point and the direction in the piece's own axes
  const lz = -ox * s + oz * c;
  const ux = r.hx * c + r.hz * s;
  const uz = -r.hx * s + r.hz * c;
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const [p, d, half] of [[lx, ux, it.w / 2], [lz, uz, it.d / 2]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(p) > half) return false;
    } else {
      const a = (-half - p) / d;
      const b = (half - p) / d;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
  }
  if (t1 <= Math.max(t0, EPS) || (t0 < 0 && t1 > 0)) return false; // missed, behind the point, or the point is inside it
  const elev = it.elev ?? 0;
  return r.y + t0 * r.k <= elev + it.h && r.y + t1 * r.k >= elev;
}

/** How much of the room's doors the camera sees: 0..1 (a window only changes how solid its wall is, see `solidArea`). */
function doorsSeen(openings: Opening[], facing: Map<string, WallFacing>): number {
  let seen = 0;
  let all = 0;
  for (const o of openings) {
    const f = facing.get(o.wallId);
    if (o.type !== "door" || (f !== "far" && f !== "near" && f !== "inner")) continue;
    all += 1;
    seen += f === "far" ? SEE_FAR : f === "inner" ? SEE_INNER : SEE_NEAR;
  }
  return all > 0 ? seen / all : 1;
}

export type RoomViewOpts = {
  /** Where the camera looks from now (degrees round y from +z; the classic isometric view is 45). */
  current: number;
  /** The azimuths to choose from; default: the current one and the four isometric corners. */
  candidates?: readonly number[];
  /** Are the walls cut low where they stand between the camera and the room? (Room mode cuts the near ones whatever the Cut-away switch says, so it passes true.) */
  cutaway: boolean;
  /** Camera elevation above the horizon (degrees); default true isometric. */
  elevation?: number;
  /** Viewport in px, the part of it covered by panels, and the framing limits (see `frameRects`). */
  width: number;
  height: number;
  inset?: Inset;
  pad: number;
  minZoom: number;
  maxZoom: number;
};

/** What one azimuth shows, each part 0..1: `walls` = how little of the wall area between the camera and the room is solid, `items` = share (by weight) of the furniture in sight, `doors` = share of the doors in sight. */
export type ViewScore = { azimuth: number; score: number; walls: number; items: number; doors: number; zoom: number };
export type RoomView = {
  /** The chosen azimuth (0..360) and the signed shortest turn to it from the current one (degrees). */
  azimuth: number;
  turn: number;
  /** Camera target and zoom (px per metre) that frame the room from there. */
  framing: Framing;
  /** Every candidate, best first. */
  scores: ViewScore[];
};

/** What looking at the zone from one azimuth shows (before the price of turning, `score` is 0). `zoom` is what fits the free screen area from there. */
function scoreAt(plan: Plan, zone: Zone, az: number, o: RoomViewOpts, items: Item[], openings: Opening[]): ViewScore {
  const elevation = o.elevation ?? DEFAULT_ELEVATION;
  const a = (az * Math.PI) / 180;
  const k = Math.tan((elevation * Math.PI) / 180);
  const facing = new Map<string, WallFacing>();
  const slabs: Slab[] = [];
  let blocked = 0;
  let total = 0;
  for (const w of plan.walls) {
    const f = wallFacing(plan, zone, w, az);
    facing.set(w.id, f);
    if (f === "hide" || f === "keep") continue;
    const full = wallHeight(w, WALL_H);
    const cut = o.cutaway && f !== "far"; // Room mode lowers the walls between the camera and the room, and the ones inside an open space
    const s = slabOf(plan, w, cut ? Math.min(full, WALL_CUT_H) : full);
    total += s.len * full;
    if (f === "near") blocked += solidArea(s);
    slabs.push(s);
  }
  const occluders = items.filter((i) => (i.elev ?? 0) + i.h >= LOW_PIECE);
  let seen = 0;
  let all = 0;
  for (const it of items) {
    const ray: Ray = { x: it.x, z: it.y, y: (it.elev ?? 0) + it.h / 2, hx: Math.sin(a), hz: Math.cos(a), k };
    const weight = it.entity ? DEVICE_WEIGHT : 1;
    all += weight;
    if (!slabs.some((s) => hitsSlab(ray, s)) && !occluders.some((b) => b !== it && hitsItem(ray, b))) seen += weight;
  }
  const zoom = frameRects(zone.rects, o.width, o.height, { pad: o.pad, yLow: zone.y0, yHigh: zone.y1, minZoom: o.minZoom, maxZoom: o.maxZoom, axes: viewAxes(az, elevation), inset: o.inset }).zoom;
  return { azimuth: norm(az), score: 0, walls: total > 0 ? 1 - blocked / total : 1, items: all > 0 ? seen / all : 1, doors: doorsSeen(openings, facing), zoom };
}

/**
 * The azimuth to look at a room from, and how to frame it from there. A candidate must beat the current view by the price of the turn to get there, so equal views keep the
 * camera where it is (the current azimuth comes first among the candidates) and near-equal ones go to the least rotation.
 */
export function solveRoomView(plan: Plan, zone: Zone, o: RoomViewOpts): RoomView {
  const items = itemsIn(plan, zone);
  const openings = openingsIn(plan, zone);
  const azimuths = (o.candidates ?? [o.current, ...ISO_CORNERS]).map(norm).filter((a, i, all) => all.findIndex((b) => Math.abs(turnBetween(a, b)) < 0.5) === i);
  const rows = azimuths.map((az) => scoreAt(plan, zone, az, o, items, openings));
  const bestZoom = Math.max(...rows.map((r) => r.zoom));
  const scored = rows
    .map((r) => ({ ...r, score: W_ITEMS * r.items + W_WALLS * r.walls + W_DOORS * r.doors + (W_FIT * r.zoom) / bestZoom - (TURN_COST * Math.abs(turnBetween(o.current, r.azimuth))) / 180 }))
    .sort((p, q) => q.score - p.score); // stable: equal scores keep the candidates' order
  const best = scored[0];
  const framing = frameRects(zone.rects, o.width, o.height, { pad: o.pad, yLow: zone.y0, yHigh: zone.y1, minZoom: o.minZoom, maxZoom: o.maxZoom, axes: viewAxes(best.azimuth, o.elevation ?? DEFAULT_ELEVATION), inset: o.inset });
  return { azimuth: best.azimuth, turn: turnBetween(o.current, best.azimuth), framing, scores: scored };
}
