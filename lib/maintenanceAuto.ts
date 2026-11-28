// The maintenance items Doshy finds by itself in the Home Assistant states: low batteries, filters and brushes running out, washers that ask for a service, devices that
// have been offline for a day and updates waiting. Nothing is stored here: an item simply stops being listed when the problem goes away. Each has a stable id made from
// the entity (or the washer's name), so snoozing or switching one off stays with the right thing. Pure: the node test runner loads this file directly.
import { domainOf, type HAState } from "./ha.ts";
import { roomAtLevel } from "./geometry.ts";
import { listUpdates } from "./haUpdates.ts";
import { levelIdOf } from "./levels.ts";
import { BATTERY_DEFAULT } from "./maintenance.ts";
import { openingRooms } from "./openings.ts";
import type { Plan } from "./types.ts";
import { washdataFamilies, washView } from "./washdata.ts";

export type AutoKind = "battery" | "filter" | "wash" | "offline" | "update";
/** due: needs doing now. soon: will need it soon, or it is optional (an update). ok: watched and fine. */
export type AutoStatus = "due" | "soon" | "ok";

export type AutoItem = {
  /** `auto:<kind>:<entity or washer name>`: stable for as long as the thing exists. */
  id: string;
  kind: AutoKind;
  status: AutoStatus;
  name: string;
  /** What is wrong or fine, in plain words: "Battery 12%", "Offline for 3 days". */
  text: string;
  entity?: string;
  roomId?: string;
  roomName?: string;
  itemId?: string;
  /** How low it is, for sorting the worst first (a percentage, hours or days left); absent when it has no number. */
  level?: number;
};

export type AutoInput = {
  plan: Plan;
  states: Record<string, HAState>;
  /** ms since 1970. */
  now: number;
  /** Home Assistant's entity -> area map (lib/haAreas.ts): puts a battery in a room when no furniture is linked to it. Optional. */
  entityArea?: Record<string, string | null>;
  /** A battery at or below this percentage is low. */
  batteryBelow?: number;
};

const HOUR = 3_600_000;
export const OFFLINE_AFTER_MS = 24 * HOUR;
const MAX_ITEMS = 300;
const BATTERY_SOON_MARGIN = 10;
/** A phone, tablet or watch reports a battery too, but charging it is not house upkeep. */
const PERSONAL_DEVICE = /(phone|iphone|ipad|pixel|galaxy|oneplus|tablet|watch|laptop|macbook|airpods|buds|earbuds|headphones)/i;
/** The consumables Home Assistant integrations report: filters, brushes, mops, dust bags and cartridges. */
const CONSUMABLE = /(filter|brush|mop|dust_?bag|sensor_dirty|dirty_sensor|cartridge|membrane|consumable)/i;
const LIFE_LEFT = /(life|left|remaining|remain)/i;
/** The same readings as an attribute of a fan, humidifier or vacuum (`filter_life`, `main_brush_left`). */
const CONSUMABLE_ATTRIBUTE = /^(filter|hepa_filter|carbon_filter|main_brush|side_brush|mop|dust_?bag|sensor_dirty)_(life|left|remaining|life_level|life_remaining)$/i;
const ATTRIBUTE_DOMAINS: readonly string[] = ["fan", "humidifier", "vacuum", "air_purifier", "water_heater"];

// ---- where a thing is ---------------------------------------------------------------------------------------------------------------------------------------

type Place = { roomId?: string; roomName?: string; itemId?: string };

/** Looks up where entities are on the plan: the furniture or door / window linked to one wins, then a room whose Home Assistant areas include the entity's area. */
export function placer(plan: Plan, entityArea: Record<string, string | null> = {}): (entities: readonly string[]) => Place {
  const hostOf = (id: string) => {
    const r = plan.rooms.find((x) => x.id === id);
    return plan.rooms.find((x) => x.id === r?.parent) ?? r;
  };
  const known = new Map<string, Place>();
  const set = (entity: string | undefined, place: Place) => {
    if (entity && !known.has(entity)) known.set(entity, place);
  };
  for (const i of plan.items) {
    const room = roomAtLevel(plan, levelIdOf(plan, i), i.x, i.y);
    const host = room && hostOf(room.id);
    const place = { ...(host ? { roomId: host.id, roomName: host.name } : {}), itemId: i.id };
    set(i.entity, place);
    for (const key of ["plugEntity", "powerEntity"]) {
      const linked = i.params?.[key];
      set(typeof linked === "string" ? linked : undefined, place);
    }
  }
  for (const o of plan.openings) {
    const host = openingRooms(plan, o).rooms[0];
    set(o.entity, host ? { roomId: host.id, roomName: host.name } : {});
  }
  for (const r of plan.rooms) {
    for (const e of [r.tempEntity, r.humidityEntity, ...(r.presenceEntities ?? []), ...(r.powerEntities ?? [])]) set(e, { roomId: r.parent ?? r.id, roomName: hostOf(r.id)?.name });
  }
  return (entities) => {
    for (const e of entities) {
      const hit = known.get(e);
      if (hit) return hit;
    }
    for (const e of entities) {
      const area = entityArea[e];
      const room = area ? plan.rooms.find((r) => r.areas?.includes(area)) : undefined;
      const host = room && hostOf(room.id);
      if (host) return { roomId: host.id, roomName: host.name };
    }
    return {};
  };
}

// ---- readings -----------------------------------------------------------------------------------------------------------------------------------------

const reading = (st: HAState): number | undefined => {
  if (st.state === "unavailable" || st.state === "unknown" || st.state.trim() === "") return undefined;
  const n = Number(st.state);
  return Number.isFinite(n) ? n : undefined;
};

const nameOf = (st: HAState, strip?: RegExp): string => {
  const full = st.attributes.friendly_name ?? "";
  const name = strip ? full.replace(strip, "").trim() : full;
  return name || full || st.entity_id;
};

const objectId = (entity: string): string => entity.slice(entity.indexOf(".") + 1);

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---- batteries ----------------------------------------------------------------------------------------------------------------------------------------

/** A phone's companion app reports `<name>_battery_level` next to `<name>_battery_state`; a sensor on a wall never does. */
const isPersonal = (st: HAState, states: Record<string, HAState>): boolean => {
  const id = objectId(st.entity_id);
  if (PERSONAL_DEVICE.test(id) || PERSONAL_DEVICE.test(st.attributes.friendly_name ?? "")) return true;
  return id.endsWith("_battery_level") && states[`sensor.${id.slice(0, -"_battery_level".length)}_battery_state`] !== undefined;
};

function batteryItem(st: HAState, below: number, states: Record<string, HAState>): Omit<AutoItem, "roomId" | "roomName" | "itemId"> | undefined {
  if (st.attributes.device_class !== "battery" || isPersonal(st, states)) return undefined;
  const domain = domainOf(st.entity_id);
  const name = nameOf(st, /\s*battery( level)?$/i);
  if (domain === "binary_sensor") {
    if (st.state !== "on" && st.state !== "off") return undefined;
    return { id: `auto:battery:${st.entity_id}`, kind: "battery", status: st.state === "on" ? "due" : "ok", name, text: st.state === "on" ? "Battery is low" : "Battery is fine", entity: st.entity_id };
  }
  const pct = domain === "sensor" ? reading(st) : undefined;
  if (pct === undefined || pct < 0 || pct > 100) return undefined;
  const status: AutoStatus = pct <= below ? "due" : pct <= below + BATTERY_SOON_MARGIN ? "soon" : "ok";
  return { id: `auto:battery:${st.entity_id}`, kind: "battery", status, name, text: `Battery ${Math.round(pct)}%`, entity: st.entity_id, level: pct };
}

// ---- filters and other consumables --------------------------------------------------------------------------------------------------------------------

type Left = { unit: "percent" | "hours" | "days"; value: number };

/** What is left of a consumable, from its number and unit; undefined for a unit that is not a time or a percentage. */
function leftOf(value: number, unit: string | undefined): Left | undefined {
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "" || u === "%") return value >= 0 && value <= 100 ? { unit: "percent", value } : undefined;
  if (u === "h" || u === "hr" || u === "hrs" || u === "hour" || u === "hours") return { unit: "hours", value };
  if (u === "min" || u === "mins" || u === "minutes") return { unit: "hours", value: value / 60 };
  if (u === "s" || u === "sec" || u === "seconds") return { unit: "hours", value: value / 3600 };
  if (u === "d" || u === "day" || u === "days") return { unit: "days", value };
  return undefined;
}

const LIMITS: Record<Left["unit"], { due: number; soon: number }> = { percent: { due: 10, soon: 20 }, hours: { due: 20, soon: 50 }, days: { due: 3, soon: 14 } };

const leftText = (l: Left): string => (l.unit === "percent" ? `${Math.round(l.value)}% left` : l.unit === "hours" ? `${plural(Math.max(0, Math.round(l.value)), "hour")} left` : `${plural(Math.max(0, Math.round(l.value)), "day")} left`);

const partName = (key: string): string => key.replace(/_(life|left|remaining|life_level|life_remaining)$/i, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function consumable(id: string, name: string, entity: string, value: number, unit: string | undefined): AutoItem | undefined {
  const left = leftOf(value, unit);
  if (!left) return undefined;
  const lim = LIMITS[left.unit];
  const status: AutoStatus = left.value <= lim.due ? "due" : left.value <= lim.soon ? "soon" : "ok";
  return { id, kind: "filter", status, name, text: leftText(left), entity, level: left.unit === "percent" ? left.value : left.unit === "hours" ? left.value / 3 : left.value * 8 };
}

function consumables(st: HAState): AutoItem[] {
  const domain = domainOf(st.entity_id);
  const id = objectId(st.entity_id);
  if (domain === "sensor" && CONSUMABLE.test(id) && LIFE_LEFT.test(id) && !/battery/i.test(id)) {
    const n = reading(st);
    const name = nameOf(st, /\s*(time |life )?(left|remaining|life)$/i);
    const item = n === undefined ? undefined : consumable(`auto:filter:${st.entity_id}`, name, st.entity_id, n, st.attributes.unit_of_measurement);
    return item ? [item] : [];
  }
  if (!ATTRIBUTE_DOMAINS.includes(domain)) return [];
  const attrs: Record<string, unknown> = st.attributes;
  return Object.keys(attrs).flatMap((key) => {
    const v = attrs[key];
    if (!CONSUMABLE_ATTRIBUTE.test(key) || typeof v !== "number" || !Number.isFinite(v)) return [];
    const item = consumable(`auto:filter:${st.entity_id}:${key}`, `${nameOf(st)}: ${partName(key).toLowerCase()}`, st.entity_id, v, undefined);
    return item ? [item] : [];
  });
}

// ---- offline devices ----------------------------------------------------------------------------------------------------------------------------------

/** Entities the owner put on the plan: furniture, doors and windows, and the rooms' own sensors. */
function linkedEntities(plan: Plan): string[] {
  const all = [...plan.items.map((i) => i.entity), ...plan.openings.map((o) => o.entity), ...plan.rooms.flatMap((r) => [r.tempEntity, r.humidityEntity, ...(r.presenceEntities ?? [])])];
  return [...new Set(all.filter((e): e is string => !!e))];
}

function offlineItem(st: HAState, now: number): Omit<AutoItem, "roomId" | "roomName" | "itemId"> | undefined {
  const offline = st.state === "unavailable" || st.state === "unknown";
  // A stable value is not stale: last_changed alone cannot tell when a working sensor last reported.
  const stamp = offline ? st.last_changed : st.last_reported ?? st.last_updated;
  const since = stamp ? Date.parse(stamp) : NaN;
  if (!Number.isFinite(since) || now - since < OFFLINE_AFTER_MS) return undefined;
  const days = Math.floor((now - since) / (24 * HOUR));
  return { id: `auto:offline:${st.entity_id}`, kind: "offline", status: "due", name: nameOf(st), text: `${offline ? "Offline" : "No reading"} for ${plural(days, "day")}`, entity: st.entity_id, level: -days };
}

// ---- everything --------------------------------------------------------------------------------------------------------------------------------------

/** Every automatic item right now, worst first within a kind. Home Assistant's own answers only; an unreadable or unavailable entity is skipped, never guessed at. */
export function deriveAutoItems({ plan, states, now, entityArea, batteryBelow = BATTERY_DEFAULT }: AutoInput): AutoItem[] {
  const where = placer(plan, entityArea);
  const out: AutoItem[] = [];
  const add = (item: AutoItem | Omit<AutoItem, "roomId" | "roomName" | "itemId">, entities: readonly string[] = item.entity ? [item.entity] : []) => {
    if (out.length < MAX_ITEMS) out.push({ ...item, ...where(entities) });
  };
  for (const st of Object.values(states)) {
    const battery = batteryItem(st, batteryBelow, states);
    if (battery) add(battery);
    for (const c of consumables(st)) add(c);
  }
  for (const dev of washdataFamilies(states)) {
    const v = washView(states, dev.base, now);
    const cycles = v.cycleCount !== undefined ? plural(Math.round(v.cycleCount), "cycle") : "";
    add(
      { id: `auto:wash:${dev.base}`, kind: "wash", status: v.maintenanceDue ? "due" : "ok", name: dev.name, text: v.maintenanceDue ? `Maintenance due${cycles ? `, ${cycles} so far` : ""}` : cycles || "No service needed", entity: dev.anchor },
      dev.entities,
    );
  }
  for (const entity of linkedEntities(plan)) {
    const st = states[entity];
    const off = st && offlineItem(st, now);
    if (off) add(off);
  }
  for (const group of listUpdates(states).available) {
    for (const u of group.items) add({ id: `auto:update:${u.id}`, kind: "update", status: "soon", name: u.name, text: `Update available: ${u.versions}`, entity: u.id });
  }
  return out;
}
