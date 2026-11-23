import test from "node:test";
import assert from "node:assert/strict";
import { filterRows, roomDevices, deviceRows, zoneDeviceRows, DEVICE_TYPES } from "./roomDevices.ts";
import { zoneOf } from "./roomIsolate.ts";
import type { HAState } from "./ha.ts";
import type { Item, Plan, Room } from "./types.ts";

const room = (id: string, x: number): Room => ({ id, name: id, x, y: 0, w: 4, h: 4, color: "#fff", floor: "wood" });
const item = (id: string, kind: string, entity?: string, x = 1): Item => ({ id, kind, x, y: 1, rot: 0, w: 1, d: 1, h: 1, entity });
const st = (entity_id: string, state: string, attributes: HAState["attributes"] = {}): [string, HAState] => [entity_id, { entity_id, state, attributes }];

const living = room("living", 0);
const plan = (items: Item[]): Plan => ({ walls: [], openings: [], rooms: [living, room("kitchen", 10)], items });

const items = [
  item("a", "ceiling_light", "light.ceiling"),
  item("b", "ceiling_light", "switch.lamp_plug"), // smart switch driving a light fixture => Lights
  item("c", "ac", "climate.ac"),
  item("d", "besta_tv", "media_player.tv"),
  item("e", "marker", "binary_sensor.window"),
  item("f", "marker", "binary_sensor.leak"),
  item("g", "sec_cam_dome_ceiling", "camera.hall"),
  item("h", "washer", "vacuum.robot"),
  item("i", "ektorp", "fan.desk"),
  item("j", "ektorp"), // no entity: skipped
  item("k", "ektorp", "light.kitchen", 11), // other room
];
const states = Object.fromEntries([
  st("light.ceiling", "on", { brightness: 128, friendly_name: "Ceiling" }),
  st("switch.lamp_plug", "off", { friendly_name: "Lamp plug" }),
  st("climate.ac", "cool", { current_temperature: 21.5, friendly_name: "AC" }),
  st("media_player.tv", "playing", { friendly_name: "TV" }),
  st("binary_sensor.window", "off", { device_class: "window", friendly_name: "Window" }),
  st("binary_sensor.leak", "on", { device_class: "moisture", friendly_name: "Sink leak" }),
  st("camera.hall", "idle", { friendly_name: "Hall cam" }),
  st("vacuum.robot", "cleaning", { friendly_name: "Robot" }),
  st("fan.desk", "unavailable"),
]);

test("groups follow the fixed type order and skip empty groups", () => {
  const g = roomDevices(plan(items), states, living);
  assert.deepEqual(g.map((x) => x.type), [...DEVICE_TYPES]);
});

test("classifies lights, switch-lights, security, sensors and appliances", () => {
  const by = Object.fromEntries(deviceRows(plan(items), states, living).map((r) => [r.entity, r]));
  assert.equal(by["light.ceiling"].type, "lights");
  assert.equal(by["switch.lamp_plug"].type, "lights");
  assert.equal(by["camera.hall"].type, "security");
  assert.equal(by["vacuum.robot"].type, "appliances");
  assert.equal(by["fan.desk"].type, "switches");
  assert.equal(by["binary_sensor.window"].type, "sensors");
  assert.equal(by["light.kitchen"], undefined);
  assert.equal(deviceRows(plan(items), states, living).length, 9);
});

test("values are readable and toggle only for toggleable domains", () => {
  const by = Object.fromEntries(deviceRows(plan(items), states, living).map((r) => [r.entity, r]));
  assert.equal(by["light.ceiling"].value, "50%");
  assert.equal(by["switch.lamp_plug"].value, "Off");
  assert.equal(by["climate.ac"].value, "Cool · 21.5°");
  assert.equal(by["fan.desk"].value, "Unavailable");
  assert.equal(by["binary_sensor.window"].toggleable, false);
  assert.equal(by["light.ceiling"].toggleable, true);
  assert.equal(by["light.ceiling"].on, true);
});

test("alert sensors are flagged and sort first in their group", () => {
  const sensors = roomDevices(plan(items), states, living).find((g) => g.type === "sensors")!;
  assert.deepEqual(sensors.rows.map((r) => [r.name, !!r.alert]), [["Sink leak", true], ["Window", false]]);
});

test("filterRows matches name, entity and value case-insensitively; type narrows", () => {
  const rows = deviceRows(plan(items), states, living);
  assert.deepEqual(filterRows(rows, "SINK", null).map((r) => r.entity), ["binary_sensor.leak"]);
  assert.ok(filterRows(rows, "fan.", null).length === 1);
  assert.ok(filterRows(rows, "50%", null).some((r) => r.entity === "light.ceiling"));
  assert.ok(filterRows(rows, "", "lights").every((r) => r.type === "lights"));
  assert.equal(filterRows(rows, "", null).length, rows.length);
  assert.equal(filterRows(rows, "zzz", null).length, 0);
});

test("a room without linked devices is empty", () => {
  assert.deepEqual(roomDevices(plan([item("x", "ektorp")]), {}, living), []);
});

test("zone rows hold every linked device standing in the isolated footprint and nothing from other rooms", () => {
  const p = plan(items);
  const zone = zoneOf(p, "living", false)!;
  const rows = zoneDeviceRows(p, states, zone);
  assert.deepEqual(rows.map((r) => r.itemId).sort(), deviceRows(p, states, living).map((r) => r.itemId).sort());
  assert.ok(!rows.some((r) => r.itemId === "k"), "the kitchen light belongs to another room");
});

test("a two-layer window curtain lists both covers: sheer and sun-blocking, each with its own switch and opening", () => {
  const curtain: Item = { ...item("c1", "lv_sheer_curtain_door", "cover.net"), params: { blackoutEntity: "cover.velvet" } };
  const cs = Object.fromEntries([
    st("cover.net", "open", { friendly_name: "Living net", current_position: 100 }),
    st("cover.velvet", "open", { friendly_name: "Living velvet", current_position: 60 }),
  ]);
  const rows = deviceRows(plan([curtain]), cs, living);
  assert.deepEqual(rows.map((r) => [r.name, r.value, r.layer, r.toggleable, r.on]), [
    ["Living net (sheer)", "Open", "sheer", true, true],
    ["Living velvet (sun-blocking)", "60% open", "blackout", true, true],
  ]);
  assert.deepEqual(rows.map((r) => r.entity), ["cover.net", "cover.velvet"]);
  const closed = deviceRows(plan([curtain]), { ...cs, ...Object.fromEntries([st("cover.velvet", "closed", { current_position: 0 })]) }, living);
  assert.deepEqual([closed[1].value, closed[1].on], ["Closed", false]);
});

test("a curtain with only the sun-blocking cover linked lists one row; one with nothing linked lists none; a single-layer curtain needs no suffix", () => {
  const onlyBlackout: Item = { ...item("c2", "lv_sheer_curtain_door"), params: { blackoutEntity: "cover.velvet" } };
  assert.deepEqual(deviceRows(plan([onlyBlackout]), {}, living).map((r) => r.layer), ["blackout"]);
  assert.deepEqual(deviceRows(plan([item("c3", "lv_sheer_curtain_door")]), {}, living), []);
  const plain = item("c4", "curtain", "cover.plain");
  assert.deepEqual(deviceRows(plan([plain]), Object.fromEntries([st("cover.plain", "closed", { friendly_name: "Hall" })]), living).map((r) => r.name), ["Hall"]);
});

const washStates = (state: string, extra: [string, string][] = []): Record<string, HAState> =>
  Object.fromEntries([
    st("sensor.bath_washer_state", state, { friendly_name: "Washing Machine State" }),
    st("sensor.bath_washer_progress", "45"),
    st("sensor.bath_washer_time_remaining", "32", { unit_of_measurement: "min" }),
    st("binary_sensor.bath_washer_running", state === "running" ? "on" : "off"),
    st("switch.bath_washer_switch", "on", { friendly_name: "Plug" }),
    ...extra.map(([id, s]) => st(id, s)),
  ]);

test("a WashData washing machine is one Appliances row with its words and kind, whichever of its entities is linked", () => {
  const p = plan([item("w", "bt_washer", "sensor.bath_washer_state"), item("x", "washer", "binary_sensor.bath_washer_running"), item("y", "ap_dishwasher")]);
  const [a, b] = deviceRows(p, washStates("running"), living);
  assert.deepEqual([a.name, a.type, a.value, a.on, a.wash, a.toggleable, a.alert], ["Washing Machine", "appliances", "Washing - 32 min left", true, "washer", false, undefined]);
  assert.equal(b.value, a.value);
  assert.deepEqual(roomDevices(plan([item("w", "bt_washer", "sensor.bath_washer_state")]), washStates("running"), living).map((g) => g.title), ["Appliances"]);
});

test("WashData rows: finished with the laundry inside, plain finished, paused, interrupted (an alert)", () => {
  const row = (s: string) => deviceRows(plan([item("w", "bt_washer", "sensor.bath_washer_state")]), washStates(s), living)[0];
  assert.equal(row("clean").value, "Finished - laundry inside");
  assert.equal(row("finished").value, "Finished");
  assert.equal(row("user_paused").value, "Paused by you");
  assert.equal(row("idle").value, "Idle");
  assert.deepEqual([row("interrupted").value, row("interrupted").alert, row("running").alert], ["Interrupted", true, undefined]);
});

test("a washer on a plain smart plug, and a sensor that only looks like a WashData one, are listed as before", () => {
  const plug = item("p", "bt_washer", "switch.bath_washer_switch");
  assert.deepEqual(deviceRows(plan([plug]), washStates("running"), living).map((r) => [r.name, r.type, r.value, r.wash, r.toggleable]), [["Plug", "switches", "On", undefined, true]]);
  const stray = item("s", "marker", "sensor.download_progress");
  const rows = deviceRows(plan([stray]), Object.fromEntries([st("sensor.download_progress", "50", { friendly_name: "Download" })]), living);
  assert.deepEqual([rows[0].type, rows[0].wash], ["sensors", undefined]);
});
