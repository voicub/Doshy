import assert from "node:assert/strict";
import { test } from "node:test";
import { guestPlan, guestStates } from "./guestPlan.ts";

/** Any text that looks like a Home Assistant entity id (`light.kitchen_ceiling`) anywhere in a value. */
const ENTITY_IN_TEXT = /"[a-z][a-z0-9_]{0,40}\.(?!g\d)[a-z0-9_]{1,100}"/;

/** A plan with a private thing in every place the plan can hold one. */
const home = () => ({
  walls: [{ id: "w1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, style: "plaster" }],
  openings: [{ id: "o1", wallId: "w1", t: 0.5, width: 1, type: "door", sill: 0, height: 2, entity: "binary_sensor.front_door" }],
  rooms: [
    { id: "r1", name: "Kitchen", x: 0, y: 0, w: 4, h: 3, color: "#fff", floor: "wood", tempEntity: "sensor.kitchen_temp", humidityEntity: "sensor.kitchen_rh", presenceEntities: ["binary_sensor.kitchen_motion"], powerEntities: ["sensor.oven_w"], areas: ["kitchen_area_id"] },
  ],
  items: [
    { id: "i1", kind: "lamp", x: 1, y: 1, rot: 0, w: 1, d: 1, h: 1, entity: "light.kitchen_ceiling", locked: true, params: { speed: 3, tint: "#aabbcc", stream: "rtsp://camera.local/live", cam: "camera.driveway", note: "x".repeat(200) } },
    { id: "i2", kind: "tv", x: 2, y: 2, rot: 0, w: 1, d: 1, h: 1, entity: "media_player.living_tv" },
    { id: "i3", kind: "lamp", x: 3, y: 1, rot: 0, w: 1, d: 1, h: 1, entity: "light.kitchen_ceiling" },
  ],
  levels: [{ id: "ground", name: "Ground", elevation: 0, height: 2.8 }],
  building: { type: "house", name: "Number 5" },
  bearing: 40,
  site: { source: "manual", lat: 52.1234, lon: 4.5678, dx: 0, dy: 0, enabled: true, radius: 200 },
  scenes: [{ id: "s", name: "Movie", icon: "movie", steps: [{ entity: "light.kitchen_ceiling" }] }],
  annotations: [{ id: "a", kind: "note", text: "alarm code 1234" }],
  trace: { resourceId: "img_secret", scale: 1 },
  flows: [{ id: "f", from: "i1", to: "i2", entity: "sensor.grid_power" }],
  added: ["extra"],
});

const withoutLive = { location: false, live: false };

test("by default a guest gets the building and none of the owner's private parts: no device links, scenes, notes, picture, flows, coordinates or direction", () => {
  const { plan, entities } = guestPlan(home(), withoutLive);
  const out = JSON.stringify(plan);
  assert.doesNotMatch(out, ENTITY_IN_TEXT, "no entity id anywhere");
  for (const secret of ["kitchen_area_id", "alarm code", "img_secret", "52.1234", "rtsp://", "grid_power", "Movie", "bearing"]) assert.ok(!out.includes(secret), secret);
  for (const part of ["scenes", "annotations", "trace", "flows", "added", "site", "bearing"]) assert.ok(!(part in plan), part);
  assert.equal(entities.size, 0);
  assert.equal(plan.walls.length, 1);
  assert.equal(plan.rooms[0].name, "Kitchen");
  assert.equal(plan.items.length, 3);
  assert.equal(plan.items[0].kind, "lamp");
  assert.deepEqual(plan.levels, home().levels);
  assert.equal(plan.building?.name, "Number 5");
});

test("a plan part that is not listed is private by default (a field added to the plan later does not leak through)", () => {
  const { plan } = guestPlan({ ...home(), shoppingList: ["a"], alarm: { code: "1234" } }, withoutLive);
  assert.ok(!("shoppingList" in plan) && !("alarm" in plan));
});

test("item options keep plain values (a colour, a number) and lose addresses, device ids and long text; the editing lock goes too", () => {
  const [lamp] = guestPlan(home(), withoutLive).plan.items;
  assert.deepEqual(lamp.params, { speed: 3, tint: "#aabbcc" });
  assert.ok(!("locked" in lamp));
});

test("'show the real home location' brings the coordinates, direction and surroundings back, and only that", () => {
  const { plan } = guestPlan(home(), { location: true, live: false });
  assert.equal(plan.site?.lat, 52.1234);
  assert.equal(plan.bearing, 40);
  assert.ok(!("scenes" in plan) && !("annotations" in plan));
  assert.doesNotMatch(JSON.stringify(plan), ENTITY_IN_TEXT);
});

test("with live states the device links are made-up ids: the same one for the same device, the real kind of device, never the real name", () => {
  const { plan, entities } = guestPlan(home(), { location: false, live: true });
  assert.doesNotMatch(JSON.stringify(plan), ENTITY_IN_TEXT);
  assert.equal(plan.items[0].entity, plan.items[2].entity, "one device, one made-up id");
  assert.match(String(plan.items[0].entity), /^light\.g\d+$/);
  assert.match(String(plan.items[1].entity), /^media_player\.g\d+$/);
  assert.match(String(plan.openings[0].entity), /^binary_sensor\.g\d+$/);
  assert.match(String(plan.rooms[0].tempEntity), /^sensor\.g\d+$/);
  assert.equal(plan.rooms[0].presenceEntities?.length, 1);
  assert.ok(!("areas" in plan.rooms[0]));
  assert.equal(entities.get(String(plan.items[0].entity)), "light.kitchen_ceiling");
  assert.equal(entities.size, 7);
});

test("garbage in the stored plan cannot get through: odd types, prototype keys and entity-looking nonsense", () => {
  const raw = JSON.parse('{"walls":"x","items":[{"id":"i","kind":"a","x":1,"y":1,"rot":0,"w":1,"d":1,"h":1,"entity":{"a":1},"params":{"__proto__":"x","a":["light.x"]}},5,null],"rooms":[{"name":"n","tempEntity":7,"presenceEntities":"sensor.a"}],"__proto__":{"polluted":true},"building":[1]}');
  const { plan } = guestPlan(raw, { location: true, live: true });
  assert.deepEqual(plan.walls, []);
  assert.equal(plan.items.length, 1);
  assert.ok(!plan.items[0].entity);
  assert.equal(plan.items[0].params, undefined);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.deepEqual(guestPlan(null, withoutLive).plan, { walls: [], openings: [], rooms: [], items: [] });
});

test("live states: made-up id -> a state word or a number, a few numbers and the unit; no names, titles, pictures or places", () => {
  const entities = new Map([["light.g1", "light.kitchen_ceiling"], ["sensor.g2", "sensor.kitchen_temp"], ["media_player.g3", "media_player.living_tv"], ["sensor.g4", "sensor.mum_location"], ["sensor.g5", "sensor.gone"]]);
  const list = [
    { entity_id: "light.kitchen_ceiling", state: "on", attributes: { brightness: 200, rgb_color: [255, 200, 100], friendly_name: "Mum's lamp", entity_picture: "/api/x" } },
    { entity_id: "sensor.kitchen_temp", state: "21.5", attributes: { unit_of_measurement: "°C", device_class: "temperature", friendly_name: "Kitchen" } },
    { entity_id: "media_player.living_tv", state: "playing", attributes: { media_title: "Secret film", source: "HDMI" } },
    { entity_id: "sensor.mum_location", state: "Mum is at her lover's house", attributes: {} },
    { entity_id: "light.not_in_plan", state: "on", attributes: {} },
  ];
  const out = guestStates(entities, list);
  assert.deepEqual(out["light.g1"], { entity_id: "light.g1", state: "on", attributes: { brightness: 200, rgb_color: [255, 200, 100] } });
  assert.deepEqual(out["sensor.g2"].attributes, { unit_of_measurement: "°C", device_class: "temperature" });
  assert.equal(out["sensor.g2"].state, "21.5");
  assert.equal(out["media_player.g3"].state, "playing");
  assert.deepEqual(out["media_player.g3"].attributes, {});
  assert.equal(out["sensor.g4"].state, "unknown");
  assert.ok(!("sensor.g5" in out), "a device that does not report is simply absent");
  const text = JSON.stringify(out);
  for (const secret of ["Mum", "Secret", "kitchen", "/api/x", "HDMI", "not_in_plan"]) assert.ok(!text.includes(secret), secret);
});
