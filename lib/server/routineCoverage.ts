// What the automations Home Assistant already has do to devices at set times, so the routine finder does not suggest what exists. Reads automation configs (Doshy's and the
// owner's, classic and new key names) and keeps only: which device, which verbs, at which times or sun offsets, and which sensors start it. Pure: no fetch (the route does that).
import { ENTITY_ID } from "../timeline.ts";
import { isRecord } from "../guards.ts";
import { DOMAIN_VERBS, domainOf, type Verb } from "../deviceAction.ts";
import { verbsOfService } from "../routinesCovered.ts";
import type { Covered } from "../routinesWire.ts";

const MAX_NODES = 400;
const MAX_DEPTH = 8;

/** A value that is one thing or a list of things, as a list. */
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

const entityIds = (v: unknown): string[] => listOf(v).filter((e): e is string => typeof e === "string" && ENTITY_ID.test(e));

/** `HH:MM` or `HH:MM:SS` as minutes since midnight; null for anything else (an input_datetime entity, a template). */
function clockMinutes(v: unknown): number | null {
  const m = typeof v === "string" ? /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v) : null;
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** A sun trigger's offset (`-00:45:00`, `+01:00`, or seconds) in minutes; 0 when there is none. */
function offsetMinutes(v: unknown): number {
  if (typeof v === "number") return Math.round(v / 60);
  const m = typeof v === "string" ? /^([+-]?)(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v) : null;
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

type Triggers = { at: number[]; sun: Covered["sun"]; sensors: string[] };

function triggersOf(config: Record<string, unknown>): Triggers {
  const out: Triggers = { at: [], sun: [], sensors: [] };
  for (const t of listOf(config.trigger ?? config.triggers)) {
    if (!isRecord(t)) continue;
    const kind = t.platform ?? t.trigger;
    if (kind === "time") {
      for (const at of listOf(t.at)) {
        const m = clockMinutes(at);
        if (m !== null) out.at.push(m);
      }
    } else if (kind === "sun" && (t.event === "sunrise" || t.event === "sunset")) out.sun.push({ event: t.event, offset: offsetMinutes(t.offset) });
    else if (kind === "state") out.sensors.push(...entityIds(t.entity_id));
  }
  return out;
}

/** Every `[entity, verbs]` an action tree calls, however deeply it is nested in sequences, conditions and choices. */
function callsOf(node: unknown, found: Map<string, Set<Verb>>, budget: { left: number }, depth = 0): void {
  if (depth > MAX_DEPTH || budget.left-- <= 0) return;
  if (Array.isArray(node)) {
    for (const n of node) callsOf(n, found, budget, depth + 1);
    return;
  }
  if (!isRecord(node)) return;
  const service = node.service ?? node.action;
  if (typeof service === "string" && /^[a-z_]+\.[a-z_]+$/.test(service)) {
    const target = isRecord(node.target) ? node.target.entity_id : undefined;
    const data = isRecord(node.data) ? node.data.entity_id : undefined;
    for (const e of entityIds([node.entity_id, target, data].flat()).filter((id) => Object.hasOwn(DOMAIN_VERBS, domainOf(id)))) {
      const verbs = found.get(e) ?? new Set<Verb>();
      for (const v of verbsOfService(service)) verbs.add(v);
      found.set(e, verbs);
    }
  }
  for (const value of Object.values(node)) if (typeof value === "object") callsOf(value, found, budget, depth + 1);
}

/** What one automation config does to which devices, and when it starts. Empty for a config that is not an object or does nothing to a device. */
export function coversOfConfig(config: unknown): Covered[] {
  if (!isRecord(config)) return [];
  const { at, sun, sensors } = triggersOf(config);
  const found = new Map<string, Set<Verb>>();
  callsOf(config.action ?? config.actions, found, { left: MAX_NODES });
  return [...found].flatMap(([entity, verbs]) => (verbs.size ? [{ entity, verbs: [...verbs], at, sun, sensors }] : []));
}
