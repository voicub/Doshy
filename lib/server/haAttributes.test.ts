import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanAttribute, KNOWN_ATTRIBUTES } from "./haAttributes.ts";
import { keepFor, shapeStates } from "./haStates.ts";

test("a value of the wrong type is dropped, one of the right type passes", () => {
  assert.equal(cleanAttribute("friendly_name", "Hall"), "Hall");
  assert.equal(cleanAttribute("friendly_name", 5), undefined);
  assert.equal(cleanAttribute("current_temperature", 21.5), 21.5);
  assert.equal(cleanAttribute("current_temperature", "unavailable"), undefined);
  assert.equal(cleanAttribute("current_temperature", Infinity), undefined);
  assert.equal(cleanAttribute("current_temperature", null), undefined);
  assert.equal(cleanAttribute("is_volume_muted", "yes"), undefined);
  assert.equal(cleanAttribute("in_progress", 40), 40);
});

test("a number an integration sent as text is read as the number", () => {
  assert.equal(cleanAttribute("temperature", "21.5"), 21.5);
  assert.equal(cleanAttribute("temperature", " "), undefined);
  assert.equal(cleanAttribute("temperature", "1e999"), undefined);
});

test("lists and pairs keep their shape", () => {
  assert.deepEqual(cleanAttribute("source_list", ["tv", 3, "hdmi"]), ["tv", "hdmi"]);
  assert.equal(cleanAttribute("source_list", "tv"), undefined);
  assert.deepEqual(cleanAttribute("rgb_color", [255, 0, 10]), [255, 0, 10]);
  assert.equal(cleanAttribute("rgb_color", [255, 0]), undefined);
  assert.equal(cleanAttribute("hs_color", ["a", 1]), undefined);
  assert.deepEqual(cleanAttribute("position", { x: 1, y: 2, z: 3 }), { x: 1, y: 2 });
  assert.deepEqual(cleanAttribute("position", [1, 2]), [1, 2]);
  assert.equal(cleanAttribute("position", { x: "1", y: 2 }), undefined);
});

test("an attribute the dashboard does not know is dropped", () => {
  assert.equal(cleanAttribute("secret_blob", "x"), undefined);
  assert.equal(cleanAttribute("constructor", "x"), undefined);
});

test("every attribute the lists forward is one the dashboard can check", () => {
  for (const id of ["light.a", "media_player.a", "vacuum.a", "update.a", "select.w_cycle_program"]) {
    for (const key of keepFor(id)) assert.ok(KNOWN_ATTRIBUTES.includes(key), `${id}: ${key} has no kind in haAttributes.ts`);
  }
});

test("a mistyped reading cannot reach the dashboard, and an entry without a text state is skipped", () => {
  const out = shapeStates([
    { entity_id: "climate.hall", state: "heat", attributes: { current_temperature: "unavailable", temperature: "22", hvac_modes: "heat", friendly_name: 7 } },
    { entity_id: "sensor.bad", state: null, attributes: {} },
    { entity_id: 5, state: "on", attributes: {} },
    { entity_id: "sensor.noattr", state: "1", attributes: null },
    null,
  ]);
  assert.deepEqual(out.map((s) => s.entity_id), ["climate.hall", "sensor.noattr"]);
  assert.deepEqual(out[0].attributes, { temperature: 22 });
  assert.deepEqual(out[1].attributes, {});
});
