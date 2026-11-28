import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeTerrarium, terrariumHeight, TILE_PX } from "./pngTerrarium.ts";
import { groundFn, HOME_FLAT_M } from "./siteMeshGround.ts";
import { terrariumPng } from "./siteTerrainFixture.ts";
import { heightAt, metresPerPixel, sampleTerrainGrid, terrainZoom, tileKey, tilesCovering, worldPixel, type TileHeights } from "./siteTerrainTiles.ts";

const GREENWICH = { lat: 51.4779, lon: -0.0015 };

/** Tiles of a plane that rises `slope` metres per world pixel eastwards from the westmost tile's edge: the same continuous surface in every tile (kept small: the tiles hold float32). */
function slopeTiles(z: number, ids: { x: number; y: number }[], slope: number, base = 40): TileHeights {
  const m = new Map<string, Float32Array>();
  const origin = Math.min(...ids.map((t) => t.x)) * TILE_PX;
  for (const { x, y } of ids) {
    const h = new Float32Array(TILE_PX * TILE_PX);
    for (let j = 0; j < TILE_PX; j++) for (let i = 0; i < TILE_PX; i++) h[j * TILE_PX + i] = base + slope * (x * TILE_PX + i + 0.5 - origin);
    m.set(tileKey({ z, x, y }), h);
  }
  return m;
}

test("the Terrarium colour is R * 256 + G + B / 256 - 32768 and all-zero means no data", () => {
  assert.equal(terrariumHeight(128, 0, 0), 0);
  assert.equal(terrariumHeight(128, 1, 128), 1.5);
  assert.equal(terrariumHeight(127, 255, 255), -1 / 256);
  assert.equal(terrariumHeight(120, 0, 0), -2048, "bathymetry is real data");
  assert.ok(Number.isNaN(terrariumHeight(0, 0, 0)));
});

test("a PNG made with every row filter decodes to the same heights, RGB and RGBA", () => {
  const f = (x: number, y: number) => (x === 3 && y === 7 ? null : 100.5 + x * 0.25 - y * 0.5);
  for (const channels of [3, 4] as const) {
    const h = decodeTerrarium(terrariumPng(f, channels));
    assert.ok(h);
    assert.equal(h.length, TILE_PX * TILE_PX);
    for (const [x, y] of [[0, 0], [255, 255], [10, 3], [200, 128], [5, 9]]) assert.equal(h[y * TILE_PX + x], f(x, y), `${channels} ch (${x},${y})`);
    assert.ok(Number.isNaN(h[7 * TILE_PX + 3]), "no data stays NaN");
  }
});

test("anything that is not a plain 256 px 8-bit non-interlaced PNG is refused", () => {
  const good = terrariumPng(() => 1);
  assert.ok(decodeTerrarium(good));
  assert.equal(decodeTerrarium(good.subarray(0, 100)), undefined, "truncated");
  assert.equal(decodeTerrarium(new Uint8Array(500)), undefined, "not a PNG");
  assert.equal(decodeTerrarium(new TextEncoder().encode("<html>429 slow down</html>".repeat(4))), undefined);
  const patched = (offset: number, value: number) => {
    const b = Buffer.from(good);
    b[offset] = value;
    return b;
  };
  assert.equal(decodeTerrarium(patched(8 + 8 + 8, 16)), undefined, "16 bit");
  assert.equal(decodeTerrarium(patched(8 + 8 + 12, 1)), undefined, "interlaced");
  assert.equal(decodeTerrarium(patched(8 + 8 + 9, 3)), undefined, "palette");
  assert.equal(decodeTerrarium(patched(8 + 8 + 3, 1)), undefined, "512 wide");
});

test("the zoom follows the grid spacing and stays inside the dataset's levels", () => {
  assert.equal(terrainZoom(51.5, metresPerPixel(51.5, 14)), 14);
  assert.equal(terrainZoom(51.5, metresPerPixel(51.5, 15)), 15);
  assert.equal(terrainZoom(51.5, 1), 15, "never deeper than the dataset");
  assert.equal(terrainZoom(51.5, 500), 11, "never so coarse that Open-Meteo is as good");
  assert.ok(metresPerPixel(51.5, 15) > 2.5 && metresPerPixel(51.5, 15) < 4, "about 3 m a pixel");
  assert.ok(terrainZoom(60, 5) >= terrainZoom(0, 5) - 1);
});

test("the tiles of a site: the centre's tile is always in, a seam gives 2 or 4 tiles, and radius 600 at the deepest zoom stays within the cap", () => {
  const [wx, wy] = worldPixel(GREENWICH.lat, GREENWICH.lon, 15);
  const centreTile = { x: Math.floor(wx / TILE_PX), y: Math.floor(wy / TILE_PX) };
  for (const radius of [100, 250, 400, 600]) {
    const ids = tilesCovering(GREENWICH, radius, 15);
    assert.ok(ids && ids.length >= 1 && ids.length <= 9, `${radius}: ${ids?.length}`);
    assert.ok(ids.some((t) => t.x === centreTile.x && t.y === centreTile.y));
    assert.ok(ids.every((t) => t.z === 15));
  }
  // a centre on the corner of four tiles
  const corner = { lat: Math.atan(Math.sinh(Math.PI * (1 - (2 * 10000) / 2 ** 14))) / (Math.PI / 180), lon: (8192 / 2 ** 14) * 360 - 180 };
  assert.equal(tilesCovering(corner, 100, 14)?.length, 4);
  assert.equal(tilesCovering(corner, 600, 15)?.length, 4, "the widest site at the deepest zoom, centred on a tile corner, still needs only its four neighbours");
});

test("bilinear heights read across a tile seam without a jump, and pixel centres are exact", () => {
  const z = 12;
  const a = new Float32Array(TILE_PX * TILE_PX).fill(10);
  const b = new Float32Array(TILE_PX * TILE_PX).fill(20);
  const tiles: TileHeights = new Map([
    [tileKey({ z, x: 5, y: 5 }), a],
    [tileKey({ z, x: 6, y: 5 }), b],
  ]);
  const seam = 6 * TILE_PX;
  const y = 5 * TILE_PX + 100.5;
  assert.equal(heightAt(tiles, z, seam - 0.5, y), 10, "centre of the last pixel of tile A");
  assert.equal(heightAt(tiles, z, seam + 0.5, y), 20, "centre of the first pixel of tile B");
  assert.equal(heightAt(tiles, z, seam, y), 15, "exactly on the seam: halfway");
  assert.ok(Math.abs(heightAt(tiles, z, seam - 0.25, y) - 12.5) < 1e-9);
  assert.ok(Number.isNaN(heightAt(tiles, z, 9 * TILE_PX, y)), "a tile that is not there");
});

test("no-data pixels are left out of the average, not read as -32768", () => {
  const z = 12;
  const t = new Float32Array(TILE_PX * TILE_PX).fill(50);
  t[100 * TILE_PX + 100] = NaN;
  const tiles: TileHeights = new Map([[tileKey({ z, x: 0, y: 0 }), t]]);
  assert.equal(heightAt(tiles, z, 101, 101), 50, "three of four taps are real: they carry all the weight");
  assert.equal(heightAt(tiles, z, 100.5, 100.5), NaN, "only tap, no data");
});

test("a slope sampled across four tiles is a straight slope, with 0 at the centre and the centre's height as the base", () => {
  const z = 15;
  const [wx, wy] = worldPixel(GREENWICH.lat, GREENWICH.lon, z);
  const tx = Math.floor(wx / TILE_PX);
  const ty = Math.floor(wy / TILE_PX);
  // move the centre to a tile corner so the grid straddles all four tiles
  const centre = { lat: GREENWICH.lat, lon: GREENWICH.lon };
  const ids = [tx - 1, tx, tx + 1].flatMap((x) => [ty - 1, ty, ty + 1].map((y) => ({ x, y })));
  const slope = 0.25; // metres per pixel eastwards
  const tiles = slopeTiles(z, ids, slope);
  const n = 65;
  const radius = 200;
  const t = sampleTerrainGrid(tiles, centre, radius, n, z);
  assert.ok(t);
  assert.equal(t.n, n);
  assert.equal(t.src, "aws");
  const mid = (n - 1) / 2;
  assert.equal(t.h[mid * n + mid], 0, "exactly 0 at the centre");
  assert.ok(Math.abs(t.base - (40 + slope * (wx - (tx - 1) * TILE_PX))) < 0.1, `base ${t.base}`);
  const pxPerMetre = 1 / metresPerPixel(centre.lat, z);
  for (const [i, j] of [[0, 0], [n - 1, 10], [mid + 7, mid - 20], [3, n - 1]]) {
    const east: number = (i - mid) * t.step;
    assert.ok(Math.abs(t.h[j * n + i] - east * pxPerMetre * slope) < 0.08, `(${i},${j}): ${t.h[j * n + i]} vs ${east * pxPerMetre * slope}`);
  }
  // the row is monotone east: no seam artefacts
  for (let i = 1; i < n; i++) assert.ok(t.h[mid * n + i] >= t.h[mid * n + i - 1] - 0.011);
});

test("a hole at the coast is filled, but a missing centre or a missing tile is a failure", () => {
  const z = 15;
  const [wx, wy] = worldPixel(GREENWICH.lat, GREENWICH.lon, z);
  const tx = Math.floor(wx / TILE_PX);
  const ty = Math.floor(wy / TILE_PX);
  const ids = [tx - 1, tx, tx + 1].flatMap((x) => [ty - 1, ty, ty + 1].map((y) => ({ x, y })));
  const holey = slopeTiles(z, ids, 0);
  const home = holey.get(tileKey({ z, x: tx, y: ty }));
  assert.ok(home);
  const [lx, ly] = [Math.floor(wx % TILE_PX), Math.floor(wy % TILE_PX)];
  // a patch 30 pixels away from the centre: nodata
  for (let j = -5; j <= 5; j++) for (let i = 25; i <= 35; i++) home[(ly + j) * TILE_PX + Math.min(TILE_PX - 1, lx + i)] = NaN;
  const t = sampleTerrainGrid(holey, GREENWICH, 200, 41, z);
  assert.ok(t && t.h.every(Number.isFinite), "filled");
  assert.equal(t.h[20 * 41 + 20], 0);
  // the centre itself has no data
  const blind = slopeTiles(z, ids, 0);
  const b = blind.get(tileKey({ z, x: tx, y: ty }));
  assert.ok(b);
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) b[(ly + j) * TILE_PX + lx + i] = NaN;
  assert.equal(sampleTerrainGrid(blind, GREENWICH, 200, 41, z), undefined);
  // the neighbours are missing: the grid is mostly holes
  assert.equal(sampleTerrainGrid(new Map([[tileKey({ z, x: tx, y: ty }), home]]), GREENWICH, 600, 41, z), undefined);
  assert.equal(sampleTerrainGrid(new Map(), GREENWICH, 200, 41, z), undefined);
});

test("the house neither floats nor sinks: the plan's ground is exactly 0 around the home, whatever the terrain does there", () => {
  const z = 15;
  const [wx, wy] = worldPixel(GREENWICH.lat, GREENWICH.lon, z);
  const tx = Math.floor(wx / TILE_PX);
  const ty = Math.floor(wy / TILE_PX);
  const ids = [tx - 1, tx, tx + 1].flatMap((x) => [ty - 1, ty, ty + 1].map((y) => ({ x, y })));
  const t = sampleTerrainGrid(slopeTiles(z, ids, 0.5), GREENWICH, 250, 97, z);
  assert.ok(t);
  const toSite = (p: [number, number]): [number, number] => [p[0], p[1]];
  const home = { x0: -6, y0: -4, x1: 6, y1: 4 };
  const ground = groundFn(t, home, toSite);
  for (const [x, y] of [[0, 0], [-6, -4], [6, 4], [6 + HOME_FLAT_M, 0], [0, 4 + HOME_FLAT_M]]) assert.equal(ground(x, y), 0, `(${x},${y})`);
  assert.ok(Math.abs(ground(200, 0)) > 5, "but the hill is there further out");
});
