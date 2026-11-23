import assert from "node:assert/strict";
import { test } from "node:test";
import { PHOTO_FAILED_NOTE, PHOTO_PARTIAL_NOTE, composeSiteData, fetchPlan, mergeTrees, siteTarget, targetKey } from "./siteState.ts";
import { DEFAULT_SITE, siteOf, type SiteBuilding, type SiteData, type SiteTree } from "./siteTypes.ts";

const HOME = { "zone.home": { attributes: { latitude: 51.4779, longitude: -0.0015 } } };
const on = (over: Parameters<typeof siteOf>[0] = {}) => siteOf({ ...DEFAULT_SITE, enabled: true, ...over });
const tree = (x: number, y: number, over: Partial<SiteTree> = {}): SiteTree => ({ x, y, height: 8, crown: 5, leaf: "broad", source: "photo", ...over });
const block = (x: number, y: number, w: number, h: number): SiteBuilding => ({ id: "b", ring: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], height: 10, minHeight: 0, roof: "flat", roofHeight: 0, kind: "yes" });
const raw = (over: Partial<SiteData> = {}): SiteData => ({ version: 1, center: { lat: 1, lon: 2 }, radius: 250, fetchedAt: 1, buildings: [], trees: [], areas: [], roads: [], attribution: ["OSM"], notes: [], ...over });

test("target: nothing while off, the home zone for source home, manual coordinates for manual, nothing when the position is unknown", () => {
  assert.equal(siteTarget(siteOf(undefined), HOME), null);
  assert.deepEqual(siteTarget(on(), HOME), { center: { lat: 51.4779, lon: -0.0015 }, radius: 250 });
  const exact = { "zone.home": { attributes: { latitude: 51.47790000081094, longitude: -0.00150002973862 } } };
  assert.deepEqual(siteTarget(on({ radius: 333.3333333 }), exact), { center: { lat: 51.4779, lon: -0.0015 }, radius: 333 }, "full-precision coordinates and fractional radii are rounded");
  assert.deepEqual(siteTarget(on({ source: "manual", lat: 10, lon: 20, radius: 400 }), HOME), { center: { lat: 10, lon: 20 }, radius: 400 });
  assert.equal(siteTarget(on(), {}), null);
  assert.equal(siteTarget(on(), undefined), null);
});

test("fetch plan: never when disabled or without a position", () => {
  assert.deepEqual(fetchPlan(siteOf(undefined), HOME, {}), { data: false, photo: false });
  assert.deepEqual(fetchPlan(siteOf({ enabled: false, layers: { ...DEFAULT_SITE.layers, satellite: true } }), HOME, {}), { data: false, photo: false });
  assert.deepEqual(fetchPlan(on(), {}, {}), { data: false, photo: false });
});

test("fetch plan: data once per place and radius, again when either changes, not again after a failure until the place changes", () => {
  const key = targetKey({ center: { lat: 51.4779, lon: -0.0015 }, radius: 250 });
  assert.equal(key, "51.47790_-0.00150_r250");
  assert.deepEqual(fetchPlan(on(), HOME, {}), { key, data: true, photo: false });
  assert.equal(fetchPlan(on(), HOME, { dataKey: key }).data, false);
  assert.equal(fetchPlan(on({ radius: 300 }), HOME, { dataKey: key }).data, true, "radius changed");
  assert.equal(fetchPlan(on({ source: "manual", lat: 1, lon: 2 }), HOME, { dataKey: key }).data, true, "centre changed");
  assert.equal(fetchPlan(on(), HOME, { dataFailedKey: key }).data, false, "a failed fetch is not retried in a loop");
  const moved = { "zone.home": { attributes: { latitude: 51.5, longitude: -0.0015 } } };
  assert.equal(fetchPlan(on(), moved, { dataFailedKey: key }).data, true);
  const nudged = { "zone.home": { attributes: { latitude: 51.4779001, longitude: -0.0014999 } } };
  assert.equal(fetchPlan(on(), nudged, { dataKey: key }).data, false, "sub-metre jitter in the home zone does not refetch");
});

test("fetch plan: the photo only while the satellite layer is on, once per place", () => {
  const sat = on({ layers: { ...DEFAULT_SITE.layers, satellite: true } });
  const p = fetchPlan(sat, HOME, {});
  assert.equal(p.photo, true);
  assert.equal(fetchPlan(sat, HOME, { photoKey: p.key }).photo, false);
  assert.equal(fetchPlan(sat, HOME, { photoFailedKey: p.key }).photo, false);
  assert.equal(fetchPlan(on(), HOME, {}).photo, false);
});

test("merging: a found tree on top of a mapped tree, inside a building or outside the radius is dropped", () => {
  const mapped = [tree(0, 0, { source: "osm", crown: 6 })];
  const found = [tree(1, 1), tree(20, 20), tree(52, 3), tree(300, 0), tree(0, -400)];
  const out = mergeTrees(mapped, found, [block(50, 0, 10, 10)], 250);
  assert.deepEqual(out.map((t) => [t.x, t.y, t.source]), [[0, 0, "osm"], [20, 20, "photo"]]);
});

test("merging: nearest the centre first, bounded", () => {
  const found = Array.from({ length: 4000 }, (_, i) => tree(((i * 7) % 400) - 200, Math.floor(i / 100) * 3 - 60));
  const out = mergeTrees([], found, [], 250);
  assert.equal(out.length, 3000);
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].x ** 2 + out[i - 1].y ** 2 <= out[i].x ** 2 + out[i].y ** 2);
});

test("composing: the satellite layer off leaves the data alone, on adds trees (if the trees layer is on), the credit, and notes", () => {
  const data = raw({ trees: [tree(0, 0, { source: "osm" })] });
  const photo = { trees: [tree(30, 0)], failed: 0, credit: "Imagery (c) Esri" };
  assert.equal(composeSiteData(data, photo, false, { trees: true, satellite: false }), data);
  assert.equal(composeSiteData(data, null, false, { trees: true, satellite: true }), data, "still loading");
  const both = composeSiteData(data, photo, false, { trees: true, satellite: true });
  assert.equal(both.trees.length, 2);
  assert.deepEqual(both.attribution, ["OSM", "Imagery (c) Esri"]);
  assert.equal(data.trees.length, 1, "the input is not changed");
  const noTrees = composeSiteData(data, photo, false, { trees: false, satellite: true });
  assert.equal(noTrees.trees.length, 1, "photo trees need the trees layer");
  assert.deepEqual(noTrees.attribution, ["OSM", "Imagery (c) Esri"]);
  assert.ok(composeSiteData(data, { ...photo, failed: 3 }, false, { trees: true, satellite: true }).notes.includes(PHOTO_PARTIAL_NOTE));
  assert.ok(composeSiteData(data, null, true, { trees: true, satellite: true }).notes.includes(PHOTO_FAILED_NOTE));
  assert.equal(composeSiteData(raw({ attribution: ["OSM", "Imagery (c) Esri"] }), photo, false, { trees: true, satellite: true }).attribution.length, 2, "credit not repeated");
});
