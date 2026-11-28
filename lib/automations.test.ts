import test from "node:test";
import assert from "node:assert/strict";
import { AUTOMATION_ID, automationId, buildAutomation, describeRecipe, toYaml, validateRecipe, type Recipe, type World } from "./automations.ts";
import { isRecord } from "./guards.ts";
import { STATES } from "./sceneFixture.ts";

const world: World = { states: STATES, notify: ["notify.mobile_app_phone"] };
const name = (e: string) => STATES[e]?.attributes.friendly_name ?? e;
const ok = (raw: unknown): Recipe => {
  const v = validateRecipe(raw, world);
  assert.equal(v.ok, true, v.ok ? "" : v.error);
  return v.ok ? v.recipe : (undefined as never);
};

test("each recipe is described in words and built with the Doshy id and alias", () => {
  const recipes: [unknown, RegExp][] = [
    [{ type: "open-after", entity: "binary_sensor.kitchen_window", time: "22:00", notify: "notify.mobile_app_phone" }, /^Tell me if Kitchen window is open after 22:00$/],
    [{ type: "notify-open", entity: "binary_sensor.kitchen_window", notify: "notify.mobile_app_phone" }, /^Tell me when Kitchen window opens$/],
    [{ type: "light-off-no-motion", motion: "binary_sensor.hall_motion", lights: ["light.kitchen_ceiling", "light.desk_lamp"], minutes: 10 }, /^Turn off Kitchen ceiling and Desk lamp after 10 minutes without movement at Hall motion$/],
    [{ type: "curtains-sun", covers: ["cover.living_blind"], elevation: 35 }, /^Close Living blind when the sun is higher than 35 degrees$/],
    [{ type: "scene-at", name: "Movie night", steps: [{ entity: "light.living_main", on: false }], time: "20:30", days: "weekdays" }, /^Run "Movie night" at 20:30 on weekdays$/],
  ];
  for (const [raw, words] of recipes) {
    const r = ok(raw);
    assert.match(describeRecipe(r, name), words);
    const { id, config } = buildAutomation(r, automationId(r.type, "abc123"), name);
    assert.match(id, AUTOMATION_ID);
    assert.ok(config.alias.startsWith("Doshy: "));
    assert.ok(config.trigger.length > 0 && config.action.length > 0);
    assert.match(JSON.stringify(config), /"mode":"single"/);
  }
});

test("the window recipe notices the window at the chosen time and when it opens later", () => {
  const r = ok({ type: "open-after", entity: "binary_sensor.kitchen_window", time: "22:00", notify: "notify.mobile_app_phone" });
  const { config } = buildAutomation(r, "doshy_x", name);
  assert.deepEqual(config.trigger, [{ platform: "time", at: "22:00:00" }, { platform: "state", entity_id: "binary_sensor.kitchen_window", to: "on" }]);
  assert.deepEqual(config.condition, [{ condition: "state", entity_id: "binary_sensor.kitchen_window", state: "on" }, { condition: "time", after: "22:00:00", before: "06:00:00" }]);
  assert.deepEqual(config.action, [{ service: "notify.mobile_app_phone", data: { title: "Doshy", message: "Kitchen window is open." } }]);
});

test("the YAML preview is valid and quotes what YAML would misread", () => {
  const { config } = buildAutomation(ok({ type: "open-after", entity: "binary_sensor.kitchen_window", time: "22:00", notify: "notify.mobile_app_phone" }), "doshy_x", name);
  const yaml = toYaml(JSON.parse(JSON.stringify(config)));
  assert.match(yaml, /^alias: "Doshy: Tell me if Kitchen window is open after 22:00"$/m);
  assert.match(yaml, /^trigger:\n {2}- platform: time\n {4}at: "22:00:00"\n {2}- platform: state$/m);
  assert.match(yaml, /^ {4}to: "on"$/m, "on is a boolean in YAML 1.1, so it is quoted");
  assert.match(yaml, /state: "on"/);
  assert.equal(toYaml({ a: [], b: {}, c: [1, 2], d: [{ x: "y z" }] }), 'a: []\nb: {}\nc:\n  - 1\n  - 2\nd:\n  - x: "y z"');
});

test("a recipe may only name things Home Assistant has, of the right kind", () => {
  const bad: unknown[] = [
    null,
    { type: "nope" },
    { type: "open-after", entity: "binary_sensor.nothing", time: "22:00", notify: "notify.mobile_app_phone" },
    { type: "open-after", entity: "light.bedroom_ceiling", time: "22:00", notify: "notify.mobile_app_phone" },
    { type: "open-after", entity: "binary_sensor.kitchen_window", time: "25:00", notify: "notify.mobile_app_phone" },
    { type: "open-after", entity: "binary_sensor.kitchen_window", time: "22:00", notify: "notify.mobile_app_other" },
    { type: "open-after", entity: "binary_sensor.kitchen_window", time: "22:00", notify: "persistent_notification.create" },
    { type: "notify-open", entity: "binary_sensor.kitchen_window", notify: "script.turn_on" },
    { type: "light-off-no-motion", motion: "binary_sensor.hall_motion", lights: [], minutes: 10 },
    { type: "light-off-no-motion", motion: "binary_sensor.hall_motion", lights: ["switch.server"], minutes: 10 },
    { type: "light-off-no-motion", motion: "binary_sensor.hall_motion", lights: ["light.desk_lamp"], minutes: 0 },
    { type: "light-off-no-motion", motion: "binary_sensor.hall_motion", lights: ["light.desk_lamp"], minutes: 5.5 },
    { type: "curtains-sun", covers: ["cover.garage_door"], elevation: 30 },
    { type: "curtains-sun", covers: ["cover.living_blind"], elevation: 90 },
    { type: "scene-at", name: "x", steps: [], time: "20:00", days: "every" },
    { type: "scene-at", name: "x", steps: [{ entity: "lock.front_door", on: false }], time: "20:00", days: "every" },
    { type: "scene-at", name: "x", steps: [{ entity: "light.gone", on: false }], time: "20:00", days: "every" },
    { type: "scene-at", name: "x", steps: [{ entity: "light.desk_lamp", on: false }], time: "20:00", days: "sometimes" },
  ];
  for (const raw of bad) assert.equal(validateRecipe(raw, world).ok, false, JSON.stringify(raw));
  const noSun = { states: Object.fromEntries(Object.entries(STATES).filter(([k]) => k !== "sun.sun")), notify: [] };
  assert.equal(validateRecipe({ type: "curtains-sun", covers: ["cover.living_blind"], elevation: 30 }, noSun).ok, false, "no sun entity, no sun rule");
});

test("a scene automation carries every call of the scene", () => {
  const r = ok({ type: "scene-at", name: "Bedtime", steps: [{ entity: "light.living_main", on: false }, { entity: "cover.living_blind", position: 0 }, { entity: "media_player.living_tv", on: true, volume: 20 }], time: "23:00", days: "weekend" });
  const { config } = buildAutomation(r, "doshy_scene_at_1", name);
  assert.deepEqual(config.condition, [{ condition: "time", weekday: ["sat", "sun"] }]);
  assert.deepEqual(config.action.map((a) => (isRecord(a) ? a.service : null)), ["light.turn_off", "cover.close_cover", "media_player.turn_on", "media_player.volume_set"]);
});

test("ids are doshy_ plus letters, digits and underscores only", () => {
  assert.match(automationId("light-off-no-motion", "A1b2-c3"), /^doshy_light_off_no_motion_1b2c3$/);
  for (const id of ["automation.x", "doshy", "doshy_", "Doshy_a", "doshy_a b", "x_doshy_a", `doshy_${"a".repeat(80)}`]) assert.equal(AUTOMATION_ID.test(id), false, id);
});
