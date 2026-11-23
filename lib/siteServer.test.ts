import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { latLonToSite } from "./geo.ts";
import { CACHE_TTL_MS, OVERPASS_URLS, PARTIAL_TTL_MS, SiteError, USER_AGENT, buildSiteData, fetchOverpass, parseSiteQuery, readCache, siteData, siteKey, writeCache } from "./siteServer.ts";
import type { SiteData } from "./siteTypes.ts";

const C = { lat: 51.4779, lon: -0.0015 };
const fixture: unknown = JSON.parse(readFileSync(new URL("./siteOsm.fixture.json", import.meta.url), "utf8"));
const q = (s: string) => parseSiteQuery(new URLSearchParams(s));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { url: string; init?: RequestInit };
/** A fake network: Overpass answers `overpass` (or fails), Open-Meteo a rising plane (or fails). */
function network(opts: { overpass?: (n: number) => Response; elevation?: "ok" | "fail" } = {}) {
  const calls: Call[] = [];
  let overpassCalls = 0;
  const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    if (url.includes("open-meteo")) {
      if (opts.elevation === "fail") return json({ error: true }, 429);
      const sp = new URL(url).searchParams;
      const lats = (sp.get("latitude") ?? "").split(",").map(Number);
      const lons = (sp.get("longitude") ?? "").split(",").map(Number);
      return json({ elevation: lats.map((la, i) => 200 + 0.1 * latLonToSite(C, la, lons[i])[0]) });
    }
    return (opts.overpass ?? (() => json(fixture)))(overpassCalls++);
  };
  return { fetchFn, calls, overpassCalls: () => calls.filter((c) => !c.url.includes("open-meteo")) };
}

test("query validation: plain decimals in range, a radius of 100 to 600, everything else is a sentence", () => {
  assert.deepEqual(q("lat=51.4779&lon=-0.0015&radius=250"), { lat: 51.4779, lon: -0.0015, radius: 250, fresh: false });
  assert.deepEqual(q("lat=51.47790000081094&lon=-0.00150002973862&radius=250"), { lat: 51.47790000081094, lon: -0.00150002973862, radius: 250, fresh: false }, "what Home Assistant stores");
  assert.deepEqual(q("lat=-33&lon=-70.5&radius=100&fresh=1"), { lat: -33, lon: -70.5, radius: 100, fresh: true });
  for (const bad of [
    "", "lat=47&lon=23", "lat=47&radius=250", "lat=91&lon=0&radius=250", "lat=0&lon=181&radius=250", "lat=1e1&lon=0&radius=250", "lat=NaN&lon=0&radius=250",
    "lat=47,5&lon=23&radius=250", "lat=%2047&lon=23&radius=250", "lat=47&lon=23&radius=99", "lat=47&lon=23&radius=601", "lat=47&lon=23&radius=abc", "lat=47&lon=23&radius=250;drop",
    "lat=47)&lon=23&radius=250", "lat=47&lon=23&radius=-250",
  ]) assert.equal(typeof q(bad), "string", bad);
});

test("cache key: five decimals and a 50 m radius step", () => {
  assert.deepEqual(siteKey({ lat: 51.4779004, lon: -0.0014997, radius: 250 }), { key: "51.47790_-0.00150_r250", lat: 51.4779, lon: -0.0015, radius: 250 });
  assert.equal(siteKey({ lat: 1, lon: 2, radius: 251 }).radius, 300);
  assert.equal(siteKey({ lat: 1, lon: 2, radius: 600 }).radius, 600);
  assert.equal(siteKey({ lat: 1, lon: 2, radius: 100 }).radius, 100);
});

test("Overpass: sends our User-Agent and only the query, falls back to the mirror, then retries the main server once", async () => {
  const net = network({ overpass: (n) => (n < 2 ? json({}, 504) : json(fixture)) });
  const r = await fetchOverpass("QUERY", net.fetchFn, 0);
  assert.ok(r);
  const urls = net.overpassCalls().map((c) => c.url);
  assert.deepEqual(urls, [OVERPASS_URLS[0], OVERPASS_URLS[1], OVERPASS_URLS[0]]);
  const init = net.overpassCalls()[0].init;
  assert.equal((init?.headers as Record<string, string>)["user-agent"], USER_AGENT);
  assert.equal(init?.body, "data=QUERY");
});

test("Overpass: a half-finished answer (remark) counts as a failure and gives undefined after three tries", async () => {
  const net = network({ overpass: () => json({ elements: [], remark: "runtime error: Query timed out in \"query\" at line 1" }) });
  assert.equal(await fetchOverpass("Q", net.fetchFn, 0), undefined);
  assert.equal(net.overpassCalls().length, 3);
});

test("a full answer: OpenStreetMap parts, a terrain grid, attribution; written to the cache and served from it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "site-"));
  try {
    const net = network();
    const a = await siteData({ lat: C.lat, lon: C.lon, radius: 150, fresh: false }, { fetchFn: net.fetchFn, dir, now: 1_000_000 });
    assert.equal(a.version, 1);
    assert.equal(a.buildings.length, 15);
    assert.equal(a.roads.length, 6);
    assert.ok(a.terrain && a.terrain.h.length === a.terrain.n ** 2);
    assert.ok(a.attribution.some((s) => s.includes("OpenStreetMap")) && a.attribution.some((s) => s.includes("Copernicus")));
    assert.deepEqual(a.center, { lat: 51.4779, lon: -0.0015 });
    assert.equal(a.radius, 150);
    const before = net.calls.length;
    const b = await siteData({ lat: C.lat, lon: C.lon, radius: 140, fresh: false }, { fetchFn: net.fetchFn, dir, now: 2_000_000 });
    assert.equal(net.calls.length, before, "the second call never touches the network");
    assert.equal(b.fetchedAt, a.fetchedAt);
    assert.equal(b.radius, 150, "the answer covers at least the radius asked");
    assert.deepEqual(await readdir(dir), ["51.47790_-0.00150_r150.json"]);
    await siteData({ lat: C.lat, lon: C.lon, radius: 150, fresh: true }, { fetchFn: net.fetchFn, dir, now: 70_000_000 });
    assert.ok(net.calls.length > before, "fresh skips the cache");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("two callers asking for the same place at once share one fetch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "site-"));
  try {
    const net = network();
    const ask = () => siteData({ lat: 10.5, lon: 20.5, radius: 100, fresh: false }, { fetchFn: net.fetchFn, dir, now: 200_000_000 });
    await Promise.all([ask(), ask()]);
    assert.equal(net.overpassCalls().length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("elevation down: buildings still come, with a plain note and no terrain; kept only briefly", async () => {
  const net = network({ elevation: "fail" });
  const { data, complete } = await buildSiteData(C.lat, C.lon, 150, net.fetchFn, 5, 0);
  assert.equal(data.terrain, undefined);
  assert.equal(data.buildings.length, 15);
  assert.equal(complete, false);
  assert.ok(data.notes.length > 0, "the gap is explained");
  assert.ok(!JSON.stringify(data).includes("429") && !JSON.stringify(data).includes("HTTP"), "never upstream text");
});

test("OpenStreetMap down: the ground height still comes, with a note; both down: a 502 sentence", async () => {
  const dead = network({ overpass: () => json({}, 504) });
  const { data } = await buildSiteData(C.lat, C.lon, 150, dead.fetchFn, 5, 0);
  assert.equal(data.buildings.length, 0);
  assert.ok(data.terrain);
  assert.ok(data.notes.length > 0, "the gap is explained");
  assert.ok(!data.attribution.some((s) => s.includes("OpenStreetMap")));
  const none = network({ overpass: () => json({}, 504), elevation: "fail" });
  await assert.rejects(buildSiteData(C.lat, C.lon, 150, none.fetchFn, 5, 0), (e: unknown) => e instanceof SiteError && e.status === 502 && !/504|429/.test(e.message));
});

test("cache lifetime: 30 days for a complete answer, 10 minutes for a partial one; junk files are ignored; the folder stays bounded", async () => {
  const dir = await mkdtemp(join(tmpdir(), "site-"));
  try {
    const data: SiteData = { version: 1, center: C, radius: 100, fetchedAt: 1000, buildings: [], trees: [], areas: [], roads: [], attribution: [], notes: [] };
    await writeCache("a", { complete: true, data }, dir);
    await writeCache("b", { complete: false, data }, dir);
    assert.ok(await readCache("a", 1000 + CACHE_TTL_MS - 1, dir));
    assert.equal(await readCache("a", 1000 + CACHE_TTL_MS + 1, dir), undefined);
    assert.ok(await readCache("b", 1000 + PARTIAL_TTL_MS - 1, dir));
    assert.equal(await readCache("b", 1000 + PARTIAL_TTL_MS + 1, dir), undefined);
    assert.equal(await readCache("missing", 1000, dir), undefined);
    await writeCache("junk", { complete: true, data: { nope: 1 } as unknown as SiteData }, dir);
    assert.equal(await readCache("junk", 1000, dir), undefined);
    for (let i = 0; i < 205; i++) await writeCache(`k${i}`, { complete: true, data }, dir);
    assert.ok((await readdir(dir)).length <= 200);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
