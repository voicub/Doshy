import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "./catalog.ts";
import { SEASONAL, holidayOfKind, outOfSeason, twinkleLevel } from "./catalog.seasonal.ts";
import { bounds } from "./partKit.ts";

const entries = Object.entries(SEASONAL);

test("every seasonal piece is registered once, in the Seasonal category, with sane dimensions", () => {
  assert.ok(entries.length >= 60, `expected ~60+ kinds, got ${entries.length}`);
  for (const [kind, d] of entries) {
    assert.ok(kind.startsWith("sz_"), kind);
    assert.equal(CATALOG[kind], d, `${kind} is shadowed by another catalog`);
    assert.equal(d.cat, "Seasonal", kind);
    assert.ok(d.label.length > 3 && d.parts.length > 0, kind);
    for (const n of [d.w, d.d, d.h]) assert.ok(Number.isFinite(n) && n > 0, `${kind} dimension ${n}`);
  }
  assert.equal(new Set(entries.map(([, d]) => d.label)).size, entries.length, "labels are unique so search results are distinguishable");
});

test("a piece is light-bearing exactly when it has glow parts, and the light is placed inside the piece", () => {
  for (const [kind, d] of entries) {
    const glows = d.parts.some((p) => p.glow);
    assert.equal(!!d.light, glows, `${kind}: glow parts and light must go together`);
    if (!d.light) continue;
    assert.match(d.light.color, /^#[0-9a-f]{6}$/i, kind);
    assert.ok(d.light.y > 0 && d.light.y <= d.h, `${kind}: light height ${d.light.y} outside 0..${d.h}`);
    assert.ok((d.light.k ?? 1) > 0 && (d.light.k ?? 1) <= 1, kind);
  }
});

test("twinkle is only set on glow parts", () => {
  for (const [kind, d] of entries) for (const p of d.parts) if (p.twinkle) assert.ok(p.glow, `${kind}: twinkle on a part that cannot glow`);
});

test("parts stay inside the declared footprint and height, and a piece is not absurdly heavy to draw", () => {
  const bad: string[] = [];
  for (const [kind, d] of entries) {
    const o = bounds(d.parts);
    const tol = 0.03;
    if (o.x0 < -d.w / 2 - tol || o.x1 > d.w / 2 + tol) bad.push(`${kind}: x ${o.x0.toFixed(2)}..${o.x1.toFixed(2)} vs w ${d.w}`);
    if (o.z0 < -d.d / 2 - tol || o.z1 > d.d / 2 + tol) bad.push(`${kind}: z ${o.z0.toFixed(2)}..${o.z1.toFixed(2)} vs d ${d.d}`);
    if (o.y0 < -0.005 || o.y1 > d.h + tol) bad.push(`${kind}: y ${o.y0.toFixed(2)}..${o.y1.toFixed(2)} vs h ${d.h}`);
    if (d.parts.length > 170) bad.push(`${kind}: ${d.parts.length} parts`);
  }
  assert.deepEqual(bad, []);
});

test("Christmas trees come in five heights, each one piece with lights, twinkling bulbs and a glowing topper", () => {
  const trees = entries.filter(([k]) => k.startsWith("sz_xm_tree_") && /\d/.test(k));
  const heights = new Set(trees.map(([, d]) => d.h));
  for (const h of [0.6, 1.2, 1.8, 2.1, 2.4]) assert.ok(heights.has(h), `tree of ${h} m`);
  for (const [kind, d] of trees) {
    assert.ok(d.light, `${kind} has no light`);
    assert.ok(d.parts.filter((p) => p.twinkle).length >= 10, `${kind} bulbs`);
    assert.ok(d.parts.some((p) => p.glow && !p.twinkle), `${kind} glowing topper`);
  }
});

test("twinkle stays gentle, is different per bulb and per time", () => {
  let lo = 1, hi = 0;
  for (let i = 0; i < 40; i++) for (let t = 0; t < 30; t += 0.1) {
    const v = twinkleLevel(t, i);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  assert.ok(lo >= 0.55 && hi <= 1, `${lo}..${hi}`);
  assert.ok(hi - lo > 0.35, "visibly moves");
  assert.notEqual(twinkleLevel(1, 0), twinkleLevel(1, 1));
  assert.notEqual(twinkleLevel(1, 3), twinkleLevel(2, 3));
});

test("season-limited pieces hide outside their holiday window, follow the holiday override, and unlisted holidays never hide", () => {
  const july = new Date(2026, 6, 15, 12);
  const xmas = new Date(2026, 11, 20, 12);
  assert.equal(holidayOfKind("sz_xm_tree_180"), "CHRISTMAS");
  assert.equal(holidayOfKind("sz_hw_ghost"), "HALLOWEEN");
  assert.equal(holidayOfKind("sz_hk_menorah"), undefined);
  assert.equal(holidayOfKind("lv_sofa"), undefined);
  assert.equal(outOfSeason("sz_xm_tree_180", july), true);
  assert.equal(outOfSeason("sz_xm_tree_180", xmas), false);
  assert.equal(outOfSeason("sz_xm_tree_180", new Date(2027, 0, 2, 12)), false, "the Christmas window runs to 7 January");
  assert.equal(outOfSeason("sz_xm_tree_180", july, "orthodox", "CHRISTMAS"), false, "forcing the holiday shows it");
  assert.equal(outOfSeason("sz_hk_menorah", july), false);
  assert.equal(outOfSeason("sz_pride_flag", july), false);
  assert.equal(outOfSeason("sz_hw_pumpkin_carved", new Date(2026, 9, 29, 12)), false);
});
