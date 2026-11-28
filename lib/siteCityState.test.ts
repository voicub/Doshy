import assert from "node:assert/strict";
import { test } from "node:test";
import { cityWant, gzip, isGzip, placeProblem, unpack } from "./siteCityState.ts";
import { siteOf, type SiteData } from "./siteTypes.ts";
import { CITY_CREDIT, creditsOf, mergeSite, siteSummary } from "./siteUi.ts";

const on = siteOf({ enabled: true, source: "manual", lat: 51.4779, lon: -0.0015 });
/** A site as a plan file from anywhere may carry it: untyped JSON. */
const fromFile = (json: string) => siteOf(JSON.parse(json));

test("a plan without city settings keeps OpenStreetMap and stores no city fields", () => {
  const s = siteOf(on);
  assert.equal(s.buildingsFrom, undefined);
  assert.equal(s.city, undefined);
  assert.equal(cityWant(s, undefined), null);
});

test("choosing the city model completes its settings with defaults; choosing OpenStreetMap again keeps them", () => {
  const city = mergeSite(on, { buildingsFrom: "city", city: { tiles: 5 } });
  assert.deepEqual([city.buildingsFrom, city.city?.tiles, city.city?.roads, city.city?.terrain], ["city", 5, true, false]);
  const back = mergeSite(city, { buildingsFrom: "osm" });
  assert.equal(back.buildingsFrom, undefined);
  assert.equal(back.city?.tiles, 5);
});

test("city settings from a plan file are validated: bad tiles, a bad file id or a half-given tile fall back or drop", () => {
  const s = fromFile('{"buildingsFrom":"city","city":{"tiles":7,"roads":"yes","file":{"id":"../x","name":"a.obj","z":16}}}');
  assert.deepEqual([s.city?.tiles, s.city?.roads, s.city?.file], [3, true, undefined]);
  const half = fromFile('{"buildingsFrom":"city","city":{"file":{"id":"city-1-ab","name":"m.obj","z":16,"x":100}}}').city?.file;
  assert.deepEqual(half, { id: "city-1-ab", name: "m.obj", z: 16 });
  const placed = fromFile('{"buildingsFrom":"city","city":{"file":{"id":"c","name":"m.obj","z":16,"x":100,"y":200}}}').city?.file;
  assert.deepEqual(placed, { id: "c", name: "m.obj", z: 16, x: 100, y: 200 });
  assert.equal(fromFile('{"buildingsFrom":"city","city":{"file":{"id":"c","name":"m","z":40}}}').city?.file, undefined);
});

test("removing the imported file takes it out of the settings", () => {
  const withFile = mergeSite(on, { buildingsFrom: "city", city: { file: { id: "c", name: "m.obj", z: 16 } } });
  assert.equal(withFile.city?.file?.id, "c");
  assert.equal(mergeSite(withFile, { city: { file: undefined } }).city?.file, undefined);
});

test("what to load follows the settings: a Vectiler run for the home's tiles, or the imported file; nothing while off", () => {
  const s = mergeSite(on, { buildingsFrom: "city", city: { tiles: 5, terrain: true, roads: false } });
  const want = cityWant(s, undefined);
  assert.equal(want?.from, "vectiler");
  assert.equal(want?.from === "vectiler" && want.url, "/api/site/city?lat=51.4779&lon=-0.0015&tiles=5&terrain=1&roads=0");
  assert.notEqual(cityWant(mergeSite(s, { city: { tiles: 3 } }), undefined)?.key, want?.key);
  assert.equal(cityWant(mergeSite(s, { enabled: false }), undefined), null);
  const file = cityWant(mergeSite(s, { city: { file: { id: "c1", name: "m.obj", z: 16 } } }), undefined);
  assert.deepEqual(file && [file.from, file.key], ["file", "file:c1"]);
});

test("the radius does not change what is loaded (the model is cut to it later)", () => {
  const s = mergeSite(on, { buildingsFrom: "city" });
  assert.equal(cityWant(mergeSite(s, { radius: 500 }), undefined)?.key, cityWant(s, undefined)?.key);
});

test("tile numbers are checked for zoom, range and pairing", () => {
  assert.equal(placeProblem(16, null, null), undefined);
  assert.equal(placeProblem(16, 32767, 21800), undefined);
  assert.match(placeProblem(9, null, null) ?? "", /zoom/i);
  assert.match(placeProblem(16, 5, null) ?? "", /both/i);
  assert.match(placeProblem(10, 1024, 3) ?? "", /0 to 1023/);
  assert.match(placeProblem(16, 1.5, 3) ?? "", /whole/);
});

test("a model is packed for storage and unpacked again; bytes that are not gzip pass through", async () => {
  const text = new TextEncoder().encode("v 0 0 0\n".repeat(5000));
  const packed = await gzip(text);
  assert.ok(isGzip(packed) && packed.length < text.length / 10);
  assert.deepEqual(await unpack(new Uint8Array(packed)), text);
  assert.deepEqual(await unpack(text), text);
});

test("the credit line names Nextzen when the city model is on, and the summary leaves out OpenStreetMap's buildings and roads then", () => {
  assert.ok(creditsOf(undefined, false, true).includes(CITY_CREDIT));
  assert.ok(CITY_CREDIT.includes("\u00a9 OpenStreetMap contributors, Nextzen"));
  assert.ok(!creditsOf(undefined, false).includes(CITY_CREDIT));
  const data: SiteData = { version: 1, center: { lat: 0, lon: 0 }, radius: 250, fetchedAt: 0, trees: [], areas: [], attribution: [], notes: [], roads: [{ id: "r", kind: "residential", width: 5, pts: [] }], buildings: [{ id: "a", ring: [], height: 6, minHeight: 0, roof: "flat", roofHeight: 0, kind: "yes" }, { id: "b", ring: [], height: 6, minHeight: 0, roof: "flat", roofHeight: 0, kind: "yes" }] };
  const layers = { buildings: true, trees: false, roads: true, water: false, terrain: false, satellite: false };
  assert.match(siteSummary(data, layers), /2 buildings/);
  assert.equal(siteSummary(data, layers, true), "nothing selected to show");
});
