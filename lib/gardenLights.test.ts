import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, CATEGORIES } from "./catalog.ts";
import { GARDEN } from "./catalog.garden.ts";
import { LIGHTS } from "./garden/lights.ts";
import { RAILINGS } from "./garden/railings.ts";
import { bounds, sagAt, shellPoints, strand, b } from "./garden/kit.ts";

const entries = Object.entries(GARDEN);
/** Glowing pieces that are status LEDs of an appliance, not lights: they glow while their switch is on and cast no light. */
const GLOW_ONLY: Record<string, true> = { gd_light_controller: true };
const MAX_LIGHT_Y = 1.78; // above this a lamp counts as a ceiling fixture (components/scene/pointShadow.ts) and would take the indoor lamps' shadow slots

test("every garden piece is registered once, in the Garden category, with sane dimensions and plain unique labels", () => {
  assert.ok(CATEGORIES.includes("Garden"));
  for (const [kind, d] of entries) {
    assert.match(kind, /^gd_[a-z0-9_]+$/, kind);
    assert.equal(CATALOG[kind], d, `${kind} is shadowed by another catalog`);
    assert.equal(d.cat, "Garden", kind);
    assert.ok(d.label.length > 3 && d.parts.length > 0, kind);
    for (const n of [d.w, d.d, d.h]) assert.ok(Number.isFinite(n) && n > 0, `${kind} dimension ${n}`);
    for (const p of d.parts) for (const n of [...p.s, ...p.p]) assert.ok(Number.isFinite(n), `${kind} part not finite`);
    for (const p of d.parts) for (const n of p.s) assert.ok(n > 0, `${kind} part with size ${n}`);
  }
  assert.equal(new Set(entries.map(([, d]) => d.label)).size, entries.length, "labels are unique so search results are distinguishable");
  const others = Object.entries(CATALOG).filter(([k, d]) => d.cat !== "Garden" && k.startsWith("gd_"));
  assert.deepEqual(others, [], "gd_ ids belong to the Garden category");
});

test("parts stay inside the declared footprint and height (rotation aware) and a piece stays cheap to draw", () => {
  const bad: string[] = [];
  for (const [kind, d] of entries) {
    const o = bounds(d.parts);
    const tol = 0.03;
    if (o.x0 < -d.w / 2 - tol || o.x1 > d.w / 2 + tol) bad.push(`${kind}: x ${o.x0.toFixed(2)}..${o.x1.toFixed(2)} vs w ${d.w}`);
    if (o.z0 < -d.d / 2 - tol || o.z1 > d.d / 2 + tol) bad.push(`${kind}: z ${o.z0.toFixed(2)}..${o.z1.toFixed(2)} vs d ${d.d}`);
    if (o.y0 < -0.03 || o.y1 > d.h + tol) bad.push(`${kind}: y ${o.y0.toFixed(2)}..${o.y1.toFixed(2)} vs h ${d.h}`);
    if (d.parts.length > 170) bad.push(`${kind}: ${d.parts.length} parts`);
    if (d.parts.filter((p) => p.veg).length > 3) bad.push(`${kind}: more than 3 plants`);
  }
  assert.deepEqual(bad, []);
});

test("a light-bearing piece has glow parts and a sane light; glow parts have a light unless they are appliance LEDs", () => {
  for (const [kind, d] of entries) {
    const glows = d.parts.some((p) => p.glow);
    if (d.light) assert.ok(glows, `${kind}: a light with nothing glowing`);
    else assert.equal(glows, !!GLOW_ONLY[kind], `${kind}: glow parts and light must go together`);
    for (const p of d.parts) if (p.twinkle) assert.ok(p.glow, `${kind}: twinkle on a part that cannot glow`);
    if (!d.light) continue;
    assert.match(d.light.color, /^#[0-9a-f]{6}$/i, kind);
    assert.ok(d.light.y > 0 && d.light.y <= d.h, `${kind}: light height ${d.light.y} outside 0..${d.h}`);
    assert.ok(d.light.y <= MAX_LIGHT_Y, `${kind}: light at ${d.light.y} m would count as a ceiling lamp`);
    assert.ok((d.light.k ?? 1) > 0 && (d.light.k ?? 1) <= 2, kind);
  }
});

test("pieces that move in the wind say so, hang inside themselves and move all their hanging parts together", () => {
  for (const [kind, d] of entries) {
    const moving = d.parts.filter((p) => p.spin);
    if (!d.wind) { assert.equal(moving.length, 0, `${kind}: moving parts without wind:true`); continue; }
    assert.ok(moving.length > 0, `${kind}: wind:true with nothing that moves`);
    const byPivot = new Map<number, string[]>();
    for (const p of moving) {
      assert.ok(p.spin!.rpm > 0, kind);
      if (p.spin!.pivot === undefined) continue;
      assert.ok(p.spin!.swing! > 0, `${kind}: a pivoted part must swing`);
      assert.ok(p.spin!.pivot >= 0 && p.spin!.pivot <= d.h + 0.03, `${kind}: pivot ${p.spin!.pivot} outside the piece`);
      const k = byPivot.get(p.spin!.pivot) ?? [];
      k.push(`${p.spin!.axis}/${p.spin!.rpm}/${p.spin!.swing}`);
      byPivot.set(p.spin!.pivot, k);
    }
    for (const [pivot, motions] of byPivot) assert.equal(new Set(motions).size, 1, `${kind}: parts hanging from ${pivot} m must swing identically, got ${[...new Set(motions)]}`);
  }
});

test("LED bush lights come in three sizes, warm white and colour-changing, as a real shrub wrapped in twinkling bulbs", () => {
  for (const mode of ["warm", "rgb"]) {
    const sizes = Object.entries(LIGHTS).filter(([k]) => k.startsWith(`gd_bush_${mode === "warm" ? "led" : "rgb"}_`));
    assert.deepEqual(sizes.map(([, d]) => d.w).sort(), [0.6, 0.9, 1.4], mode);
    for (const [kind, d] of sizes) {
      assert.equal(d.parts.filter((p) => p.veg).length, 1, `${kind}: one real plant`);
      const bulbs = d.parts.filter((p) => p.glow);
      assert.ok(bulbs.length >= 24 && bulbs.every((p) => p.twinkle), `${kind}: ${bulbs.length} bulbs`);
      assert.ok(bulbs.every((p) => p.p[1] > 0 && Math.hypot(p.p[0], p.p[2]) <= d.w / 2), `${kind}: bulbs on the bush`);
    }
  }
  const rgbOff = new Set(LIGHTS.gd_bush_rgb_m.parts.filter((p) => p.glow).map((p) => p.c));
  assert.ok(rgbOff.size >= 3, "the colour-changing bush shows several bulb colours when off");
});

test("festoon strings come in 3, 5, 8 and 12 m, hang between two hooks and sag more the longer they are", () => {
  const lens = [3, 5, 8, 12];
  let lastLow = Infinity;
  for (const len of lens) {
    const d = LIGHTS[`gd_festoon_${len}`];
    assert.ok(d, `festoon ${len} m`);
    assert.equal(d.w, len);
    const globes = d.parts.filter((p) => p.glow);
    assert.ok(globes.length >= len / 0.6 && globes.length <= len / 0.4, `${len} m: ${globes.length} bulbs`);
    const spacing = len / globes.length;
    assert.ok(spacing > 0.4 && spacing < 0.7, `${len} m bulb spacing ${spacing}`);
    const low = Math.min(...globes.map((p) => p.p[1]));
    assert.ok(low < 2.6 && low > 1.7, `${len} m: lowest bulb ${low}`);
    assert.ok(low <= lastLow, "a longer span sags at least as much");
    lastLow = low;
    assert.ok(d.parts.some((p) => p.s[1] === 0.05 && p.p[1] > 2.6), "hooks at both ends");
  }
  assert.ok(LIGHTS.gd_festoon_posts_5.parts.some((p) => p.s[1] >= 2.5 && p.shape === "cyl"), "the two-post variant brings its posts");
});

test("strand hangs from both ends, sags in the middle and puts a bulb in each slot", () => {
  const parts = strand(6, 2.5, 0.3, 0, 10, (x, y, z) => b(x, y, z, 0.05, 0.05, 0.05, "#fff", { glow: true }));
  const bulbs = parts.filter((p) => p.glow);
  assert.equal(bulbs.length, 10);
  assert.ok(bulbs[0].p[0] > -3 && bulbs[9].p[0] < 3);
  assert.ok(Math.min(...bulbs.map((p) => p.p[1])) < 2.5 - 0.25, "middle sags");
  assert.equal(sagAt(2.5, 0.3, 0), 2.5);
  assert.equal(sagAt(2.5, 0.3, 1), 2.5);
  assert.ok(Math.abs(sagAt(2.5, 0.3, 0.5) - 2.2) < 1e-9);
});

test("shellPoints spread over an ellipsoid shell, never outside it, never bunched on one side", () => {
  const pts = shellPoints(0, 0.5, 0, 0.4, 0.5, 0.3, 40, -0.4);
  for (const [x, y, z] of pts) assert.ok(Math.abs((x / 0.4) ** 2 + ((y - 0.5) / 0.5) ** 2 + (z / 0.3) ** 2 - 1) < 1e-9);
  assert.ok(pts.some(([x]) => x > 0.2) && pts.some(([x]) => x < -0.2) && pts.some(([, , z]) => z > 0.15) && pts.some(([, , z]) => z < -0.15));
  assert.ok(Math.min(...pts.map((p) => p[1])) < 0.4 && Math.max(...pts.map((p) => p[1])) > 0.9);
});

test("glass railings: modules swap one for one with the metal railing, glass is see-through and stays inside the footprint", () => {
  const ids = Object.keys(RAILINGS);
  for (const id of ids) {
    const d = CATALOG[id];
    assert.ok(d, id);
    assert.equal(d.cat, "Garden");
    assert.equal(d.d, CATALOG.balcony_railing.d, "same depth as the metal railing");
    assert.ok(d.solid && d.h >= 1 && d.h <= 1.15);
    assert.ok(d.parts.some((p) => p.glass), `${id} has glass`);
    for (const p of d.parts) assert.ok(Math.abs(p.p[0]) + p.s[0] / 2 <= d.w / 2 + 0.03, `${id} part inside its length`);
  }
});
