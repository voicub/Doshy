import test from "node:test";
import assert from "node:assert/strict";
import { CAR_BODY_TYPES, CAR_COLORS, carDef, carSpec, finishOf, paintHex } from "./cars.ts";
import { CAR_TABLE } from "./cars.data.ts";
import { CARS } from "./catalog.cars.ts";

const specs = CAR_TABLE.map(carSpec);
const HEX = /^#[0-9a-f]{6}$/i;

test("the table has 80+ models and no duplicate ids", () => {
  assert.ok(specs.length >= 80, `only ${specs.length}`);
  assert.equal(new Set(specs.map((s) => s.id)).size, specs.length);
  assert.equal(Object.keys(CARS).length, specs.length);
});

test("every model is a sane car: wheelbase inside the length, sizes in range, valid body style", () => {
  const styles = new Set(CAR_BODY_TYPES.map((t) => t.id));
  for (const s of specs) {
    assert.ok(styles.has(s.bodyStyle), `${s.id} style`);
    assert.ok(s.wheelbase < s.length, `${s.id} wheelbase`);
    assert.ok(s.wheelbase > s.length * 0.45, `${s.id} wheelbase too short`);
    assert.ok(s.length >= 2.3 && s.length <= 6.1, `${s.id} length`);
    assert.ok(s.width >= 1.35 && s.width <= 2.1, `${s.id} width`);
    assert.ok(s.height >= 1.2 && s.height <= 2.6, `${s.id} height`);
  }
});

test("every body style is represented in the table", () => {
  for (const t of CAR_BODY_TYPES) assert.ok(specs.some((s) => s.bodyStyle === t.id), t.id);
});

test("footprint of the catalog item equals length x width x height, and a car carries its spec for the 3D", () => {
  for (const s of specs) {
    const d = carDef(s);
    assert.ok(Math.abs(d.d - s.length) < 0.01 && Math.abs(d.w - s.width) < 0.01 && Math.abs(d.h - s.height) < 0.01, s.id);
    assert.equal(d.car, s);
    const y1 = Math.max(...d.parts.map((p) => p.p[1] + p.s[1] / 2));
    assert.ok(y1 <= s.height + 0.005, `${s.id} coarse stand-in roof ${y1}`);
  }
});

test("the coarse stand-in parts keep the model's paint and four lights that glow", () => {
  for (const s of specs) {
    const parts = carDef(s).parts;
    const paint = parts.filter((p) => p.m);
    assert.ok(paint.length >= 1 && paint.every((p) => p.c === s.color), s.id);
    assert.ok(parts.filter((p) => p.glow).length >= 4, `${s.id} lights`);
  }
});

test("finish: a car's choice wins, the matte factory colours default to matte, everything else to gloss", () => {
  assert.equal(finishOf(undefined, "#aeb3b9"), "gloss");
  assert.equal(finishOf(undefined, "#6A6D70"), "matte");
  assert.equal(finishOf({ finish: "metallic" }, "#6a6d70"), "metallic");
  assert.equal(finishOf({ finish: "shiny" }, "#aeb3b9"), "gloss");
});

test("the paint palette has 20+ valid, distinct colours and every default resolves", () => {
  assert.ok(CAR_COLORS.length >= 20);
  for (const c of CAR_COLORS) assert.match(c.c, HEX, c.name);
  assert.equal(new Set(CAR_COLORS.map((c) => c.c)).size, CAR_COLORS.length);
  assert.equal(new Set(CAR_COLORS.map((c) => c.name)).size, CAR_COLORS.length);
  for (const s of specs) assert.match(s.color, HEX, s.id);
  assert.equal(paintHex("silver"), paintHex("Silver"));
  assert.equal(paintHex("nope"), undefined);
});
