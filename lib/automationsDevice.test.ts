import test from "node:test";
import assert from "node:assert/strict";
import { buildAutomation, automationId, AUTOMATION_ID, describeRecipe, toYaml, validateRecipe, type Recipe, type World } from "./automations.ts";
import { STATES } from "./sceneFixture.ts";

const states = { ...STATES, "zone.home": { state: "1", attributes: { friendly_name: "Home" } }, "lock.front": { state: "locked", attributes: {} }, "fan.office": { state: "off", attributes: {} } };
const world: World = { states, notify: [] };
const name = (e: string) => (states[e as keyof typeof states] as { attributes: { friendly_name?: string } } | undefined)?.attributes.friendly_name ?? e;

const atTime = { type: "device-at", entity: "light.kitchen_ceiling", action: { verb: "turn_off" }, time: "23:10", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], onlyHome: false };
const check = (raw: unknown) => validateRecipe(raw, world);
const ok = (raw: unknown): Recipe => {
  const v = check(raw);
  assert.equal(v.ok, true, v.ok ? "" : v.error);
  return v.ok ? v.recipe : (undefined as never);
};

test("a time recipe is described in words and built as a time trigger with the Doshy id and alias", () => {
  const r = ok(atTime);
  assert.equal(describeRecipe(r, name), "At 23:10 every day, turn Kitchen ceiling off");
  const { id, config } = buildAutomation(r, automationId(r.type, "abc123"), name);
  assert.match(id, AUTOMATION_ID);
  assert.equal(id, "doshy_device_at_abc123");
  assert.equal(config.alias, "Doshy: At 23:10 every day, turn Kitchen ceiling off");
  assert.deepEqual(config.trigger, [{ platform: "time", at: "23:10:00" }]);
  assert.deepEqual(config.condition, [], "every day needs no day condition");
  assert.deepEqual(config.action, [{ service: "light.turn_off", target: { entity_id: "light.kitchen_ceiling" } }]);
});

test("weekdays, the weekend and particular days become a weekday condition; being home becomes a zone condition", () => {
  const cond = (days: string[], onlyHome = false) => buildAutomation(ok({ ...atTime, days, onlyHome, action: { verb: "turn_on" } }), "doshy_x", name).config.condition;
  assert.deepEqual(cond(["mon", "tue", "wed", "thu", "fri"]), [{ condition: "time", weekday: ["mon", "tue", "wed", "thu", "fri"] }]);
  assert.deepEqual(cond(["sun", "sat"]), [{ condition: "time", weekday: ["sat", "sun"] }], "in week order whatever order was sent");
  assert.deepEqual(cond(["tue", "thu"], true), [{ condition: "time", weekday: ["tue", "thu"] }, { condition: "numeric_state", entity_id: "zone.home", above: 0 }]);
  assert.match(describeRecipe(ok({ ...atTime, days: ["tue", "thu"], onlyHome: true }), name), /on Tuesday and Thursday, turn Kitchen ceiling off, when someone is home$/);
});

test("a sun recipe is a sun trigger with the offset Home Assistant reads", () => {
  const sun = (offset: number) => ({ type: "device-sun", entity: "cover.living_blind", action: { verb: "close" }, sun: "sunset", offset, days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], onlyHome: false });
  const built = (offset: number) => buildAutomation(ok(sun(offset)), "doshy_x", name).config;
  assert.deepEqual(built(10).trigger, [{ platform: "sun", event: "sunset", offset: "+00:10:00" }]);
  assert.deepEqual(built(-45).trigger, [{ platform: "sun", event: "sunset", offset: "-00:45:00" }]);
  assert.deepEqual(built(0).trigger, [{ platform: "sun", event: "sunset", offset: "+00:00:00" }]);
  assert.deepEqual(built(90).trigger, [{ platform: "sun", event: "sunset", offset: "+01:30:00" }]);
  assert.deepEqual(built(10).action, [{ service: "cover.close_cover", target: { entity_id: "cover.living_blind" } }]);
  assert.equal(describeRecipe(ok(sun(10)), name), "10 minutes after sunset every day, close Living blind");
  assert.equal(describeRecipe(ok(sun(-1)), name), "1 minute before sunset every day, close Living blind");
  assert.equal(describeRecipe(ok(sun(0)), name), "At sunset every day, close Living blind");
});

test("positions and temperatures are part of the call and checked against the device's own limits", () => {
  const pos = buildAutomation(ok({ ...atTime, entity: "cover.bedroom_curtain", action: { verb: "set_position", value: 40 } }), "doshy_x", name).config;
  assert.deepEqual(pos.action, [{ service: "cover.set_cover_position", target: { entity_id: "cover.bedroom_curtain" }, data: { position: 40 } }]);
  const heat = buildAutomation(ok({ ...atTime, entity: "climate.living", action: { verb: "set_temperature", value: 18.5 } }), "doshy_x", name).config;
  assert.deepEqual(heat.action, [{ service: "climate.set_temperature", target: { entity_id: "climate.living" }, data: { temperature: 18.5 } }]);
  assert.equal(describeRecipe(ok({ ...atTime, entity: "climate.living", action: { verb: "set_temperature", value: 18.5 } }), name), "At 23:10 every day, set Living to 18.5 degrees");
  const yaml = toYaml(heat);
  assert.match(yaml, /temperature: 18.5/);
});

test("everything unsafe or malformed is refused with a plain sentence", () => {
  const bad: [string, unknown, RegExp][] = [
    ["a lock", { ...atTime, entity: "lock.front", action: { verb: "turn_off" } }, /light, switch, fan, curtain/],
    ["a garage door", { ...atTime, entity: "cover.garage_door", action: { verb: "open" } }, /garage door, gate or door/],
    ["an unknown device", { ...atTime, entity: "light.nowhere" }, /not known to Home Assistant/],
    ["an open light", { ...atTime, action: { verb: "open" } }, /cannot do that/],
    ["a thermostat mode", { ...atTime, entity: "climate.living", action: { verb: "turn_on" } }, /cannot do that/],
    ["a temperature above the device's limit", { ...atTime, entity: "climate.living", action: { verb: "set_temperature", value: 31 } }, /temperature/],
    ["a temperature below it", { ...atTime, entity: "climate.living", action: { verb: "set_temperature", value: 3 } }, /temperature/],
    ["a missing temperature", { ...atTime, entity: "climate.living", action: { verb: "set_temperature" } }, /cannot do that/],
    ["a position of 0", { ...atTime, entity: "cover.bedroom_curtain", action: { verb: "set_position", value: 0 } }, /1 to 99/],
    ["a position of 100", { ...atTime, entity: "cover.bedroom_curtain", action: { verb: "set_position", value: 100 } }, /1 to 99/],
    ["a fractional position", { ...atTime, entity: "cover.bedroom_curtain", action: { verb: "set_position", value: 40.5 } }, /1 to 99/],
    ["a number with a verb that takes none", { ...atTime, action: { verb: "turn_off", value: 3 } }, /cannot do that/],
    ["a bad time", { ...atTime, time: "25:00" }, /Pick a time/],
    ["a time with seconds", { ...atTime, time: "23:10:00" }, /Pick a time/],
    ["no days", { ...atTime, days: [] }, /Pick the days/],
    ["a day that is not one", { ...atTime, days: ["mon", "someday"] }, /Pick the days/],
    ["no home choice", { ...atTime, onlyHome: undefined }, /only run when someone is home/],
    ["a sun event that is not one", { type: "device-sun", entity: "cover.living_blind", action: { verb: "close" }, sun: "noon", offset: 0, days: ["mon"], onlyHome: false }, /sunrise or sunset/],
    ["a sun offset over three hours", { type: "device-sun", entity: "cover.living_blind", action: { verb: "close" }, sun: "sunset", offset: 181, days: ["mon"], onlyHome: false }, /minutes before or after/],
    ["a fractional sun offset", { type: "device-sun", entity: "cover.living_blind", action: { verb: "close" }, sun: "sunset", offset: 1.5, days: ["mon"], onlyHome: false }, /minutes before or after/],
  ];
  for (const [what, raw, words] of bad) {
    const v = check(raw);
    assert.equal(v.ok, false, what);
    if (!v.ok) assert.match(v.error, words, what);
  }
});

test("being home needs a home zone, and a sun routine needs the sun", () => {
  const without = (drop: string): World => ({ ...world, states: Object.fromEntries(Object.entries(states).filter(([k]) => k !== drop)) });
  const home = validateRecipe({ ...atTime, onlyHome: true }, without("zone.home"));
  assert.equal(home.ok, false);
  const sun = validateRecipe({ type: "device-sun", entity: "cover.living_blind", action: { verb: "close" }, sun: "sunset", offset: 0, days: ["mon"], onlyHome: false }, without("sun.sun"));
  assert.equal(sun.ok, false);
});

test("the older recipes are unchanged", () => {
  const r = ok({ type: "curtains-sun", covers: ["cover.living_blind"], elevation: 35 });
  assert.equal(describeRecipe(r, name), "Close Living blind when the sun is higher than 35 degrees");
});
