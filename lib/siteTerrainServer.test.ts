import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { TILE_PX } from "./pngTerrarium.ts";
import { SiteError } from "./siteServer.ts";
import { terrariumPng } from "./siteTerrainFixture.ts";
import { GRID_MAX, GRID_MIN, TERRAIN_ATTRIBUTION, parseTerrainQuery, parseTerrainTile, terrainFromTiles, terrainTile, terrainTilePath, terrainTileUrl } from "./siteTerrainServer.ts";
import { worldPixel } from "./siteTerrainTiles.ts";

const q = (s: string) => parseTerrainQuery(new URLSearchParams(s));
const GREENWICH = { lat: 51.4779, lon: -0.0015 };

/** A fake AWS: a gentle slope (1 m per 16 pixels eastwards, relative to the tile's own west edge so tiles meet), counting and recording requests. */
function fakeAws(over: { status?: number; type?: string; body?: Buffer } = {}) {
  const urls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const png = terrariumPng((x) => 100 + x / 16);
  const fetchFn = async (url: string, init?: RequestInit) => {
    urls.push(url);
    inits.push(init);
    return new Response(new Uint8Array(over.body ?? png), { status: over.status ?? 200, headers: { "content-type": over.type ?? "image/png" } });
  };
  return { fetchFn, urls, inits };
}

const tmp = () => mkdtemp(join(tmpdir(), "doshy-terrain-"));

test("the query: place and radius as for the data route, the grid size odd and within bounds", () => {
  assert.deepEqual(q("lat=51.4779&lon=-0.0015&radius=250&n=129"), { lat: 51.4779, lon: -0.0015, radius: 250, n: 129 });
  for (const bad of ["n=128", "n=31", "n=259", "n=abc", "n=1e2", "n=-65", "n=065x", ""]) assert.equal(typeof q(`lat=51&lon=0&radius=250&${bad}`), "string", bad);
  assert.equal(typeof q("lat=51&lon=0&radius=999&n=65"), "string", "radius out of range");
  assert.equal(typeof q("lat=abc&lon=0&radius=250&n=65"), "string");
  assert.equal(typeof q("lat=51&lon=0&radius=250"), "string", "n is required");
  assert.ok(GRID_MIN % 2 === 1 && GRID_MAX % 2 === 1);
});

test("only tiles of the zoom levels we use, inside the world, reach the URL", () => {
  assert.deepEqual(parseTerrainTile(15, 16383, 10900), { z: 15, x: 16383, y: 10900 });
  assert.equal(terrainTileUrl({ z: 15, x: 16383, y: 10900 }), "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/16383/10900.png");
  for (const [z, x, y] of [[16, 0, 0], [10, 0, 0], [15, 32768, 0], [15, 0, 32768], [14, -1, 0], [14, 1.5, 0], [14, "1", 0], [14, NaN, 0], [14, 0, Infinity]]) assert.equal(parseTerrainTile(z, x, y), undefined, `${z}/${x}/${y}`);
});

test("a tile is downloaded once, then served from disk (and memory), with our User-Agent and no redirects", async () => {
  const dir = await tmp();
  try {
    const aws = fakeAws();
    const t = { z: 14, x: 8191, y: 5448 };
    const a = await terrainTile(t, { fetchFn: aws.fetchFn, dir });
    assert.equal(a?.length, TILE_PX * TILE_PX);
    assert.equal(a?.[5], 100 + 5 / 16);
    assert.equal(aws.urls.length, 1);
    assert.equal(aws.urls[0], terrainTileUrl(t));
    assert.match(String(new Headers(aws.inits[0]?.headers).get("user-agent")), /doshy/i);
    assert.equal(aws.inits[0]?.redirect, "error");
    assert.ok((await stat(terrainTilePath(dir, t))).size > 100, "cached on disk");
    assert.deepEqual((await readdir(join(dir, "14", "8191"))).filter((f) => f.endsWith(".tmp")), [], "no temporary file left");
    await terrainTile(t, { fetchFn: aws.fetchFn, dir });
    assert.equal(aws.urls.length, 1, "the second load costs nothing");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a restart (nothing in memory) still finds the file; an old file is fetched again, and kept when the dataset is down", async () => {
  const dir = await tmp();
  try {
    const t = { z: 13, x: 4000, y: 2700 };
    const aws = fakeAws();
    await terrainTile(t, { fetchFn: aws.fetchFn, dir, now: 1_000_000 });
    assert.equal(aws.urls.length, 1);
    const day = 24 * 3600_000;
    // a different directory key forgets the in-memory copy but not the disk file
    const file = terrainTilePath(dir, t);
    await utimes(file, new Date(), new Date()); // fresh mtime
    await terrainTile(t, { fetchFn: aws.fetchFn, dir, now: Date.now() + 1000, ttlMs: 90 * day });
    assert.equal(aws.urls.length, 1, "within the TTL: from the cache");
    const old = new Date(Date.now() - 100 * day);
    await utimes(file, old, old);
    const down = fakeAws({ status: 503 });
    const stale = await terrainTile({ ...t, y: t.y }, { fetchFn: down.fetchFn, dir, now: Date.now() + 2 * 90 * day, ttlMs: 90 * day });
    assert.equal(down.urls.length, 1, "expired: the dataset was asked");
    assert.equal(stale?.[0], 100, "and when it did not answer, the stale file was used");
    const fresh = fakeAws();
    await utimes(file, old, old);
    await terrainTile(t, { fetchFn: fresh.fetchFn, dir, now: Date.now() + 3 * 90 * day, ttlMs: 90 * day });
    assert.equal(fresh.urls.length, 1, "expired and the dataset is up: refreshed");
    assert.ok(Date.now() - (await stat(file)).mtimeMs < 60_000, "the file was rewritten");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("what is not a Terrarium picture is never cached: wrong type, an error page, a damaged cache file", async () => {
  const dir = await tmp();
  try {
    const t = { z: 12, x: 2000, y: 1300 };
    for (const bad of [fakeAws({ type: "text/html", body: Buffer.from("<html>slow down</html>") }), fakeAws({ body: Buffer.from("not a png at all, 500 bytes of junk".repeat(20)) }), fakeAws({ status: 429 })]) {
      assert.equal(await terrainTile(t, { fetchFn: bad.fetchFn, dir }), undefined);
    }
    await assert.rejects(readFile(terrainTilePath(dir, t)), "nothing was written");
    const aws = fakeAws();
    const good = { z: 12, x: 2001, y: 1300 };
    await terrainTile(good, { fetchFn: aws.fetchFn, dir, now: 0 });
    await writeFile(terrainTilePath(dir, good), "junk");
    const again = await terrainTile(good, { fetchFn: aws.fetchFn, dir, now: 1000, ttlMs: 500 }); // the in-memory copy has expired, the file is young but damaged
    assert.ok(again, "a damaged file is replaced, not trusted");
    assert.equal(aws.urls.length, 2, "it was downloaded again");
    assert.ok((await readFile(terrainTilePath(dir, good))).length > 100, "and the cache file is good again");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the disk cache stays under its cap, oldest tile first", async () => {
  const dir = await tmp();
  try {
    const aws = fakeAws();
    const one = (await terrainTile({ z: 11, x: 1000, y: 700 }, { fetchFn: aws.fetchFn, dir, capBytes: 1e9 })) && (await stat(terrainTilePath(dir, { z: 11, x: 1000, y: 700 }))).size;
    assert.ok(one);
    const old = new Date(Date.now() - 5000);
    await utimes(terrainTilePath(dir, { z: 11, x: 1000, y: 700 }), old, old);
    await terrainTile({ z: 11, x: 1001, y: 700 }, { fetchFn: aws.fetchFn, dir, capBytes: one * 2 });
    await terrainTile({ z: 11, x: 1002, y: 700 }, { fetchFn: aws.fetchFn, dir, capBytes: one * 2 });
    await assert.rejects(stat(terrainTilePath(dir, { z: 11, x: 1000, y: 700 })), "the oldest went first");
    assert.ok(await stat(terrainTilePath(dir, { z: 11, x: 1002, y: 700 })));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the ground of a site: the tiles it needs, a grid with 0 at the centre, the credit, and a plain sentence when the dataset is down", async () => {
  const dir = await tmp();
  try {
    const aws = fakeAws();
    const [wx, wy] = worldPixel(GREENWICH.lat, GREENWICH.lon, 14);
    const answer = await terrainFromTiles({ ...GREENWICH, radius: 250, n: 65 }, { fetchFn: aws.fetchFn, dir });
    assert.equal(answer.zoom, 14);
    assert.ok(answer.tiles >= 1 && answer.tiles <= 4);
    assert.equal(answer.terrain.n, 65);
    assert.equal(answer.terrain.h[32 * 65 + 32], 0);
    assert.equal(answer.terrain.src, "aws");
    assert.equal(answer.attribution, TERRAIN_ATTRIBUTION);
    assert.ok(aws.urls.every((u) => u.startsWith("https://s3.amazonaws.com/elevation-tiles-prod/terrarium/14/")));
    assert.ok(aws.urls.some((u) => u.endsWith(`/${Math.floor(wx / TILE_PX)}/${Math.floor(wy / TILE_PX)}.png`)));
    const before = aws.urls.length;
    await terrainFromTiles({ ...GREENWICH, radius: 250, n: 65 }, { fetchFn: aws.fetchFn, dir });
    assert.equal(aws.urls.length, before, "second load: all from cache");

    const down = await tmp();
    try {
      await assert.rejects(terrainFromTiles({ ...GREENWICH, radius: 250, n: 65 }, { fetchFn: fakeAws({ status: 500 }).fetchFn, dir: down }), (e: unknown) => e instanceof SiteError && e.status === 502 && /terrain service/.test(e.message));
      await assert.rejects(terrainFromTiles({ ...GREENWICH, radius: 250, n: 65 }, { fetchFn: async () => Promise.reject(new TypeError("fetch failed")), dir: down }), (e: unknown) => e instanceof SiteError && e.status === 502);
    } finally {
      await rm(down, { recursive: true, force: true });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
