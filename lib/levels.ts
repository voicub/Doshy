import type { Item, Level, Opening, Plan, Room, Wall } from "./types";

/** Floor-to-floor height of a storey added without an explicit height: 2.58 m walls + 0.20 m slab. */
export const DEFAULT_LEVEL_HEIGHT = 2.78;
/** Id of the level every legacy plan lives on. */
export const GROUND_ID = "L0";
/** A raised ground floor: the finished floor sits this far above the ground. */
export const RAISED_FLOOR = 1.0;
/** Thickness of the slab between two storeys / under a raised floor (m). */
export const SLAB_T = 0.2;

/** The plan's levels (never empty): legacy plans get one ground level at elevation 0. */
export function levelsOf(plan: Pick<Plan, "levels">): Level[] {
  return plan.levels?.length ? plan.levels : [{ id: GROUND_ID, name: "Ground floor", elevation: 0, height: DEFAULT_LEVEL_HEIGHT }];
}

export const firstLevelId = (plan: Pick<Plan, "levels">) => levelsOf(plan)[0].id;

/** The level an entity is on: its `level`, or the first level when absent or unknown. */
export function levelIdOf(plan: Pick<Plan, "levels">, e: { level?: string }): string {
  const ls = levelsOf(plan);
  return e.level && ls.some((l) => l.id === e.level) ? e.level : ls[0].id;
}

export const findLevel = (plan: Pick<Plan, "levels">, id: string | undefined): Level => levelsOf(plan).find((l) => l.id === id) ?? levelsOf(plan)[0];

/** Height of the finished floor of a level above the ground (m). */
export const elevationOf = (plan: Pick<Plan, "levels">, id: string | undefined) => findLevel(plan, id).elevation;

/** Levels sorted bottom to top. */
export const sortedLevels = (plan: Pick<Plan, "levels">): Level[] => [...levelsOf(plan)].sort((a, b) => a.elevation - b.elevation);

/** Elevation for a level added on top of the current top level. */
export function nextElevation(plan: Pick<Plan, "levels">): number {
  const top = sortedLevels(plan).at(-1);
  return top ? top.elevation + top.height : 0;
}

export type LevelContent = { walls: Wall[]; openings: Opening[]; rooms: Room[]; items: Item[] };

/** Only the entities on `levelId`. Use it for every geometric operation (collision, framing, room lookup, move, enclosure checks). */
export function onLevel(plan: Plan, levelId: string): LevelContent {
  const on = <T extends { level?: string }>(list: T[]) => list.filter((e) => levelIdOf(plan, e) === levelId);
  return { walls: on(plan.walls), openings: on(plan.openings), rooms: on(plan.rooms), items: on(plan.items) };
}

/** The plan reduced to one level (same shape as Plan, keeps bearing/building/levels) so existing Plan-based helpers can run per level. */
export const planOfLevel = (plan: Plan, levelId: string): Plan => ({ ...plan, ...onLevel(plan, levelId) });

/** A unique level id ("L1", "L2", ...). */
export function newLevelId(plan: Pick<Plan, "levels">): string {
  const ids = new Set(levelsOf(plan).map((l) => l.id));
  for (let n = 1; ; n++) if (!ids.has(`L${n}`)) return `L${n}`;
}

/** How far past a room's rectangle still counts as the building (wall thickness, railings, corner columns). */
const FOOTPRINT_MARGIN = 0.25;

/** True when (x, y) is outside every room of `levelId`: open ground around the building (a garden, a drive). */
export function outsideRooms(plan: Plan, levelId: string, x: number, y: number): boolean {
  const m = FOOTPRINT_MARGIN;
  return !onLevel(plan, levelId).rooms.some((r) => x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m);
}

/** Can a free-standing item of lift `elev` on `levelId` stand on the ground outside the building? Only the lowest level of a raised building, and only unlifted items. */
export function groundable(plan: Pick<Plan, "levels">, levelId: string, elev = 0): boolean {
  return findLevel(plan, levelId).elevation > 0.005 && elev < 0.3 && levelId === sortedLevels(plan)[0].id;
}

/**
 * Height of the surface an entity stands on. That is its level's finished floor, except that a free-standing item outside the building on the lowest level
 * of a raised building stands on the GROUND (a car on the drive of a flat lifted one metre above it). Items lifted by the user (`elev` of 0.3 m or more)
 * keep the level frame: they hang on a wall or stand on something that belongs to the building.
 */
export function floorY(plan: Plan, e: { level?: string; x?: number; y?: number; kind?: string; elev?: number }): number {
  const id = levelIdOf(plan, e);
  const lv = findLevel(plan, id);
  if (e.kind === undefined || e.x === undefined || e.y === undefined || !groundable(plan, id, e.elev ?? 0)) return lv.elevation;
  return outsideRooms(plan, id, e.x, e.y) ? 0 : lv.elevation;
}

/**
 * Does a garden fence, wall or hedge rest on the ground instead of on its level's floor? Yes when both ends and the middle lie outside the building and the
 * level is the lowest of a raised building, the same rule as a free-standing item (`floorY`): a fence round the garden of a flat lifted one metre must not
 * float at the flat's floor height. The caller checks that the wall is a fence (lib/fences.ts `isFence`).
 */
export function groundedWall(plan: Plan, w: Wall): boolean {
  const id = levelIdOf(plan, w);
  if (!groundable(plan, id)) return false;
  const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
  return [w.a, w.b, mid].every((p) => outsideRooms(plan, id, p.x, p.y));
}
