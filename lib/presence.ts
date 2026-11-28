// Pure: who is home and in which room of the plan. A person (`person.*`, or a `device_tracker.*` the owner added) is home when its state is "home";
// the room comes from a sensor that names it (a room-presence sensor such as Bermuda / ESPresense / mqtt_room), from a motion sensor linked to a room,
// or from the owner's fixed choice. The node test runner loads this file directly, so imports carry a .ts extension and nothing touches React or the browser.
// Scene side: components/scene/PresenceAvatars.tsx. Settings store: presenceStore.ts. Walking: presenceWalk.ts.
import { isRecord } from "./guards.ts";
import type { HAState } from "./ha.ts";
import { roomAreaIds, type HaArea } from "./haAreas.ts";
import { levelIdOf, sortedLevels } from "./levels.ts";
import { cleanName, initials } from "./live.ts";
import { floorOf, isOutdoorFloor } from "./materials.ts";
import type { Plan, Room } from "./types.ts";

// ---- settings ----------------------------------------------------------------------------------------------------------------------------

export const WHERE = ["auto", "fixed", "hidden"] as const;
/** Where a person is drawn: from the sensors (auto), always in one room (fixed) or nowhere (hidden). */
export type Where = (typeof WHERE)[number];

/** Avatar colours, all readable on the dark HUD and on a pale floor. */
export const PALETTE = ["#5ad7ff", "#ff9a62", "#7be08a", "#ffd25a", "#c792ff", "#ff7ab8", "#6f9bff", "#e9eef2"] as const;

export type PersonPrefs = {
  /** Draw this person in the home. */
  enabled: boolean;
  where: Where;
  /** Fixed room, by NAME: plans differ, ids do not carry over. */
  room?: string;
  /** Auto: use this entity instead of looking for `sensor.<name>_room` and friends. */
  sensor?: string;
  color?: string;
  /** One or two characters shown on the avatar. */
  letter?: string;
};

export type PresenceSettings = {
  /** The master switch: people in the home, on or off. */
  show: boolean;
  /** Only the people the owner changed; everyone else has the defaults. */
  people: Record<string, PersonPrefs>;
  /** `device_tracker.*` entities the owner added next to the `person.*` ones. */
  trackers: string[];
};

export const DEFAULT_PREFS: PersonPrefs = { enabled: true, where: "auto" };
export const defaultSettings = (): PresenceSettings => ({ show: true, people: {}, trackers: [] });

const ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const MAX_PEOPLE = 40;
const MAX_ROOM_NAME = 80;

function parsePrefs(raw: unknown): PersonPrefs {
  const r = isRecord(raw) ? raw : {};
  const p: PersonPrefs = { enabled: r.enabled !== false, where: WHERE.find((w) => w === r.where) ?? "auto" };
  if (typeof r.room === "string" && r.room.trim()) p.room = r.room.trim().slice(0, MAX_ROOM_NAME);
  if (typeof r.sensor === "string" && ID.test(r.sensor)) p.sensor = r.sensor;
  const color = PALETTE.find((c) => c === r.color);
  if (color) p.color = color;
  const letter = typeof r.letter === "string" ? Array.from(r.letter.trim()).slice(0, 2).join("") : "";
  if (letter) p.letter = letter;
  return p;
}

/** Stored settings of any version or shape: every valid field is kept, the rest gets its default. */
export function parseSettings(raw: unknown): PresenceSettings {
  const r = isRecord(raw) ? raw : {};
  const people: Record<string, PersonPrefs> = {};
  if (isRecord(r.people))
    for (const [id, v] of Object.entries(r.people).slice(0, MAX_PEOPLE)) if (/^(person|device_tracker)\./.test(id) && ID.test(id)) people[id] = parsePrefs(v);
  const trackers = Array.isArray(r.trackers) ? r.trackers.filter((t): t is string => typeof t === "string" && ID.test(t) && t.startsWith("device_tracker.")) : [];
  return { show: r.show !== false, people, trackers: [...new Set(trackers)].slice(0, MAX_PEOPLE) };
}

export const prefsOf = (s: Pick<PresenceSettings, "people">, entity: string): PersonPrefs => s.people[entity] ?? DEFAULT_PREFS;

/** 32-bit FNV-1a with a murmur finaliser (texts that differ in one character must land far apart): a stable pseudo-random number from text (default colour, standing spot). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export const colorOf = (entity: string, prefs: PersonPrefs): string => prefs.color ?? PALETTE[hash32(entity) % PALETTE.length];
export const letterOf = (name: string, prefs: PersonPrefs): string => prefs.letter ?? initials(name);

// ---- who exists --------------------------------------------------------------------------------------------------------------------------

export type PersonRef = { entity: string; name: string };

const nameOf = (entity: string, st: HAState | undefined): string => {
  const id = entity.slice(entity.indexOf(".") + 1);
  return cleanName(st?.attributes.friendly_name ?? id.replace(/_/g, " ")) || id;
};

/** Every `person.*` Home Assistant reports plus the trackers the owner added, by name. */
export function peopleOf(states: Record<string, HAState>, trackers: readonly string[]): PersonRef[] {
  const ids = new Set([...Object.keys(states).filter((k) => k.startsWith("person.")), ...trackers]);
  return [...ids].map((entity) => ({ entity, name: nameOf(entity, states[entity]) })).sort((a, b) => a.name.localeCompare(b.name) || a.entity.localeCompare(b.entity));
}

// ---- names to rooms ----------------------------------------------------------------------------------------------------------------------

/** What the plan needs for this: its rooms and the order of its storeys. */
export type Layout = Pick<Plan, "rooms" | "levels">;

/** Case, accents and punctuation do not matter: "Living_Room", "living room" and "LIVING-ROOM" are the same text. */
export const norm = (s: string): string => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const GENERIC: Record<string, true> = { room: true, the: true, a: true, an: true, and: true, of: true, my: true };
const words = (s: string): string[] => norm(s).split(" ").filter((w) => w && !Object.hasOwn(GENERIC, w));
const hosts = (l: Layout): Room[] => l.rooms.filter((r) => !r.parent);

/**
 * The room a text names. Exact name first, then a Home Assistant area (by id or name) that belongs to a room, then the closest name that shares words
 * ("Living" and "Kitchen" both find "Living & kitchen"; fewer extra words wins). Alcoves answer as their room. Undefined when nothing fits.
 */
export function matchRoom(layout: Layout, text: string, areas: readonly HaArea[] = []): Room | undefined {
  const want = norm(text);
  const rooms = hosts(layout);
  if (!want) return undefined;
  const exact = rooms.find((r) => norm(r.name) === want);
  if (exact) return exact;

  const ids = new Set([want.replace(/ /g, "_"), ...areas.filter((a) => norm(a.name) === want || norm(a.id) === want).map((a) => a.id)]);
  const shell: Plan = { walls: [], openings: [], items: [], rooms: layout.rooms, levels: layout.levels };
  const byArea = rooms.find((r) => roomAreaIds(shell, r, [...areas]).some((a) => ids.has(a)));
  if (byArea) return byArea;

  const w = words(text);
  if (!w.length) return undefined;
  let best: { room: Room; extra: number } | undefined;
  for (const r of rooms) {
    const rw = words(r.name);
    const inside = w.every((x) => rw.includes(x)) || (rw.length > 0 && rw.every((x) => w.includes(x)));
    const extra = Math.abs(rw.length - w.length);
    if (inside && (!best || extra < best.extra)) best = { room: r, extra };
  }
  return best?.room;
}

const LIVING = /living|lounge|salon|sitting|family|common/;

/** Where someone who is home waits when nothing says where: the living room, else the first indoor room of the lowest storey. */
export function defaultRoom(layout: Layout): Room | undefined {
  const order = sortedLevels(layout).map((l) => l.id);
  const indoor = hosts(layout)
    .filter((r) => !isOutdoorFloor(floorOf(r)))
    .sort((a, b) => order.indexOf(levelIdOf(layout, a)) - order.indexOf(levelIdOf(layout, b)));
  return indoor.find((r) => LIVING.test(norm(r.name))) ?? indoor[0];
}

// ---- sensors -----------------------------------------------------------------------------------------------------------------------------

const UNUSABLE: Record<string, true> = { "": true, unknown: true, unavailable: true, none: true, null: true };
/** Sensor name endings that say where somebody is, best first. */
const ENDINGS = [/^room$/, /^area$/, /(^|_)room$/, /(^|_)area$/, /(^|_)location$/];

/** Name parts a person's sensors start with: `person.anna_popescu` owns `sensor.anna_popescu_room`, and `sensor.anna_room` unless another person is also called anna. */
function slugsOf(ref: PersonRef, everyone: readonly PersonRef[]): string[] {
  const id = ref.entity.slice(ref.entity.indexOf(".") + 1);
  const first = id.split("_")[0];
  const shared = everyone.some((o) => o !== ref && o.entity.slice(o.entity.indexOf(".") + 1).split("_")[0] === first);
  return [...new Set([id, norm(ref.name).replace(/ /g, "_"), ...(shared ? [] : [first])].filter((s) => s.length >= 3))];
}

/** Sensors that look like this person's room sensor, best name first. A sensor that starts with a longer name (`anna_b_room` for anna) is not anna's. */
export function discoverSensors(mine: readonly string[], all: readonly string[], states: Record<string, HAState>): string[] {
  const found: { id: string; rank: number }[] = [];
  for (const id of Object.keys(states)) {
    if (!id.startsWith("sensor.")) continue;
    const obj = id.slice(7);
    const owner = all.filter((s) => obj.startsWith(`${s}_`)).sort((a, b) => b.length - a.length)[0];
    if (!owner || !mine.includes(owner)) continue;
    const rank = ENDINGS.findIndex((re) => re.test(obj.slice(owner.length + 1)));
    if (rank >= 0) found.push({ id, rank });
  }
  return found.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)).map((f) => f.id);
}

export type Context = {
  layout: Layout;
  states: Record<string, HAState>;
  areas: readonly HaArea[];
  /** entity id -> Home Assistant area id (null = none). */
  entityArea: Record<string, string | null>;
  /** The room each person was last known in (a room id), for when their sensor goes quiet. */
  last: ReadonlyMap<string, string>;
};

/** The room a sensor puts somebody in right now, or undefined when it says nothing useful (no reading, empty, a name that fits no room). */
function roomOfSensor(c: Context, id: string): Room | undefined {
  const st = c.states[id];
  if (!st) return undefined;
  if (st.state === "on") {
    // a motion / occupancy sensor: the room that lists it, else the room of its Home Assistant area
    const listed = c.layout.rooms.find((r) => r.presenceEntities?.includes(id));
    if (listed) return c.layout.rooms.find((x) => x.id === listed.parent) ?? listed;
    const area = c.entityArea[id];
    return area ? matchRoom(c.layout, area, c.areas) : undefined;
  }
  if (st.state === "off" || Object.hasOwn(UNUSABLE, norm(st.state))) return undefined;
  return matchRoom(c.layout, st.state, c.areas);
}

// ---- the answer --------------------------------------------------------------------------------------------------------------------------

export type Source = "away" | "hidden" | "fixed" | "sensor" | "last" | "default" | "none";

export type Resolution = {
  entity: string;
  name: string;
  enabled: boolean;
  home: boolean;
  /** Set when the person should be drawn: home, not hidden, and a room found. */
  roomId?: string;
  roomName?: string;
  source: Source;
  /** The sensor that decided (source "sensor"), or the one the owner picked when it said nothing. */
  sensor?: string;
};

function resolveOne(ref: PersonRef, prefs: PersonPrefs, c: Context, mine: readonly string[], all: readonly string[]): Resolution {
  const base = { entity: ref.entity, name: ref.name, enabled: prefs.enabled };
  const home = c.states[ref.entity]?.state === "home";
  if (!home) return { ...base, home, source: "away" };
  if (prefs.where === "hidden") return { ...base, home, source: "hidden" };
  const at = (room: Room, source: Source, sensor?: string): Resolution => ({ ...base, home, roomId: room.id, roomName: room.name, source, sensor });

  let asked: string | undefined; // the sensor that was consulted and said nothing: the sheet names it
  if (prefs.where === "fixed") {
    const room = prefs.room ? matchRoom(c.layout, prefs.room, c.areas) : undefined;
    if (room) return at(room, "fixed");
  } else {
    const ids = prefs.sensor ? [prefs.sensor] : discoverSensors(mine, all, c.states);
    for (const id of ids) {
      const room = roomOfSensor(c, id);
      if (room) return at(room, "sensor", id);
    }
    asked = ids[0];
  }
  const lastId = c.last.get(ref.entity);
  const last = lastId ? hosts(c.layout).find((r) => r.id === lastId) : undefined;
  if (last) return at(last, "last", asked);
  const room = defaultRoom(c.layout);
  return room ? at(room, "default", asked) : { ...base, home, source: "none", sensor: asked };
}

/** Everyone (enabled or not) with where they are. Pass the settings' people; `last` makes a quiet sensor keep a person in their last room. */
export function resolveAll(people: readonly PersonRef[], prefs: Pick<PresenceSettings, "people">, c: Context): Resolution[] {
  const slugs = people.map((p) => slugsOf(p, people));
  const all = [...new Set(slugs.flat())];
  return people.map((p, i) => resolveOne(p, prefsOf(prefs, p.entity), c, slugs[i], all));
}

/** The rooms people were found in for sure (a sensor or the owner's choice), to pass back as `last` next time. */
export function rememberRooms(last: Map<string, string>, results: readonly Resolution[]): void {
  for (const r of results) if (r.roomId && (r.source === "sensor" || r.source === "fixed")) last.set(r.entity, r.roomId);
}

/** One plain sentence for the People sheet: what Doshy sees for this person right now. */
export function describe(r: Resolution): string {
  const who = r.name;
  switch (r.source) {
    case "away":
      return `${who} is away.`;
    case "hidden":
      return `${who} is home but is not drawn (hidden).`;
    case "fixed":
      return `${who} is always shown in ${r.roomName}.`;
    case "sensor":
      return `${who} is in ${r.roomName} (from ${r.sensor}).`;
    case "last":
      return `${who} is home. ${r.sensor ? `${r.sensor} has no reading` : "No room sensor"}, so ${who} stays in ${r.roomName}, the last room seen.`;
    case "default":
      return `${who} is home. ${r.sensor ? `${r.sensor} has no reading` : "No room sensor found"}, so ${who} waits in ${r.roomName}.`;
    case "none":
      return `${who} is home, but the plan has no room to show them in.`;
  }
}
