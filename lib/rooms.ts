import { CATALOG } from "./catalog.ts";
import { domainOf, type HAState } from "./ha.ts";
import { isOn } from "./light.ts";
import { elevationOf, levelIdOf } from "./levels.ts";
import { roomGroup } from "./planOps.ts";
import type { Item, Plan, Room } from "./types.ts";

export type RoomSummary = {
  id: string;
  name: string;
  items: number;
  lights: { total: number; on: number; entities: string[] };
  temp?: { value: string; unit: string };
};

const inside = (room: Room, x: number, y: number) => x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h;

/** Furniture whose centre lies in the room or one of its alcoves, on its level. */
export const roomItems = (plan: Plan, room: Room): Item[] => {
  const group = roomGroup(plan, room);
  const level = levelIdOf(plan, room);
  return plan.items.filter((i) => levelIdOf(plan, i) === level && group.some((r) => inside(r, i.x, i.y)));
};

const itemsIn = roomItems;

/** A light entity: a `light.*`, or a smart `switch.*` driving a fixture that has a catalog light. */
export const lightOf = (i: Item): string | undefined => {
  if (!i.entity) return undefined;
  const d = domainOf(i.entity);
  return d === "light" || (d === "switch" && CATALOG[i.kind]?.light) ? i.entity : undefined;
};

/** Light entities linked to furniture in the room (alcoves included). */
export function roomLightEntities(plan: Plan, room: Room): string[] {
  return [...new Set(itemsIn(plan, room).flatMap((i) => lightOf(i) ?? []))];
}

/** What a room contains, for HUD lists and chips. Furniture counts by its centre point. */
export function roomSummary(plan: Plan, states: Record<string, HAState>, room: Room): RoomSummary {
  const entities = roomLightEntities(plan, room);
  const t = room.tempEntity ? states[room.tempEntity] : undefined;
  return {
    id: room.id,
    name: room.name,
    items: itemsIn(plan, room).length,
    lights: { total: entities.length, on: entities.filter((id) => isOn(states[id])).length, entities },
    temp: t ? { value: t.state, unit: t.attributes.unit_of_measurement ?? "" } : undefined,
  };
}

/** The room (an alcove counts as its host) whose floor lies under a world point `y` metres up, on the highest storey at or below it; undefined outside every room. */
export function roomIdAt(plan: Plan, x: number, z: number, y: number): string | undefined {
  let best: Room | undefined;
  let bestLv = -Infinity;
  for (const r of plan.rooms) {
    if (!inside(r, x, z)) continue;
    const lv = elevationOf(plan, levelIdOf(plan, r));
    if (lv > y + 0.05 || lv < bestLv || (lv === bestLv && best && r.w * r.h >= best.w * best.h)) continue;
    best = r;
    bestLv = lv;
  }
  return best && (best.parent ?? best.id);
}
