import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OVERTURE_FALLBACK_NOTE,
  OVERTURE_PARTIAL_NOTE,
  TERRAIN_FALLBACK_NOTE,
  composeExternal,
  describeBuildings,
  describeTerrain,
  isOvertureAnswer,
  isTerrainAnswer,
  radiusBucket,
  wantsOverture,
  wantsTerrain,
  type Outcome,
  type OvertureAnswer,
  type TerrainAnswer,
} from "./siteExternal.ts";
import { ELEVATION_ATTRIBUTION, TERRAIN_NOTE } from "./siteElevation.ts";
import { DEFAULT_SITE, siteOf, type Site, type SiteBuilding, type SiteData, type SiteTerrain, type XY } from "./siteTypes.ts";

const rect = (x: number, y: number, w: number, d: number): XY[] => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
const bld = (id: string, ring: XY[], over: Partial<SiteBuilding> = {}): SiteBuilding => ({ id, ring, height: 6, minHeight: 0, roof: "flat", roofHeight: 0, kind: "yes", ...over });

const on = (over: Parameters<typeof siteOf>[0] = {}): Site => siteOf({ ...DEFAULT_SITE, enabled: true, ...over });
const base = (over: Partial<SiteData> = {}): SiteData => ({
  version: 1,
  center: { lat: 51.4779, lon: -0.0015 },
  radius: 250,
  fetchedAt: 1,
  buildings: [bld("o1", rect(0, 0, 10, 10)), bld("o2", rect(40, 0, 10, 10), { real: true, height: 9 })],
  trees: [],
  areas: [],
  roads: [],
  terrain: { n: 3, step: 100, h: [0, 0, 0, 0, 0, 0, 0, 0, 0], base: 10 },
  attribution: ["\u00a9 OpenStreetMap contributors (ODbL)", ELEVATION_ATTRIBUTION],
  notes: [TERRAIN_NOTE],
  ...over,
});

const detailed = (n = 5): SiteTerrain => ({ n, step: 10, h: Array.from({ length: n * n }, (_, k) => (k === (n * n - 1) / 2 ? 0 : (k % n) * 0.5)), base: 40, src: "aws" });
const terrainOk = (n = 5): Outcome<TerrainAnswer> => ({ state: "ok", value: { terrain: detailed(n), zoom: 15, tiles: 2, attribution: "Terrain: AWS" } });
const overtureOk = (over: Partial<OvertureAnswer> = {}): Outcome<OvertureAnswer> => ({
  state: "ok",
  value: { release: "2026-11-18.0", buildings: [bld("v1", rect(0.2, 0.1, 10, 10), { real: true, height: 20, from: "overture" }), bld("v3", rect(100, 0, 10, 10), { from: "overture" })], tiles: 2, failed: 0, withHeight: 1, attribution: "Buildings: Overture", ...over },
});
const IDLE: Outcome<never> = { state: "idle" };

test("what is wanted follows the site: detailed ground unless Standard or the layer is off; Overture unless OpenStreetMap only, the city model or no buildings", () => {
  assert.equal(wantsTerrain(on()), true);
  assert.equal(wantsTerrain(on({ terrainFrom: "high" })), true);
  assert.equal(wantsTerrain(on({ terrainFrom: "standard" })), false);
  assert.equal(wantsTerrain(on({ layers: { ...DEFAULT_SITE.layers, terrain: false } })), false);
  assert.equal(wantsTerrain(siteOf({ ...DEFAULT_SITE, enabled: false })), false, "nothing is asked while the surroundings are off");
  assert.equal(wantsOverture(on()), true);
  assert.equal(wantsOverture(on({ buildingData: "overture" })), true);
  assert.equal(wantsOverture(on({ buildingData: "osm" })), false);
  assert.equal(wantsOverture(on({ buildingsFrom: "city" })), false);
  assert.equal(wantsOverture(on({ layers: { ...DEFAULT_SITE.layers, buildings: false } })), false);
  assert.equal(wantsOverture(siteOf({ ...DEFAULT_SITE, enabled: false })), false);
});

test("the radius sent matches the data route's cache steps", () => {
  assert.deepEqual([100, 120, 250, 251, 599, 600].map(radiusBucket), [100, 150, 250, 300, 600, 600]);
});

test("the plan's new site fields are completed, clamped and stored only when they are not the default", () => {
  assert.deepEqual(Object.keys(siteOf({ ...DEFAULT_SITE })).filter((k) => /terrain|building/i.test(k)), ["buildingsFrom"].filter(() => false));
  const s = siteOf({ ...DEFAULT_SITE, buildingData: "overture", terrainFrom: "high", terrainScale: 2, terrainSmooth: 2 });
  assert.deepEqual([s.buildingData, s.terrainFrom, s.terrainScale, s.terrainSmooth], ["overture", "high", 2, 2]);
  const junk = siteOf({ ...DEFAULT_SITE, buildingData: "both" as never, terrainFrom: "auto" as never, terrainScale: 1, terrainSmooth: 7 as never });
  assert.deepEqual([junk.buildingData, junk.terrainFrom, junk.terrainScale, junk.terrainSmooth], [undefined, undefined, undefined, undefined], "defaults and nonsense are not kept");
  assert.equal(siteOf({ ...DEFAULT_SITE, terrainScale: 99 }).terrainScale, 3);
  assert.equal(siteOf({ ...DEFAULT_SITE, terrainScale: 0.1 }).terrainScale, 0.5);
  assert.equal(siteOf({ ...DEFAULT_SITE, terrainScale: Number.NaN }).terrainScale, undefined);
  const a = siteOf(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(a, s, "survives a save and load");
});

test("answers from the server are believed only when they are shaped right", () => {
  assert.ok(isTerrainAnswer({ terrain: detailed(), zoom: 15, tiles: 1, attribution: "x" }));
  const t = detailed();
  for (const bad of [
    { ...t, h: t.h.slice(1) },
    { ...t, n: 4 },
    { ...t, n: 1001 },
    { ...t, step: 0 },
    { ...t, h: t.h.map((v, i) => (i === 3 ? Number.NaN : v)) },
    { ...t, h: t.h.map((v, i) => (i === 3 ? 1e6 : v)) },
    { ...t, h: t.h.map((v, i) => (i === 12 ? 3 : v)) },
  ]) assert.equal(isTerrainAnswer({ terrain: bad, zoom: 15, tiles: 1, attribution: "x" }), false);
  assert.equal(isTerrainAnswer(null), false);
  assert.equal(isTerrainAnswer({ error: "no" }), false);

  const good = { release: "r", buildings: [bld("a", rect(0, 0, 5, 5))], tiles: 1, failed: 0, withHeight: 0, attribution: "x" };
  assert.ok(isOvertureAnswer(good));
  assert.equal(isOvertureAnswer({ ...good, buildings: [bld("a", [[0, 0], [1, 1]])] }), false, "two points are no outline");
  assert.equal(isOvertureAnswer({ ...good, buildings: [bld("a", rect(0, 0, 5, 5), { roof: "mansard" as never })] }), false, "an unknown roof shape");
  assert.equal(isOvertureAnswer({ ...good, buildings: [bld("a", rect(0, 0, 5, 5), { height: Number.NaN })] }), false);
  assert.equal(isOvertureAnswer({ ...good, buildings: [bld("a", [[0, 0], [1e9, 0], [0, 1]])] }), false, "a point a million kilometres away");
  assert.equal(isOvertureAnswer({ ...good, buildings: Array.from({ length: 5001 }, (_, i) => bld(`b${i}`, rect(0, 0, 5, 5))) }), false);
  assert.equal(isOvertureAnswer({ ...good, buildings: "none" }), false);
});

test("the detailed ground replaces the Open-Meteo one: grid, note and credit; the plan's centre is still exactly 0", () => {
  const { data, terrain } = composeExternal(base(), on(), terrainOk(), IDLE);
  assert.equal(data.terrain?.src, "aws");
  assert.equal(data.terrain?.h[12], 0);
  assert.ok(!data.attribution.includes(ELEVATION_ATTRIBUTION) && data.attribution.includes("Terrain: AWS"));
  assert.ok(!data.notes.includes(TERRAIN_NOTE) && data.notes.some((n) => /AWS Terrain Tiles/.test(n)));
  assert.deepEqual([terrain.state, terrain.spacing, terrain.zoom], ["high", 10, 15]);
  assert.ok(describeTerrain(terrain).includes("10 m"));
});

test("smoothing and exaggeration chosen in the panel reach the grid", () => {
  const flat = composeExternal(base(), on(), terrainOk(), IDLE).data.terrain;
  const x2 = composeExternal(base(), on({ terrainScale: 2 }), terrainOk(), IDLE).data.terrain;
  assert.ok(flat && x2);
  assert.equal(x2.h[14], flat.h[14] * 2);
  assert.equal(x2.h[12], 0);
});

test("when the detailed ground failed the standard ground stays with a sentence; when the server has third-party downloads off, silently", () => {
  const failed = composeExternal(base(), on(), { state: "failed", disabled: false }, IDLE);
  assert.deepEqual(failed.data.terrain, base().terrain);
  assert.ok(failed.data.notes.includes(TERRAIN_FALLBACK_NOTE));
  assert.equal(failed.terrain.state, "fallback");
  assert.ok(describeTerrain(failed.terrain).length > 20);
  const off = composeExternal(base(), on(), { state: "failed", disabled: true }, IDLE);
  assert.ok(!off.data.notes.includes(TERRAIN_FALLBACK_NOTE));
  assert.equal(off.terrain.state, "standard");
  const waiting = composeExternal(base(), on(), { state: "loading" }, IDLE);
  assert.deepEqual(waiting.data.terrain, base().terrain, "the standard ground is drawn while the detailed one loads");
  assert.equal(waiting.terrain.state, "loading");
});

test("Standard, or the ground layer off, leaves the Open-Meteo ground and its credit alone", () => {
  for (const site of [on({ terrainFrom: "standard" }), on({ layers: { ...DEFAULT_SITE.layers, terrain: false } })]) {
    const r = composeExternal(base(), site, terrainOk(), IDLE);
    assert.deepEqual(r.data, base());
  }
});

test("Both: OpenStreetMap footprints with Overture's real heights, the extra buildings added, the credit shown, the counts reported", () => {
  const { data, buildings } = composeExternal(base(), on(), IDLE, overtureOk());
  assert.equal(data.buildings.length, 3);
  assert.equal(data.buildings.find((b) => b.id === "o1")?.height, 20, "o1 had a guess; Overture measured it");
  assert.equal(data.buildings.find((b) => b.id === "o2")?.height, 9, "o2 had a real height already");
  assert.ok(data.buildings.some((b) => b.id === "v3"), "a building only Overture has");
  assert.ok(data.attribution.includes("Buildings: Overture"));
  assert.equal(buildings.state, "ready");
  assert.deepEqual([buildings.stats?.osmWithHeight, buildings.stats?.withHeight], [1, 2]);
  assert.ok(/2 of 3 buildings/.test(describeBuildings(buildings)) && /OpenStreetMap alone: 1 of 2/.test(describeBuildings(buildings)));
});

test("Overture only: its buildings replace OpenStreetMap's; OpenStreetMap only (or the city model): nothing changes", () => {
  const only = composeExternal(base(), on({ buildingData: "overture" }), IDLE, overtureOk());
  assert.deepEqual(only.data.buildings.map((b) => b.id), ["v1", "v3"]);
  for (const site of [on({ buildingData: "osm" }), on({ buildingsFrom: "city" })]) {
    const r = composeExternal(base(), site, IDLE, overtureOk());
    assert.deepEqual(r.data.buildings, base().buildings);
    assert.ok(!r.data.attribution.includes("Buildings: Overture"));
    assert.equal(r.buildings.state, "off");
  }
});

test("Overture failing says so in the plan's words and keeps OpenStreetMap; a partly read answer warns; a server with downloads off says nothing", () => {
  const down = composeExternal(base(), on(), IDLE, { state: "failed", disabled: false });
  assert.deepEqual(down.data.buildings, base().buildings);
  assert.ok(down.data.notes.includes(OVERTURE_FALLBACK_NOTE));
  assert.equal(OVERTURE_FALLBACK_NOTE, "Overture data unavailable right now, showing OpenStreetMap.");
  assert.equal(down.buildings.state, "unavailable");
  assert.equal(describeBuildings(down.buildings), OVERTURE_FALLBACK_NOTE);
  const silent = composeExternal(base(), on(), IDLE, { state: "failed", disabled: true });
  assert.ok(!silent.data.notes.includes(OVERTURE_FALLBACK_NOTE));
  const partial = composeExternal(base(), on(), IDLE, overtureOk({ failed: 1 }));
  assert.ok(partial.data.notes.includes(OVERTURE_PARTIAL_NOTE));
  assert.equal(describeBuildings(composeExternal(base(), on(), IDLE, { state: "loading" }).buildings).includes("Loading"), true);
});

test("composing is cheap to repeat: nothing wanted returns the very same data object", () => {
  const d = base();
  assert.equal(composeExternal(d, on({ terrainFrom: "standard", buildingData: "osm" }), IDLE, IDLE).data, d);
});
