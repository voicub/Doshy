import test from "node:test";
import assert from "node:assert/strict";
import { ARRIVAL_STATES } from "./arrivalFixture.ts";
import { choreographyRecipe } from "./automationsArrival.ts";
import { AUTOMATION_ID, automationId, buildAutomation, describeRecipe, toYaml, validateRecipe, type Recipe, type World } from "./automations.ts";
import { isRecord } from "./guards.ts";
import type { Choreography } from "./arrival.ts";

const world: World = { states: ARRIVAL_STATES, notify: ["notify.mobile_app_phone"] };
const name = (e: string) => ARRIVAL_STATES[e]?.attributes.friendly_name ?? e;
const ok = (raw: unknown, w: World = world): Recipe => {
  const v = validateRecipe(raw, w);
  assert.equal(v.ok, true, v.ok ? "" : v.error);
  return v.ok ? v.recipe : (undefined as never);
};
const without = (...drop: string[]): World => ({ ...world, states: Object.fromEntries(Object.entries(ARRIVAL_STATES).filter(([k]) => !drop.includes(k))) });
const step = (entity: string, delayMs: number, extra: Record<string, unknown> = {}) => ({ entity, on: true, delayMs, ...extra });

const welcome = {
  type: "arrival-sequence",
  name: "Evening",
  persons: ["person.anna"],
  zones: [],
  steps: [step("light.path_far", 0, { brightness: 60 }), step("light.hall", 1500, { brightness: 80 }), step("light.living", 2250)],
  onlyAfterDark: true,
  onlyIfAlone: false,
  debounceSeconds: 5,
};
const goodbye = { type: "departure-scene", persons: [], awayMinutes: 5, delayMinutes: 0, lights: ["light.hall", "light.living"], covers: ["cover.living_blind"], climate: [{ entity: "climate.living", temperature: 17 }] };
const built = (r: Recipe) => buildAutomation(r, automationId(r.type, "abc123"), name);
const actionServices = (a: unknown[]) => a.map((x) => (isRecord(x) ? (x.service ?? Object.keys(x)[0]) : x));

test("both recipes are described in plain words and get ids and aliases Doshy can list", () => {
  const a = ok(welcome);
  assert.equal(describeRecipe(a, name), 'Welcome home "Evening": when Anna arrives home after dark, turn on Path far, Hall and Living one after another (4 seconds in all)');
  const d = ok(goodbye);
  assert.equal(describeRecipe(d, name), "Goodbye: when Anna and Sam have all been away for 5 minutes, turn off Hall and Living, close Living blind and set Living to 17 degrees");
  for (const r of [a, d]) {
    const { id, config } = built(r);
    assert.match(id, AUTOMATION_ID);
    assert.ok(id.startsWith(r.type === "arrival-sequence" ? "doshy_arrival_sequence_" : "doshy_departure_scene_"));
    assert.ok(config.alias.startsWith("Doshy: "));
    assert.ok(config.trigger.length > 0 && config.action.length > 0);
  }
});

test("a welcome is a state trigger on home with a short wait, the dark condition, and each light behind its own delay", () => {
  const { config } = built(ok(welcome));
  assert.equal(config.mode, "single");
  assert.deepEqual(config.trigger, [{ platform: "state", entity_id: ["person.anna"], to: "home", for: { hours: 0, minutes: 0, seconds: 5 } }]);
  assert.deepEqual(config.condition, [{ condition: "state", entity_id: "sun.sun", state: "below_horizon" }]);
  assert.deepEqual(config.action, [
    { service: "light.turn_on", target: { entity_id: "light.path_far" }, data: { brightness_pct: 60 } },
    { delay: { hours: 0, minutes: 0, seconds: 1, milliseconds: 500 } },
    { service: "light.turn_on", target: { entity_id: "light.hall" }, data: { brightness_pct: 80 } },
    { delay: { hours: 0, minutes: 0, seconds: 2, milliseconds: 250 } },
    { service: "light.turn_on", target: { entity_id: "light.living" } },
  ]);
});

test("a step with no wait has no delay; a media player step is two calls behind one delay; a scene step runs the scene", () => {
  const r = ok({ ...welcome, steps: [step("scene.evening", 0, { on: undefined, run: true }), step("media_player.living_tv", 3000, { volume: 20 })] });
  assert.deepEqual(actionServices(built(r).config.action), ["scene.turn_on", "delay", "media_player.turn_on", "media_player.volume_set"]);
});

test("'nobody else is home' counts the arrival: below 2 for arriving home, below 1 for a place on the way", () => {
  assert.deepEqual(built(ok({ ...welcome, onlyAfterDark: false, onlyIfAlone: true })).config.condition, [{ condition: "numeric_state", entity_id: "zone.home", below: 2 }]);
  const gate = built(ok({ ...welcome, onlyAfterDark: false, onlyIfAlone: true, zones: ["zone.gate"], persons: ["person.anna", "person.sam"], debounceSeconds: 20 }));
  assert.deepEqual(gate.config.condition, [{ condition: "numeric_state", entity_id: "zone.home", below: 1 }]);
  assert.deepEqual(gate.config.trigger, [{ platform: "zone", entity_id: ["person.anna", "person.sam"], zone: "zone.gate", event: "enter" }], "a zone trigger has no wait");
  assert.equal(validateRecipe({ ...welcome, onlyIfAlone: true, zones: ["zone.home", "zone.gate"] }, world).ok, false, "home and another place cannot share one count");
});

test("nobody named means everybody Home Assistant has; with nobody at all it is refused", () => {
  const r = ok({ ...welcome, persons: [] });
  assert.ok(r.type === "arrival-sequence" && r.persons.join() === "person.anna,person.sam");
  assert.equal(validateRecipe({ ...welcome, persons: [] }, without("person.anna", "person.sam")).ok, false);
});

test("turning the lights off again: a delay, the motion check, then one turn_off per kind of device; the run restarts on a second arrival", () => {
  const withOff = built(ok({ ...welcome, steps: [...welcome.steps, step("switch.server", 500)], offAfterMinutes: 10, motion: "binary_sensor.hall_motion" }));
  assert.equal(withOff.config.mode, "restart");
  assert.deepEqual(withOff.config.action.slice(-4), [
    { delay: { hours: 0, minutes: 10, seconds: 0 } },
    { condition: "state", entity_id: "binary_sensor.hall_motion", state: "off" },
    { service: "light.turn_off", target: { entity_id: ["light.path_far", "light.hall", "light.living"] } },
    { service: "switch.turn_off", target: { entity_id: ["switch.server"] } },
  ]);
  assert.match(describeRecipe(ok({ ...welcome, offAfterMinutes: 90, motion: "binary_sensor.hall_motion" }), name), /, then turn them off again after 90 minutes unless Hall motion shows movement$/);
  assert.deepEqual(built(ok({ ...welcome, offAfterMinutes: 90 })).config.action.slice(-2), [{ delay: { hours: 1, minutes: 30, seconds: 0 } }, { service: "light.turn_off", target: { entity_id: ["light.path_far", "light.hall", "light.living"] } }]);
});

test("a welcome refuses what is not safe or not there", () => {
  const bad: unknown[] = [
    { ...welcome, steps: [step("lock.front_door", 0, { on: false })] },
    { ...welcome, steps: [step("cover.garage_door", 0, { position: 100, on: undefined })] },
    { ...welcome, steps: [step("light.gone", 0)] },
    { ...welcome, steps: [] },
    { ...welcome, steps: Array.from({ length: 31 }, () => step("light.hall", 0)) },
    { ...welcome, steps: Array.from({ length: 6 }, () => step("light.hall", 60_000)) },
    { ...welcome, persons: ["person.nobody"] },
    { ...welcome, persons: ["light.hall"] },
    { ...welcome, zones: ["zone.nowhere"] },
    { ...welcome, name: "  " },
    { ...welcome, onlyAfterDark: "yes" },
    { ...welcome, debounceSeconds: 61 },
    { ...welcome, offAfterMinutes: 0 },
    { ...welcome, offAfterMinutes: 241 },
    { ...welcome, offAfterMinutes: 5, motion: "light.hall" },
    { ...welcome, motion: "binary_sensor.hall_motion" },
    { ...welcome, steps: [step("scene.evening", 0, { on: undefined, run: true })], offAfterMinutes: 5 },
  ];
  for (const raw of bad) assert.equal(validateRecipe(raw, world).ok, false, JSON.stringify(raw).slice(0, 120));
  assert.equal(validateRecipe(welcome, without("sun.sun")).ok, false, "no sun, no dark rule");
  assert.equal(validateRecipe({ ...welcome, onlyAfterDark: false, onlyIfAlone: true }, without("zone.home")).ok, false, "no home zone, no alone rule");
  assert.equal(validateRecipe({ ...welcome, steps: [step("light.hall", 0, { brightness: 500 })] }, world).ok, true, "a number is clamped, not refused");
});

test("goodbye: the home count must stay at 0, every person is checked as away, and a long wait re-checks before it acts", () => {
  const quick = built(ok(goodbye));
  assert.equal(quick.config.mode, "single");
  assert.deepEqual(quick.config.trigger, [{ platform: "numeric_state", entity_id: "zone.home", below: 1, for: { hours: 0, minutes: 5, seconds: 0 } }]);
  const away = ["person.anna", "person.sam"].map((p) => ({ condition: "not", conditions: ["home", "unknown", "unavailable"].map((state) => ({ condition: "state", entity_id: p, state })) })); // an unknown or unavailable person is never taken as away
  assert.deepEqual(quick.config.condition, away);
  assert.deepEqual(quick.config.action, [
    { service: "light.turn_off", target: { entity_id: ["light.hall", "light.living"] } },
    { service: "cover.close_cover", target: { entity_id: ["cover.living_blind"] } },
    { service: "climate.set_temperature", target: { entity_id: "climate.living" }, data: { temperature: 17 } },
  ]);
  const later = built(ok({ ...goodbye, delayMinutes: 20 })).config.action;
  assert.deepEqual(later.slice(0, 2 + away.length), [{ delay: { hours: 0, minutes: 20, seconds: 0 } }, { condition: "numeric_state", entity_id: "zone.home", below: 1 }, ...away]);
  assert.match(describeRecipe(ok({ ...goodbye, delayMinutes: 20 }), name), /been away for 5 minutes, wait 20 more minutes and turn off/);
});

test("goodbye can remind about a door that is still open, with a notify guarded by the door's state", () => {
  const r = ok({ ...goodbye, lights: [], covers: [], climate: [], doorAlert: { contact: "binary_sensor.front_door", notify: "notify.mobile_app_phone" } });
  assert.deepEqual(built(r).config.action, [{ choose: [{ conditions: [{ condition: "state", entity_id: "binary_sensor.front_door", state: "on" }], sequence: [{ service: "notify.mobile_app_phone", data: { title: "Doshy", message: "Front door is still open." } }] }] }]);
  assert.match(describeRecipe(r, name), /tell me if Front door is still open$/);
});

test("goodbye refuses locks, garage doors, unknown things and out-of-range temperatures", () => {
  const bad: unknown[] = [
    { ...goodbye, lights: ["lock.front_door"] },
    { ...goodbye, covers: ["cover.garage_door"] },
    { ...goodbye, covers: ["cover.nothing"] },
    { ...goodbye, lights: ["light.gone"] },
    { ...goodbye, climate: [{ entity: "climate.living", temperature: 90 }] },
    { ...goodbye, climate: [{ entity: "climate.living" }] },
    { ...goodbye, climate: [{ entity: "light.hall", temperature: 18 }] },
    { ...goodbye, lights: [], covers: [], climate: [] },
    { ...goodbye, awayMinutes: 0 },
    { ...goodbye, delayMinutes: 31 },
    { ...goodbye, awayMinutes: 2.5 },
    { ...goodbye, awayMinutes: 4 }, // under the five-minute safeguard
    { ...goodbye, doorAlert: { contact: "binary_sensor.front_door", notify: "notify.someone_else" } },
    { ...goodbye, doorAlert: { contact: "light.hall", notify: "notify.mobile_app_phone" } },
    { ...goodbye, doorAlert: "yes" },
    { ...goodbye, persons: ["person.ghost"] },
  ];
  for (const raw of bad) assert.equal(validateRecipe(raw, world).ok, false, JSON.stringify(raw));
  assert.equal(validateRecipe(goodbye, without("zone.home")).ok, false);
});

test("the YAML preview carries the delays, the alias and the mode", () => {
  const yaml = toYaml(JSON.parse(JSON.stringify(built(ok({ ...welcome, offAfterMinutes: 10 })).config)));
  assert.match(yaml, /^mode: restart$/m);
  assert.match(yaml, /^ {6}milliseconds: 500$/m);
  assert.match(yaml, /state: below_horizon/);
  assert.match(yaml, /^alias: "Doshy: Welcome home /m);
});

test("a saved choreography becomes the same recipe the sheet previews", () => {
  const c: Choreography = {
    id: "c1", name: "Evening", kind: "arrival", steps: welcome.steps.map((s) => ({ ...s, on: true })),
    conditions: { onlyAfterDark: true, persons: ["person.anna"], debounceSeconds: 5 },
  };
  assert.deepEqual(ok(choreographyRecipe(c)), ok(welcome));
  const dep: Choreography = {
    id: "d1", name: "Leaving", kind: "departure", conditions: { onlyAfterDark: false, persons: [] },
    steps: [{ entity: "light.hall", on: false, delayMs: 0 }, { entity: "cover.living_blind", position: 0, delayMs: 0 }, { entity: "climate.living", temperature: 17, delayMs: 0 }],
    away: { awayMinutes: 5, delayMinutes: 0, doorContact: "binary_sensor.front_door", notify: "notify.mobile_app_phone" },
  };
  const r = ok(choreographyRecipe(dep));
  assert.ok(r.type === "departure-scene" && r.lights.join() === "light.hall" && r.covers.join() === "cover.living_blind" && r.climate[0].temperature === 17 && r.doorAlert?.contact === "binary_sensor.front_door");
});
