import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, CATEGORIES } from "./catalog.ts";
import { DECOR } from "./catalog.decor.ts";
import { FLAT_MAX_H, classify } from "./placement.ts";
import { halfExtent } from "./decor/kit.ts";
import { FLOOR_T } from "./partKit.ts";

const ALLOWED = ["Living", "Bedroom", "Kitchen & dining", "Bathroom", "Office", "Lighting & devices", "Decor"];
const TOL = 0.03; // metres a part may stick out of its footprint (cushions, handles, tilted backs)
const entries = Object.entries(DECOR);

test("every decor piece has a unique dc_ id, a plain label and one of the furnishing categories", () => {
  const bad: string[] = [];
  const labels = new Set<string>();
  assert.ok(entries.length >= 80, `only ${entries.length} kinds`);
  for (const [id, d] of entries) {
    if (!/^dc_[a-z0-9_]+$/.test(id)) bad.push(`${id}: id format`);
    if (!ALLOWED.includes(d.cat) || !CATEGORIES.includes(d.cat)) bad.push(`${id}: category ${d.cat}`);
    if (d.label.length <= 3 || d.label.length > 70) bad.push(`${id}: label length`);
    if (labels.has(d.label)) bad.push(`${id}: duplicate label "${d.label}"`);
    labels.add(d.label);
    if (CATALOG[id] !== d) bad.push(`${id}: not in the shared catalog unchanged`);
  }
  assert.deepEqual(bad, []);
});

test("sizes are positive and every part sits inside the footprint and height", () => {
  const bad: string[] = [];
  for (const [id, d] of entries) {
    if (!(d.w > 0 && d.d > 0 && d.h > 0)) bad.push(`${id}: size`);
    if (d.parts.length === 0) bad.push(`${id}: no parts`);
    d.parts.forEach((p, i) => {
      if (!p.s.every((v) => v > 0 && Number.isFinite(v)) || !p.p.every(Number.isFinite)) return void bad.push(`${id} part ${i}: bad numbers`);
      const [hx, hy, hz] = halfExtent(p);
      const where = `${id} part ${i} (${p.shape ?? "box"} at ${p.p.map((v) => v.toFixed(2))} size ${p.s.map((v) => v.toFixed(2))})`;
      if (Math.abs(p.p[0]) + hx > d.w / 2 + TOL) bad.push(`${where}: outside width ${d.w}`);
      if (Math.abs(p.p[2]) + hz > d.d / 2 + TOL) bad.push(`${where}: outside depth ${d.d}`);
      const top = d.h + TOL + (d.h <= FLAT_MAX_H ? FLOOR_T : 0); // flat pieces lie on the 6 cm floor slab
      if (p.p[1] - hy < -TOL || p.p[1] + hy > top) bad.push(`${where}: outside height ${d.h}`);
    });
  }
  assert.deepEqual(bad, []);
});

test("lights have a glowing part to react with, and sit within their height", () => {
  const bad: string[] = [];
  for (const [id, d] of entries) {
    if (!d.light) continue;
    if (!d.parts.some((p) => p.glow)) bad.push(`${id}: light without glow part`);
    if (!(d.light.y > 0 && d.light.y <= d.h + TOL)) bad.push(`${id}: light.y ${d.light.y}`);
  }
  assert.deepEqual(bad, []);
});

test("each piece is placed the way it is used: ceiling fixtures hang, rugs lie flat, wall pieces stay thin", () => {
  const bad: string[] = [];
  for (const [id, d] of entries) {
    const cls = classify(d, id);
    if (cls === "ceiling" && d.h < 2.5) bad.push(`${id}: ceiling piece must reach the ceiling`);
    if (id.includes("_rug_") && cls !== "flat") bad.push(`${id}: rug is not flat`);
    if (d.wall && d.d > 0.7) bad.push(`${id}: wall piece too deep`);
    if (id.includes("curtain") && !(d.wall && d.h >= 2.3)) bad.push(`${id}: curtains hang on a wall`);
  }
  assert.deepEqual(bad, []);
});

test("seating, tables, beds and storage offer a finish the user can recolour", () => {
  const exempt = /lamp|candle|light|glass|piano|aquarium|tub|shower|bidet|clock|guitar|stove|fireplace/;
  const bad = entries
    .filter(([id, d]) => ["Living", "Bedroom", "Kitchen & dining", "Office", "Bathroom"].includes(d.cat) && !exempt.test(id) && !d.parts.some((p) => p.m))
    .map(([id]) => `${id}: no recolourable part`);
  assert.deepEqual(bad, []);
});

test("flat pieces (rugs, mats, strips) rest on the floor slab instead of sinking into it", () => {
  const flat = entries.filter(([, d]) => d.h <= FLAT_MAX_H);
  assert.ok(flat.length >= 10, "expected the rugs and mats to be flat");
  const buried = flat.filter(([, d]) => Math.min(...d.parts.map((p) => p.p[1] - halfExtent(p)[1])) < FLOOR_T - 0.001).map(([id]) => id);
  assert.deepEqual(buried, []);
});
