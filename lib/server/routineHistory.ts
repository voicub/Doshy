// The routine finder's history, the server side: check the request, build the Home Assistant history queries and shape its answer into state-change lists (times, not
// readings: the finder needs the exact moment a light went off, not a sample a minute). Pure (no fetch, no Next): the node test runner loads this file directly.
import { DOMAIN_VERBS, domainOf } from "../deviceAction.ts";
import { isRecord } from "../guards.ts";
import { MAX_DAYS, MIN_DAYS, type ChangeEvent } from "../routinesWire.ts";
import { ENTITY_ID } from "../timeline.ts";

/** Entities of these kinds are read: what a routine may change, and the motion and door sensors that give it context. Locks and alarms are never read. */
export const ROUTINE_DOMAINS: readonly string[] = [...Object.keys(DOMAIN_VERBS), "binary_sensor"];
export const MAX_ROUTINE_ENTITIES = 150;
export const DEFAULT_DAYS = 21;
export const MAX_EVENTS_PER_ENTITY = 1500;
/** Over all entities together: about 1 MB of JSON. */
export const MAX_EVENTS_TOTAL = 30_000;
const DAY_MS = 86_400_000;

/** Only these carry a number that matters (a cover's position, a thermostat's set temperature): they are asked with attributes, the rest without (a far smaller answer). */
const NUMBER_ATTR: Record<string, string> = { cover: "current_position", climate: "temperature" };

export type RoutinesQuery = { ok: true; entities: string[]; days: number } | { ok: false; error: string };

/** The request's `entities` (comma separated ids) and `days` (7 to 30), checked. */
export function parseRoutinesQuery(sp: URLSearchParams): RoutinesQuery {
  const entities = [...new Set((sp.get("entities") ?? "").split(",").filter(Boolean))];
  if (!entities.length) return { ok: false, error: "entities is required" };
  if (entities.length > MAX_ROUTINE_ENTITIES) return { ok: false, error: `at most ${MAX_ROUTINE_ENTITIES} entities` };
  if (!entities.every((e) => ENTITY_ID.test(e))) return { ok: false, error: "invalid entity id" };
  if (!entities.every((e) => ROUTINE_DOMAINS.includes(domainOf(e)))) return { ok: false, error: "only lights, switches, fans, curtains, TVs, thermostats and sensors can be read" };
  const raw = sp.get("days");
  const days = raw === null ? DEFAULT_DAYS : Number(raw);
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) return { ok: false, error: `days must be a whole number from ${MIN_DAYS} to ${MAX_DAYS}` };
  return { ok: true, entities, days };
}

/** How far back to read: the days asked, plus today and a day of slack for the clock changes of the time zone. */
export const spanFor = (days: number, now: number): { from: number; to: number } => ({ from: now - (days + 2) * DAY_MS, to: now });

/** The Home Assistant history queries: one with attributes for covers and thermostats, one minimal for the rest (omitted when empty). */
export function historyPaths(entities: readonly string[], from: number, to: number): string[] {
  const rich = entities.filter((id) => Object.hasOwn(NUMBER_ATTR, domainOf(id)));
  const plain = entities.filter((id) => !Object.hasOwn(NUMBER_ATTR, domainOf(id)));
  const range = `end_time=${encodeURIComponent(new Date(to).toISOString())}`;
  const path = (ids: string[], flags: string) => `history/period/${new Date(from).toISOString()}?filter_entity_id=${ids.join(",")}${flags}&${range}`; // ids are validated: their commas stay literal
  const out: string[] = [];
  // a cover that moves or a thermostat that is set changes only an attribute: `significant_changes_only=0` keeps those
  if (rich.length) out.push(path(rich, "&significant_changes_only=0"));
  if (plain.length) out.push(path(plain, "&minimal_response&no_attributes"));
  return out;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** One entity's rows from Home Assistant as its change list: the time (never before `from`), the state and the number that matters, repeats dropped. */
function shapeEntity(id: string, rows: readonly unknown[], from: number): ChangeEvent[] {
  const key = NUMBER_ATTR[domainOf(id)];
  const out: ChangeEvent[] = [];
  for (const row of rows) {
    if (!isRecord(row) || typeof row.state !== "string") continue;
    const stamp = row.last_updated ?? row.last_changed; // last_updated also moves when only an attribute changes
    const t = Math.max(from, Date.parse(typeof stamp === "string" ? stamp : ""));
    if (!Number.isFinite(t)) continue;
    const n = key && isRecord(row.attributes) && finite(row.attributes[key]) ? row.attributes[key] : undefined;
    const last = out[out.length - 1];
    if (last && last[1] === row.state && last[2] === n) continue;
    out.push(n === undefined ? [t, row.state] : [t, row.state, n]);
  }
  return out;
}

/** Cut the oldest events so no entity holds more than MAX_EVENTS_PER_ENTITY and all together stay under MAX_EVENTS_TOTAL. */
function capEvents(entities: Record<string, ChangeEvent[]>): void {
  const lists = Object.values(entities);
  let cap = MAX_EVENTS_PER_ENTITY;
  while (cap > 1 && lists.reduce((n, l) => n + Math.min(l.length, cap), 0) > MAX_EVENTS_TOTAL) cap = Math.floor(cap * 0.8);
  for (const [id, l] of Object.entries(entities)) if (l.length > cap) entities[id] = l.slice(-cap);
}

/** Home Assistant's history answers (one per query: a list of per-entity row lists) as change lists. Rows of entities that were not asked for are ignored. */
export function shapeChanges(answers: readonly unknown[], wanted: readonly string[], from: number): Record<string, ChangeEvent[]> {
  const want = new Set(wanted);
  const entities: Record<string, ChangeEvent[]> = {};
  for (const answer of answers) {
    if (!Array.isArray(answer)) continue;
    for (const rows of answer as unknown[]) {
      if (!Array.isArray(rows) || !rows.length) continue;
      const first: unknown = rows[0];
      const id = isRecord(first) && typeof first.entity_id === "string" ? first.entity_id : "";
      if (!want.has(id) || entities[id]) continue;
      const events = shapeEntity(id, rows, from);
      if (events.length) entities[id] = events;
    }
  }
  capEvents(entities);
  return entities;
}
