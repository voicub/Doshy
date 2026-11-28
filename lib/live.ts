// Pure live-statistics helpers (no React, no store): the node test runner loads this file directly. Hooks live in useLive.ts.
import type { HAState } from "./ha.ts";
import { isRecord } from "./guards.ts";
import type { HaArea } from "./haAreas.ts";
import { roomAreaIds } from "./haAreas.ts";
import { roomGroup } from "./planOps.ts";
import { isNumeric, kwhFactor } from "./stats.ts";
import type { Plan, Room } from "./types.ts";

export type Reading = { value: number; unit: string; entity: string };
type TempComfort = "cold" | "cool" | "ok" | "warm" | "hot";
type HumidityComfort = "dry" | "ok" | "humid";
export type RoomLive = {
  temp?: Reading;
  humidity?: Reading;
  /** true = occupied, false = empty, null = no (working) presence sensor. */
  presence: boolean | null;
  /** Epoch ms of the last presence change: since when the room is occupied / empty. */
  presenceSince?: number;
  /** Summed watts of the room's power sensors. */
  powerW?: number;
  tempComfort?: TempComfort;
  humidityComfort?: HumidityComfort;
};
type AreaCtx = { entityArea: Record<string, string | null>; areas: HaArea[] };
export type Person = { entity: string; name: string; home: boolean };
export type HouseLive = {
  powerW?: number;
  /** Lifetime meter reading. */
  energyKwh?: number;
  outsideTemp?: number;
  outsideHumidity?: number;
  meanTemp?: number;
  meanHumidity?: number;
  persons: Person[];
};

export const HOUSE = {
  power: "sensor.house_power_power",
  energy: "sensor.house_power_energy",
  outsideTemp: "sensor.outside_temperature",
  outsideHumidity: "sensor.outside_humidity",
  meanTemp: "sensor.mean_temperature",
  meanHumidity: "sensor.mean_humidity",
} as const;

const domain = (id: string) => id.split(".")[0];
const num = (st?: HAState): number | undefined => (st && isNumeric(st.state) ? Number(st.state) : undefined);
const toC = (v: number, unit: string) => (unit === "°F" ? ((v - 32) * 5) / 9 : v);

/** Comfort bands in °C (Fahrenheit readings are converted first). */
export function tempComfort(value: number, unit = "°C"): TempComfort {
  const c = toC(value, unit);
  return c < 17 ? "cold" : c < 20 ? "cool" : c <= 24 ? "ok" : c <= 27 ? "warm" : "hot";
}
export const humidityComfort = (rh: number): HumidityComfort => (rh < 30 ? "dry" : rh > 60 ? "humid" : "ok");

/** A sensor of the device itself (chip / CPU / internal temperature), not the room air. */
export const DEVICE_INTERNAL = /device_temperature|chip|cpu|soc_|internal/;

const reading = (st: HAState | undefined, attr?: "current_temperature" | "current_humidity"): Reading | undefined => {
  if (!st) return undefined;
  if (attr) {
    const v = st.attributes[attr];
    return typeof v === "number" ? { value: v, unit: attr === "current_humidity" ? "%" : "°C", entity: st.entity_id } : undefined;
  }
  const v = num(st);
  return v === undefined ? undefined : { value: v, unit: st.attributes.unit_of_measurement ?? "", entity: st.entity_id };
};

/** Reading of an explicitly configured entity: a plain sensor, or a climate entity's current temperature / humidity. */
const explicit = (id: string | undefined, states: Record<string, HAState>, kind: "temp" | "humidity"): Reading | undefined =>
  id ? reading(states[id], domain(id) === "climate" ? (kind === "temp" ? "current_temperature" : "current_humidity") : undefined) : undefined;

const toWatts = (r: Reading): number => (r.unit === "kW" ? r.value * 1000 : r.value);

/**
 * Live statistics of a room: explicit Room fields first (alcoves fold into their parent), else sensors found through the room's Home Assistant areas.
 * `areaCtx` is optional: without it only explicit fields are used.
 */
export function roomLive(plan: Plan, states: Record<string, HAState>, room: Room, areaCtx?: AreaCtx): RoomLive {
  const group = roomGroup(plan, room);
  const ids = new Set(areaCtx ? roomAreaIds(plan, room, areaCtx.areas) : []);
  // area fallback candidates, computed once and only when an explicit field is missing. HA files some sensors under the wrong area, so a sensor
  // whose id starts with another room's name ("bedroom_climate_..." in the kitchen area) is not this room's.
  const mine = new Set(group.flatMap((r) => words(r.name)));
  const foreign = plan.rooms.filter((r) => !group.includes(r)).flatMap((r) => words(r.name)).filter((w) => !mine.has(w));
  let found: HAState[] | undefined;
  const inArea = () =>
    (found ??= !areaCtx || !ids.size
      ? []
      : Object.values(states).filter((s) => {
          const a = areaCtx.entityArea[s.entity_id];
          return a != null && ids.has(a) && !foreign.some((w) => s.entity_id.split(".")[1].startsWith(`${w}_`));
        }));
  const sensors = (cls: string, units: string[]) =>
    inArea().filter((s) => domain(s.entity_id) === "sensor" && s.attributes.device_class === cls && !DEVICE_INTERNAL.test(s.entity_id) && units.includes(s.attributes.unit_of_measurement ?? ""));
  const climates = () => inArea().filter((s) => domain(s.entity_id) === "climate");

  const temp =
    group.map((r) => explicit(r.tempEntity, states, "temp")).find(Boolean) ??
    (group.some((r) => r.tempEntity) ? undefined : [...sensors("temperature", ["°C", "°F"]).map((s) => reading(s)), ...climates().map((s) => reading(s, "current_temperature"))].find(Boolean));
  const humidity =
    group.map((r) => explicit(r.humidityEntity, states, "humidity")).find(Boolean) ??
    (group.some((r) => r.humidityEntity) ? undefined : sensors("humidity", ["%"]).map((s) => reading(s)).find(Boolean));

  const presenceIds = group.some((r) => r.presenceEntities?.length)
    ? group.flatMap((r) => r.presenceEntities ?? [])
    : inArea().filter((s) => domain(s.entity_id) === "binary_sensor" && ["occupancy", "motion", "presence"].includes(s.attributes.device_class ?? "")).map((s) => s.entity_id);
  const live = presenceIds.map((id) => states[id]).filter((s): s is HAState => !!s && (s.state === "on" || s.state === "off"));
  const occupied = live.filter((s) => s.state === "on");
  // occupied since the earliest still-on sensor flipped; empty since the latest flip of any sensor
  const stamps = (occupied.length ? occupied : live).map((s) => (s.last_changed ? Date.parse(s.last_changed) : NaN)).filter(Number.isFinite);
  const presenceSince = stamps.length ? (occupied.length ? Math.min(...stamps) : Math.max(...stamps)) : undefined;

  const powerIds = group.some((r) => r.powerEntities?.length) ? group.flatMap((r) => r.powerEntities ?? []) : null;
  const watts = (powerIds ? powerIds.map((id) => reading(states[id])) : sensors("power", ["W", "kW"]).map((s) => reading(s))).filter((r): r is Reading => !!r).map(toWatts);

  return {
    temp,
    humidity,
    presence: live.length ? occupied.length > 0 : null,
    presenceSince,
    powerW: watts.length ? watts.reduce((a, b) => a + b, 0) : undefined,
    tempComfort: temp ? tempComfort(temp.value, temp.unit) : undefined,
    humidityComfort: humidity ? humidityComfort(humidity.value) : undefined,
  };
}

export const cleanName = (s: string) => s.replace(/[^\p{L}\p{N} .'-]/gu, "").replace(/\s+/g, " ").trim();

/** Whole-flat figures from the well-known entities; anything missing is left undefined. Persons with no tracking (unknown / unavailable) are skipped. */
export function houseLive(states: Record<string, HAState>): HouseLive {
  const p = states[HOUSE.power];
  const e = states[HOUSE.energy];
  const pw = num(p);
  const en = num(e);
  return {
    powerW: pw === undefined ? undefined : p.attributes.unit_of_measurement === "kW" ? pw * 1000 : pw,
    energyKwh: en === undefined ? undefined : en * kwhFactor(e.attributes.unit_of_measurement),
    outsideTemp: num(states[HOUSE.outsideTemp]),
    outsideHumidity: num(states[HOUSE.outsideHumidity]),
    meanTemp: num(states[HOUSE.meanTemp]),
    meanHumidity: num(states[HOUSE.meanHumidity]),
    persons: Object.values(states)
      .filter((s) => domain(s.entity_id) === "person" && s.state !== "unknown" && s.state !== "unavailable")
      .map((s) => ({ entity: s.entity_id, name: cleanName(s.attributes.friendly_name ?? s.entity_id.slice(7)) || s.entity_id.slice(7), home: s.state === "home" })),
  };
}

/** Initials for a person badge: first letter of the first two words. */
export const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

/** "12 MIN" / "2 H 5 MIN" / "3 D" for HUD tooltips. */
export function sinceLabel(since: number, now: number): string {
  const m = Math.max(0, Math.floor((now - since) / 60_000));
  if (m < 1) return "NOW";
  if (m < 60) return `${m} MIN`;
  if (m < 1440) return `${Math.floor(m / 60)} H${m % 60 ? ` ${m % 60} MIN` : ""}`;
  return `${Math.floor(m / 1440)} D`;
}

export type Line = { t: number[]; v: number[] };
/** Appends a sample and keeps the newest `max` (the oldest drop off): a ring buffer that never grows. Returns a new Line. */
export function pushSample(line: Line | undefined, t: number, v: number, max: number): Line {
  const from = line ? Math.max(0, line.t.length - max + 1) : 0;
  return { t: [...(line?.t.slice(from) ?? []), t], v: [...(line?.v.slice(from) ?? []), v] };
}

/** Keeps the previous object for every key whose value is structurally unchanged, so memoised consumers re-render only on real changes. */
export function stabilize<T>(prev: T | undefined, next: T): T {
  if (prev === undefined) return next;
  if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
  if (!isRecord(next)) return next;
  const before: Record<string, unknown> = isRecord(prev) ? prev : {};
  const out: Record<string, unknown> = { ...next };
  for (const k of Object.keys(out)) out[k] = stabilize(before[k], out[k]);
  // generic boundary: `out` has the same keys as `next`, each value stabilised against its own previous value
  return out as T;
}

/** "22.1°C" for a reading, "--" when there is none. */
export const fmtTemp = (r?: Reading) => (r ? `${r.value.toFixed(1)}${r.unit}` : "--");
/** "48%" for a relative humidity reading, "--" when there is none. */
export const fmtRh = (r?: Reading) => (r ? `${Math.round(r.value)}%` : "--");

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
