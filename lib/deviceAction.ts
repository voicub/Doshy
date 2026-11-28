// What a routine does to one device: switch it on or off, open or close a cover, put a cover at a position, set a thermostat. The same description is used by the
// routine finder (what it saw), the automation recipes (what to make) and the words in between. Pure.
import { isRecord } from "./guards.ts";

export const VERBS = ["turn_on", "turn_off", "open", "close", "set_position", "set_temperature"] as const;
export type Verb = (typeof VERBS)[number];
export type DeviceAction = { verb: Verb; /** the position (percent open) or the temperature */ value?: number };

/** The services each domain may be given by a routine (nothing else is ever offered: no locks, alarms, garage doors or thermostat modes). */
export const DOMAIN_VERBS: Record<string, readonly Verb[]> = {
  light: ["turn_on", "turn_off"],
  switch: ["turn_on", "turn_off"],
  fan: ["turn_on", "turn_off"],
  input_boolean: ["turn_on", "turn_off"],
  media_player: ["turn_on", "turn_off"],
  cover: ["open", "close", "set_position"],
  climate: ["set_temperature"],
};

export const domainOf = (entity: string): string => entity.slice(0, entity.indexOf("."));

const isVerb = (v: unknown): v is Verb => typeof v === "string" && (VERBS as readonly string[]).includes(v);

/** The action from untrusted data: a known verb, and a number exactly when the verb needs one. */
export function actionOf(raw: unknown): DeviceAction | null {
  if (!isRecord(raw) || !isVerb(raw.verb)) return null;
  const verb = raw.verb;
  const needsValue = verb === "set_position" || verb === "set_temperature";
  if (!needsValue) return raw.value === undefined ? { verb } : null;
  return typeof raw.value === "number" && Number.isFinite(raw.value) ? { verb, value: raw.value } : null;
}

/** The Home Assistant service call for an action on an entity (the shape lib/sceneRun.ts validates). */
export function actionCall(entity: string, a: DeviceAction): { domain: string; service: string; entity_id: string; data?: Record<string, unknown> } {
  const domain = domainOf(entity);
  switch (a.verb) {
    case "turn_on": return { domain, service: "turn_on", entity_id: entity };
    case "turn_off": return { domain, service: "turn_off", entity_id: entity };
    case "open": return { domain, service: "open_cover", entity_id: entity };
    case "close": return { domain, service: "close_cover", entity_id: entity };
    case "set_position": return { domain, service: "set_cover_position", entity_id: entity, data: { position: a.value } };
    case "set_temperature": return { domain, service: "set_temperature", entity_id: entity, data: { temperature: a.value } };
  }
}

/** "turn the Hall light off", "open the living room curtains", "put the curtains at 40%", "set the thermostat to 19 degrees". */
export function actionWords(a: DeviceAction, name: string): string {
  switch (a.verb) {
    case "turn_on": return `turn ${name} on`;
    case "turn_off": return `turn ${name} off`;
    case "open": return `open ${name}`;
    case "close": return `close ${name}`;
    case "set_position": return `put ${name} at ${a.value}%`;
    case "set_temperature": return `set ${name} to ${a.value} degrees`;
  }
}

/** Actions that make something happen in an empty house (light, heating, a TV): worth guarding with "only when someone is home". */
export const startsSomething = (a: DeviceAction): boolean => a.verb === "turn_on" || a.verb === "open" || a.verb === "set_temperature";
