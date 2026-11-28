// The two recipes the Arrival sheet makes: "when someone arrives home, light the way in one light after another" and "when everybody has left, switch things off". Checked with the
// same rules as every other recipe and as a scene: the calls go through lib/sceneRun.ts (only the offered services, garage doors and gates refused, numbers inside the device's own
// limits), and nothing here can touch a lock: the lock domain is not one a step may name. Pure; lib/automations.ts wires these into validateRecipe, describeRecipe and buildAutomation.
import { arrivalStepOf, DEFAULT_DEBOUNCE_S, MAX_ARRIVAL_STEPS, MAX_AWAY_MINUTES, MAX_DEPARTURE_DELAY_MINUTES, MAX_OFF_MINUTES, MAX_DEBOUNCE_S, MAX_SEQUENCE_MS, MIN_AWAY_MINUTES, sequenceMs, type ArrivalStep, type Choreography } from "./arrival.ts";
import { isRecord } from "./guards.ts";
import { ENTITY_ID } from "./haService.ts";
import { checkBatch, MAX_ACTIONS, type KnownStates } from "./sceneRun.ts";
import { inBatches, NAME_MAX, stepActions, stepOf, type SceneStep } from "./scenes.ts";

export type ArrivalRecipe =
  | {
      type: "arrival-sequence";
      name: string;
      /** `person.*`; the people the automation watches (a recipe for "anyone" lists everyone Home Assistant has) */
      persons: string[];
      /** `zone.*`: run when someone enters one of these; none = when someone's state becomes `home` */
      zones: string[];
      steps: ArrivalStep[];
      onlyAfterDark: boolean;
      onlyIfAlone: boolean;
      /** seconds the person must stay home before it runs (only for "arrives home") */
      debounceSeconds: number;
      offAfterMinutes?: number;
      motion?: string;
    }
  | {
      type: "departure-scene";
      persons: string[];
      /** how long everybody has been away before it runs */
      awayMinutes: number;
      /** a further wait before anything is switched off */
      delayMinutes: number;
      lights: string[];
      covers: string[];
      climate: { entity: string; temperature: number }[];
      doorAlert?: { contact: string; notify: string };
    };

export const ARRIVAL_RECIPE_TYPES = ["arrival-sequence", "departure-scene"] as const;
const MAX_PERSONS = 20;
const MAX_ZONES = 6;
const MAX_DEPARTURE_LIGHTS = 60;
const MAX_DEPARTURE_COVERS = 20;
const MAX_DEPARTURE_CLIMATE = 6;
const HOME_ZONE = "zone.home";
/** Devices a step can switch on and that "turn them off again" can switch off. */
const SWITCHED = ["light", "switch", "fan", "input_boolean"];

type World = { states: KnownStates; notify: readonly string[] };
type Checked = { ok: true; recipe: ArrivalRecipe } | { ok: false; error: string };
const refuse = (error: string): Checked => ({ ok: false, error });
const domainOf = (e: string) => e.slice(0, e.indexOf("."));
const isText = (v: unknown): v is string => typeof v === "string";

export const isArrivalRecipeRaw = (raw: unknown): raw is Record<string, unknown> & { type: (typeof ARRIVAL_RECIPE_TYPES)[number] } => isRecord(raw) && (raw.type === "arrival-sequence" || raw.type === "departure-scene");

/** Entities of one domain that Home Assistant has: the list (empty when none were given), or the sentence that says what is wrong. */
function entitiesIn(v: unknown, domain: string, max: number, states: KnownStates, what: string): string[] | { error: string } {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max) return { error: `${what}: at most ${max}.` };
  const out: string[] = [];
  for (const e of v) {
    if (!isText(e) || !ENTITY_ID.test(e) || domainOf(e) !== domain) return { error: `${what} must be ${domain}.* entities.` };
    if (!states[e]) return { error: `${e} is not known to Home Assistant.` };
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

/** The people an automation watches: those named, or (none named) everyone Home Assistant has. */
function personsIn(v: unknown, states: KnownStates): string[] | { error: string } {
  const named = entitiesIn(v, "person", MAX_PERSONS, states, "The people");
  if (!Array.isArray(named)) return named;
  if (named.length) return named;
  const all = Object.keys(states).filter((e) => e.startsWith("person.")).sort().slice(0, MAX_PERSONS);
  return all.length ? all : { error: "Home Assistant has no people yet (person entities). Add yourself under Settings > People, then try again." };
}

const one = (v: unknown, domain: string, states: KnownStates, what: string): string | { error: string } => {
  const list = entitiesIn(v === undefined ? undefined : [v], domain, 1, states, what);
  return Array.isArray(list) ? (list[0] ?? { error: `Pick ${what}.` }) : list;
};

const wholeIn = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);

/** The calls of every step, checked together as one batch like a scene. */
function checkSteps(steps: readonly SceneStep[], states: KnownStates): string | null {
  const calls = steps.flatMap(stepActions);
  for (const batch of inBatches(calls, MAX_ACTIONS)) {
    const checked = checkBatch({ actions: batch }, states);
    if (!checked.ok) return checked.error;
  }
  return null;
}

/** An arrival or departure recipe from untrusted JSON (`raw.type` is one of ARRIVAL_RECIPE_TYPES), checked against what Home Assistant has. */
export function validateArrivalRecipe(raw: Record<string, unknown>, world: World): Checked {
  const { states } = world;
  const persons = personsIn(raw.persons, states);
  if (!Array.isArray(persons)) return refuse(persons.error);
  return raw.type === "arrival-sequence" ? validateArrival(raw, persons, states) : validateDeparture(raw, persons, world);
}

function validateArrival(raw: Record<string, unknown>, persons: string[], states: KnownStates): Checked {
  const name = isText(raw.name) ? raw.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX) : "";
  if (!name) return refuse("Give the welcome a name.");
  const zones = entitiesIn(raw.zones, "zone", MAX_ZONES, states, "The places");
  if (!Array.isArray(zones)) return refuse(zones.error);
  if (typeof raw.onlyAfterDark !== "boolean" || typeof raw.onlyIfAlone !== "boolean") return refuse("Say whether it should only run after dark and only when nobody else is home.");
  const { onlyAfterDark, onlyIfAlone } = raw;
  if (onlyAfterDark && !states["sun.sun"]) return refuse("Home Assistant has no sun entity (sun.sun), so it cannot tell when it is dark.");
  if (onlyIfAlone && !states[HOME_ZONE]) return refuse("Home Assistant has no home zone (zone.home), so it cannot tell whether anyone else is home.");
  if (onlyIfAlone && new Set(zones.map((z) => z === HOME_ZONE)).size > 1) return refuse("\"Only if nobody else is home\" cannot mix your home with other places. Pick one or the other.");

  if (!Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > MAX_ARRIVAL_STEPS) return refuse(`The welcome needs 1 to ${MAX_ARRIVAL_STEPS} steps.`);
  const steps: ArrivalStep[] = [];
  for (const s of raw.steps) {
    const step = arrivalStepOf(s);
    if (!step) return refuse("One step is not something Doshy can set.");
    if (!states[step.entity]) return refuse(`${step.entity} is not known to Home Assistant.`);
    steps.push(step);
  }
  if (sequenceMs(steps) > MAX_SEQUENCE_MS) return refuse(`The whole welcome may take at most ${MAX_SEQUENCE_MS / 60_000} minutes.`);
  const problem = checkSteps(steps, states);
  if (problem) return refuse(problem);

  const debounce = zones.length ? 0 : raw.debounceSeconds === undefined ? DEFAULT_DEBOUNCE_S : wholeIn(raw.debounceSeconds, 0, MAX_DEBOUNCE_S);
  if (debounce === undefined) return refuse(`The wait before it starts is a whole number of seconds from 0 to ${MAX_DEBOUNCE_S}.`);
  const recipe: ArrivalRecipe = { type: "arrival-sequence", name, persons, zones, steps, onlyAfterDark, onlyIfAlone, debounceSeconds: debounce };

  if (raw.offAfterMinutes === undefined) return raw.motion === undefined ? { ok: true, recipe } : refuse("A motion sensor only matters together with the turn-off time.");
  const off = wholeIn(raw.offAfterMinutes, 1, MAX_OFF_MINUTES);
  if (off === undefined) return refuse(`Minutes before the lights go off again must be a whole number from 1 to ${MAX_OFF_MINUTES}.`);
  if (!switchedOff(steps).length) return refuse("Nothing in the welcome is a light or switch that could be turned off again.");
  if (raw.motion === undefined) return { ok: true, recipe: { ...recipe, offAfterMinutes: off } };
  const motion = one(raw.motion, "binary_sensor", states, "the motion sensor");
  if (typeof motion === "string" && !["motion", "occupancy", "presence"].includes(states[motion].attributes.device_class ?? "")) return refuse("Pick a motion or occupancy sensor.");
  return typeof motion === "string" ? { ok: true, recipe: { ...recipe, offAfterMinutes: off, motion } } : refuse(motion.error);
}

function validateDeparture(raw: Record<string, unknown>, persons: string[], { states, notify }: World): Checked {
  if (!states[HOME_ZONE]) return refuse("Home Assistant has no home zone (zone.home), so it cannot tell when everybody has left.");
  const awayMinutes = wholeIn(raw.awayMinutes, MIN_AWAY_MINUTES, MAX_AWAY_MINUTES);
  const delayMinutes = wholeIn(raw.delayMinutes, 0, MAX_DEPARTURE_DELAY_MINUTES);
  if (awayMinutes === undefined) return refuse(`Minutes everybody must be away is a whole number from ${MIN_AWAY_MINUTES} to ${MAX_AWAY_MINUTES}.`);
  if (delayMinutes === undefined) return refuse(`The extra wait is a whole number of minutes from 0 to ${MAX_DEPARTURE_DELAY_MINUTES}.`);
  const lights = entitiesIn(raw.lights, "light", MAX_DEPARTURE_LIGHTS, states, "The lights");
  if (!Array.isArray(lights)) return refuse(lights.error);
  const covers = entitiesIn(raw.covers, "cover", MAX_DEPARTURE_COVERS, states, "The curtains");
  if (!Array.isArray(covers)) return refuse(covers.error);
  const climate: { entity: string; temperature: number }[] = [];
  const rawClimate = raw.climate === undefined ? [] : raw.climate;
  if (!Array.isArray(rawClimate) || rawClimate.length > MAX_DEPARTURE_CLIMATE) return refuse(`Pick at most ${MAX_DEPARTURE_CLIMATE} thermostats.`);
  for (const c of rawClimate) {
    if (!isRecord(c) || typeof c.entity !== "string" || typeof c.temperature !== "number" || !Number.isFinite(c.temperature)) return refuse("A thermostat needs the temperature to go to.");
    const rawProblem = checkSteps([{ entity: c.entity, temperature: c.temperature }], states);
    if (rawProblem) return refuse(rawProblem);
    const step = stepOf(c);
    if (!step || domainOf(step.entity) !== "climate" || step.temperature === undefined) return refuse("A thermostat needs the temperature to go to.");
    if (!states[step.entity]) return refuse(`${step.entity} is not known to Home Assistant.`);
    climate.push({ entity: step.entity, temperature: step.temperature });
  }

  // the same safety path as a scene: only the offered services, numbers inside the device's limits, and a garage door or gate is refused
  const problem = checkSteps([...lights.map((entity): SceneStep => ({ entity, on: false })), ...covers.map((entity): SceneStep => ({ entity, position: 0 })), ...climate], states);
  if (problem) return refuse(problem);

  let doorAlert: { contact: string; notify: string } | undefined;
  if (raw.doorAlert !== undefined) {
    const a = raw.doorAlert;
    const contact = isRecord(a) ? one(a.contact, "binary_sensor", states, "the door or window") : { error: "Pick the door or window to look at." };
    if (typeof contact !== "string") return refuse(contact.error);
    if (!["door", "window", "opening"].includes(states[contact].attributes.device_class ?? "")) return refuse("Pick a door or window contact sensor.");
    const service = isRecord(a) ? a.notify : undefined;
    if (!isText(service) || !/^notify\.[a-z0-9_]+$/.test(service) || !notify.includes(service)) return refuse("Pick one of the notification services Home Assistant has (for example the companion app on your phone).");
    doorAlert = { contact, notify: service };
  }
  if (!lights.length && !covers.length && !climate.length && !doorAlert) return refuse("Pick something for goodbye to do.");
  return { ok: true, recipe: { type: "departure-scene", persons, awayMinutes, delayMinutes, lights, covers, climate, ...(doorAlert ? { doorAlert } : {}) } };
}

// ---- words -----------------------------------------------------------------------------------------------------------------------------------------------

const and = (names: string[]) => (names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** A list of devices in a sentence: all of them up to three, else "5 lights". */
const some = (names: string[], noun: string) => (names.length <= 3 ? and(names) : plural(names.length, noun));
const seconds = (ms: number) => (ms < 1000 ? "a moment" : ms < 120_000 ? `${Math.round(ms / 1000)} seconds` : `${Math.round(ms / 60_000)} minutes`);

export function describeArrivalRecipe(r: ArrivalRecipe, name: (entity: string) => string): string {
  const who = and(r.persons.map(name));
  if (r.type === "departure-scene") {
    const acts = [
      ...(r.lights.length ? [`turn off ${some(r.lights.map(name), "lights")}`] : []),
      ...(r.covers.length ? [`close ${some(r.covers.map(name), "curtains")}`] : []),
      ...r.climate.map((c) => `set ${name(c.entity)} to ${c.temperature} degrees`),
      ...(r.doorAlert ? [`tell me if ${name(r.doorAlert.contact)} is still open`] : []),
    ];
    const wait = r.delayMinutes ? `, wait ${plural(r.delayMinutes, "more minute")} and` : ",";
    return `Goodbye: when ${who} ${r.persons.length === 1 ? "has" : "have all"} been away for ${plural(r.awayMinutes, "minute")}${wait} ${and(acts)}`;
  }
  const names = r.steps.map((s) => name(s.entity));
  const allOn = r.steps.every((s) => SWITCHED.includes(domainOf(s.entity)) && s.on !== false);
  const when = r.zones.length ? `${r.persons.length === 1 ? "enters" : "enter"} ${and(r.zones.map(name))}` : r.persons.length === 1 ? "arrives home" : "arrive home";
  const off = r.offAfterMinutes ? `, then turn them off again after ${plural(r.offAfterMinutes, "minute")}${r.motion ? ` unless ${name(r.motion)} shows movement` : ""}` : "";
  const total = sequenceMs(r.steps);
  return `Welcome home "${r.name}": when ${who} ${when}${r.onlyAfterDark ? " after dark" : ""}${r.onlyIfAlone ? " and nobody else is home" : ""}, ${allOn ? "turn on" : "set"} ${some(names, "devices")} one after another${total >= 1000 ? ` (${seconds(total)} in all)` : ""}${off}`;
}

// ---- the automation ------------------------------------------------------------------------------------------------------------------------------------

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type ArrivalAutomationParts = { mode: "single" | "restart"; trigger: Json[]; condition: Json[]; action: Json[] };

/** Service data as plain JSON (a step's data is validated already: numbers and lists of numbers). */
const jsonOf = (v: unknown): Json => {
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map(jsonOf);
  return isRecord(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonOf(x)])) : null;
};

const clock = (totalSeconds: number): Json => ({ hours: Math.floor(totalSeconds / 3600), minutes: Math.floor((totalSeconds % 3600) / 60), seconds: totalSeconds % 60 });
const delay = (ms: number): Json => ({ delay: { hours: 0, minutes: Math.floor(ms / 60_000), seconds: Math.floor((ms % 60_000) / 1000), milliseconds: ms % 1000 } });

/** What the sequence switched on and can switch off again, as `[domain, entities]`. */
function switchedOff(steps: readonly ArrivalStep[]): [string, string[]][] {
  const out: [string, string[]][] = [];
  for (const s of steps) {
    const d = domainOf(s.entity);
    if (!SWITCHED.includes(d) || s.on === false) continue;
    const row = out.find((o) => o[0] === d);
    if (!row) out.push([d, [s.entity]]);
    else if (!row[1].includes(s.entity)) row[1].push(s.entity);
  }
  return out;
}

/** Nobody is at home but you: the count of `zone.home` is 1 once you are in it (the arrival is counted), 0 while you are still on the way to another place. */
const aloneBelow = (zones: readonly string[]) => (zones.every((z) => z === HOME_ZONE) ? 2 : 1);

export function arrivalAutomationParts(r: ArrivalRecipe, name: (entity: string) => string): ArrivalAutomationParts {
  if (r.type === "departure-scene") return departureParts(r, name);
  // A state trigger on `home` only fires on a real change to home; with several people in one trigger each arrival starts the run. `for` makes the person stay home a few seconds:
  // Home Assistant's home count (read by "nobody else is home") has settled by then, and a flicker of the phone's GPS at the door does not start it.
  const trigger: Json[] = r.zones.length
    ? r.zones.map((zone): Json => ({ platform: "zone", entity_id: r.persons, zone, event: "enter" }))
    : [{ platform: "state", entity_id: r.persons, to: "home", ...(r.debounceSeconds ? { for: clock(r.debounceSeconds) } : {}) }];
  const condition: Json[] = [];
  if (r.onlyAfterDark) condition.push({ condition: "state", entity_id: "sun.sun", state: "below_horizon" });
  if (r.onlyIfAlone) condition.push({ condition: "numeric_state", entity_id: HOME_ZONE, below: aloneBelow(r.zones) });
  const action: Json[] = [];
  for (const s of r.steps) {
    const calls = stepActions(s);
    if (s.delayMs && calls.length) action.push(delay(s.delayMs));
    for (const a of calls) action.push({ service: `${a.domain}.${a.service}`, target: { entity_id: a.entity_id }, ...(a.data ? { data: jsonOf(a.data) } : {}) });
  }
  if (r.offAfterMinutes) {
    action.push({ delay: clock(r.offAfterMinutes * 60) });
    // an action-level condition ends the run quietly when it is false: movement at that moment leaves the lights on
    if (r.motion) action.push({ condition: "state", entity_id: r.motion, state: "off" });
    for (const [domain, entities] of switchedOff(r.steps)) action.push({ service: `${domain}.turn_off`, target: { entity_id: entities } });
  }
  // A second arrival while the lights are still on: with a turn-off timer the run starts again (so the timer counts from the last arrival), without one the second arrival is skipped.
  return { mode: r.offAfterMinutes ? "restart" : "single", trigger, condition, action };
}

function departureParts(r: Extract<ArrivalRecipe, { type: "departure-scene" }>, name: (entity: string) => string): ArrivalAutomationParts {
  // "Everybody is gone" is the home zone's count falling to 0 and staying there: one trigger however many people live here, and the `for` ignores a phone that loses GPS for a minute.
  // Named places count as away too ("Work" is not "not_home"), so each person is checked as "not home" rather than compared with one state.
  const away: Json[] = r.persons.map((p): Json => ({ condition: "not", conditions: ["home", "unknown", "unavailable"].map((state): Json => ({ condition: "state", entity_id: p, state })) }));
  const trigger: Json[] = [{ platform: "numeric_state", entity_id: HOME_ZONE, below: 1, for: clock(r.awayMinutes * 60) }];
  const action: Json[] = [];
  if (r.delayMinutes) action.push({ delay: clock(r.delayMinutes * 60) }, { condition: "numeric_state", entity_id: HOME_ZONE, below: 1 }, ...away); // somebody may have come back while it waited
  if (r.lights.length) action.push({ service: "light.turn_off", target: { entity_id: r.lights } });
  if (r.covers.length) action.push({ service: "cover.close_cover", target: { entity_id: r.covers } });
  for (const c of r.climate) action.push({ service: "climate.set_temperature", target: { entity_id: c.entity }, data: { temperature: c.temperature } });
  if (r.doorAlert) {
    const { contact, notify } = r.doorAlert;
    // `choose` so that a closed door does not end the run (a bare condition would), whatever is added after it later
    action.push({ choose: [{ conditions: [{ condition: "state", entity_id: contact, state: "on" }], sequence: [{ service: notify, data: { title: "Doshy", message: `${name(contact)} is still open.` } }] }] });
  }
  return { mode: "single", trigger, condition: away, action };
}

// ---- from a saved choreography ---------------------------------------------------------------------------------------------------------------------------

/** The recipe data for a choreography, as the plain JSON validateRecipe checks and the server builds from. */
export function choreographyRecipe(c: Choreography): Record<string, unknown> {
  const { conditions, steps } = c;
  if (c.kind === "arrival") {
    return {
      type: "arrival-sequence",
      name: c.name,
      persons: conditions.persons,
      zones: c.trigger?.zones ?? [],
      steps,
      onlyAfterDark: conditions.onlyAfterDark,
      onlyIfAlone: conditions.onlyIfAloneHome === true,
      ...(conditions.debounceSeconds !== undefined ? { debounceSeconds: conditions.debounceSeconds } : {}),
      ...(conditions.offAfterMinutes !== undefined ? { offAfterMinutes: conditions.offAfterMinutes } : {}),
      ...(conditions.offAfterMinutes !== undefined && conditions.motion ? { motion: conditions.motion } : {}),
    };
  }
  const away = c.away ?? { awayMinutes: 5, delayMinutes: 0 };
  return {
    type: "departure-scene",
    persons: conditions.persons,
    awayMinutes: away.awayMinutes,
    delayMinutes: away.delayMinutes,
    lights: steps.filter((s) => domainOf(s.entity) === "light" && s.on === false).map((s) => s.entity),
    covers: steps.filter((s) => domainOf(s.entity) === "cover").map((s) => s.entity),
    climate: steps.filter((s) => domainOf(s.entity) === "climate").map((s) => ({ entity: s.entity, temperature: s.temperature })),
    ...(away.doorContact && away.notify ? { doorAlert: { contact: away.doorContact, notify: away.notify } } : {}),
  };
}
