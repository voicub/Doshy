// "Make it do something": a few safe recipes that become a Home Assistant automation. The browser sends a recipe (a few plain choices), never raw automation
// code: this module checks every field against what Home Assistant really has, builds the automation itself and describes it in words. The same code runs in
// the browser (the preview) and on the server (what is actually created), so the preview is what gets made. Pure. The node test runner loads this file directly.
import { isRecord } from "./guards.ts";
import { ENTITY_ID } from "./haService.ts";
import { movableCover } from "./sceneDevices.ts";
import { checkBatch, type KnownStates } from "./sceneRun.ts";
import { MAX_STEPS, NAME_MAX, sceneActions, stepOf, type SceneStep } from "./scenes.ts";
import { describeDeviceRecipe, deviceAutomationParts, isDeviceRecipeRaw, validateDeviceRecipe, type DeviceRecipe } from "./automationsDevice.ts";
import { arrivalAutomationParts, describeArrivalRecipe, isArrivalRecipeRaw, validateArrivalRecipe, type ArrivalRecipe } from "./automationsArrival.ts";

/** Everything Doshy creates carries this id prefix and an alias starting "Doshy: ", so it can be listed and removed by Doshy and nothing else. */
export const ID_PREFIX = "doshy_";
export const ALIAS_PREFIX = "Doshy: ";
export const AUTOMATION_ID = /^doshy_[a-z0-9_]{1,70}$/;

export type Days = "every" | "weekdays" | "weekend";
export const DAYS_WORDS: Record<Days, string> = { every: "every day", weekdays: "on weekdays", weekend: "at the weekend" };

export type Recipe =
  | { type: "open-after"; entity: string; time: string; notify: string }
  | { type: "notify-open"; entity: string; notify: string }
  | { type: "light-off-no-motion"; motion: string; lights: string[]; minutes: number }
  | { type: "curtains-sun"; covers: string[]; elevation: number }
  | { type: "scene-at"; name: string; steps: SceneStep[]; time: string; days: Days }
  | DeviceRecipe
  | ArrivalRecipe;

/** The recipes the "Make it do something" sheet builds from a form. The routine finder's `device-*` recipes come from its own panel (lib/automationsDevice.ts), the Arrival sheet's from lib/automationsArrival.ts. */
export type RecipeType = Exclude<Recipe["type"], DeviceRecipe["type"] | ArrivalRecipe["type"]>;
export const RECIPE_TYPES: readonly RecipeType[] = ["open-after", "notify-open", "light-off-no-motion", "curtains-sun", "scene-at"];

/** What Home Assistant has, as far as validating a recipe needs it: every entity and the `notify.*` services that exist. */
export type World = { states: KnownStates; notify: readonly string[] };

type Checked = { ok: true; recipe: Recipe } | { ok: false; error: string };
const refuse = (error: string): Checked => ({ ok: false, error });

const NOTIFY = /^notify\.[a-z0-9_]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const domainOf = (e: string) => e.slice(0, e.indexOf("."));
const isText = (v: unknown): v is string => typeof v === "string";

function entityIn(v: unknown, domains: readonly string[], world: World, what: string): string | { error: string } {
  if (!isText(v) || !ENTITY_ID.test(v) || !domains.includes(domainOf(v))) return { error: `${what} must be a ${domains.join(" or ")}.` };
  return world.states[v] ? v : { error: `${what} (${v}) is not known to Home Assistant.` };
}

function listIn(v: unknown, domain: string, max: number, world: World, what: string): string[] | { error: string } {
  if (!Array.isArray(v) || !v.length || v.length > max) return { error: `Pick 1 to ${max} ${what}.` };
  const out: string[] = [];
  for (const e of v) {
    const ok = entityIn(e, [domain], world, what);
    if (typeof ok !== "string") return ok;
    if (domain === "cover" && !movableCover(world.states[ok])) return { error: `${ok} is a garage door, gate or door: Doshy will not move it automatically.` };
    if (!out.includes(ok)) out.push(ok);
  }
  return out;
}

function notifyIn(v: unknown, world: World): string | { error: string } {
  if (!isText(v) || !NOTIFY.test(v) || !world.notify.includes(v)) return { error: "Pick one of the notification services Home Assistant has (for example the companion app on your phone)." };
  return v;
}

/** A recipe from untrusted JSON, checked field by field against the world. A recipe that passes can be built and created as it is. */
export function validateRecipe(raw: unknown, world: World): Checked {
  if (!isRecord(raw)) return refuse("That is not a recipe.");
  if (isDeviceRecipeRaw(raw)) return validateDeviceRecipe(raw, world.states);
  if (isArrivalRecipeRaw(raw)) return validateArrivalRecipe(raw, world);
  const time = (): string | { error: string } => (isText(raw.time) && TIME.test(raw.time) ? raw.time : { error: "Pick a time like 22:00." });
  switch (raw.type) {
    case "open-after":
    case "notify-open": {
      const entity = entityIn(raw.entity, ["binary_sensor", "cover"], world, "The door or window");
      if (typeof entity !== "string") return refuse(entity.error);
      const notify = notifyIn(raw.notify, world);
      if (typeof notify !== "string") return refuse(notify.error);
      if (raw.type === "notify-open") return { ok: true, recipe: { type: "notify-open", entity, notify } };
      const t = time();
      return typeof t === "string" ? { ok: true, recipe: { type: "open-after", entity, time: t, notify } } : refuse(t.error);
    }
    case "light-off-no-motion": {
      const motion = entityIn(raw.motion, ["binary_sensor"], world, "The motion sensor");
      if (typeof motion !== "string") return refuse(motion.error);
      const lights = listIn(raw.lights, "light", 20, world, "lights");
      if (!Array.isArray(lights)) return refuse(lights.error);
      const m = raw.minutes;
      if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > 240) return refuse("Minutes must be a whole number from 1 to 240.");
      return { ok: true, recipe: { type: "light-off-no-motion", motion, lights, minutes: m } };
    }
    case "curtains-sun": {
      const covers = listIn(raw.covers, "cover", 20, world, "curtains");
      if (!Array.isArray(covers)) return refuse(covers.error);
      const e = raw.elevation;
      if (typeof e !== "number" || !Number.isInteger(e) || e < 5 || e > 60) return refuse("The sun height must be a whole number of degrees from 5 to 60.");
      return world.states["sun.sun"] ? { ok: true, recipe: { type: "curtains-sun", covers, elevation: e } } : refuse("Home Assistant has no sun entity (sun.sun), so it cannot know where the sun is.");
    }
    case "scene-at": {
      const t = time();
      if (typeof t !== "string") return refuse(t.error);
      const name = isText(raw.name) ? raw.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX) : "";
      const days = raw.days === "weekdays" || raw.days === "weekend" || raw.days === "every" ? raw.days : null;
      if (!name || !days) return refuse("Give the scene a name and pick the days.");
      if (!Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > MAX_STEPS) return refuse(`The scene needs 1 to ${MAX_STEPS} devices.`);
      const steps: SceneStep[] = [];
      for (const s of raw.steps) {
        const step = stepOf(s);
        if (!step) return refuse("One device in the scene is not something Doshy can set.");
        if (!world.states[step.entity]) return refuse(`${step.entity} is not known to Home Assistant.`);
        steps.push(step);
      }
      const actions = checkBatch({ actions: sceneActions({ steps }) }, world.states);
      if (!actions.ok) return refuse(actions.error);
      if (actions.calls.length > 40) return refuse("That scene is too big to hand to Home Assistant as one automation. Use fewer devices.");
      return { ok: true, recipe: { type: "scene-at", name, steps, time: t, days } };
    }
    default:
      return refuse("That is not one of the recipes Doshy knows.");
  }
}

// ---- words ---------------------------------------------------------------------------------------------------------------------------------------------

/** How a device is called in a sentence. */
export type Namer = (entity: string) => string;
const and = (names: string[]) => (names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

export function describeRecipe(r: Recipe, name: Namer): string {
  switch (r.type) {
    case "open-after": return `Tell me if ${name(r.entity)} is open after ${r.time}`;
    case "notify-open": return `Tell me when ${name(r.entity)} opens`;
    case "light-off-no-motion": return `Turn off ${and(r.lights.map(name))} after ${r.minutes} minute${r.minutes === 1 ? "" : "s"} without movement at ${name(r.motion)}`;
    case "curtains-sun": return `Close ${and(r.covers.map(name))} when the sun is higher than ${r.elevation} degrees`;
    case "scene-at": return `Run "${r.name}" at ${r.time} ${DAYS_WORDS[r.days]}`;
    case "device-at":
    case "device-sun": return describeDeviceRecipe(r, name);
    case "arrival-sequence":
    case "departure-scene": return describeArrivalRecipe(r, name);
  }
}

// ---- the automation ------------------------------------------------------------------------------------------------------------------------------------

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type AutomationConfig = { alias: string; description: string; mode: "single" | "restart"; trigger: Json[]; condition: Json[]; action: Json[] };

/** A value read as plain JSON (a scene's service data is validated already; anything that is not plain data becomes null). */
function jsonOf(v: unknown): Json {
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map(jsonOf);
  return isRecord(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonOf(x)])) : null;
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const WEEKEND = ["sat", "sun"];

/** The sentence shown for what the automation has to say, with the name of the thing. */
const notifyAction = (service: string, message: string): Json => ({ service, data: { title: "Doshy", message } });
const isOpenState = (entity: string) => (domainOf(entity) === "cover" ? "open" : "on");

/** The recipe as a Home Assistant automation. Uses the classic key names (trigger/condition/action/service), which every Home Assistant version reads. */
export function buildAutomation(r: Recipe, id: string, name: Namer): { id: string; config: AutomationConfig } {
  const summary = describeRecipe(r, name);
  const base = { alias: `${ALIAS_PREFIX}${summary}`.slice(0, 120), description: `${summary}. Made by Doshy; change or remove it from Doshy's automations list.`, mode: "single" as const };
  switch (r.type) {
    case "open-after":
      return {
        id,
        config: {
          ...base,
          trigger: [{ platform: "time", at: `${r.time}:00` }, { platform: "state", entity_id: r.entity, to: isOpenState(r.entity) }],
          // from the chosen time until the small hours (or midnight for a morning time), so opening it later is also noticed
          condition: [{ condition: "state", entity_id: r.entity, state: isOpenState(r.entity) }, { condition: "time", after: `${r.time}:00`, before: r.time >= "12:00" ? "06:00:00" : "23:59:59" }],
          action: [notifyAction(r.notify, `${name(r.entity)} is open.`)],
        },
      };
    case "notify-open":
      return { id, config: { ...base, trigger: [{ platform: "state", entity_id: r.entity, to: isOpenState(r.entity) }], condition: [], action: [notifyAction(r.notify, `${name(r.entity)} was opened.`)] } };
    case "light-off-no-motion":
      return {
        id,
        config: {
          ...base,
          trigger: [{ platform: "state", entity_id: r.motion, to: "off", for: { hours: 0, minutes: r.minutes, seconds: 0 } }],
          condition: [],
          action: [{ service: "light.turn_off", target: { entity_id: r.lights } }],
        },
      };
    case "curtains-sun":
      return {
        id,
        config: {
          ...base,
          trigger: [{ platform: "numeric_state", entity_id: "sun.sun", attribute: "elevation", above: r.elevation }],
          condition: [],
          action: [{ service: "cover.close_cover", target: { entity_id: r.covers } }],
        },
      };
    case "scene-at":
      return {
        id,
        config: {
          ...base,
          trigger: [{ platform: "time", at: `${r.time}:00` }],
          condition: r.days === "every" ? [] : [{ condition: "time", weekday: r.days === "weekdays" ? WEEKDAYS : WEEKEND }],
          action: sceneActions({ steps: r.steps }).map((a): Json => ({ service: `${a.domain}.${a.service}`, target: { entity_id: a.entity_id }, ...(a.data ? { data: jsonOf(a.data) } : {}) })),
        },
      };
    case "device-at":
    case "device-sun":
      return { id, config: { ...base, ...deviceAutomationParts(r) } };
    case "arrival-sequence":
    case "departure-scene":
      return { id, config: { ...base, ...arrivalAutomationParts(r, name) } };
  }
}

/** A fresh id for a recipe: `doshy_<recipe>_<random>`. `random` is injected so tests are repeatable. */
export const automationId = (type: Recipe["type"], random: string): string => `${ID_PREFIX}${type.replace(/-/g, "_")}_${random.replace(/[^a-z0-9]/g, "").slice(0, 12)}`;

// ---- YAML (for the preview) ----------------------------------------------------------------------------------------------------------------------------

const PLAIN = /^[A-Za-z_][A-Za-z0-9_.:/-]*$/;
const scalar = (v: Json): string => (typeof v === "string" ? (PLAIN.test(v) && !/^(true|false|null|yes|no|on|off|y|n)$/i.test(v) ? v : JSON.stringify(v)) : String(v));

/** A small YAML writer for the shapes automations use (nested objects, lists, text, numbers). Text that is not plainly safe is written as a quoted JSON string, which is valid YAML. */
export function toYaml(v: Json, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return `${pad}[]`;
    return v
      .map((item) => {
        if (item !== null && typeof item === "object") {
          const inner = toYaml(item, indent + 1).split("\n");
          inner[0] = inner[0].replace(/^\s+/, "");
          return `${pad}- ${inner.join("\n")}`;
        }
        return `${pad}- ${scalar(item)}`;
      })
      .join("\n");
  }
  if (v !== null && typeof v === "object") {
    const keys = Object.keys(v);
    if (!keys.length) return `${pad}{}`;
    return keys
      .map((k) => {
        const val = v[k];
        if (val !== null && typeof val === "object" && (Array.isArray(val) ? val.length : Object.keys(val).length)) return `${pad}${k}:\n${toYaml(val, indent + 1)}`;
        if (val !== null && typeof val === "object") return `${pad}${k}: ${Array.isArray(val) ? "[]" : "{}"}`;
        return `${pad}${k}: ${scalar(val)}`;
      })
      .join("\n");
  }
  return `${pad}${scalar(v)}`;
}
