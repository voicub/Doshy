import assert from "node:assert/strict";
import { test } from "node:test";
import { latLonToSite, tileCorner } from "./geo.ts";
import { MAX_TILES_PER_SIDE, TILE_PX, mapLimit, planTiles, pow2Size } from "./sitePhotoMath.ts";

const HOME = { lat: 51.47790000081094, lon: -0.00150002973862 };

test("a home at 250 m uses the deepest zoom and a few tiles that cover the whole square", () => {
  const p = planTiles(HOME, 250, 17);
  assert.equal(p.z, 17);
  assert.ok(p.cols >= 3 && p.cols <= MAX_TILES_PER_SIDE && p.rows >= 3 && p.rows <= MAX_TILES_PER_SIDE);
  assert.ok(p.bounds.x0 <= -250 && p.bounds.y0 <= -250 && p.bounds.x1 >= 250 && p.bounds.y1 >= 250);
  assert.ok(p.bounds.x0 > -250 - 400 && p.bounds.y1 < 250 + 400, "no more than a tile of margin");
  assert.ok(p.metresPerPixel > 0.7 && p.metresPerPixel < 0.9, `${p.metresPerPixel} m/px at 51.5 N`);
  assert.ok(p.x0 <= 65535 && p.x0 + p.cols - 1 >= 65535 && p.y0 <= 43602 && p.y0 + p.rows - 1 >= 43602);
});

test("the covered rectangle is exactly the tiles' corners in site metres", () => {
  const p = planTiles(HOME, 120, 17);
  const nw = tileCorner(p.z, p.x0, p.y0);
  const se = tileCorner(p.z, p.x0 + p.cols, p.y0 + p.rows);
  const [x0, y0] = latLonToSite(HOME, nw.lat, nw.lon);
  const [x1, y1] = latLonToSite(HOME, se.lat, se.lon);
  assert.deepEqual([p.bounds.x0, p.bounds.y0, p.bounds.x1, p.bounds.y1].map((v) => Math.round(v * 1e6)), [x0, y0, x1, y1].map((v) => Math.round(v * 1e6)));
  assert.ok(Math.abs(p.metresPerPixel - (x1 - x0) / (p.cols * TILE_PX)) < 1e-9);
});

test("a big radius or a shallow provider gets a coarser zoom, never more than 6 tiles across", () => {
  const big = planTiles(HOME, 600, 17);
  assert.ok(big.z < 17 && big.z >= 15, `z${big.z}`);
  assert.ok(big.cols <= MAX_TILES_PER_SIDE && big.rows <= MAX_TILES_PER_SIDE);
  assert.ok(big.bounds.x0 <= -600 && big.bounds.x1 >= 600);
  assert.equal(planTiles(HOME, 100, 15).z, 15);
  assert.equal(planTiles(HOME, 250, 0).z, 0);
});

test("the picture size is the next power of two, capped", () => {
  assert.deepEqual([1, 3, 768, 1024, 1536, 5000].map((n) => pow2Size(n)), [1, 4, 1024, 1024, 2048, 2048]);
  assert.equal(pow2Size(5000, 512), 512);
});

test("mapLimit keeps order and never runs more than the limit at once", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
    peak = Math.max(peak, ++running);
    for (let i = 0; i < 5 - (n % 3); i++) await null; // a few turns of the event loop, no clock
    running--;
    return n * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50, 60, 70, 80]);
  assert.ok(peak <= 3 && peak >= 2);
});

test("mapLimit stops when aborted", async () => {
  const ac = new AbortController();
  let started = 0;
  await assert.rejects(
    mapLimit([1, 2, 3, 4, 5, 6], 1, async () => {
      if (++started === 2) ac.abort(new Error("stop"));
    }, ac.signal),
    /stop/,
  );
  assert.equal(started, 2);
});
