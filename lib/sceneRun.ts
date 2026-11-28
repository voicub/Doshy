// Validation of POST /api/ha/scene: a list of service calls (a scene), every one held to the same strict rules as POST /api/ha/service, plus the two services only
// a scene may start (scene.turn_on, script.turn_on, no arguments) and a guard that keeps garage doors and gates out of any batch. Pure: no I/O.
import { isRecord } from "./guards.ts";
import { ENTITY_ID, validateService } from "./haService.ts";
import { movableCover } from "./sceneDevices.ts";
import type { HAState } from "./ha.ts";

export const MAX_ACTIONS = 40;

/** What the server knows of each entity: the attributes the validators need (limits, offered colour range) and the device class. */
export type KnownStates = Record<string, Pick<HAState, "state" | "attributes">>;

export type Call = { domain: string; service: string; entity: string; data: Record<string, unknown> };
export type Checked = { ok: true; calls: Call[] } | { ok: false; error: string };

/** Services a scene may start that the general service route does not allow: they take no arguments and only an entity that exists. */
const SCENE_STARTERS = ["scene.turn_on", "script.turn_on"];

function checkOne(raw: unknown, states: KnownStates): Call | string {
  if (!isRecord(raw)) return "is not a service call";
  const { domain, service, entity_id } = raw;
  if (typeof domain !== "string" || typeof service !== "string") return "needs a domain and a service";
  if (typeof entity_id === "string" && domain === "cover" && states[entity_id] && !movableCover(states[entity_id])) return `would move ${entity_id}, a garage door, gate or door: Doshy never does that from a scene`;
  if (SCENE_STARTERS.includes(`${domain}.${service}`)) {
    if (typeof entity_id !== "string" || !ENTITY_ID.test(entity_id) || entity_id.split(".")[0] !== domain) return `${domain}.${service} needs a ${domain} entity`;
    if (raw.data !== undefined && !(isRecord(raw.data) && !Object.keys(raw.data).length)) return `${domain}.${service} takes no arguments`;
    return { domain, service, entity: entity_id, data: { entity_id } };
  }
  const v = validateService(raw, typeof entity_id === "string" ? (states[entity_id]?.attributes ?? {}) : {});
  if (!v.ok) return v.error;
  return { domain: v.domain, service: v.service, entity: typeof entity_id === "string" ? entity_id : "", data: v.data };
}

/** The body of a scene request, checked. One bad call refuses the whole batch (a scene that half runs on a mistake is worse than one that does not run). */
export function checkBatch(body: unknown, states: KnownStates): Checked {
  const list = isRecord(body) ? body.actions : undefined;
  if (!Array.isArray(list) || !list.length) return { ok: false, error: "Send a list of actions." };
  if (list.length > MAX_ACTIONS) return { ok: false, error: `A scene batch holds ${MAX_ACTIONS} actions at most.` };
  const calls: Call[] = [];
  for (const [i, raw] of list.entries()) {
    const c = checkOne(raw, states);
    if (typeof c === "string") return { ok: false, error: `Action ${i + 1}: ${c}` };
    calls.push(c);
  }
  return { ok: true, calls };
}
