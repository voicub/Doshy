import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "./catalog.ts";
import { DEFAULT_AMBIENT, HEAT_KINDS, MAX_SOURCES, PER_SOURCE, PLUMES, bendOf, burningItems, flicker, heatKindOf, heatPoint, isHeatActive, newPuff, plumeAt, puffAge, restoreAmbient } from "./ambient.ts";

test("switches, lights, fans, booleans and binary sensors burn when on", () => {
  for (const d of ["switch", "light", "fan", "input_boolean", "binary_sensor"]) {
    assert.equal(isHeatActive(d, "on", undefined), true, d);
    assert.equal(isHeatActive(d, "off", undefined), false, d);
    assert.equal(isHeatActive(d, "unavailable", undefined), false, d);
  }
});

test("a thermostat burns while it reports heating, or is set to heat when it does not report", () => {
  assert.equal(isHeatActive("climate", "heat", { hvac_action: "heating" }), true);
  assert.equal(isHeatActive("climate", "heat", { hvac_action: "idle" }), false);
  assert.equal(isHeatActive("climate", "off", { hvac_action: "heating" }), true, "the report wins");
  assert.equal(isHeatActive("climate", "heat", {}), true);
  assert.equal(isHeatActive("climate", "heat", undefined), true);
  assert.equal(isHeatActive("climate", "cool", {}), false);
  assert.equal(isHeatActive("climate", "off", { hvac_action: 3 }), false);
});

test("a water heater burns in every mode but off", () => {
  for (const m of ["heat_pump", "electric", "gas", "eco", "performance", "high_demand"]) assert.equal(isHeatActive("water_heater", m, undefined), true, m);
  for (const m of ["off", "unavailable", "unknown", ""]) assert.equal(isHeatActive("water_heater", m, undefined), false, m);
  assert.equal(isHeatActive("water_heater", "constructor", undefined), true, "a state word is not looked up on the prototype");
});

test("other domains say nothing about a fire", () => {
  for (const d of ["sensor", "person", "device_tracker", "cover", "media_player", ""]) assert.equal(isHeatActive(d, "on", { hvac_action: "heating" }), false, d);
});

test("every burning kind is a real catalog piece with its flue and fire inside it", () => {
  for (const [kind, h] of Object.entries(HEAT_KINDS)) {
    const def = CATALOG[kind];
    assert.ok(def, kind);
    assert.ok(h.flue || h.flame, kind);
    for (const p of [h.flue, h.flame?.at]) if (p) assert.ok(Math.abs(p[0]) <= def.w && Math.abs(p[2]) <= def.d && p[1] >= 0 && p[1] <= def.h + 1e-9, `${kind} ${p}`);
  }
  assert.equal(heatKindOf("constructor"), undefined);
  assert.equal(heatKindOf("sofa"), undefined);
});

test("burning pieces: a burning kind with a linked, active entity", () => {
  const items = [
    { id: "a", kind: "ap_woodstove", entity: "switch.stove" },
    { id: "b", kind: "ap_woodstove", entity: "switch.cold" },
    { id: "c", kind: "ap_woodstove" },
    { id: "d", kind: "sofa", entity: "switch.stove" },
    { id: "e", kind: "dc_fireplace_stone", entity: "climate.hearth" },
    { id: "f", kind: "out_fire_pit", entity: "switch.missing" },
  ];
  const states = {
    "switch.stove": { state: "on", attributes: {} },
    "switch.cold": { state: "off", attributes: {} },
    "climate.hearth": { state: "heat", attributes: { hvac_action: "heating" } },
  };
  assert.deepEqual(burningItems(items, states).map((i) => i.id), ["a", "e"]);
});

test("a point of a piece follows the item's size, turn and floor", () => {
  const def = { w: 1, d: 1, h: 2 };
  const at = (rot: number) => heatPoint({ x: 10, y: 20, rot, w: 2, d: 1, h: 2 }, def, [0.5, 1, 0.5], 3);
  assert.deepEqual(at(0).map((v) => Math.round(v * 1e6) / 1e6), [11, 4, 20.5]);
  // a quarter turn clockwise in plan (+z down the page): the piece's right side faces +z and its front (+z) points to -x
  const q = at(90).map((v) => Math.round(v * 1e6) / 1e6);
  assert.deepEqual(q, [9.5, 4, 21]);
  assert.equal(heatPoint({ x: 0, y: 0, rot: 0, w: 1, d: 1, h: 2, elev: 0.5 }, def, [0, 2, 0], 0)[1], 2.5);
});

test("smoke rises and fades, leans downwind only when it is windy, and stays within a few metres", () => {
  const p = newPuff();
  const at = (u: number, bend: number) => ({ ...plumeAt(p, u, 0.3, bend, 1, 0) });
  assert.equal(at(0, 0).y, 0);
  assert.equal(at(0, 0).alpha, 0);
  assert.equal(at(1, 0).alpha, 0);
  assert.ok(at(0.5, 0).y > at(0.2, 0).y && at(0.9, 0).y > at(0.5, 0).y);
  assert.ok(at(0.8, 0).size > at(0.1, 0).size);
  const calm = at(0.8, 0);
  const gale = at(0.8, 1);
  assert.ok(Math.abs(calm.x) < 0.1 && Math.abs(calm.z) < 0.1, "calm air: straight up");
  assert.ok(gale.x > 1 && Math.abs(gale.z) < 0.1, "a strong wind from the west blows it east");
  assert.ok(gale.y === calm.y);
  for (let u = 0; u < 1; u += 0.01) {
    const s = at(u, 1);
    assert.ok(s.alpha >= 0 && s.alpha <= PLUMES.smoke.alpha && s.y <= PLUMES.smoke.rise + 1e-9 && s.x <= 2, `u=${u}`);
  }
  assert.ok(Math.max(...[0.15, 0.3, 0.5].map((u) => at(u, 0).alpha)) > at(0.9, 0).alpha, "thinner higher up");
});

test("a boiler's vapour is whiter, sparser, shorter and thinner than stove smoke, and the whole scene stays within 24 puffs", () => {
  assert.equal(heatKindOf("kt_boiler")?.plume, "vapour");
  assert.equal(heatKindOf("kt_boiler")?.flame, undefined, "no flame glow on a boiler");
  const { smoke, vapour } = PLUMES;
  assert.ok(vapour.white > smoke.white && vapour.puffs < smoke.puffs && vapour.rise < smoke.rise && vapour.alpha < smoke.alpha);
  const p = newPuff();
  for (let u = 0.05; u < 1; u += 0.05) {
    plumeAt(p, u, 0.2, 0, 1, 0, vapour);
    assert.ok(p.y <= vapour.rise + 1e-9 && p.alpha <= vapour.alpha + 1e-9 && p.size > 0);
  }
  assert.ok(smoke.puffs <= PER_SOURCE && vapour.puffs <= PER_SOURCE);
  assert.ok(smoke.puffs * MAX_SOURCES <= 24);
  const big = plumeAt(newPuff(), 0.5, 0.3, 0, 1, 0, smoke);
  assert.ok(big.size >= 0.5 && big.y >= 1.5, "stove smoke is big enough and rises far enough to read from the iso camera");
});

test("a boiler burns on a heating thermostat, a running water heater or a switch", () => {
  const items = [{ id: "b1", kind: "kt_boiler", entity: "climate.boiler" }, { id: "b2", kind: "kt_boiler", entity: "water_heater.dhw" }, { id: "b3", kind: "kt_boiler", entity: "binary_sensor.flame" }, { id: "b4", kind: "kt_boiler", entity: "climate.idle" }];
  const states = {
    "climate.boiler": { state: "heat", attributes: { hvac_action: "heating" } },
    "water_heater.dhw": { state: "gas", attributes: {} },
    "binary_sensor.flame": { state: "on", attributes: {} },
    "climate.idle": { state: "heat", attributes: { hvac_action: "idle" } },
  };
  assert.deepEqual(burningItems(items, states).map((i) => i.id), ["b1", "b2", "b3"]);
});

test("puffs are spread along the plume and age steadily", () => {
  const ages = Array.from({ length: PER_SOURCE }, (_, i) => puffAge(0, i, PER_SOURCE, 0));
  assert.deepEqual([...ages].sort(), ages);
  assert.ok(new Set(ages).size === PER_SOURCE);
  for (const t of [0, 1.3, 7, 1e5, -4]) for (let i = 0; i < PER_SOURCE; i++) assert.ok(puffAge(t, i, PER_SOURCE, 0.9) >= 0 && puffAge(t, i, PER_SOURCE, 0.9) < 1);
  const a = puffAge(1, 0, PER_SOURCE, 0);
  const b = puffAge(1.5, 0, PER_SOURCE, 0);
  assert.ok(Math.abs(((b - a + 1) % 1) - 0.5 / 6) < 1e-9, "a puff ages by dt / life");
  assert.equal(bendOf(0), 0);
  assert.equal(bendOf(100), 1);
});

test("the flame flickers within its range", () => {
  let lo = 1;
  let hi = 0;
  for (let t = 0; t < 30; t += 0.05) {
    const f = flicker(t, 0.4);
    lo = Math.min(lo, f);
    hi = Math.max(hi, f);
  }
  assert.ok(lo >= 0.55 - 1e-9 && hi <= 1 + 1e-9 && hi - lo > 0.3);
});

test("settings: stored values are validated, anything else is the default", () => {
  assert.deepEqual(restoreAmbient({ smoke: false }), { smoke: false });
  assert.deepEqual(restoreAmbient({ smoke: true }), { smoke: true });
  for (const junk of [undefined, null, 3, "off", [], { smoke: "no" }, { smoke: 0 }, {}]) assert.deepEqual(restoreAmbient(junk), DEFAULT_AMBIENT);
  assert.equal(DEFAULT_AMBIENT.smoke, true);
});
