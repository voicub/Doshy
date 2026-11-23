import test from "node:test";
import assert from "node:assert/strict";
import { SENSORS } from "./catalog.sensors.ts";
import { bounds } from "./partKit.ts";

const defs = Object.entries(SENSORS);
const EPS = 0.012; // a glow part may stick a few mm out of its box

test("about 35 sensors, all in the Sensors category with an sn_ id", () => {
  assert.ok(defs.length >= 35);
  for (const [id, d] of defs) {
    assert.match(id, /^sn_/);
    assert.equal(d.cat, "Sensors", id);
  }
});

test("every sensor has a glowing LED or display, so it stays readable at a few centimetres", () => {
  for (const [id, d] of defs) assert.ok(d.parts.some((p) => p.glow), `${id} has no glow part`);
});

test("parts stay inside the footprint and below the item height", () => {
  for (const [id, d] of defs) {
    const b = bounds(d.parts);
    assert.ok(b.x0 >= -d.w / 2 - EPS && b.x1 <= d.w / 2 + EPS, `${id} is wider than its footprint`);
    assert.ok(b.z0 >= -d.d / 2 - EPS && b.z1 <= d.d / 2 + EPS, `${id} is deeper than its footprint`);
    assert.ok(b.y0 >= -EPS && b.y1 <= d.h + EPS, `${id} leaves its height (${b.y0.toFixed(3)}..${b.y1.toFixed(3)} vs ${d.h})`);
  }
});

test("wall pieces hang at a mounting height, ceiling pieces reach the ceiling", () => {
  for (const [id, d] of defs) {
    if (d.wall) assert.ok(d.h >= 0.3 && bounds(d.parts).y1 >= d.h - 0.04, `${id} floats away from its height`);
    if (/ceiling/.test(id)) assert.ok(d.h >= 2.5 && bounds(d.parts).y1 >= d.h - 0.02, `${id} is not at the ceiling`);
  }
});
