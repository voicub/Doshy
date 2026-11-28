// What GET /api/ha/routines sends and the browser checks: the state changes of the devices (times only, not one reading a minute), the home's time zone and place,
// and what Home Assistant's existing automations already do. Pure; the server code (lib/server/routineHistory.ts, routineCoverage.ts) shares these types.
import type { SunEvent } from "./automationsDevice.ts";
import { VERBS, type Verb } from "./deviceAction.ts";
import { isRecord } from "./guards.ts";
import { ENTITY_ID } from "./timeline.ts";

/** One change: [time in ms, state, number]. The number is a cover's position or a thermostat's set temperature when the entity has one. */
export type ChangeEvent = readonly [t: number, state: string, n?: number];

/** What an automation that already exists does to a device at set times, as far as it matters for "is this routine already covered?". */
export type Covered = {
  entity: string;
  verbs: Verb[];
  /** times of day (minutes since midnight) of its time triggers */
  at: number[];
  sun: { event: SunEvent; offset: number }[];
  /** sensors or buttons whose changes start it (state triggers): an idea "turn the light off when this sensor sees nobody" is already made when it is here */
  sensors: string[];
};

export type RoutinesWire = {
  from: number;
  to: number;
  days: number;
  zone: string | null;
  lat: number | null;
  lon: number | null;
  entities: Record<string, ChangeEvent[]>;
  /** null: Home Assistant would not show the automations (the token is not an administrator's): nothing could be checked */
  covers: Covered[] | null;
};

export const MIN_DAYS = 7;
export const MAX_DAYS = 30;
const MAX_ENTITIES = 150;
const MAX_EVENTS = 4000;
const MAX_COVERS = 400;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseEvents(list: unknown): ChangeEvent[] {
  if (!Array.isArray(list)) return [];
  const out: ChangeEvent[] = [];
  for (const e of list.slice(0, MAX_EVENTS) as unknown[]) {
    if (!Array.isArray(e) || !finite(e[0]) || typeof e[1] !== "string" || e[1].length > 40) continue;
    out.push(finite(e[2]) ? [e[0], e[1], e[2]] : [e[0], e[1]]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

function parseCover(raw: unknown): Covered | null {
  if (!isRecord(raw) || typeof raw.entity !== "string" || !ENTITY_ID.test(raw.entity) || !Array.isArray(raw.verbs) || !Array.isArray(raw.at) || !Array.isArray(raw.sun)) return null;
  const verbs = raw.verbs.filter((v): v is Verb => (VERBS as readonly unknown[]).includes(v));
  const at = raw.at.filter(finite);
  const sun = raw.sun.flatMap((s: unknown): Covered["sun"] => (isRecord(s) && (s.event === "sunrise" || s.event === "sunset") && finite(s.offset) ? [{ event: s.event, offset: s.offset }] : []));
  const sensors = Array.isArray(raw.sensors) ? raw.sensors.filter((s): s is string => typeof s === "string" && ENTITY_ID.test(s)) : [];
  return { entity: raw.entity, verbs, at, sun, sensors };
}

/** The server's answer, checked: a bad event or entity is dropped, a bad whole throws. */
export function parseRoutines(raw: unknown): RoutinesWire {
  if (!isRecord(raw) || !isRecord(raw.entities) || !finite(raw.from) || !finite(raw.to) || raw.to <= raw.from || !finite(raw.days)) throw new Error("The history answer was not in the expected shape");
  const entities: Record<string, ChangeEvent[]> = {};
  for (const [id, list] of Object.entries(raw.entities).slice(0, MAX_ENTITIES)) {
    if (!ENTITY_ID.test(id)) continue;
    const events = parseEvents(list);
    if (events.length) entities[id] = events;
  }
  const covers = Array.isArray(raw.covers) ? raw.covers.slice(0, MAX_COVERS).flatMap((c: unknown) => parseCover(c) ?? []) : null;
  const place = (v: unknown) => (finite(v) ? v : null);
  return {
    from: raw.from,
    to: raw.to,
    days: Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(raw.days))),
    zone: typeof raw.zone === "string" ? raw.zone : null,
    lat: place(raw.lat),
    lon: place(raw.lon),
    entities,
    covers,
  };
}
