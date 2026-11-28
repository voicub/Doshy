import { isRecord } from "./guards.ts";

// What a robot vacuum says about its job, read from the attributes of its Home Assistant entity. Integrations differ (Dreame, Roborock, Valetudo, Xiaomi, Roomba ...),
// so several spellings are tolerated; a value that is not clearly what it should be is dropped, never guessed (no unit conversion, no id without a name).
// Pure: no React, no browser.

export type VacuumReport = {
  /** The room the vacuum is in, as the vacuum names it. */
  room?: string;
  /** Floor cleaned in this run (m²). */
  cleanedAreaM2?: number;
  /** 0..100 */
  progress?: number;
  minutes?: number;
};

type Attrs = Record<string, unknown>;

const ROOM_KEYS = ["current_room", "current_room_name", "room_name", "room", "current_segment", "current_segment_name", "segment", "segment_name"];
const ROOM_LISTS = ["rooms", "segments"];
const AREA_KEYS = ["cleaned_area", "cleaning_area", "clean_area", "area"];
const PROGRESS_KEYS = ["cleaning_progress", "progress"];
const TIME_KEYS = ["cleaning_time"];
const NO_NAME: Record<string, true> = { "": true, unknown: true, unavailable: true, none: true, null: true, "n/a": true, "-": true };
/** A single run longer than a day is a value in other units (seconds), not minutes. */
const MAX_MINUTES = 24 * 60;

const NAME_FIELDS = ["name", "room_name", "label"];
const ID_FIELDS = ["id", "segment_id", "room_id"];

const text = (v: unknown): string | undefined => (typeof v === "string" && !Object.hasOwn(NO_NAME, v.trim().toLowerCase()) ? v.trim() : undefined);
const idKey = (v: unknown): string | undefined => (typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" && /^\d+$/.test(v.trim()) ? String(Number(v)) : undefined);
const pick = (o: Attrs, keys: readonly string[]) => keys.map((k) => o[k]);

/** A number, or text that is only a number with one of `units` after it (`units` are regex alternatives, case-insensitive). Anything else is undefined. */
function amount(v: unknown, units: string, min = 0, max = Infinity): number | undefined {
  let n: number | undefined;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const m = new RegExp(`^\\s*(\\d+(?:\\.\\d+)?)\\s*(?:${units})?\\s*$`, "i").exec(v);
    n = m ? Number(m[1]) : undefined;
  }
  return n !== undefined && Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

function firstAmount(a: Attrs, keys: readonly string[], units: string, min?: number, max?: number): number | undefined {
  for (const v of pick(a, keys)) {
    const n = amount(v, units, min, max);
    if (n !== undefined) return n;
  }
  return undefined;
}

/** One room entry of a list: `{id, name}`, any of the id/name spellings. `id` overrides the entry's own (a map keyed by id). */
function addEntry(out: Map<string, string>, e: unknown, id?: unknown) {
  if (!isRecord(e)) return;
  const key = idKey(id) ?? pick(e, ID_FIELDS).map(idKey).find((k) => k !== undefined);
  const name = pick(e, NAME_FIELDS).map(text).find(Boolean);
  if (key !== undefined && name) out.set(key, name);
}

/** id -> name from `rooms` / `segments`: a map of id -> name, id -> {name}, a list of {id, name}, or a map-name -> list of those (Dreame). */
function roomNames(a: Attrs): Map<string, string> {
  const out = new Map<string, string>();
  for (const src of pick(a, ROOM_LISTS)) {
    if (Array.isArray(src)) src.forEach((e) => addEntry(out, e));
    else if (isRecord(src))
      for (const [k, v] of Object.entries(src)) {
        const name = text(v);
        if (name) {
          const key = idKey(k);
          if (key !== undefined) out.set(key, name);
        } else if (Array.isArray(v)) v.forEach((e) => addEntry(out, e));
        else addEntry(out, v, k);
      }
  }
  return out;
}

/** The room the vacuum is in. A name is taken as it is; an id only through the room list (no list, no room). */
function currentRoom(a: Attrs): string | undefined {
  const names = roomNames(a);
  for (const v of pick(a, ROOM_KEYS)) {
    const id = idKey(v);
    const name = id !== undefined ? names.get(id) : text(v);
    if (name) return name;
  }
  return undefined;
}

/** Reads the report; `{}` when the vacuum tells nothing usable. */
export function readVacuumReport(attrs: unknown): VacuumReport {
  if (!isRecord(attrs)) return {};
  const report: VacuumReport = {};
  const room = currentRoom(attrs);
  if (room) report.room = room;
  const area = firstAmount(attrs, AREA_KEYS, "m2|m²|sqm");
  if (area !== undefined) report.cleanedAreaM2 = area;
  const progress = firstAmount(attrs, PROGRESS_KEYS, "%", 0, 100);
  if (progress !== undefined) report.progress = progress;
  const minutes = firstAmount(attrs, TIME_KEYS, "min|mins|minutes?", 0, MAX_MINUTES);
  if (minutes !== undefined) report.minutes = minutes;
  return report;
}

/** "Cleaning Kitchen · 23 m²" (the area only when the vacuum reported one worth showing). */
export function cleaningLine(room: string, areaM2?: number): string {
  return areaM2 !== undefined && areaM2 >= 0.5 ? `Cleaning ${room} · ${Math.round(areaM2)} m²` : `Cleaning ${room}`;
}
