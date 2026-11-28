import assert from "node:assert/strict";
import test from "node:test";
import { closedValves, shutoffTarget, suggestShutoff, valveState } from "./utilitiesShutoff.ts";
import type { HAState } from "./ha.ts";
import type { Plan } from "./types.ts";

const plan: Plan = {
  walls: [], openings: [],
  rooms: [{ id: "kitchen", name: "Kitchen", x: 0, y: 0, w: 5, h: 4, floor: "tile", color: "#fff" }],
  items: [
    { id: "sensor", kind: "sensor", entity: "binary_sensor.leak", x: 4, y: 1, w: .1, d: .1, h: .1, rot: 0 },
    { id: "main", kind: "ut_water_main", entity: "valve.main", x: 0, y: 1, w: .2, d: .2, h: .2, rot: 0 },
  ],
  utilities: [{ id: "supply", kind: "cold", pts: [{ x: 0, y: 1 }, { x: 4, y: 1 }] }],
};
const state = (value: string): Record<string, HAState> => ({ "valve.main": { entity_id: "valve.main", state: value, attributes: {} } });

test("a moving valve never counts as a confirmed shutoff or safe reopening", () => {
  for (const value of ["closing", "opening", "unavailable", "unknown"]) {
    assert.equal(valveState("valve.main", state(value)), "unknown");
    assert.equal(closedValves(plan, state(value)).size, 0);
    assert.equal(suggestShutoff(plan, state(value), { medium: "water", itemId: "sensor" })?.reopen.length, 0);
  }
  assert.equal(suggestShutoff(plan, state("closed"), { medium: "water", itemId: "sensor" })?.reopen[0]?.entity, "valve.main");
});

test("external shutoff suggestions resolve only placed sensors or rooms and infer the safety medium", () => {
  assert.deepEqual(shutoffTarget(plan, {}, "binary_sensor.leak"), { medium: "water", alert: "leak", itemId: "sensor" });
  assert.deepEqual(shutoffTarget(plan, {}, "KITCHEN"), { medium: "water", alert: "leak", roomId: "kitchen" });
  assert.equal(shutoffTarget(plan, {}, "switch.unplaced"), null);
  for (const [device_class, alert] of [["smoke", "smoke"], ["gas", "gas"], ["carbon_monoxide", "co"]]) {
    const states = { "binary_sensor.leak": { entity_id: "binary_sensor.leak", state: "on", attributes: { device_class } } };
    assert.deepEqual(shutoffTarget(plan, states, "sensor"), { medium: "gas", alert, itemId: "sensor" });
  }
});
