import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { tileOf } from "./geo.ts";
import { SiteError } from "./siteServer.ts";
import { OVERTURE_ATTRIBUTION, OVERTURE_TTL_MS, RELEASE_RE, checkedArchiveUrl, currentRelease, discoverRelease, overtureBuildings, parseOvertureQuery, rangeReader, resetOvertureMemory, tileFile } from "./siteOvertureServer.ts";
import { mvtLayer, mvtTile, pmtilesArchive, square, type FixtureFeature } from "./siteOvertureFixture.ts";
import { OVERTURE_ZOOM, overtureTiles } from "./siteOverture.ts";
import { worldPixel } from "./siteTerrainTiles.ts";

const C = { lat: 51.4779, lon: -0.0015 };
const RELEASE = "2026-11-18.0";
const ARCHIVE_URL = `https://tiles.overturemaps.org/${RELEASE}/buildings.pmtiles`;
const home = tileOf(C.lat, C.lon, OVERTURE_ZOOM);
/** The site centre in the home tile's own units (4096 per tile), so the fixture houses stand a few dozen metres from it. */
const [CX, CY] = worldPixel(C.lat, C.lon, OVERTURE_ZOOM).map((v, i) => Math.round((v / 256 - (i ? home.y : home.x)) * 4096));

const house = (id: string, x: number, y: number, props: FixtureFeature["props"] = {}): FixtureFeature => ({ props: { id, height: 12, class: "residential", ...props }, polygons: [[square(x, y, 80)]] });

/** A fake Overture: STAC answers, and an archive (leaf directories on) holding the tiles given; counts every request. */
function fakeOverture(tileFeatures: Record<string, FixtureFeature[]>, over: { stac?: Partial<Record<"root" | "theme", unknown>>; failTiles?: boolean; status?: number } = {}) {
  const tiles = Object.entries(tileFeatures).map(([k, f]) => {
    const [x, y] = k.split("/").map(Number);
    return { z: OVERTURE_ZOOM, x, y, bytes: mvtTile([mvtLayer("building", f)]) };
  });
  const file = pmtilesArchive(tiles, { leafSize: 1, minZoom: 5, maxZoom: 14 });
  const urls: string[] = [];
  const ranges: string[] = [];
  const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
    urls.push(url);
    if (url === "https://stac.overturemaps.org/catalog.json") return Response.json(over.stac?.root ?? { latest: RELEASE });
    if (url === `https://stac.overturemaps.org/${RELEASE}/buildings/catalog.json`) return Response.json(over.stac?.theme ?? { links: [{ rel: "root", href: "https://stac.overturemaps.org/catalog.json" }, { rel: "pmtiles", href: ARCHIVE_URL }] });
    if (url === ARCHIVE_URL) {
      const range = new Headers(init?.headers).get("range") ?? "";
      ranges.push(range);
      const m = /^bytes=(\d+)-(\d+)$/.exec(range);
      if (!m || over.failTiles) return new Response("nope", { status: over.status ?? 503 });
      return new Response(file.slice(Number(m[1]), Number(m[2]) + 1), { status: 206 });
    }
    return new Response("unexpected host", { status: 404 });
  };
  return { fetchFn, urls, ranges };
}

const tmp = () => mkdtemp(join(tmpdir(), "doshy-overture-"));
const q = { ...C, radius: 250 };

test("the query is the data route's: plain decimals and a radius in range", () => {
  assert.deepEqual(parseOvertureQuery(new URLSearchParams("lat=51.4779&lon=-0.0015&radius=250")), q);
  for (const bad of ["lat=x&lon=0&radius=250", "lat=51&lon=0&radius=5", "lat=51&lon=0", "lat=91&lon=0&radius=250"]) assert.equal(typeof parseOvertureQuery(new URLSearchParams(bad)), "string", bad);
});

test("only the release's own archive on Overture's hosts is ever read: other hosts, ports, paths, schemes and credentials are refused", () => {
  assert.equal(checkedArchiveUrl(ARCHIVE_URL, RELEASE), ARCHIVE_URL);
  assert.ok(checkedArchiveUrl(`https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${RELEASE}/buildings.pmtiles`, RELEASE));
  for (const bad of [
    `https://evil.example/${RELEASE}/buildings.pmtiles`,
    `http://tiles.overturemaps.org/${RELEASE}/buildings.pmtiles`,
    `https://tiles.overturemaps.org:8443/${RELEASE}/buildings.pmtiles`,
    `https://user:pw@tiles.overturemaps.org/${RELEASE}/buildings.pmtiles`,
    `https://tiles.overturemaps.org/${RELEASE}/places.pmtiles`,
    `https://tiles.overturemaps.org/2026-10-21.0/buildings.pmtiles`,
    `https://tiles.overturemaps.org/${RELEASE}/buildings.pmtiles?x=1`,
    `https://tiles.overturemaps.org.evil.example/${RELEASE}/buildings.pmtiles`,
    "file:///etc/passwd",
    42,
    undefined,
  ]) assert.equal(checkedArchiveUrl(bad, RELEASE), undefined, String(bad));
  assert.ok(RELEASE_RE.test("2026-11-18.0") && !RELEASE_RE.test("../2026") && !RELEASE_RE.test("2026-11-18.0/x") && !RELEASE_RE.test("latest"));
});

test("release discovery: STAC root names the release, the theme catalogue links the archive; anything odd is an error with a sentence", async () => {
  const ok = fakeOverture({});
  assert.deepEqual(await discoverRelease(ok.fetchFn), { release: RELEASE, url: ARCHIVE_URL });
  await assert.rejects(discoverRelease(fakeOverture({}, { stac: { root: { latest: "../../etc" } } }).fetchFn), (e: unknown) => e instanceof SiteError && e.status === 502);
  await assert.rejects(discoverRelease(fakeOverture({}, { stac: { theme: { links: [{ rel: "pmtiles", href: "https://evil.example/x.pmtiles" }] } } }).fetchFn), (e: unknown) => e instanceof SiteError && /link/.test(e.message));
  await assert.rejects(discoverRelease(fakeOverture({}, { stac: { theme: {} } }).fetchFn), SiteError);
});

test("the release is looked up once a day, then remembered (also on disk); a stale one is used when the catalogue is down", async () => {
  resetOvertureMemory();
  const dir = await tmp();
  try {
    const net = fakeOverture({});
    const t0 = 1_000_000_000_000;
    assert.equal((await currentRelease({ fetchFn: net.fetchFn, dir, now: t0 })).release, RELEASE);
    const asked = net.urls.length;
    await currentRelease({ fetchFn: net.fetchFn, dir, now: t0 + 3600_000 });
    assert.equal(net.urls.length, asked, "within the day: no request");
    resetOvertureMemory(); // a restart
    await currentRelease({ fetchFn: net.fetchFn, dir, now: t0 + 7200_000 });
    assert.equal(net.urls.length, asked, "after a restart the file on disk answers");
    const dead = async () => Promise.reject(new TypeError("fetch failed"));
    resetOvertureMemory();
    const r = await currentRelease({ fetchFn: dead, dir, now: t0 + 3 * 24 * 3600_000 });
    assert.equal(r.release, RELEASE, "the catalogue is down: the last known release");
    resetOvertureMemory();
    await assert.rejects(currentRelease({ fetchFn: dead, dir: await tmp(), now: t0 }), (e: unknown) => e instanceof SiteError && e.status === 502);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ranges: only a real 206 of exactly the size asked for is accepted; absurd ranges are not even sent", async () => {
  const body = new Uint8Array(100).fill(7);
  const mk = (status: number, len: number) => rangeReader(ARCHIVE_URL, async () => new Response(new Uint8Array(len), { status }));
  assert.equal((await mk(206, 100)(0, 100)).length, 100);
  await assert.rejects(mk(200, 100)(0, 100), SiteError, "a server that ignores Range sends the whole 180 GB: never accepted");
  await assert.rejects(mk(206, 60)(0, 100), SiteError, "short");
  await assert.rejects(mk(206, 140)(0, 100), SiteError, "long");
  let asked = 0;
  const counting = rangeReader(ARCHIVE_URL, async () => {
    asked++;
    return new Response(body, { status: 206 });
  });
  for (const [o, l] of [[-1, 10], [0, 0], [0, 1e9], [1.5, 10]]) await assert.rejects(counting(o, l), SiteError);
  assert.equal(asked, 0);
});

test("a site's buildings: the tiles it needs are read, mapped, cached on disk; the second load makes no request at all", async () => {
  resetOvertureMemory();
  const dir = await tmp();
  try {
    const ids = overtureTiles(C, q.radius) ?? [];
    const feats: Record<string, FixtureFeature[]> = {};
    for (const t of ids) feats[`${t.x}/${t.y}`] = t.x === home.x && t.y === home.y ? [house("aaaaaaaa-1111-2222-3333-444444444444", CX + 100, CY + 100), house("bbbbbbbb-1111-2222-3333-444444444444", CX + 250, CY + 100, { height: -1, num_floors: 4 })] : [];
    const net = fakeOverture(feats);
    const a = await overtureBuildings(q, { fetchFn: net.fetchFn, dir, now: Date.now() });
    assert.equal(a.release, RELEASE);
    assert.equal(a.failed, 0);
    assert.equal(a.tiles, ids.length);
    assert.equal(a.attribution, OVERTURE_ATTRIBUTION);
    assert.equal(a.buildings.length, 2, JSON.stringify(a.buildings.map((b) => b.id)));
    assert.equal(a.withHeight, 2);
    assert.ok(a.buildings.every((b) => b.from === "overture" && b.ring.length >= 3));
    assert.ok(net.urls.every((u) => u.startsWith("https://stac.overturemaps.org/") || u === ARCHIVE_URL), "only Overture's hosts");
    assert.ok((await stat(tileFile(dir, RELEASE, ids[0]))).isFile());
    const before = net.urls.length;
    resetOvertureMemory();
    const b = await overtureBuildings(q, { fetchFn: net.fetchFn, dir, now: Date.now() });
    assert.equal(net.urls.length, before, "nothing was requested: the release and the tiles came from disk");
    assert.deepEqual(b.buildings, a.buildings);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a tile the archive does not have (no buildings there) is remembered as empty", async () => {
  resetOvertureMemory();
  const dir = await tmp();
  try {
    const net = fakeOverture({ "1/1": [] });
    const a = await overtureBuildings(q, { fetchFn: net.fetchFn, dir });
    assert.equal(a.buildings.length, 0);
    assert.equal(a.failed, 0);
    const empties = overtureTiles(C, q.radius) ?? [];
    assert.equal((await stat(tileFile(dir, RELEASE, empties[0]))).size, 0);
    const before = net.urls.length;
    await overtureBuildings(q, { fetchFn: net.fetchFn, dir });
    assert.equal(net.urls.length, before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("when Overture cannot be read the answer is a sentence, nothing is cached, and nothing throws raw", async () => {
  resetOvertureMemory();
  const dir = await tmp();
  try {
    const net = fakeOverture({}, { failTiles: true });
    await assert.rejects(overtureBuildings(q, { fetchFn: net.fetchFn, dir }), (e: unknown) => e instanceof SiteError && e.status === 502 && /Overture/.test(e.message));
    resetOvertureMemory();
    await assert.rejects(overtureBuildings(q, { fetchFn: async () => Promise.reject(new TypeError("fetch failed")), dir: await tmp() }), (e: unknown) => e instanceof SiteError && e.status === 502);
    resetOvertureMemory();
    const down = fakeOverture({ "1/1": [] }, { stac: { root: {} } });
    await assert.rejects(overtureBuildings(q, { fetchFn: down.fetchFn, dir: await tmp() }), SiteError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a damaged or expired tile file is read from the archive again", async () => {
  resetOvertureMemory();
  const dir = await tmp();
  try {
    const ids = overtureTiles(C, q.radius) ?? [];
    const feats: Record<string, FixtureFeature[]> = {};
    for (const t of ids) feats[`${t.x}/${t.y}`] = t.x === home.x && t.y === home.y ? [house("aaaaaaaa-1111-2222-3333-444444444444", CX + 100, CY + 100)] : [];
    const net = fakeOverture(feats);
    const now = Date.now();
    await overtureBuildings(q, { fetchFn: net.fetchFn, dir, now });
    const file = tileFile(dir, RELEASE, home.x === ids[0].x && home.y === ids[0].y ? ids[0] : ids.find((t) => t.x === home.x && t.y === home.y) ?? ids[0]);
    await writeFile(file, "not gzip");
    const again = await overtureBuildings(q, { fetchFn: net.fetchFn, dir, now });
    assert.equal(again.buildings.length, 1, "the damaged file was replaced from the archive");
    assert.ok((await readFile(file)).length > 20);
    const old = new Date(now - 2 * OVERTURE_TTL_MS);
    await utimes(file, old, old);
    const before = net.ranges.length;
    await overtureBuildings(q, { fetchFn: net.fetchFn, dir, now });
    assert.ok(net.ranges.length > before, "an expired file is fetched again");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
