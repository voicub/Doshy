// The plan's linked devices a scene (or a typed command) may drive, grouped by room, with what each one can do. Pure.
import { deviceRows } from "./roomDevices.ts";
import { lightOf } from "./rooms.ts";
import { domainOf, type HAState } from "./ha.ts";
import { levelIdOf } from "./levels.ts";
import type { Plan, Room } from "./types.ts";

export type DeviceKind = "light" | "cover" | "media" | "climate" | "switch" | "fan";
export type SceneDevice = {
  entity: string;
  name: string;
  kind: DeviceKind;
  /** The room's name, or "Elsewhere" for something outside every room. */
  room: string;
  roomId: string | null;
  /** Light: can be dimmed / set to a colour / set to a colour temperature (kelvin range). */
  dimmable: boolean;
  colour: boolean;
  kelvin: [number, number] | null;
  /** Thermostat: lowest, highest and step of its setpoint. */
  limits: { min: number; max: number; step: number } | null;
  /** A cover (curtain, blind, shutter) that is not a garage door or gate. */
  window: boolean;
};

export const ELSEWHERE = "Elsewhere";

const KIND: Record<string, DeviceKind> = { light: "light", cover: "cover", media_player: "media", climate: "climate", switch: "switch", input_boolean: "switch", fan: "fan" };
const COLOUR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];
/** Covers Doshy never moves from a scene or a typed command: a garage door or gate opening by itself is a security matter. */
export const GUARDED_COVERS = ["garage", "gate", "door"];

/** A cover Doshy may move: its device class is not a garage door, gate or door. */
export const movableCover = (st?: { attributes: { device_class?: string } }) => !GUARDED_COVERS.includes(st?.attributes.device_class ?? "");

/** `asLight`: a smart switch that drives a ceiling light fixture counts as a light (it only switches on and off). */
function describe(entity: string, name: string, room: string, roomId: string | null, st: HAState | undefined, asLight: boolean): SceneDevice | null {
  const kind = asLight && domainOf(entity) === "switch" ? "light" : KIND[domainOf(entity)];
  if (!kind || (kind === "cover" && !movableCover(st))) return null;
  const a = st?.attributes;
  const modes = a?.supported_color_modes ?? [];
  const dimmable = kind === "light" && modes.some((m) => m !== "onoff");
  return {
    entity, name, kind, room, roomId, dimmable,
    colour: kind === "light" && modes.some((m) => COLOUR_MODES.includes(m)),
    kelvin: kind === "light" && modes.includes("color_temp") ? [a?.min_color_temp_kelvin ?? 2000, a?.max_color_temp_kelvin ?? 6500] : null,
    limits: kind === "climate" ? { min: a?.min_temp ?? 7, max: a?.max_temp ?? 35, step: a?.target_temp_step ?? 0.5 } : null,
    window: kind === "cover",
  };
}

/** Every controllable device linked to the plan's furniture, rooms in plan order, each device once (an alcove counts with its host room). */
export function sceneDevices(plan: Plan, states: Record<string, HAState>): SceneDevice[] {
  const seen = new Set<string>();
  const out: SceneDevice[] = [];
  const add = (entity: string, name: string, room: Room | null, asLight: boolean) => {
    if (seen.has(entity)) return;
    const d = describe(entity, name, room?.name ?? ELSEWHERE, room?.id ?? null, states[entity], asLight);
    if (!d) return;
    seen.add(entity);
    out.push(d);
  };
  for (const room of plan.rooms.filter((r) => !r.parent)) {
    for (const row of deviceRows(plan, states, room).sort((a, b) => a.name.localeCompare(b.name))) add(row.entity, row.name, room, row.type === "lights");
  }
  for (const it of plan.items) {
    if (it.entity) add(it.entity, states[it.entity]?.attributes.friendly_name ?? it.entity, null, !!lightOf(it));
  }
  return out;
}

/** The devices grouped by room name, in order of first appearance. */
export function byRoom(devices: readonly SceneDevice[]): { room: string; roomId: string | null; devices: SceneDevice[] }[] {
  const groups: { room: string; roomId: string | null; devices: SceneDevice[] }[] = [];
  for (const d of devices) {
    const g = groups.find((x) => x.room === d.room && x.roomId === d.roomId);
    if (g) g.devices.push(d);
    else groups.push({ room: d.room, roomId: d.roomId, devices: [d] });
  }
  return groups;
}

/** The window contact sensors (and window / door openings linked to a sensor): what "is the bathroom window open?" reads. */
export type Contact = { entity: string; name: string; room: string; roomId: string | null; kind: "window" | "door" };

const EDGE = 0.4; // a window sits in the wall, i.e. on the room's boundary

export function contacts(plan: Plan, states: Record<string, HAState>): Contact[] {
  const seen = new Set<string>();
  const out: Contact[] = [];
  const roomAt = (x: number, y: number, level: string): Room | null =>
    plan.rooms.find((r) => !r.parent && levelIdOf(plan, r) === level && x >= r.x - EDGE && x <= r.x + r.w + EDGE && y >= r.y - EDGE && y <= r.y + r.h + EDGE) ?? null;
  for (const o of plan.openings) {
    if (!o.entity || seen.has(o.entity)) continue;
    const wall = plan.walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    seen.add(o.entity);
    const room = roomAt(wall.a.x + (wall.b.x - wall.a.x) * o.t, wall.a.y + (wall.b.y - wall.a.y) * o.t, levelIdOf(plan, o));
    out.push({ entity: o.entity, name: states[o.entity]?.attributes.friendly_name ?? (o.type === "window" ? "Window" : "Door"), room: room?.name ?? ELSEWHERE, roomId: room?.id ?? null, kind: o.type });
  }
  for (const it of plan.items) {
    const st = it.entity ? states[it.entity] : undefined;
    if (!it.entity || !st || seen.has(it.entity) || domainOf(it.entity) !== "binary_sensor") continue;
    const dc = st.attributes.device_class;
    if (dc !== "window" && dc !== "door" && dc !== "opening") continue;
    seen.add(it.entity);
    const room = plan.rooms.find((r) => !r.parent && levelIdOf(plan, r) === levelIdOf(plan, it) && it.x >= r.x && it.x <= r.x + r.w && it.y >= r.y && it.y <= r.y + r.h) ?? null;
    out.push({ entity: it.entity, name: st.attributes.friendly_name ?? it.entity, room: room?.name ?? ELSEWHERE, roomId: room?.id ?? null, kind: dc === "door" ? "door" : "window" });
  }
  return out;
}
