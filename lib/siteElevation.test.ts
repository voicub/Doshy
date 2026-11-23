import assert from "node:assert/strict";
import { test } from "node:test";
import { latLonToSite } from "./geo.ts";
import { TERRAIN_FAILED_NOTE, sampleTerrain, smoothGrid, terrainGrid } from "./siteElevation.ts";

const C = { lat: 51.4779, lon: -0.0015 };
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

/** A fake elevation service: a plane rising 0.1 m per metre to the east and 0.05 m per metre to the south, 200 m above sea level at C. */
const plane = async (url: string): Promise<unknown> => {
  const q = new URL(url).searchParams;
  const lats = (q.get("latitude") ?? "").split(",").map(Number);
  const lons = (q.get("longitude") ?? "").split(",").map(Number);
  return { elevation: lats.map((la, i) => { const [x, y] = latLonToSite(C, la, lons[i]); return 200 + 0.1 * x + 0.05 * y; }) };
};

test("the grid spans the radius exactly, is odd and never above 21 x 21 or 60 m apart", () => {
  for (const radius of [100, 150, 250, 300, 400, 599, 600]) {
    const { n, step } = terrainGrid(radius);
    assert.ok(n % 2 === 1 && n <= 21 && n >= 11, `${radius}: n=${n}`);
    assert.ok(step <= 60.01, `${radius}: step=${step}`);
    near(((n - 1) / 2) * step, radius);
  }
});

test("smoothing keeps flat and straight slopes as they are and spreads a spike", () => {
  const n = 9;
  const flat = Array.from({ length: n * n }, () => 5);
  smoothGrid(flat, n).forEach((v) => near(v, 5));
  const slope = Array.from({ length: n * n }, (_, i) => i % n);
  const s = smoothGrid(slope, n);
  for (let y = 0; y < n; y++) for (let x = 2; x < n - 2; x++) near(s[y * n + x], x, 1e-9); // away from the edges
  const spike = Array.from({ length: n * n }, (_, i) => (i === 4 * n + 4 ? 10 : 0));
  const sp = smoothGrid(spike, n);
  assert.ok(sp[4 * n + 4] < 10 && sp[4 * n + 4] > 1 && sp[4 * n + 5] > 0);
  near(sp.reduce((a, b) => a + b, 0), 10, 1e-9);
});

test("sampleTerrain: heights are relative to the centre, east is higher, the centre is 0", async () => {
  const { terrain, note } = await sampleTerrain(C, 250, plane);
  assert.equal(note, undefined);
  assert.ok(terrain);
  const { n, step, h, base } = terrain;
  assert.equal(h.length, n * n);
  const mid = (n - 1) / 2;
  near(h[mid * n + mid], 0, 0.01);
  near(base, 200, 0.1);
  near(h[mid * n + mid + 2] - h[mid * n + mid], 0.1 * 2 * step, 0.05);
  assert.ok(h[(mid + 2) * n + mid] > 0, "rows run north to south: further down is further south, higher here");
  assert.ok(h[(mid - 2) * n + mid] < 0);
  near(step * mid, 250, 0.05);
});

test("requests are batched at 100 points and carry only coordinates", async () => {
  const urls: string[] = [];
  await sampleTerrain(C, 600, async (u) => (urls.push(u), plane(u)));
  assert.equal(urls.length, 5, "21 x 21 = 441 points");
  for (const u of urls) {
    assert.match(u, /^https:\/\/api\.open-meteo\.com\/v1\/elevation\?latitude=[-\d.,]+&longitude=[-\d.,]+$/);
    assert.ok((new URL(u).searchParams.get("latitude")?.split(",").length ?? 999) <= 100);
  }
});

test("a failing, malformed or short answer gives no terrain and a plain sentence", async () => {
  for (const fetchFn of [
    async () => { throw new Error("HTTP 429 raw upstream text"); },
    async () => ({ elevation: [1, 2, 3] }),
    async () => ({ error: true }),
    async () => null,
    async (u: string) => ({ elevation: (await plane(u) as { elevation: number[] }).elevation.map(() => "x") }),
  ]) {
    const r = await sampleTerrain(C, 100, fetchFn);
    assert.equal(r.terrain, undefined);
    assert.equal(r.note, TERRAIN_FAILED_NOTE);
  }
});
