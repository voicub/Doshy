// Pure: the Cut-away switch's automatic state. With Cut-away off the walls that face the camera are cut low (so you see into the rooms) and the walls behind them stand
// at full height. Which is which depends on the horizontal direction the camera looks from, so this file turns (plan, storey, azimuth) into a cut / tall answer per wall.
// The node test runner loads this file directly, so imports carry a .ts extension. 3D side: components/scene/facingState.ts, WallMesh, ItemMesh, DeclutterLayer.
import { isPillar } from "./catalog.ts";
import { isFence } from "./fences.ts";
import { projectOnWall, roomAt, wallLen } from "./geometry.ts";
import { levelIdOf } from "./levels.ts";
import { isOutdoorFloor } from "./materials.ts";
import type { Item, Plan, Room, Wall } from "./types.ts";

/** How a wall is drawn while Cut-away is automatic. */
export type WallCut = "cut" | "tall";

/**
 * The rule, in short. Let c be how much of the camera's direction a wall's face carries (its unit normal dotted with the horizontal vector toward the camera).
 * - A wall on the outside of the building (a room on one side, none or open air on the other) is cut when its OUTWARD face looks at the camera (c > CUT_DOT): it is
 *   the near wall, and it would hide the rooms. The walls on the far side, and walls seen edge-on, stand: they are the backdrop.
 * - A wall inside the building (rooms on both sides) has no outside; whichever of its faces looks at the camera hides the room behind it, so it is cut when |c| > CUT_DOT.
 *   Walls seen edge-on (|c| small) hide nothing and stand, as Room mode's far walls do (lib/roomIsolate.ts, NEAR_DOT). From each isometric corner this cuts every
 *   inner wall and the two outer walls toward the camera, so the whole plan can be seen into over the two tall walls at the back.
 * - A free-standing wall with no room on either side is treated like an inner wall. Fences, hedges and garden walls are not building walls: they get no answer.
 * - A pillar (column, plumbing riser: `Def.pillar`) has no faces, so it behaves like an outside wall at the place where it stands: c is its offset from the building's
 *   centre (as a share of the building's half diagonal) dotted with the same camera vector. Pillars on the camera's side are cut, those in the back half stand, and one
 *   at the very centre stands too.
 * A wall that is partly one kind and partly another (a long wall that is outside for one room and inside for the next) follows what most of its length asks for; a tie cuts.
 * Hysteresis: a wall that is cut keeps being cut until c drops below LEAVE_DOT, and one that stands stays up until c passes ENTER_DOT, so a wall on the threshold
 * does not flip back and forth while the camera hovers.
 */
export const CUT_DOT = 0.15;
const ENTER_DOT = 0.2;
const LEAVE_DOT = 0.1;

const SAMPLE = 0.25; // m between probes along a wall
const PROBE = 0.35; // m either side of the centre line: clears the wall's own thickness and lands in the room next to it

/** What lies along one wall, independent of the camera: lengths of wall that are inside, outside toward +normal, outside toward -normal, or free standing. */
type Sides = { id: string; nx: number; ny: number; inner: number; free: number; outPlus: number; outMinus: number };
/** A pillar's place in its building: where it stands from the building's centre, as a share of the building's half diagonal (so a corner column is about 1 away). */
type PillarAt = { id: string; ox: number; oy: number };
type Faces = { sides: Sides[]; pillars: PillarAt[] };

const facesCache = new WeakMap<Plan, Map<string, Faces>>();
const MIN_RADIUS = 1; // m: a tiny building does not turn a hand's breadth of offset into "far from the centre"

/** Centre and half diagonal of the building on a storey: its building walls' extent, else its indoor rooms'. Null when it has neither. */
function buildingOf(plan: Plan, levelId: string, rooms: readonly Room[]): { cx: number; cy: number; r: number } | null {
  const pts = plan.walls.filter((w) => !isFence(w.style) && levelIdOf(plan, w) === levelId).flatMap((w) => [w.a, w.b]);
  const corners = pts.length ? pts : rooms.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }]);
  if (!corners.length) return null;
  const x0 = Math.min(...corners.map((p) => p.x));
  const x1 = Math.max(...corners.map((p) => p.x));
  const y0 = Math.min(...corners.map((p) => p.y));
  const y1 = Math.max(...corners.map((p) => p.y));
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.max(MIN_RADIUS, Math.hypot(x1 - x0, y1 - y0) / 2) };
}

function facesOf(plan: Plan, levelId: string): Faces {
  let byLevel = facesCache.get(plan);
  if (!byLevel) facesCache.set(plan, (byLevel = new Map()));
  const hit = byLevel.get(levelId);
  if (hit) return hit;
  const indoor = plan.rooms.filter((r) => levelIdOf(plan, r) === levelId && !isOutdoorFloor(r.floor)); // only indoor rooms count as "inside"
  const level = { ...plan, rooms: indoor };
  const sides: Sides[] = [];
  for (const w of plan.walls) {
    const len = wallLen(w);
    if (len < 1e-6 || isFence(w.style) || levelIdOf(plan, w) !== levelId) continue;
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const s: Sides = { id: w.id, nx: -dy / len, ny: dx / len, inner: 0, free: 0, outPlus: 0, outMinus: 0 };
    const n = Math.max(1, Math.ceil(len / SAMPLE));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const px = w.a.x + dx * t;
      const py = w.a.y + dy * t;
      const plus = !!roomAt(level, px + s.nx * PROBE, py + s.ny * PROBE);
      const minus = !!roomAt(level, px - s.nx * PROBE, py - s.ny * PROBE);
      const share = len / n;
      if (plus && minus) s.inner += share;
      else if (plus) s.outMinus += share; // the room is on the +normal side, so outside is -normal
      else if (minus) s.outPlus += share;
      else s.free += share;
    }
    sides.push(s);
  }
  const home = buildingOf(plan, levelId, indoor);
  const pillars = home
    ? plan.items.filter((i) => isPillar(i.kind) && levelIdOf(plan, i) === levelId).map((i) => ({ id: i.id, ox: (i.x - home.cx) / home.r, oy: (i.y - home.cy) / home.r }))
    : [];
  const faces = { sides, pillars };
  byLevel.set(levelId, faces);
  return faces;
}

/**
 * Cut or tall for every building wall and every pillar of one storey, for a camera at `azimuth` degrees (round y from +z; the default isometric camera looks from the
 * (+x, +z) corner: 45). Keyed by wall id or item id. Walls of other storeys and fences are absent. `prev`: the answer for a nearby azimuth of the same plan and storey,
 * for the hysteresis; the very same Map comes back when nothing changed, so a caller can tell by identity.
 */
export function wallCuts(plan: Plan, levelId: string, azimuth: number, prev?: ReadonlyMap<string, WallCut>): ReadonlyMap<string, WallCut> {
  const az = (azimuth * Math.PI) / 180;
  const vx = Math.sin(az);
  const vz = Math.cos(az);
  const next = new Map<string, WallCut>();
  let same = !!prev;
  const put = (id: string, cut: WallCut) => {
    next.set(id, cut);
    if (prev?.get(id) !== cut) same = false;
  };
  const limitFor = (id: string) => (prev?.get(id) === "cut" ? LEAVE_DOT : prev?.get(id) === "tall" ? ENTER_DOT : CUT_DOT);
  const { sides, pillars } = facesOf(plan, levelId);
  for (const s of sides) {
    const c = s.nx * vx + s.ny * vz;
    const limit = limitFor(s.id);
    const asked = (Math.abs(c) > limit ? s.inner + s.free : 0) + (c > limit ? s.outPlus : 0) + (-c > limit ? s.outMinus : 0);
    const total = s.inner + s.free + s.outPlus + s.outMinus;
    put(s.id, asked > 0 && asked * 2 >= total ? "cut" : "tall");
  }
  // a pillar has no faces: it is "outside" the way its place in the building is, so the ones on the camera's side of the centre are cut and the ones in the back half stand
  for (const p of pillars) put(p.id, p.ox * vx + p.oy * vz > limitFor(p.id) ? "cut" : "tall");
  return same && prev && prev.size === next.size ? prev : next;
}

const REACH = 0.15; // m beyond half the wall's and half the piece's thickness that still counts as sitting on the wall

/** The wall a wall-mounted piece hangs on: the nearest building wall of its storey whose face the piece touches. Undefined for a piece away from every wall. */
export function wallOfItem(plan: Pick<Plan, "walls" | "levels">, item: Pick<Item, "x" | "y" | "d" | "level">): string | undefined {
  const lv = levelIdOf(plan, item);
  let best: { w: Wall; d: number } | undefined;
  for (const w of plan.walls) {
    if (isFence(w.style) || levelIdOf(plan, w) !== lv) continue;
    const p = projectOnWall(w, item);
    const reach = (w.thickness ?? 0.12) / 2 + item.d / 2 + REACH;
    if (p.t < 0 || p.t > 1 || p.dist > reach) continue;
    if (!best || p.dist < best.d) best = { w, d: p.dist };
  }
  return best?.w.id;
}
