import { create } from "zustand";
import { errorMessage, isRecord } from "./guards.ts";
import type { HAState } from "./ha";
import { haFetch, onHomeChange } from "./haHome.ts";
import { REQUEST_TIMEOUT_MS, within } from "./requestTimeout.ts";
import type { Plan, Room } from "./types";

export type HaArea = { id: string; name: string };
type AreasResponse = { areas: HaArea[]; entityArea: Record<string, string | null> };

/** The area list the server sent, or null when it is not in the expected shape. */
export function parseAreas(raw: unknown): AreasResponse | null {
  if (!isRecord(raw) || !Array.isArray(raw.areas) || !isRecord(raw.entityArea)) return null;
  const areas = raw.areas.flatMap((a) => (isRecord(a) && typeof a.id === "string" && typeof a.name === "string" ? [{ id: a.id, name: a.name }] : []));
  const entityArea: Record<string, string | null> = {};
  for (const [entity, area] of Object.entries(raw.entityArea)) if (typeof area === "string" || area === null) entityArea[entity] = area;
  return { areas, entityArea };
}

type AreasState = {
  areas: HaArea[];
  /** entity_id -> area id (null = no area). Only entities HA reports a state for are expected, but unknown ids simply miss. */
  entityArea: Record<string, string | null>;
  loaded: boolean;
  error: string | null;
  /** Fetches once; after a failure the next call retries. */
  load: () => Promise<void>;
};

let inflight: Promise<void> | null = null;
let epoch = 0; // counts the homes shown so far: an answer from an older one is dropped

export const useAreas = create<AreasState>((set, get) => ({
  areas: [],
  entityArea: {},
  loaded: false,
  error: null,
  load: () => {
    if (get().loaded) return Promise.resolve();
    inflight ??= (async () => {
      const mine = epoch;
      try {
        const res = await haFetch("/api/ha/areas", { cache: "no-store", signal: within(REQUEST_TIMEOUT_MS) });
        if (!res.ok) {
          const sent: unknown = await res.json().catch(() => null);
          throw new Error(isRecord(sent) && typeof sent.error === "string" ? sent.error : `HTTP ${res.status}`);
        }
        const data = parseAreas(await res.json());
        if (!data) throw new Error("The server sent an area list this page cannot read.");
        if (mine === epoch) set({ areas: data.areas, entityArea: data.entityArea, loaded: true, error: null });
      } catch (e) {
        if (mine === epoch) set({ error: errorMessage(e) });
      } finally {
        if (mine === epoch) inflight = null;
      }
    })();
    return inflight;
  },
}));

// Another home on screen: its areas are not this home's.
onHomeChange(() => {
  epoch++;
  inflight = null;
  useAreas.setState({ areas: [], entityArea: {}, loaded: false, error: null });
  void useAreas.getState().load();
});

const areaOfEntity = (entityArea: Record<string, string | null>, entityId: string): string | null => entityArea[entityId] ?? null;

const GENERIC = ["room", "the", "and", "a"];
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !GENERIC.includes(w));

/** Area ids matched to a room by name: "Living & kitchen" matches the areas "Living Room" and "Kitchen" (word overlap, generic words ignored). */
export function autoAreaIds(room: Room, areas: HaArea[]): string[] {
  const rw = new Set(words(room.name));
  return areas.filter((a) => words(a.name).some((w) => rw.has(w)) || words(a.id).some((w) => rw.has(w))).map((a) => a.id);
}

/** The room itself plus its alcoves (rooms whose `parent` is this room). */
const group = (plan: Plan, room: Room): Room[] => [room, ...plan.rooms.filter((r) => r.parent === room.id)];

/** Area ids belonging to a room: its explicit `areas` (or the name match when unset), plus its alcoves'. Pass `areas` for the name fallback. */
export function roomAreaIds(plan: Plan, room: Room, areas: HaArea[]): string[] {
  return [...new Set(group(plan, room).flatMap((r) => r.areas ?? autoAreaIds(r, areas)))];
}

/** Entity ids (present in `states`) whose HA area belongs to the room. */
export function entitiesOfRoom(plan: Plan, room: Room, entityArea: Record<string, string | null>, states: Record<string, HAState>, areas: HaArea[] = []): string[] {
  const ids = new Set(roomAreaIds(plan, room, areas));
  if (!ids.size) return [];
  return Object.keys(states).filter((id) => {
    const a = areaOfEntity(entityArea, id);
    return a != null && ids.has(a);
  });
}

/** Domains worth a visible marker in the plan when a device is not linked to any furniture yet. */
const PLACEABLE_DOMAINS = ["light", "media_player", "climate", "humidifier", "fan", "cover", "remote", "vacuum", "water_heater"];
const MARKER_SPACING = 0.4;
const MARKER_INSET = 0.3;

export type DevicePlacement = { entity: string; roomId: string; x: number; y: number };

/**
 * Where to drop markers for every controllable device whose HA area maps to a room and that no plan item is linked to yet:
 * one row along the room's south edge, left to right. Alcoves share their parent's row.
 */
export function devicePlacements(plan: Plan, states: Record<string, HAState>, entityArea: Record<string, string | null>, areas: HaArea[]): DevicePlacement[] {
  const linked = new Set(plan.items.flatMap((i) => (i.entity ? [i.entity] : [])));
  return plan.rooms
    .filter((r) => !r.parent)
    .flatMap((room) => {
      const pending = entitiesOfRoom(plan, room, entityArea, states, areas)
        .filter((id) => !linked.has(id) && PLACEABLE_DOMAINS.includes(id.split(".")[0]))
        .sort();
      const perRow = Math.max(1, Math.floor((room.w - 2 * MARKER_INSET) / MARKER_SPACING) + 1);
      return pending.map((entity, n) => ({
        entity,
        roomId: room.id,
        x: room.x + MARKER_INSET + (n % perRow) * MARKER_SPACING,
        y: room.y + room.h - MARKER_INSET - Math.floor(n / perRow) * MARKER_SPACING,
      }));
    });
}
