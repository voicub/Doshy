import assert from "node:assert/strict";
import { test } from "node:test";
import { etagMatches, forgetStates, keepFor, shapeStates, snapshotOf, statesSnapshot } from "./haStates.ts";

const raw = [
  { entity_id: "light.kitchen", state: "on", last_changed: "2026-11-22T10:00:00Z", attributes: { friendly_name: "Kitchen", brightness: 200, effect_list: ["a", "b"], icon: "mdi:x", min_color_temp_kelvin: null } },
  { entity_id: "media_player.tv", state: "playing", attributes: { friendly_name: "TV", media_title: "Show", app_name: "Netflix", secret_blob: 1 } },
  { entity_id: "sensor.power", state: "5", attributes: { app_name: "not forwarded for a sensor", unit_of_measurement: "W" } },
  { entity_id: "select.washer_cycle_program", state: "eco", attributes: { options: ["eco", "quick"], friendly_name: "Program" } },
  { entity_id: "select.other", state: "a", attributes: { options: ["a"] } },
  { entity_id: "update.core", state: "on", attributes: { latest_version: "2", installed_version: "1", junk: true } },
  { entity_id: "vacuum.robot", state: "docked", attributes: { battery_level: 80, x: 1, y: 2 } },
];

test("only the attributes the dashboard renders are forwarded, per kind of entity", () => {
  const out = Object.fromEntries(shapeStates(raw).map((s) => [s.entity_id, s]));
  assert.deepEqual(out["light.kitchen"].attributes, { friendly_name: "Kitchen", brightness: 200, icon: "mdi:x" }, "null and unknown attributes are dropped, validated MDI icons are kept");
  assert.equal(out["light.kitchen"].last_changed, "2026-11-22T10:00:00Z");
  assert.deepEqual(out["media_player.tv"].attributes, { friendly_name: "TV", media_title: "Show", app_name: "Netflix" });
  assert.deepEqual(out["sensor.power"].attributes, { unit_of_measurement: "W" });
  assert.deepEqual(out["select.washer_cycle_program"].attributes, { friendly_name: "Program", options: ["eco", "quick"] });
  assert.deepEqual(out["select.other"].attributes, {});
  assert.deepEqual(out["update.core"].attributes, { installed_version: "1", latest_version: "2" });
  assert.deepEqual(out["vacuum.robot"].attributes, { battery_level: 80, x: 1, y: 2 });
});

test("MDI attributes survive state forwarding; custom prefixes and injection strings do not", () => {
  const icons = ["mdi:lightbulb-group", "mdi:door-open", "hass:lightbulb", "mdi:../path", "mdi:<script>", `mdi:${"x".repeat(61)}`];
  assert.deepEqual(shapeStates(icons.map((icon, i) => ({ entity_id: `light.icon_${i}`, state: "on", attributes: { icon } }))).map((st) => st.attributes.icon), ["mdi:lightbulb-group", "mdi:door-open", undefined, undefined, undefined, undefined]);
});

test("the lists per kind are shared, not rebuilt per entity", () => {
  assert.equal(keepFor("sensor.a"), keepFor("light.b"));
  assert.equal(keepFor("media_player.a"), keepFor("remote.b"));
  assert.ok(keepFor("media_player.a").includes("entity_picture") && !keepFor("sensor.a").includes("entity_picture"));
});

test("something that is not a list is refused", () => {
  assert.throws(() => shapeStates({ message: "401: Unauthorized" }), /unexpected/);
});

test("the ETag follows the content", () => {
  const a = snapshotOf(raw);
  assert.equal(snapshotOf(raw).etag, a.etag);
  assert.notEqual(snapshotOf([{ ...raw[0], state: "off" }]).etag, a.etag);
  assert.deepEqual(JSON.parse(a.body), JSON.parse(JSON.stringify(shapeStates(raw))));
});

test("If-None-Match: one tag, a list of tags, weak tags and * all match; others do not", () => {
  const tag = '"abc"';
  assert.ok(etagMatches(tag, tag));
  assert.ok(etagMatches(`"x", ${tag}`, tag));
  assert.ok(etagMatches(`W/${tag}`, tag));
  assert.ok(etagMatches("*", tag));
  assert.ok(!etagMatches('"other"', tag));
  assert.ok(!etagMatches(null, tag));
});

test("concurrent readers share one fetch, and forgetStates makes the next read ask again", async () => {
  forgetStates();
  let calls = 0;
  const load = async () => (calls++, [{ entity_id: "light.a", state: calls === 1 ? "on" : "off", attributes: {} }]);
  const [a, b] = await Promise.all([statesSnapshot("main", load), statesSnapshot("main", load)]);
  assert.equal(calls, 1);
  assert.equal(a.etag, b.etag);
  forgetStates();
  const c = await statesSnapshot("main", load);
  assert.equal(calls, 2);
  assert.notEqual(c.etag, a.etag);
  forgetStates();
});

test("two homes never share a cached list or validate each other's ETag", async () => {
  forgetStates();
  const same = [{ entity_id: "light.a", state: "on", attributes: {} }];
  const loadsFor = (calls: string[], id: string) => async () => (calls.push(id), same);
  const calls: string[] = [];
  const [flat, house] = await Promise.all([statesSnapshot("main", loadsFor(calls, "main")), statesSnapshot("abc123def4", loadsFor(calls, "abc123def4"))]);
  assert.deepEqual(calls.sort(), ["abc123def4", "main"], "each home is fetched once for itself");
  assert.equal(flat.body, house.body, "the lists are identical on purpose");
  assert.notEqual(flat.etag, house.etag, "but the validators are per home");
  const again = await statesSnapshot("abc123def4", loadsFor(calls, "x"));
  assert.equal(again.etag, house.etag);
  assert.equal(calls.length, 2, "the second home's list is cached under its own key");
  forgetStates();
});
