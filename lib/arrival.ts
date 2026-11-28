// Arrival and departure choreographies ("Welcome home": the lights that light your way in, one after another; "Goodbye": what to switch off when everybody has left).
// They live in the plan (`plan.choreographies`), so they survive export, import and duplicating a plan, and are undoable like any other plan edit. A choreography is only
// what the person chose; the Home Assistant automation that makes it real is built from it by lib/automationsArrival.ts. Pure: no React, no network. The node test runner
// loads this file directly.
import { isRecord } from "./guards.ts";
import { NAME_MAX, stepOf, type SceneStep } from "./scenes.ts";
import type { Plan } from "./types.ts";

export const MAX_CHOREOGRAPHIES = 12;
export const MAX_ARRIVAL_STEPS = 30;
/** The longest wait before one step, and the longest a whole sequence may take (ms). */
export const MAX_STEP_DELAY_MS = 60_000;
export const MAX_SEQUENCE_MS = 300_000;
/** The usual gap between two lights (ms). */
export const DEFAULT_GAP_MS = 1500;
export const MAX_OFF_MINUTES = 240;
/** How long a person must stay "home" before the lights start (s): GPS often flickers at the door, and the home count has to settle. */
export const MAX_DEBOUNCE_S = 60;
export const DEFAULT_DEBOUNCE_S = 5;
export const MAX_AWAY_MINUTES = 60;
export const DEFAULT_AWAY_MINUTES = 5;
/** Goodbye waits at least this long with everybody away (a phone that drops its signal for a few minutes must not look like a departure). */
export const MIN_AWAY_MINUTES = 5;
export const MAX_DEPARTURE_DELAY_MINUTES = 30;
const MAX_PERSONS = 20;
const MAX_ZONES = 6;

/** A scene step (a light, a switch, a scene ...) and the wait before it (ms), counted from the step before. */
export type ArrivalStep = SceneStep & { delayMs: number };

/** Where the person comes in: a door of the plan, or a point on the plan (a garden gate, the street). */
export type Entrance = { x: number; y: number; level?: string } | { openingId: string };

export type ArrivalConditions = {
  /** Only when the sun is below the horizon. */
  onlyAfterDark: boolean;
  /** Only when nobody else is home (see docs/arrival.md for how Home Assistant counts). */
  onlyIfAloneHome?: boolean;
  /** `person.*` entities; empty = anyone. */
  persons: string[];
  /** Turn the lights off again after this many minutes (1..240) ... */
  offAfterMinutes?: number;
  /** ... but only if this motion sensor shows nobody there. */
  motion?: string;
  debounceSeconds?: number;
};

/** The goodbye side: how long everybody has been away before it runs, an extra wait, and the "door still open" reminder. */
export type AwaySettings = { awayMinutes: number; delayMinutes: number; doorContact?: string; notify?: string };

export type Choreography = {
  id: string;
  name: string;
  kind: "arrival" | "departure";
  entrance?: Entrance;
  steps: ArrivalStep[];
  conditions: ArrivalConditions;
  /** `zone.*` entities: run when someone enters one of these instead of when they arrive home. */
  trigger?: { zones?: string[] };
  /** Departures only. */
  away?: AwaySettings;
};

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const PERSON = /^person\.[a-z0-9_]{1,60}$/;
const ZONE = /^zone\.[a-z0-9_]{1,60}$/;
const SENSOR = /^binary_sensor\.[a-z0-9_]{1,60}$/;
const NOTIFY = /^notify\.[a-z0-9_]{1,60}$/;

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const whole = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = num(v);
  return n === undefined ? undefined : Math.min(hi, Math.max(lo, Math.round(n)));
};
const listOf = (v: unknown, re: RegExp, max: number): string[] => (Array.isArray(v) ? [...new Set(v.filter((e): e is string => typeof e === "string" && re.test(e)))].slice(0, max) : []);

/** One step read from untrusted JSON: the device part exactly as a scene step, plus the wait (clamped to 0..60 s). Null when it is not a usable step. */
export function arrivalStepOf(raw: unknown): ArrivalStep | null {
  const step = stepOf(raw);
  if (!step) return null;
  return { ...step, delayMs: (isRecord(raw) ? whole(raw.delayMs, 0, MAX_STEP_DELAY_MS) : undefined) ?? 0 };
}

/** The steps of a list, at most MAX_ARRIVAL_STEPS and MAX_SEQUENCE_MS long in all (what does not fit is dropped from the end). `waits: false` = a departure, where nothing waits. */
export function arrivalStepsOf(raw: unknown, waits = true): ArrivalStep[] {
  const out: ArrivalStep[] = [];
  let total = 0;
  for (const r of Array.isArray(raw) ? raw : []) {
    const s = arrivalStepOf(r);
    if (!s) continue;
    const step = waits ? s : { ...s, delayMs: 0 };
    if (out.length >= MAX_ARRIVAL_STEPS || total + step.delayMs > MAX_SEQUENCE_MS) break;
    total += step.delayMs;
    out.push(step);
  }
  return out;
}

/** How long the whole sequence takes (ms). */
export const sequenceMs = (steps: readonly ArrivalStep[]): number => steps.reduce((t, s) => t + s.delayMs, 0);

function entranceOf(raw: unknown): Entrance | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.openingId === "string") return ID.test(raw.openingId) ? { openingId: raw.openingId } : undefined;
  const [x, y] = [num(raw.x), num(raw.y)];
  if (x === undefined || y === undefined || Math.abs(x) > 10_000 || Math.abs(y) > 10_000) return undefined;
  return { x, y, ...(typeof raw.level === "string" && ID.test(raw.level) ? { level: raw.level } : {}) };
}

function conditionsOf(raw: unknown, kind: Choreography["kind"]): ArrivalConditions {
  const r = isRecord(raw) ? raw : {};
  const offAfterMinutes = whole(r.offAfterMinutes, 1, MAX_OFF_MINUTES);
  const debounceSeconds = whole(r.debounceSeconds, 0, MAX_DEBOUNCE_S);
  return {
    onlyAfterDark: typeof r.onlyAfterDark === "boolean" ? r.onlyAfterDark : kind === "arrival",
    ...(r.onlyIfAloneHome === true ? { onlyIfAloneHome: true } : {}),
    persons: listOf(r.persons, PERSON, MAX_PERSONS),
    ...(offAfterMinutes !== undefined ? { offAfterMinutes } : {}),
    ...(typeof r.motion === "string" && SENSOR.test(r.motion) ? { motion: r.motion } : {}),
    ...(debounceSeconds !== undefined ? { debounceSeconds } : {}),
  };
}

function awayOf(raw: unknown): AwaySettings {
  const r = isRecord(raw) ? raw : {};
  const door = typeof r.doorContact === "string" && SENSOR.test(r.doorContact) ? r.doorContact : undefined;
  const notify = typeof r.notify === "string" && NOTIFY.test(r.notify) ? r.notify : undefined;
  return {
    awayMinutes: whole(r.awayMinutes, MIN_AWAY_MINUTES, MAX_AWAY_MINUTES) ?? DEFAULT_AWAY_MINUTES,
    delayMinutes: whole(r.delayMinutes, 0, MAX_DEPARTURE_DELAY_MINUTES) ?? 0,
    ...(door && notify ? { doorContact: door, notify } : {}),
  };
}

/** One choreography read from untrusted JSON (a saved plan, an imported file): a clean copy, or null. */
export function choreographyOf(raw: unknown): Choreography | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !ID.test(raw.id) || typeof raw.name !== "string") return null;
  const name = raw.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX);
  const kind = raw.kind === "departure" ? "departure" : raw.kind === "arrival" ? "arrival" : null;
  if (!name || !kind) return null;
  const entrance = kind === "arrival" ? entranceOf(raw.entrance) : undefined;
  const zones = kind === "arrival" && isRecord(raw.trigger) ? listOf(raw.trigger.zones, ZONE, MAX_ZONES) : [];
  return {
    id: raw.id,
    name,
    kind,
    ...(entrance ? { entrance } : {}),
    steps: arrivalStepsOf(raw.steps, kind === "arrival"),
    conditions: conditionsOf(raw.conditions, kind),
    ...(zones.length ? { trigger: { zones } } : {}),
    ...(kind === "departure" ? { away: awayOf(raw.away) } : {}),
  };
}

/** The choreographies of a plan read from untrusted JSON: at most MAX_CHOREOGRAPHIES, ids unique. Undefined when there is nothing to read (a plan without the field stays without it). */
export function choreographiesOf(raw: unknown): Choreography[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: Choreography[] = [];
  for (const r of raw) {
    const c = choreographyOf(r);
    if (!c || seen.has(c.id) || out.length >= MAX_CHOREOGRAPHIES) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/** A plan loaded from anywhere (storage, the server, a file): its choreographies are made valid, the same plan object when they already are. */
export function withChoreographies(plan: Plan): Plan {
  if (plan.choreographies === undefined) return plan;
  const clean = choreographiesOf(plan.choreographies) ?? [];
  return JSON.stringify(clean) === JSON.stringify(plan.choreographies) ? plan : { ...plan, choreographies: clean };
}

/** The plan with this choreography added (new id) or replaced (same id). An unusable one leaves the plan as it is. */
export function saveChoreographyIn(plan: Plan, c: Choreography): Plan {
  const clean = choreographyOf(c);
  if (!clean) return plan;
  const list = plan.choreographies ?? [];
  const exists = list.some((x) => x.id === clean.id);
  if (!exists && list.length >= MAX_CHOREOGRAPHIES) return plan;
  return { ...plan, choreographies: exists ? list.map((x) => (x.id === clean.id ? clean : x)) : [...list, clean] };
}

export const removeChoreographyFrom = (plan: Plan, id: string): Plan => (plan.choreographies?.some((c) => c.id === id) ? { ...plan, choreographies: plan.choreographies.filter((c) => c.id !== id) } : plan);

/** The same choreography under a new id and a name that is not taken ("Evening copy"). */
export function duplicateChoreography(c: Choreography, id: string, taken: readonly string[]): Choreography {
  let name = `${c.name} copy`.slice(0, NAME_MAX);
  for (let n = 2; taken.includes(name); n++) name = `${c.name.slice(0, NAME_MAX - 4)} ${n}`;
  return { ...c, id, name };
}
