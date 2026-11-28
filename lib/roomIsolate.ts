// Pure: Room mode ("enter a room"). Which room, which open-plan space, which items / doors / windows / sensors belong to it, which walls stay up,
// which room comes next, and how the camera frames it. The node test runner loads this file directly, so imports carry a .ts extension.
// 3D side: components/scene/RoomIsolate.tsx and the small visibility hooks in WallMesh / ItemMesh / Roof / Levels / DeclutterLayer.
import { openingPoint } from "./geometry.ts";
import { isFence } from "./fences.ts";
import { findLevel, levelIdOf, onLevel } from "./levels.ts";
import { openingRooms } from "./openings.ts";
import { roomGroup } from "./planOps.ts";
import type { V3 } from "./mathUtil.ts";
import type { Item, Opening, Plan, Room, Wall } from "./types.ts";
import { openZone, type Rect } from "./zones.ts";

/** Everything Room mode shows: the footprint of the picked room (plus its alcoves, plus the open-plan space when asked) on one storey. */
export type Zone = {
  level: string;
  rects: Rect[];
  /** Ids of every room (alcoves included) inside the footprint. */
  rooms: string[];
  /** The same, without alcoves: the rooms a person would name. */
  hosts: string[];
  /** Height span (m) of the storey: markers of other storeys at the same plan spot are not in the room. */
  y0: number;
  y1: number;
};

export type Member = { entity: string; source: "item" | "opening" | "room"; id: string };
export type WallRole = "tall" | "cut" | "hide" | "keep";

const OPENING_PAD = 0.2; // m: a door or window sits in the wall, up to a wall thickness outside the floor rectangle
const SAMPLE = 0.25; // m between probes along a wall
const PROBE = 0.35; // m either side of a wall's centre line: one side is inside the room, the other is not
const MIN_TOUCH = 0.5; // m of a wall that must border the footprint for the wall to belong to it
const STOREY_SLACK = 0.05;

const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
export const within = (rects: readonly Rect[], x: number, y: number, pad = 0): boolean =>
  rects.some((r) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad);

/** The storey footprint of a room. `includeOpen`: the rooms it shares one open space with (hall + living room + kitchen) come along. Undefined for an unknown id. */
export function zoneOf(plan: Plan, roomId: string, includeOpen: boolean): Zone | undefined {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return undefined;
  const host = plan.rooms.find((r) => r.id === room.parent) ?? room;
  const level = levelIdOf(plan, host);
  const rects: Rect[] = (includeOpen ? openZone(plan, level, host) : roomGroup(plan, host)).map(({ x, y, w, h }) => ({ x, y, w, h }));
  const rooms = onLevel(plan, level).rooms.filter((r) => rects.some((f) => same(f, r)));
  const lv = findLevel(plan, level);
  return { level, rects, rooms: rooms.map((r) => r.id), hosts: rooms.filter((r) => !r.parent).map((r) => r.id), y0: lv.elevation, y1: lv.elevation + lv.height };
}

/** Does this room share one open space with another room (so the "include the open-plan space" switch means something)? */
export const hasOpenPlan = (plan: Plan, roomId: string): boolean => (zoneOf(plan, roomId, true)?.hosts.length ?? 0) > 1;

/** The Room mode state a selector needs. */
type IsoState = { plan: Plan; isolatedRoom: string | null; isolateOpen: boolean; view: string };

let last: { plan: Plan; id: string; open: boolean; zone: Zone | undefined } | null = null;
/** The active zone, or undefined when Room mode is off, outside the live view, or the room is gone. Identity is stable until the plan, the room or the switch changes. */
export function isolationOf(s: IsoState): Zone | undefined {
  if (s.view !== "live" || !s.isolatedRoom) return undefined;
  if (last && last.plan === s.plan && last.id === s.isolatedRoom && last.open === s.isolateOpen) return last.zone;
  const zone = zoneOf(s.plan, s.isolatedRoom, s.isolateOpen);
  last = { plan: s.plan, id: s.isolatedRoom, open: s.isolateOpen, zone };
  return zone;
}

// ---- membership -------------------------------------------------------------------------------------------------------------------------

/** Furniture whose centre lies in the footprint on its storey (alcoves, open-plan neighbours and pieces standing on shelves or tables included: they share the centre point). */
export const itemsIn = (plan: Plan, z: Zone): Item[] => plan.items.filter((i) => levelIdOf(plan, i) === z.level && within(z.rects, i.x, i.y));

/** Doors and windows in the walls around (or inside) the footprint. */
export const openingsIn = (plan: Plan, z: Zone): Opening[] =>
  plan.openings.filter((o) => {
    if (levelIdOf(plan, o) !== z.level) return false;
    const p = openingPoint(plan, o);
    return !!p && within(z.rects, p.x, p.y, OPENING_PAD);
  });

/** The room's own sensors (Room fields), listed once each. */
function roomFieldEntities(plan: Plan, z: Zone): string[] {
  const rooms = plan.rooms.filter((r) => z.rooms.includes(r.id));
  const ids = rooms.flatMap((r: Room) => [r.tempEntity, r.humidityEntity, ...(r.presenceEntities ?? []), ...(r.powerEntities ?? [])]);
  return [...new Set(ids.filter((e): e is string => !!e))];
}

/** Every linked entity of the room, once: furniture first, then door / window sensors, then the room's own sensors. */
export function zoneMembers(plan: Plan, z: Zone): Member[] {
  const seen = new Set<string>();
  const out: Member[] = [];
  const add = (entity: string | undefined, source: Member["source"], id: string) => {
    if (!entity || seen.has(entity)) return;
    seen.add(entity);
    out.push({ entity, source, id });
  };
  for (const i of itemsIn(plan, z)) add(i.entity, "item", i.id);
  for (const o of openingsIn(plan, z)) add(o.entity, "opening", o.id);
  for (const e of roomFieldEntities(plan, z)) add(e, "room", e);
  return out;
}

/** A marker at world position (x, y metres up, z): inside the footprint on the zone's storey? `z` of the plan is the world z. */
export const markerInZone = (z: Zone, x: number, y: number, zz: number): boolean => y >= z.y0 - STOREY_SLACK && y < z.y1 && within(z.rects, x, zz, OPENING_PAD);

// ---- what stays, what goes --------------------------------------------------------------------------------------------------------------

/** Which side of the footprint a wall is on, seen from a camera at some azimuth (see `wallFacing`). */
export type WallFacing = "near" | "far" | "inner" | "hide" | "keep";

/** A wall whose outward normal has less than this much of the camera's direction is seen edge-on: it hides nothing, so it counts as far (and stands). */
const NEAR_DOT = 0.05;

/**
 * Where a wall is, for a camera at `azimuth` degrees (round y from +z; the default isometric camera looks from the (+x, +z) corner):
 * - "far": borders the footprint on the side away from the camera (or edge-on to it).
 * - "near": borders it on the camera's side.
 * - "inner": divides the footprint itself.
 * - "hide": belongs to another room or storey.
 * - "keep": a garden fence or low wall: outside the building.
 */
export function wallFacing(plan: Plan, z: Zone, wall: Wall, azimuth = DEFAULT_AZIMUTH): WallFacing {
  if (isFence(wall.style)) return "keep";
  if (levelIdOf(plan, wall) !== z.level) return "hide";
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return "hide";
  const nx = -dy / len;
  const ny = dx / len;
  const az = (azimuth * Math.PI) / 180;
  const toCamera = nx * Math.sin(az) + ny * Math.cos(az); // the camera's direction along the wall's normal
  const n = Math.max(1, Math.ceil(len / SAMPLE));
  let near = 0;
  let far = 0;
  let inner = 0;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const px = wall.a.x + dx * t;
    const py = wall.a.y + dy * t;
    const a = within(z.rects, px + nx * PROBE, py + ny * PROBE);
    const b = within(z.rects, px - nx * PROBE, py - ny * PROBE);
    if (a && b) inner += len / n;
    else if (a !== b) {
      const sign = a ? -1 : 1; // the outward normal: away from the side that is inside
      if (sign * toCamera > NEAR_DOT) near += len / n;
      else far += len / n;
    }
  }
  if (near + far >= MIN_TOUCH) return near >= far ? "near" : "far";
  return inner >= MIN_TOUCH ? "inner" : "hide";
}

/**
 * How a wall looks in Room mode for a camera at `azimuth`:
 * - "tall": borders the footprint on the far side, full height.
 * - "cut": borders it on the near side (cut away so you can see in), or divides the footprint itself.
 * - "hide": belongs to another room or storey.
 * - "keep": a garden fence or low wall: outside the building, untouched.
 */
export function wallRole(plan: Plan, z: Zone, wall: Wall, azimuth = DEFAULT_AZIMUTH): WallRole {
  const f = wallFacing(plan, z, wall, azimuth);
  return f === "far" ? "tall" : f === "near" || f === "inner" ? "cut" : f;
}

const roleCache = new WeakMap<Zone, { plan: Plan; azimuth: number; roles: Map<string, WallRole> }>();
/** Role of every wall of the plan for this zone seen from `azimuth`. Cached per zone, plan and azimuth (the 3D walls each ask once per change). */
export function wallRoles(plan: Plan, z: Zone, azimuth = DEFAULT_AZIMUTH): Map<string, WallRole> {
  const hit = roleCache.get(z);
  if (hit && hit.plan === plan && hit.azimuth === azimuth) return hit.roles;
  const roles = new Map(plan.walls.map((w) => [w.id, wallRole(plan, z, w, azimuth)] as const));
  roleCache.set(z, { plan, azimuth, roles });
  return roles;
}

const itemCache = new WeakMap<Zone, { plan: Plan; stay: Set<string> }>();
/** Ids of the furniture that stays on screen. */
export function stayingItems(plan: Plan, z: Zone): Set<string> {
  const hit = itemCache.get(z);
  if (hit && hit.plan === plan) return hit.stay;
  const stay = new Set(itemsIn(plan, z).map((i) => i.id));
  itemCache.set(z, { plan, stay });
  return stay;
}

// ---- stepping to the neighbour ----------------------------------------------------------------------------------------------------------

type Stop = { hosts: string[]; x: number; y: number };

/** The places Room mode can step between on one storey: every room, with an open-plan space counting once when `includeOpen`. Hosts of a stop are in left-to-right order. */
function stopsOf(plan: Plan, level: string, includeOpen: boolean): Stop[] {
  const rooms = onLevel(plan, level).rooms.filter((r) => !r.parent);
  const byPos = (a: Room, b: Room) => a.x - b.x || a.y - b.y;
  const claimed = new Set<string>();
  const stops: Stop[] = [];
  for (const r of [...rooms].sort(byPos)) {
    if (claimed.has(r.id)) continue;
    const ids = includeOpen ? (zoneOf(plan, r.id, true)?.hosts ?? [r.id]) : [r.id];
    const hosts = rooms.filter((h) => ids.includes(h.id)).sort(byPos);
    hosts.forEach((h) => claimed.add(h.id));
    stops.push({ hosts: hosts.map((h) => h.id), x: hosts[0].x, y: hosts[0].y });
  }
  return stops;
}

/** Stops in walking order: from the leftmost one, follow doors (left to right where there is a choice); stops no door reaches follow in left-to-right order. */
export function roomOrder(plan: Plan, level: string, includeOpen: boolean): string[][] {
  const stops = stopsOf(plan, level, includeOpen);
  const at = (id: string) => stops.findIndex((s) => s.hosts.includes(id));
  const next = stops.map(() => new Set<number>());
  for (const o of onLevel(plan, level).openings) {
    if (o.type !== "door") continue;
    const ends = [...new Set(openingRooms(plan, o).rooms.map((r) => at(r.id)).filter((i) => i >= 0))];
    for (const a of ends) for (const b of ends) if (a !== b) next[a].add(b);
  }
  const seen = new Set<number>();
  const order: number[] = [];
  const walk = (i: number) => {
    seen.add(i);
    order.push(i);
    for (const j of [...next[i]].sort((a, b) => stops[a].x - stops[b].x || stops[a].y - stops[b].y)) if (!seen.has(j)) walk(j);
  };
  for (let i = 0; i < stops.length; i++) if (!seen.has(i)) walk(i); // stops are already left to right: each new walk starts a new chain
  return order.map((i) => stops[i].hosts);
}

/** The room to enter when stepping from `roomId` (an alcove counts as its host); wraps round at the ends. Undefined when there is nowhere to go. */
export function stepRoom(plan: Plan, roomId: string, dir: 1 | -1, includeOpen: boolean): string | undefined {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return undefined;
  const host = room.parent ?? room.id;
  const order = roomOrder(plan, levelIdOf(plan, room), includeOpen);
  const i = order.findIndex((hosts) => hosts.includes(host));
  if (i < 0 || order.length < 2) return undefined;
  return order[(i + dir + order.length) % order.length][0];
}

// ---- camera -----------------------------------------------------------------------------------------------------------------------------

type ViewAxes = { dir: V3; right: V3; up: V3 };
export const DEFAULT_AZIMUTH = 45; // degrees: the isometric camera looks from the (+x, +z) corner
export const DEFAULT_ELEVATION = 35.264; // atan(1 / sqrt 2): true isometric

/** Unit vectors of a camera at `azimuth` (degrees round y from +z) and `elevation` (degrees above the horizon), all in world space: where it sits (from the target), screen right, screen up. */
export function viewAxes(azimuth: number, elevation: number): ViewAxes {
  const a = (azimuth * Math.PI) / 180;
  const e = (elevation * Math.PI) / 180;
  return {
    dir: [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)],
    right: [Math.cos(a), 0, -Math.sin(a)],
    up: [-Math.sin(e) * Math.sin(a), Math.cos(e), -Math.sin(e) * Math.cos(a)],
  };
}

export type Inset = { left: number; right: number; top: number; bottom: number };
type FrameOpts = { pad: number; yLow: number; yHigh: number; minZoom: number; maxZoom: number; axes: ViewAxes; inset?: Inset };
export type Framing = { target: V3; zoom: number };

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Orthographic camera target and zoom (pixels per metre) that frame some floor rectangles between heights `yLow` and `yHigh` in a `width` x `height` viewport.
 * Every corner is projected, so an L-shaped room is framed by its own outline and not by its bounding box. `inset` is the part of the viewport covered by panels:
 * the room is centred and fitted in what is left. `pad` > 1 leaves breathing room.
 */
export function frameRects(rects: readonly Rect[], width: number, height: number, o: FrameOpts): Framing {
  const { right, up } = o.axes;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (const r of rects) {
    bx0 = Math.min(bx0, r.x); bx1 = Math.max(bx1, r.x + r.w);
    bz0 = Math.min(bz0, r.y); bz1 = Math.max(bz1, r.y + r.h);
  }
  if (!rects.length) return { target: [0, (o.yLow + o.yHigh) / 2, 0], zoom: o.minZoom };
  const cx = (bx0 + bx1) / 2;
  const cz = (bz0 + bz1) / 2;
  const cy = (o.yLow + o.yHigh) / 2;
  for (const r of rects) {
    for (const x of [r.x, r.x + r.w]) {
      for (const z of [r.y, r.y + r.h]) {
        for (const y of [o.yLow, o.yHigh]) {
          const d: V3 = [x - cx, y - cy, z - cz];
          const u = dot(d, right);
          const v = dot(d, up);
          u0 = Math.min(u0, u); u1 = Math.max(u1, u);
          v0 = Math.min(v0, v); v1 = Math.max(v1, v);
        }
      }
    }
  }
  const i = o.inset ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const w = Math.max(1, width - i.left - i.right);
  const h = Math.max(1, height - i.top - i.bottom);
  const halfU = Math.max((u1 - u0) / 2, 0.05);
  const halfV = Math.max((v1 - v0) / 2, 0.05);
  const zoom = Math.min(o.maxZoom, Math.max(o.minZoom, Math.min(w / (2 * halfU * o.pad), h / (2 * halfV * o.pad))));
  // the outline's own centre goes to the middle of the free area: shift the target by the outline's offset from the box centre, and by the panels' offset from the viewport centre
  const du = (u0 + u1) / 2 - (i.left - i.right) / 2 / zoom;
  const dv = (v0 + v1) / 2 + (i.top - i.bottom) / 2 / zoom;
  return { target: [cx + right[0] * du + up[0] * dv, cy + right[1] * du + up[1] * dv, cz + right[2] * du + up[2] * dv], zoom };
}
