// History replay, the pure part: the wire format the server sends, the per-entity tracks built from it, and "what did the home look like at time t" as Home Assistant states.
// Imports only pure modules (relative, with extension): the node test runner loads this file directly, and the server shaping code (lib/server/replayHistory.ts) shares its types.
import { domainOf, isOpenState, TOGGLEABLE, type HAState } from "./ha.ts";
import { isRecord } from "./guards.ts";
import { fmtClock, fmtDay } from "./stats.ts";
import type { Plan } from "./types.ts";

export const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
export const REPLAY_HOURS = [24, 168] as const;
export type ReplayHours = (typeof REPLAY_HOURS)[number];
/** Most entities one replay follows; the server refuses more. */
export const MAX_REPLAY_ENTITIES = 120;
/** The sun entity: its history gives the sunrise / sunset ticks. Its readings (and so the sky) stay live while replaying. */
export const SUN = "sun.sun";

/** What the server keeps of an entity's attributes: numbers, short texts and short number lists (a colour). */
export type ReplayAttrs = Record<string, number | string | number[]>;
/** One change of an entity: [time in ms, state, attributes that mattered at that moment]. */
export type WireEvent = [t: number, state: string, attrs?: ReplayAttrs];
export type ReplayWire = { from: number; to: number; bucketMs: number; entities: Record<string, WireEvent[]> };

/** One entity's changes as parallel arrays, oldest first. */
export type Track = { t: number[]; s: string[]; a: (ReplayAttrs | undefined)[] };
export type Timeline = { from: number; to: number; bucketMs: number; tracks: Record<string, Track> };

const MAX_SPAN_MS = 8 * 24 * 3_600_000;
const MAX_TRACKS = 200;
const MAX_EVENTS = 5000;
const MAX_TEXT = 120;
const ATTR_KEY = /^[a-z0-9_]+$/;
const BAD_ANSWER = "The history answer was not in the expected shape";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseAttrs(raw: unknown): ReplayAttrs | undefined {
  if (!isRecord(raw)) return undefined;
  const out: ReplayAttrs = {};
  let any = false;
  for (const [k, v] of Object.entries(raw)) {
    if (!ATTR_KEY.test(k)) continue;
    if (finite(v) || (typeof v === "string" && v.length <= MAX_TEXT)) out[k] = v;
    else if (Array.isArray(v) && v.length <= 4 && v.every(finite)) out[k] = v;
    else continue;
    any = true;
  }
  return any ? out : undefined;
}

/** The server's answer, checked: a malformed event or entity is dropped, a malformed whole throws. Events come out oldest first. */
export function parseReplay(raw: unknown): Timeline {
  if (!isRecord(raw) || !isRecord(raw.entities)) throw new Error(BAD_ANSWER);
  const { from, to, bucketMs } = raw;
  if (!finite(from) || !finite(to) || !finite(bucketMs) || to <= from || to - from > MAX_SPAN_MS || bucketMs < 1) throw new Error(BAD_ANSWER);
  const tracks: Record<string, Track> = {};
  let count = 0;
  for (const [id, list] of Object.entries(raw.entities)) {
    if (!ENTITY_ID.test(id) || !Array.isArray(list)) continue;
    if (++count > MAX_TRACKS) break;
    const events: { t: number; s: string; a: ReplayAttrs | undefined }[] = [];
    for (const e of list.slice(0, MAX_EVENTS) as unknown[]) {
      if (Array.isArray(e) && finite(e[0]) && typeof e[1] === "string") events.push({ t: e[0], s: e[1], a: parseAttrs(e[2]) });
    }
    if (!events.length) continue;
    events.sort((x, y) => x.t - y.t); // stable: events at the same millisecond keep their order
    tracks[id] = { t: events.map((e) => e.t), s: events.map((e) => e.s), a: events.map((e) => e.a) };
  }
  return { from, to, bucketMs, tracks };
}

/** Index of the last change at or before `t`; -1 before the first one. Binary search. */
export function indexAt(track: Track, t: number): number {
  let lo = 0;
  let hi = track.t.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (track.t[mid] <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** What `id` was at `t`: its last change at or before then. Undefined before the first change we know of (or when the entity has no history). */
export function stateAt(tl: Timeline, id: string, t: number): { t: number; state: string; attrs?: ReplayAttrs } | undefined {
  const track = tl.tracks[id];
  const i = track ? indexAt(track, t) : -1;
  return i < 0 ? undefined : { t: track.t[i], state: track.s[i], attrs: track.a[i] };
}

// What describes the device and not its moment: kept from the live entity. Everything else (brightness, position, temperature...) comes from the history only,
// so a light that was off then does not borrow the brightness it has now.
const STATIC_ATTRS = [
  "friendly_name", "unit_of_measurement", "device_class", "state_class", "icon", "supported_color_modes", "supported_features", "min_color_temp_kelvin", "max_color_temp_kelvin",
  "hvac_modes", "min_temp", "max_temp", "target_temp_step", "preset_modes", "options",
] as const;

function stateObject(live: HAState, track: Track, i: number): HAState {
  const attributes: Record<string, unknown> = {};
  const liveAttrs: Record<string, unknown> = live.attributes;
  for (const k of STATIC_ATTRS) if (liveAttrs[k] !== undefined) attributes[k] = liveAttrs[k];
  if (i >= 0) Object.assign(attributes, track.a[i]);
  // the values come from parseAttrs (numbers, short texts, number lists) and the static keys from a HAState: the same shape the rest of the app reads
  return { entity_id: live.entity_id, state: i >= 0 ? track.s[i] : "unknown", attributes: attributes as HAState["attributes"], last_changed: i >= 0 ? new Date(track.t[i]).toISOString() : undefined };
}

/**
 * A function from a time to the whole entity map at that time. Entities the timeline follows are rebuilt from their history (an entity with no change known
 * yet shows "unknown", still named and still in the lists); the rest (weather, people, the sun's readings, entities nobody linked) stay as they are in `live`.
 * Between two calls an entity whose latest change is the same keeps its object, and when nothing changed the very same map comes back, so only what moved re-renders.
 */
export function createReplayer(tl: Timeline, live: Record<string, HAState>): (t: number) => Record<string, HAState> {
  const ids = Object.keys(tl.tracks).filter((id) => live[id] && id !== SUN);
  const built = new Map<string, number>(); // the change each entity's current object was built from
  let out = live;
  return (t) => {
    let patch: Record<string, HAState> | null = null;
    for (const id of ids) {
      const track = tl.tracks[id];
      const i = indexAt(track, t);
      if (built.get(id) === i) continue;
      built.set(id, i);
      (patch ??= {})[id] = stateObject(live[id], track, i);
    }
    if (patch) out = { ...out, ...patch };
    return out;
  };
}

/** The entity map at `t` (see `createReplayer`; this is its one-shot form). */
export const statesAt = (tl: Timeline, t: number, live: Record<string, HAState>): Record<string, HAState> => createReplayer(tl, live)(t);

/* ---------- strip marks ---------- */

export type Tick = { t: number; id: string };

/** The moments a door / window / contact in `ids` went from closed to open inside [from, to], oldest first. The state a track starts with is not a moment. */
export function eventTicks(tl: Timeline, ids: readonly string[], from: number, to: number): Tick[] {
  const out: Tick[] = [];
  for (const id of ids) {
    const tr = tl.tracks[id];
    if (!tr) continue;
    for (let i = 1; i < tr.t.length; i++) if (tr.t[i] >= from && tr.t[i] <= to && isOpenState(tr.s[i]) && !isOpenState(tr.s[i - 1])) out.push({ t: tr.t[i], id });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** The local midnights strictly inside (from, to), with their "Tue 24" label. */
export function dayMarks(from: number, to: number): { t: number; label: string }[] {
  const out: { t: number; label: string }[] = [];
  const d = new Date(from);
  d.setHours(24, 0, 0, 0);
  while (d.getTime() < to && out.length < 16) {
    out.push({ t: d.getTime(), label: fmtDay(d.getTime()) });
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0); // a daylight-saving day is not 24 h long: always step by the calendar
  }
  return out;
}

/** Sunrise and sunset moments, from the changes of the sun entity. The first reading is where the window starts, not a sunrise. */
export function sunTicks(tl: Timeline): { t: number; kind: "sunrise" | "sunset" }[] {
  const tr = tl.tracks[SUN];
  const out: { t: number; kind: "sunrise" | "sunset" }[] = [];
  if (!tr) return out;
  for (let i = 1; i < tr.t.length; i++) {
    if (tr.s[i] === tr.s[i - 1]) continue;
    if (tr.s[i] === "above_horizon") out.push({ t: tr.t[i], kind: "sunrise" });
    else if (tr.s[i] === "below_horizon") out.push({ t: tr.t[i], kind: "sunset" });
  }
  return out;
}

/* ---------- what to ask the server for ---------- */

const rankOf = (id: string, openings: ReadonlySet<string>): number => {
  if (id === SUN) return -1;
  const d = domainOf(id);
  if (d === "light") return 0;
  if (d === "cover") return 1;
  if (d === "binary_sensor" || openings.has(id)) return 2;
  if (d === "climate") return 3;
  if (d === "sensor") return 5;
  return TOGGLEABLE.includes(d) ? 4 : 6;
};

/**
 * The entities worth replaying: everything the active plan links (furniture, doors and windows, room sensors, energy flows) plus the sun,
 * only those Home Assistant knows now, lights first, then covers, doors / windows and other binary sensors, climate, other devices, sensors; at most `MAX_REPLAY_ENTITIES`.
 */
export function replayEntities(plan: Plan, states: Record<string, HAState>, extra: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const add = (v: unknown) => { if (typeof v === "string" && ENTITY_ID.test(v) && states[v]) seen.add(v); };
  for (const it of plan.items) {
    add(it.entity);
    for (const v of Object.values(it.params ?? {})) add(v);
  }
  const openings = new Set<string>();
  for (const o of plan.openings) {
    add(o.entity);
    if (o.entity) openings.add(o.entity);
  }
  for (const r of plan.rooms) {
    add(r.tempEntity);
    add(r.humidityEntity);
    for (const v of r.presenceEntities ?? []) add(v);
    for (const v of r.powerEntities ?? []) add(v);
  }
  for (const f of plan.flows ?? []) add(f.entity);
  for (const v of extra) add(v);
  add(SUN);
  return [...seen]
    .map((id, order) => ({ id, order, rank: rankOf(id, openings) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, MAX_REPLAY_ENTITIES)
    .map((e) => e.id);
}

/* ---------- time on the scrubber ---------- */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "Tue 14:32" */
export const fmtWhen = (t: number): string => `${WEEKDAYS[new Date(t).getDay()].slice(0, 3)} ${fmtClock(t)}`;
/** "Tuesday 14:32": what a screen reader says. */
export const fmtWhenLong = (t: number): string => `${WEEKDAYS[new Date(t).getDay()]} ${fmtClock(t)}`;

export const clampTime = (t: number, from: number, to: number): number => Math.min(to, Math.max(from, t));

/** Playback: the time after `dtMs` of real time at `speed`x (1 = real time, 60 = an hour a minute). `end` = it reached the present. */
export function advance(at: number, dtMs: number, speed: number, to: number): { at: number; end: boolean } {
  const next = at + dtMs * speed;
  return next >= to ? { at: to, end: true } : { at: next, end: false };
}
