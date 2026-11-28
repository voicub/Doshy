// "Light my way": put the plan's linked lights in the order somebody walking in from the entrance meets them. The walk is measured through the doors with the floor grid of the
// robot vacuum (lib/vacuumPath.ts), so a light behind a wall is "far" even when it is a metre away on the map. Pure: the node test runner loads this file directly.
import { DEFAULT_GAP_MS, MAX_ARRIVAL_STEPS, type ArrivalStep, type Entrance } from "./arrival.ts";
import { isFence } from "./fences.ts";
import { openingPoint, planBounds, roomAtLevel } from "./geometry.ts";
import { levelIdOf, levelsOf } from "./levels.ts";
import { isOpenAir } from "./stairs.ts";
import type { Plan, Pt, Room } from "./types.ts";
import { buildGrid, findPath, makeRoute, type Grid } from "./vacuumPath.ts";

/** How far a walk is: the metres from one point to another on one storey, or null when there is no way (then the straight line is used). */
export type Walker = (from: Pt, to: Pt, levelId: string) => number | null;

/** The real walk: a floor grid per storey (built once, when first needed) and a path search through the doors. */
export function gridWalker(plan: Plan): Walker {
  const grids = new Map<string, Grid | null>();
  return (from, to, levelId) => {
    if (!grids.has(levelId)) grids.set(levelId, buildGrid(plan, levelId));
    const g = grids.get(levelId);
    const path = g ? findPath(g, from, to) : null;
    return path ? makeRoute(path).len : null;
  };
}

export type Place = Pt & { level: string };

/** How far (m) another storey counts as: the walk up the stairs is not measured, so a light upstairs is simply later than anything on the entrance's own storey. */
const LEVEL_PENALTY_M = 1000;
/** A place this far (m) to each side of a door, to see which rooms it connects. */
const SIDE_M = 0.5;
const ENTRY_ROOM = /\b(hall|hallway|entry|entrance|foyer|lobby|vestibule|porch|mudroom|corridor)\b/i;

export const BRIGHTNESS = { outdoor: 60, entry: 80, rest: 100 } as const;

const hostOf = (plan: Plan, r: Room | undefined): Room | undefined => (r?.parent ? plan.rooms.find((h) => h.id === r.parent) ?? r : r);
const indoorAt = (plan: Plan, level: string, p: Pt): Room | undefined => {
  const host = hostOf(plan, roomAtLevel(plan, level, p.x, p.y));
  return host && !isOpenAir(host) ? host : undefined;
};

// ---- entrances -----------------------------------------------------------------------------------------------------------------------------------------

type Door = { id: string; at: Place; fence: boolean; /** the indoor rooms on its two sides */ inside: Room[] };

function doorsOf(plan: Plan): Door[] {
  return plan.openings.flatMap((o): Door[] => {
    const wall = plan.walls.find((w) => w.id === o.wallId);
    const at = wall && o.type === "door" ? openingPoint(plan, o) : undefined;
    if (!wall || !at) return [];
    const level = levelIdOf(plan, wall);
    const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1;
    const [nx, ny] = [-(wall.b.y - wall.a.y) / len, (wall.b.x - wall.a.x) / len];
    const sides = [1, -1].map((s) => indoorAt(plan, level, { x: at.x + nx * SIDE_M * s, y: at.y + ny * SIDE_M * s }));
    return [{ id: o.id, at: { ...at, level }, fence: isFence(wall.style), inside: sides.filter((r): r is Room => !!r) }];
  });
}

/** A way in the person can pick: the door of the building (or a garden gate), or the start of a garden path or road (the street). */
export type EntranceChoice = { key: string; label: string; entrance: Entrance };

/** The doors that lead outside (a door between two indoor rooms is not a way in), garden gates, and where roads and paths start. A plan with no outside door lists all its doors. */
export function entranceChoices(plan: Plan): EntranceChoice[] {
  const doors = doorsOf(plan);
  const outside = doors.filter((d) => d.inside.length < 2);
  const list = (outside.length ? outside : doors).sort((a, b) => Number(a.fence) - Number(b.fence));
  const used = new Map<string, number>();
  const choices = list.map((d): EntranceChoice => {
    const base = d.fence ? "Garden gate" : d.inside[0] ? `Door in ${d.inside[0].name}` : "Door outside";
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return { key: `door:${d.id}`, label: n > 1 ? `${base} (${n})` : base, entrance: { openingId: d.id } };
  });
  const streets = (plan.paths ?? []).slice(0, 3).flatMap((p, i): EntranceChoice[] => (p.points[0] ? [{ key: `path:${p.id}`, label: `The street: start of ${p.name ?? `path ${i + 1}`}`, entrance: { x: p.points[0].x, y: p.points[0].y } }] : []));
  return [...choices, ...streets];
}

/** The plan's front door: the first door of the building that leads outside, else the first garden gate or door. Undefined when there is no door. */
export const defaultEntrance = (plan: Plan): Entrance | undefined => entranceChoices(plan).find((c) => "openingId" in c.entrance)?.entrance;

/** Where an entrance is on the plan, or null when its door is gone. */
export function entrancePlace(plan: Plan, e: Entrance): Place | null {
  if (!("openingId" in e)) return { x: e.x, y: e.y, level: e.level ?? levelsOf(plan)[0].id };
  return doorsOf(plan).find((d) => d.id === e.openingId)?.at ?? null;
}

/** Do people come to this entrance from outside the plan's own walking floor (a gate, the street), so that the garden lights start at it? A door of the house is the end of the garden walk. */
const startsOutside = (plan: Plan, e: Entrance): boolean => !("openingId" in e) || (doorsOf(plan).find((d) => d.id === e.openingId)?.fence ?? false);

// ---- lights ---------------------------------------------------------------------------------------------------------------------------------------------

export type LightSpot = { entity: string; x: number; y: number; level: string; roomId: string | null; roomName: string; outdoors: boolean; entry: boolean };

/** Every `light.*` linked to a piece of the plan, once each, with where it is and what room that is. Not in an indoor room = outdoors (street lights, path lights, a porch). */
export function lightSpots(plan: Plan): LightSpot[] {
  const seen = new Set<string>();
  const out: LightSpot[] = [];
  for (const it of plan.items) {
    if (!it.entity?.startsWith("light.") || seen.has(it.entity)) continue;
    seen.add(it.entity);
    const level = levelIdOf(plan, it);
    const room = indoorAt(plan, level, it);
    out.push({ entity: it.entity, x: it.x, y: it.y, level, roomId: room?.id ?? null, roomName: room?.name ?? "Outside", outdoors: !room, entry: !!room && ENTRY_ROOM.test(room.name) });
  }
  return out;
}

export type OrderOptions = {
  /** Wait before each light but the first (ms). */
  gapMs?: number;
  /** Only these lights (the ones Home Assistant has). */
  entities?: readonly string[];
  /** The room the person usually goes to: its lights come last. */
  finishRoomId?: string;
  /** How much each light is used (any number; minutes on, say). Without `finishRoomId`, the room whose lights are used most finishes the walk. No history = the farthest room finishes it. */
  usage?: Readonly<Record<string, number>>;
  walk?: Walker;
  brightness?: { outdoor: number; entry: number; rest: number };
};

/**
 * The steps for the plan's lights, in the order somebody coming in meets them: outdoor lights first (from the street towards the door when the entrance is a door of the house;
 * from the gate or street onwards when it is one), then the hall and entry rooms, then the other rooms by how far it is to walk, and the room the person usually goes to last.
 * The first light comes on at once; the others after `gapMs`. At most MAX_ARRIVAL_STEPS: with more lights the middle rooms give way and the finish stays.
 */
export function orderArrivalSteps(plan: Plan, entrance: Entrance | undefined, opts: OrderOptions = {}): ArrivalStep[] {
  const { gapMs = DEFAULT_GAP_MS, walk = gridWalker(plan), brightness = BRIGHTNESS } = opts;
  const start: Place = (entrance && entrancePlace(plan, entrance)) ?? { x: planBounds(plan)?.x0 ?? 0, y: planBounds(plan)?.y0 ?? 0, level: levelsOf(plan)[0].id };
  const levelAt = (id: string) => levelsOf(plan).findIndex((l) => l.id === id);
  const spots = lightSpots(plan).filter((s) => !opts.entities || opts.entities.includes(s.entity));

  const metres = (s: LightSpot): number => {
    const straight = Math.hypot(s.x - start.x, s.y - start.y);
    if (s.outdoors) return straight;
    if (s.level !== start.level) return straight + LEVEL_PENALTY_M * Math.abs(levelAt(s.level) - levelAt(start.level));
    return walk(start, s, s.level) ?? straight;
  };
  const far = new Map(spots.map((s) => [s.entity, metres(s)]));
  const d = (s: LightSpot) => far.get(s.entity) ?? 0;

  const fromOutside = entrance ? startsOutside(plan, entrance) : true;
  const outdoors = spots.filter((s) => s.outdoors).sort((a, b) => (fromOutside ? d(a) - d(b) : d(b) - d(a)));
  const indoors = spots.filter((s) => !s.outdoors);
  const nearest = new Map<string, number>();
  for (const s of indoors) nearest.set(s.roomId ?? "", Math.min(nearest.get(s.roomId ?? "") ?? Infinity, d(s)));
  const byRoom = [...indoors].sort((a, b) => Number(b.entry) - Number(a.entry) || (nearest.get(a.roomId ?? "") ?? 0) - (nearest.get(b.roomId ?? "") ?? 0) || (a.roomId ?? "").localeCompare(b.roomId ?? "") || d(a) - d(b));

  const finish = opts.finishRoomId ?? usualRoom(indoors, opts.usage);
  const ordered = [...outdoors, ...byRoom.filter((s) => s.roomId !== finish), ...byRoom.filter((s) => s.roomId === finish)];
  const kept = ordered.length > MAX_ARRIVAL_STEPS ? [...ordered.slice(0, MAX_ARRIVAL_STEPS - 1), ordered[ordered.length - 1]] : ordered;
  return kept.map((s, i): ArrivalStep => ({ entity: s.entity, on: true, brightness: s.outdoors ? brightness.outdoor : s.entry ? brightness.entry : brightness.rest, delayMs: i === 0 ? 0 : gapMs }));
}

/** The indoor room whose lights are used most, or undefined when there is no usage to go by. */
function usualRoom(indoors: readonly LightSpot[], usage: OrderOptions["usage"]): string | undefined {
  if (!usage) return undefined;
  const totals = new Map<string, number>();
  for (const s of indoors) if (s.roomId) totals.set(s.roomId, (totals.get(s.roomId) ?? 0) + Math.max(0, usage[s.entity] ?? 0));
  let best: string | undefined;
  let most = 0;
  for (const [room, total] of totals) if (total > most) (most = total), (best = room);
  return best;
}
