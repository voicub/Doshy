// The two recipes the routine finder makes: "at <time> on <days>, do <action> to <device>" and "at sunset / sunrise (plus or minus some minutes), do <action>". Checked with the
// same rules as every other recipe and as a scene (the action goes through lib/sceneRun.ts: only offered services, garage doors and gates refused, numbers inside the device's
// own limits). Pure; lib/automations.ts wires these into validateRecipe, describeRecipe and buildAutomation.
import { actionCall, actionOf, actionWords, DOMAIN_VERBS, domainOf, type DeviceAction } from "./deviceAction.ts";
import { isRecord } from "./guards.ts";
import { ENTITY_ID } from "./haService.ts";
import { checkBatch, type KnownStates } from "./sceneRun.ts";
import { daysWords, normaliseDays, WEEKDAY_IDS, type Weekday } from "./weekdays.ts";

export type SunEvent = "sunrise" | "sunset";
export type DeviceRecipe =
  | { type: "device-at"; entity: string; action: DeviceAction; time: string; days: Weekday[]; /** only run when somebody is home (the `zone.home` count is above 0) */ onlyHome: boolean }
  | { type: "device-sun"; entity: string; action: DeviceAction; sun: SunEvent; /** minutes after the sun event (negative: before) */ offset: number; days: Weekday[]; onlyHome: boolean };

export const DEVICE_RECIPE_TYPES = ["device-at", "device-sun"] as const;
export const MAX_SUN_OFFSET = 180;
/** What Home Assistant counts people at home in. */
export const HOME_ZONE = "zone.home";

type Checked = { ok: true; recipe: DeviceRecipe } | { ok: false; error: string };
const refuse = (error: string): Checked => ({ ok: false, error });
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A device recipe from untrusted JSON (`raw.type` is one of DEVICE_RECIPE_TYPES), checked against what Home Assistant has. */
export function validateDeviceRecipe(raw: Record<string, unknown>, states: KnownStates): Checked {
  const { entity } = raw;
  if (typeof entity !== "string" || !ENTITY_ID.test(entity) || !Object.hasOwn(DOMAIN_VERBS, domainOf(entity))) return refuse("Pick a light, switch, fan, curtain, TV or thermostat.");
  if (!states[entity]) return refuse(`${entity} is not known to Home Assistant.`);
  const action = actionOf(raw.action);
  if (!action || !DOMAIN_VERBS[domainOf(entity)].includes(action.verb)) return refuse("That device cannot do that.");
  if (action.verb === "set_position" && !(Number.isInteger(action.value) && (action.value ?? 0) >= 1 && (action.value ?? 0) <= 99)) return refuse("A curtain position is a whole number from 1 to 99 percent.");
  const call = checkBatch({ actions: [actionCall(entity, action)] }, states);
  if (!call.ok) return refuse(call.error);
  const days = normaliseDays(raw.days);
  if (!days) return refuse("Pick the days.");
  if (typeof raw.onlyHome !== "boolean") return refuse("Say whether it should only run when someone is home.");
  if (raw.onlyHome && !states[HOME_ZONE]) return refuse("Home Assistant has no home zone (zone.home), so it cannot tell whether anyone is home.");
  const { onlyHome } = raw;
  if (raw.type === "device-at") {
    return typeof raw.time === "string" && TIME.test(raw.time) ? { ok: true, recipe: { type: "device-at", entity, action, time: raw.time, days, onlyHome } } : refuse("Pick a time like 22:00.");
  }
  const { sun, offset } = raw;
  if (sun !== "sunrise" && sun !== "sunset") return refuse("Pick sunrise or sunset.");
  if (typeof offset !== "number" || !Number.isInteger(offset) || Math.abs(offset) > MAX_SUN_OFFSET) return refuse(`The minutes before or after the sun must be a whole number up to ${MAX_SUN_OFFSET}.`);
  return states["sun.sun"] ? { ok: true, recipe: { type: "device-sun", entity, action, sun, offset, days, onlyHome } } : refuse("Home Assistant has no sun entity (sun.sun), so it cannot know when the sun rises or sets.");
}

export const sunWords = (sun: SunEvent, offset: number): string => (offset === 0 ? `at ${sun}` : `${Math.abs(offset)} minute${Math.abs(offset) === 1 ? "" : "s"} ${offset < 0 ? "before" : "after"} ${sun}`);

/** "At 23:10 every day, turn the Hall light off" / "10 minutes after sunset every day, close the curtains". */
export function describeDeviceRecipe(r: DeviceRecipe, name: (entity: string) => string): string {
  const when = r.type === "device-at" ? `At ${r.time}` : sunWords(r.sun, r.offset).replace(/^./, (c) => c.toUpperCase());
  const home = r.onlyHome ? ", when someone is home" : "";
  return `${when} ${daysWords(r.days)}, ${actionWords(r.action, name(r.entity))}${home}`;
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type DeviceAutomationParts = { trigger: Json[]; condition: Json[]; action: Json[] };

/** `+00:10:00` / `-00:45:00`: how Home Assistant's sun trigger takes its offset. */
const sunOffset = (minutes: number): string => `${minutes < 0 ? "-" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}:00`;

export function deviceAutomationParts(r: DeviceRecipe): DeviceAutomationParts {
  const trigger: Json = r.type === "device-at" ? { platform: "time", at: `${r.time}:00` } : { platform: "sun", event: r.sun, offset: sunOffset(r.offset) };
  const condition: Json[] = [];
  if (r.days.length < WEEKDAY_IDS.length) condition.push({ condition: "time", weekday: [...r.days] });
  if (r.onlyHome) condition.push({ condition: "numeric_state", entity_id: HOME_ZONE, above: 0 });
  const { domain, service, entity_id, data } = actionCall(r.entity, r.action);
  const action: Json = { service: `${domain}.${service}`, target: { entity_id }, ...(data ? { data: Object.fromEntries(Object.entries(data).filter((e): e is [string, number] => typeof e[1] === "number")) } : {}) };
  return { trigger: [trigger], condition, action: [action] };
}

export const isDeviceRecipeRaw = (raw: unknown): raw is Record<string, unknown> & { type: (typeof DEVICE_RECIPE_TYPES)[number] } =>
  isRecord(raw) && (raw.type === "device-at" || raw.type === "device-sun");
