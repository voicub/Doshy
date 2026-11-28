import assert from "node:assert/strict";
import { test } from "node:test";
import { TIER_ORDER, type Tier } from "./quality.ts";
import { MESH_CELL_FLOOR_M, SCALE_RANGE, TERRAIN_GRID, meshCell, shapeTerrain } from "./siteTerrainShape.ts";
import { GRID_MAX, GRID_MIN } from "./siteTerrainServer.ts";
import type { SiteTerrain } from "./siteTypes.ts";

const grid = (n: number, step: number, f: (i: number, j: number) => number, src?: "aws"): SiteTerrain => {
  const h: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h.push(f(i, j));
  const c = h[((n - 1) / 2) * n + (n - 1) / 2];
  return { n, step, h: h.map((v) => v - c), base: 100, ...(src ? { src } : {}) };
};

const verticesOf = (radius: number, t: SiteTerrain | undefined, tier: Tier = "medium") => (Math.ceil((2 * radius) / meshCell(radius, t, tier)) + 1) ** 2;

test("every tier asks for an odd grid the server accepts, and bigger tiers ask for more", () => {
  let last = 0;
  for (const tier of TIER_ORDER) {
    const n = TERRAIN_GRID[tier];
    assert.ok(n % 2 === 1 && n >= GRID_MIN && n <= GRID_MAX, `${tier}: ${n}`);
    assert.ok(n > last, `${tier} is bigger than the tier below`);
    last = n;
  }
});

test("the vertex budget by tier: Eco never draws more ground vertices than before the detailed ground existed; Ultra stays under 40 000", () => {
  for (const radius of [100, 150, 250, 400, 600]) {
    const before = verticesOf(radius, undefined);
    for (const tier of TIER_ORDER) {
      const n = TERRAIN_GRID[tier];
      const dem = grid(n, radius / ((n - 1) / 2), () => 0, "aws");
      const now = verticesOf(radius, dem, tier);
      if (tier === "eco") assert.ok(now <= before, `eco at ${radius} m: ${now} vs ${before}`);
      assert.ok(now <= 40_000, `${tier} at ${radius} m: ${now}`);
    }
  }
  assert.ok(verticesOf(250, grid(TERRAIN_GRID.high, 250 / 80, () => 0, "aws"), "high") > verticesOf(250, grid(TERRAIN_GRID.eco, 250 / 32, () => 0, "aws"), "eco"), "a higher tier shows more of the real shape");
});

test("the mesh follows the standard ground exactly as before, and is never cut finer than the dataset's own pixel", () => {
  assert.equal(meshCell(250, undefined), 5);
  assert.equal(meshCell(600, undefined), 12);
  assert.equal(meshCell(100, undefined), 4);
  assert.equal(meshCell(250, grid(11, 50, () => 0)), 5, "Open-Meteo / city grids: unchanged");
  assert.equal(meshCell(250, grid(129, 250 / 64, () => 0, "aws")), 250 / 64);
  assert.equal(meshCell(250, grid(257, 1, () => 0, "aws")), MESH_CELL_FLOOR_M);
});

test("nothing asked for returns the very same grid; the centre stays exactly 0 whatever is asked", () => {
  const t = grid(21, 10, (i, j) => Math.sin(i / 3) * 4 + j * 0.5 + ((i * 7 + j * 13) % 5) * 0.3);
  assert.equal(shapeTerrain(t, {}), t);
  assert.equal(shapeTerrain(t, { scale: 1 }), t);
  for (const o of [{ smooth: 1 as const }, { smooth: 2 as const }, { scale: 2 }, { scale: 3, smooth: 2 as const }]) {
    const s = shapeTerrain(t, o);
    assert.equal(s.h[10 * 21 + 10], 0, JSON.stringify(o));
    assert.equal(s.n, t.n);
    assert.equal(s.base, t.base);
    assert.ok(s.h.every(Number.isFinite));
  }
});

test("exaggeration scales heights about the home; the range is clamped", () => {
  const t = grid(11, 10, (i) => i * 2);
  const x2 = shapeTerrain(t, { scale: 2 });
  assert.equal(x2.h[5 * 11 + 10], 20, "5 columns east of the centre: 10 m x 2");
  assert.equal(x2.h[5 * 11 + 0], -20);
  assert.equal(shapeTerrain(t, { scale: 99 }).h[5 * 11 + 10], 10 * SCALE_RANGE.max);
  assert.equal(shapeTerrain(t, { scale: 0.01 }).h[5 * 11 + 10], 10 * SCALE_RANGE.min);
});

test("smoothing flattens bumps and keeps a straight slope; strong smooths more than light", () => {
  const bumpy = grid(41, 5, (i, j) => (i + j) % 2 ? 1 : 0);
  const rough = (g: SiteTerrain) => g.h.reduce((a, v, k) => a + (k % 41 ? Math.abs(v - g.h[k - 1]) : 0), 0);
  const light = shapeTerrain(bumpy, { smooth: 1 });
  const strong = shapeTerrain(bumpy, { smooth: 2 });
  assert.ok(rough(light) < rough(bumpy) * 0.01, "light smoothing takes the checkerboard down");
  assert.ok(rough(strong) < rough(bumpy) * 0.01 && rough(strong) < rough(light) + 2, "and strong smoothing at least as much (the rest is rounding to a centimetre)");
  const slope = grid(41, 5, (i) => i * 0.5);
  const s = shapeTerrain(slope, { smooth: 2 });
  for (const k of [20 * 41 + 10, 20 * 41 + 30]) assert.ok(Math.abs(s.h[k] - slope.h[k]) < 0.05, "an interior slope is a fixed point of a symmetric blur");
});
