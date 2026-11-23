import assert from "node:assert/strict";
import { test } from "node:test";
import type { HAState } from "./ha.ts";
import { mergeStates, selectStates } from "./statesMerge.ts";

const st = (id: string, state: string, attributes: HAState["attributes"] = {}): HAState => ({ entity_id: id, state, attributes, last_changed: "t0" });
const map = (...l: HAState[]): Record<string, HAState> => Object.fromEntries(l.map((e) => [e.entity_id, e]));

test("a poll that changed nothing returns the very same map", () => {
  const prev = map(st("light.a", "on", { options: ["x", "y"] }), st("sensor.b", "3"));
  const next = mergeStates(prev, [st("light.a", "on", { options: ["x", "y"] }), st("sensor.b", "3")]);
  assert.equal(next, prev);
});

test("only the entity that changed gets a new object", () => {
  const prev = map(st("light.a", "on"), st("sensor.b", "3"));
  const next = mergeStates(prev, [st("light.a", "on"), st("sensor.b", "4")]);
  assert.notEqual(next, prev);
  assert.equal(next["light.a"], prev["light.a"]);
  assert.equal(next["sensor.b"].state, "4");
});

test("an attribute change counts, so does a new last_changed", () => {
  const prev = map(st("media_player.m", "playing", { volume_level: 0.2 }));
  assert.equal(mergeStates(prev, [st("media_player.m", "playing", { volume_level: 0.3 })])["media_player.m"].attributes.volume_level, 0.3);
  assert.notEqual(mergeStates(prev, [{ ...st("media_player.m", "playing", { volume_level: 0.2 }), last_changed: "t1" }]), prev);
});

test("an entity that appears or disappears is a change", () => {
  const prev = map(st("light.a", "on"), st("light.b", "off"));
  assert.deepEqual(Object.keys(mergeStates(prev, [st("light.a", "on")])), ["light.a"]);
  const swapped = mergeStates(prev, [st("light.a", "on"), st("light.c", "off")]);
  assert.deepEqual(Object.keys(swapped), ["light.a", "light.c"]);
  assert.equal(mergeStates({}, []).constructor, Object);
});

test("selectStates derives once per map, not once per call", () => {
  let runs = 0;
  const count = selectStates((s) => (runs++, Object.keys(s).length));
  const a = map(st("light.a", "on"));
  assert.equal(count({ states: a }), 1);
  assert.equal(count({ states: a }), 1);
  assert.equal(runs, 1);
  assert.equal(count({ states: map(st("light.a", "on"), st("light.b", "on")) }), 2);
  assert.equal(runs, 2);
});
