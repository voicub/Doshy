// Where a walkthrough begins: just inside the front door looking in, or in the middle of a chosen room. Pure; see lib/walkCollide.ts for the world.
import { levelIdOf, sortedLevels } from "./levels.ts";
import { entranceDoors } from "./stairs.ts";
import { yawToward } from "./walkMove.ts";
import { nearestFree, standAt, type Walker, type WalkWorld } from "./walkCollide.ts";
import type { Plan, Room } from "./types.ts";

export type WalkStart = { walker: Walker; yaw: number };

/** How far inside the front door the walker starts (m). */
const INSIDE_DOOR = 0.9;
/** A room's own start is the middle of the room unless the house's centre is this close: then look along the room instead of at the wall. */
const NEAR_CENTRE = 1.5;

const hostOf = (plan: Plan, r: Room): Room => (r.parent ? (plan.rooms.find((h) => h.id === r.parent) ?? r) : r);

/** The middle of a room, on the nearest free floor, looking toward the rest of the home. Null when the room has no room to stand in. */
function startInRoom(plan: Plan, world: WalkWorld, room: Room): WalkStart | null {
  const level = levelIdOf(plan, room);
  const c = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  const spot = nearestFree(world, level, c.x, c.y);
  const walker = spot && standAt(world, level, spot.x, spot.y);
  if (!walker) return null;
  const [homeX, homeY] = [plan.rooms.reduce((s, r) => s + r.x + r.w / 2, 0) / plan.rooms.length, plan.rooms.reduce((s, r) => s + r.y + r.h / 2, 0) / plan.rooms.length];
  const home = { x: homeX, y: homeY };
  const yaw = Math.hypot(home.x - walker.x, home.y - walker.y) < NEAR_CENTRE ? (room.w >= room.h ? Math.PI / 2 : 0) : yawToward(walker, home);
  return { walker, yaw };
}

/** Just inside the first front door, facing in; else the middle of the first room of the lowest storey. */
function startAtDoor(plan: Plan, world: WalkWorld): WalkStart | null {
  const door = entranceDoors(plan)[0];
  if (!door) return null;
  const spot = nearestFree(world, door.level.id, door.x - door.nx * INSIDE_DOOR, door.y - door.ny * INSIDE_DOOR);
  const walker = spot && standAt(world, door.level.id, spot.x, spot.y);
  return walker ? { walker, yaw: yawToward({ x: 0, y: 0 }, { x: -door.nx, y: -door.ny }) } : null;
}

/** The start for "Walk through the home" (no room) or "Walk in <room>". Null when the plan has nowhere to stand. */
export function walkStart(plan: Plan, world: WalkWorld, roomId?: string | null): WalkStart | null {
  const chosen = roomId ? plan.rooms.find((r) => r.id === roomId) : undefined;
  if (chosen) return startInRoom(plan, world, hostOf(plan, chosen));
  const door = startAtDoor(plan, world);
  if (door) return door;
  const first = sortedLevels(plan)[0];
  const rooms = plan.rooms.filter((r) => !r.parent);
  const ordered = [...rooms.filter((r) => levelIdOf(plan, r) === first?.id), ...rooms];
  for (const r of ordered) {
    const s = startInRoom(plan, world, r);
    if (s) return s;
  }
  return null;
}

/** Where the level button puts the walker: the free floor nearest their own spot on that storey, else the middle of its first room. Null when the storey has nowhere to stand. */
export function levelSpot(plan: Plan, world: WalkWorld, levelId: string, x: number, y: number): Walker | null {
  const spot = nearestFree(world, levelId, x, y, 8);
  const here = spot && standAt(world, levelId, spot.x, spot.y);
  if (here) return here;
  const room = plan.rooms.find((r) => !r.parent && levelIdOf(plan, r) === levelId);
  return (room && startInRoom(plan, world, room)?.walker) ?? null;
}
