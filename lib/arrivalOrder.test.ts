import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GAP_MS, MAX_ARRIVAL_STEPS } from "./arrival.ts";
import { BRIGHTNESS, defaultEntrance, entranceChoices, entrancePlace, lightSpots, orderArrivalSteps } from "./arrivalOrder.ts";
import { HOUSE } from "./arrivalFixture.ts";
import type { Plan } from "./types.ts";

const FRONT = { openingId: "front" };
const order = (plan: Plan, entrance: Parameters<typeof orderArrivalSteps>[1], opts: Parameters<typeof orderArrivalSteps>[2] = {}) => orderArrivalSteps(plan, entrance, opts).map((s) => s.entity.replace("light.", ""));

test("the ways in are the doors that lead outside, garden gates and where the street starts; a door between two rooms is not one", () => {
  assert.deepEqual(entranceChoices(HOUSE).map((c) => c.label), ["Door in Hall", "Garden gate", "The street: start of Street"]);
  assert.deepEqual(defaultEntrance(HOUSE), FRONT);
  assert.deepEqual(entrancePlace(HOUSE, FRONT), { x: -0.06, y: 2, level: "L0" });
  assert.equal(entrancePlace(HOUSE, { openingId: "gone" }), null);
  assert.deepEqual(entrancePlace(HOUSE, { x: 1, y: 2 }), { x: 1, y: 2, level: "L0" });
  assert.equal(defaultEntrance({ ...HOUSE, openings: [] }), undefined);
});

test("the lights are the plan's light.* entities, once each, outside or in a room", () => {
  const spots = lightSpots(HOUSE);
  assert.deepEqual(spots.map((s) => s.entity), ["light.hall", "light.study", "light.living", "light.kitchen", "light.path_far", "light.path_near"]);
  assert.deepEqual(spots.filter((s) => s.outdoors).map((s) => s.entity), ["light.path_far", "light.path_near"]);
  assert.equal(spots.find((s) => s.entity === "light.hall")?.entry, true, "a room called Hall is an entry room");
  assert.equal(spots.find((s) => s.entity === "light.living")?.entry, false);
});

test("from the front door: the garden path from the street to the door, the hall, then rooms by how far it is to WALK, the farthest last", () => {
  // the study is 4 m from the door on the map but its only door is in the living room, so it is farther on foot than the living room
  assert.deepEqual(order(HOUSE, FRONT), ["path_far", "path_near", "hall", "living", "study", "kitchen"]);
});

test("from a gate or the street the garden lights run on from it", () => {
  assert.deepEqual(order(HOUSE, { openingId: "gate" }).slice(0, 2), ["path_far", "path_near"]);
  assert.deepEqual(order(HOUSE, { x: -1, y: 2 }).slice(0, 2), ["path_near", "path_far"]);
});

test("the room the person usually goes to comes last: chosen by hand, or the one whose lights are used most", () => {
  assert.equal(order(HOUSE, FRONT, { finishRoomId: "hall" }).at(-1), "hall");
  assert.deepEqual(order(HOUSE, FRONT, { usage: { "light.living": 600, "light.kitchen": 30 } }), ["path_far", "path_near", "hall", "study", "kitchen", "living"]);
  assert.deepEqual(order(HOUSE, FRONT, { usage: {} }), order(HOUSE, FRONT), "no history: the walking order stands");
});

test("the first light comes on at once, the rest after the gap; brightness by place; only the lights asked for", () => {
  const steps = orderArrivalSteps(HOUSE, FRONT);
  assert.deepEqual(steps.map((s) => s.delayMs), [0, DEFAULT_GAP_MS, DEFAULT_GAP_MS, DEFAULT_GAP_MS, DEFAULT_GAP_MS, DEFAULT_GAP_MS]);
  assert.deepEqual(steps.map((s) => s.brightness), [BRIGHTNESS.outdoor, BRIGHTNESS.outdoor, BRIGHTNESS.entry, BRIGHTNESS.rest, BRIGHTNESS.rest, BRIGHTNESS.rest]);
  assert.ok(steps.every((s) => s.on === true));
  assert.deepEqual(orderArrivalSteps(HOUSE, FRONT, { gapMs: 800, entities: ["light.kitchen", "light.hall"] }).map((s) => [s.entity, s.delayMs]), [["light.hall", 0], ["light.kitchen", 800]]);
});

test("the distance comes from the walker; where it knows no way the straight line is used", () => {
  const far: Record<string, number> = { "1.5,2": 50, "5.5,2": 1 }; // the hall light is "farther" than the living room's
  const calls: string[] = [];
  const walk = (_from: unknown, to: { x: number; y: number }, level: string) => {
    calls.push(level);
    return far[`${to.x},${to.y}`] ?? null;
  };
  assert.deepEqual(order(HOUSE, FRONT, { walk, finishRoomId: "none" }).slice(2), ["hall", "living", "study", "kitchen"], "the hall stays first (entry room); then the walker's metres, the straight line where it says null");
  assert.ok(calls.length >= 4 && calls.every((l) => l === "L0"));
});

test("lights on another storey come after everything on the entrance's own", () => {
  const upstairs: Plan = {
    ...HOUSE,
    levels: [{ id: "L0", name: "Ground", elevation: 0, height: 2.7 }, { id: "L1", name: "Up", elevation: 2.8, height: 2.7 }],
    rooms: [...HOUSE.rooms, { id: "bed", name: "Bedroom", x: 0, y: 0, w: 3, h: 4, color: "#888888", floor: "wood", level: "L1" }],
    items: [...HOUSE.items, { id: "l9", kind: "test_light", x: 1, y: 1, rot: 0, w: 0.3, d: 0.3, h: 0.3, entity: "light.bedroom", level: "L1" }],
  };
  assert.equal(order(upstairs, FRONT).at(-1), "bedroom", "the farthest room finishes the walk");
  assert.equal(order(upstairs, FRONT, { finishRoomId: "kit" }).at(-1), "kitchen");
});

test("a plan with a great many lights is cut to 30 steps and still ends in the finishing room", () => {
  const items = Array.from({ length: 45 }, (_, i) => ({ id: `m${i}`, kind: "test_light", x: 1 + (i % 5) * 0.4, y: 1 + Math.floor(i / 5) * 0.3, rot: 0, w: 0.3, d: 0.3, h: 0.3, entity: `light.hall_${i}` }));
  const steps = orderArrivalSteps({ ...HOUSE, items: [...HOUSE.items, ...items] }, FRONT, { finishRoomId: "kit" });
  assert.equal(steps.length, MAX_ARRIVAL_STEPS);
  assert.equal(steps.at(-1)?.entity, "light.kitchen");
});

test("no entrance and no doors still gives an order", () => {
  const steps = orderArrivalSteps({ ...HOUSE, openings: [] }, undefined);
  assert.equal(steps.length, 6);
  assert.equal(steps[0].delayMs, 0);
});
