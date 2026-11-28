// History replay, the server side: check the request, build the Home Assistant history queries and shape its answer into the compact wire format of lib/timeline.ts.
// Pure (no fetch, no Next): the node test runner loads this file directly.
import { isRecord } from "../guards.ts";
import { MIN, isNumeric } from "../stats.ts";
import { ENTITY_ID, MAX_REPLAY_ENTITIES, REPLAY_HOURS, type ReplayAttrs, type ReplayHours, type ReplayWire, type WireEvent } from "../timeline.ts";

/** Numbers are cut to one reading per bucket: a minute for a day, five minutes for a week. */
export const BUCKET_MS: Record<ReplayHours, number> = { 24: MIN, 168: 5 * MIN };
export const MAX_EVENTS_PER_ENTITY = 1500;
/** Over all entities together: about 1.5 MB of JSON, what a Raspberry Pi browser can hold comfortably. */
export const MAX_EVENTS_TOTAL = 40_000;
const MAX_TEXT = 80;

/** The attributes worth replaying, per domain. Domains listed here are asked from Home Assistant with attributes, all others without (a much smaller answer). */
export const KEPT_ATTRS: Record<string, readonly string[]> = {
  light: ["brightness", "rgb_color", "color_temp_kelvin"],
  cover: ["current_position"],
  climate: ["current_temperature", "hvac_action", "temperature"],
  fan: ["percentage"],
  media_player: ["media_title"],
};

const domainOf = (id: string) => id.slice(0, id.indexOf("."));
/** The kept attribute names of an entity's domain (none for the others; an own-property check, so a domain called "constructor" is no special case). */
const keptOf = (id: string): readonly string[] | undefined => (Object.hasOwn(KEPT_ATTRS, domainOf(id)) ? KEPT_ATTRS[domainOf(id)] : undefined);

export type ReplayQuery = { ok: true; entities: string[]; hours: ReplayHours } | { ok: false; error: string };

/** The request's `entities` (comma separated ids) and `hours` (24 or 168), checked. */
export function parseReplayQuery(sp: URLSearchParams): ReplayQuery {
  const entities = [...new Set((sp.get("entities") ?? "").split(",").filter(Boolean))];
  if (!entities.length) return { ok: false, error: "entities is required" };
  if (entities.length > MAX_REPLAY_ENTITIES) return { ok: false, error: `at most ${MAX_REPLAY_ENTITIES} entities` };
  if (!entities.every((e) => ENTITY_ID.test(e))) return { ok: false, error: "invalid entity id" };
  const raw = sp.get("hours") ?? "24";
  const hours = REPLAY_HOURS.find((h) => String(h) === raw);
  if (hours === undefined) return { ok: false, error: "hours must be 24 or 168" };
  return { ok: true, entities, hours };
}

/**
 * The Home Assistant history queries: one with attributes for the entities whose attributes are kept, one minimal for the rest (omitted when empty).
 * `significant_changes_only=0`: a brightness or position change is not a "significant" change of state, but it is what the replay shows.
 */
export function historyPaths(entities: readonly string[], from: number, to: number): string[] {
  const rich = entities.filter((id) => keptOf(id));
  const plain = entities.filter((id) => !keptOf(id));
  const q = new URLSearchParams({ end_time: new Date(to).toISOString(), significant_changes_only: "0" });
  const path = (ids: string[], flags: string) => `history/period/${new Date(from).toISOString()}?filter_entity_id=${ids.join(",")}${flags}&${q}`; // ids are validated: their commas stay literal
  const out: string[] = [];
  if (rich.length) out.push(path(rich, ""));
  if (plain.length) out.push(path(plain, "&minimal_response&no_attributes"));
  return out;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function pickAttrs(raw: unknown, keep: readonly string[]): ReplayAttrs | undefined {
  if (!isRecord(raw)) return undefined;
  const out: ReplayAttrs = {};
  let any = false;
  for (const k of keep) {
    const v = raw[k];
    if (finite(v) || (typeof v === "string" && v.length <= MAX_TEXT)) out[k] = v;
    else if (Array.isArray(v) && v.length <= 4 && v.every(finite)) out[k] = v;
    else continue;
    any = true;
  }
  return any ? out : undefined;
}

const sameChange = (a: WireEvent, b: WireEvent) => a[1] === b[1] && JSON.stringify(a[2]) === JSON.stringify(b[2]);

/** One entity's rows from Home Assistant as its change list: readings bucketed (the last of each bucket), words kept change by change, repeats dropped. */
function shapeEntity(rows: readonly unknown[], from: number, bucketMs: number, keep: readonly string[]): WireEvent[] {
  const out: WireEvent[] = [];
  for (const row of rows) {
    if (!isRecord(row) || typeof row.state !== "string") continue;
    const stamp = row.last_updated ?? row.last_changed; // last_updated also moves on attribute changes
    const t = Math.max(from, Date.parse(typeof stamp === "string" ? stamp : ""));
    if (!Number.isFinite(t)) continue;
    const numeric = isNumeric(row.state);
    const attrs = numeric ? undefined : pickAttrs(row.attributes, keep);
    const ev: WireEvent = attrs ? [t, row.state, attrs] : [t, row.state];
    const last = out[out.length - 1];
    if (numeric && last && isNumeric(last[1]) && Math.floor(last[0] / bucketMs) === Math.floor(t / bucketMs)) out[out.length - 1] = ev; // the later reading of the bucket wins
    else out.push(ev);
    const n = out.length;
    if (n > 1 && sameChange(out[n - 1], out[n - 2])) out.pop(); // a repeat of what was already showing
  }
  return out;
}

/** Cut the newest `cap` events of every entity so that no entity holds more than `MAX_EVENTS_PER_ENTITY` and all together stay under `MAX_EVENTS_TOTAL`. */
function capEvents(entities: Record<string, WireEvent[]>): void {
  const lists = Object.values(entities);
  let cap = MAX_EVENTS_PER_ENTITY;
  while (cap > 1 && lists.reduce((n, l) => n + Math.min(l.length, cap), 0) > MAX_EVENTS_TOTAL) cap = Math.floor(cap * 0.8);
  for (const [id, l] of Object.entries(entities)) if (l.length > cap) entities[id] = l.slice(-cap);
}

/** Home Assistant's history answers (one per query: a list of per-entity row lists) as the replay payload. Rows of entities that were not asked for are ignored. */
export function shapeReplay(answers: readonly unknown[], wanted: readonly string[], from: number, to: number, hours: ReplayHours): ReplayWire {
  const want = new Set(wanted);
  const bucketMs = BUCKET_MS[hours];
  const entities: Record<string, WireEvent[]> = {};
  for (const answer of answers) {
    if (!Array.isArray(answer)) continue;
    for (const rows of answer as unknown[]) {
      if (!Array.isArray(rows) || !rows.length) continue;
      const first: unknown = rows[0];
      const id = isRecord(first) && typeof first.entity_id === "string" ? first.entity_id : "";
      if (!want.has(id) || entities[id]) continue;
      const events = shapeEntity(rows, from, bucketMs, keptOf(id) ?? []);
      if (events.length) entities[id] = events;
    }
  }
  capEvents(entities);
  return { from, to, bucketMs, entities };
}
