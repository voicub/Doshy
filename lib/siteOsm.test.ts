import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { siteToLatLon } from "./geo.ts";
import { MAX_TREES, cssColor, joinRings, overpassQuery, parseMetres, parseOverpass } from "./siteOsm.ts";
import { polygonArea } from "./siteGeom.ts";
import type { XY } from "./siteTypes.ts";

const C = { lat: 51.4779, lon: -0.0015 };
const fixture: unknown = JSON.parse(readFileSync(new URL("./siteOsm.fixture.json", import.meta.url), "utf8"));
const near = (a: number, b: number, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

/** A closed OSM way for a rectangle given in site metres. */
const rect = (x: number, y: number, w: number, h: number): { lat: number; lon: number }[] => {
  const ring: XY[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
  return ring.map((p) => siteToLatLon(C, p));
};
const way = (id: number, tags: Record<string, string>, geometry: unknown) => ({ type: "way", id, tags, geometry });
const parse = (elements: unknown[], radius = 250) => parseOverpass({ elements }, C, radius);

test("the recorded Overpass answer turns into buildings, roads and one pitch, with plausible sizes", () => {
  const r = parseOverpass(fixture, C, 150);
  assert.equal(r.buildings.length, 15);
  assert.equal(r.roads.length, 6);
  assert.equal(r.areas.length, 1);
  assert.equal(r.areas[0].kind, "grass");
  assert.equal(r.trees.length, 0);
  for (const b of r.buildings) {
    assert.ok(b.ring.length >= 3 && b.height >= 2.5 && b.height < 40 && b.roofHeight >= 0, b.id);
    assert.ok(b.ring.every(([x, y]) => Math.abs(x) < 400 && Math.abs(y) < 400));
  }
  const apartments = r.buildings.filter((b) => b.kind === "apartments");
  assert.equal(apartments.length, 6);
  assert.ok(apartments.every((b) => b.roof === "flat" && b.roofHeight === 0));
  assert.ok(apartments.some((b) => b.height === 15), "untagged blocks get the 15 m default");
  assert.ok(r.buildings.some((b) => b.kind === "yes" && b.height === 16), "an explicit height tag wins");
  assert.ok(r.roads.every((x) => x.pts.length >= 2 && x.width > 0));
  assert.deepEqual(new Set(r.roads.map((x) => x.kind)), new Set(["residential", "service", "footway"]));
});

test("the query asks for a square box of the right size around the point and names the data we use", () => {
  const q = overpassQuery(C.lat, C.lon, 150);
  assert.match(q, /^\[out:json\]\[timeout:55\]/);
  assert.match(q, /\(51\.476552,-0\.003659,51\.479248,0\.000659\)/);
  for (const w of ["building", 'natural"="tree', "tree_row", "landuse", "leisure", "waterway", "highway", "railway", "parking"]) assert.ok(q.includes(w), w);
  assert.ok(q.endsWith("out geom;"));
});

test("height: tag in metres, else levels x 3, else the default for the kind", () => {
  const sq = rect(0, 0, 20, 20);
  const r = parse([
    way(1, { building: "yes", height: "12.5 m" }, sq),
    way(2, { building: "house", "building:levels": "2" }, sq),
    way(3, { building: "apartments" }, sq),
    way(4, { building: "garage" }, sq),
    way(5, { building: "yes" }, rect(30, 0, 8, 8)),
    way(6, { building: "yes" }, rect(60, 0, 20, 20)),
    way(7, { building: "house", height: "lots" }, sq),
  ]);
  const h = Object.fromEntries(r.buildings.map((b) => [b.id, b.height]));
  assert.equal(h.w1, 12.5);
  assert.equal(h.w2, 6);
  assert.equal(h.w3, 15);
  assert.equal(h.w4, 3);
  assert.equal(h.w5, 7, "a small untagged building");
  assert.equal(h.w6, 12, "a large untagged building");
  assert.equal(h.w7, 6, "unreadable height falls back to the kind");
});

test("roof: tag mapping, kind defaults, ridge height from the tag, the levels, or a quarter of the short side capped at 4 m", () => {
  const r = parse([
    way(1, { building: "house", "roof:shape": "hipped", "roof:height": "2.5" }, rect(0, 0, 10, 10)),
    way(2, { building: "house" }, rect(20, 0, 10, 10)),
    way(3, { building: "house" }, rect(40, 0, 30, 30)),
    way(4, { building: "apartments", "roof:shape": "gabled", "roof:levels": "2" }, rect(80, 0, 20, 20)),
    way(5, { building: "apartments" }, rect(110, 0, 20, 20)),
    way(6, { building: "house", "roof:shape": "gambrel" }, rect(140, 0, 10, 10)),
    way(7, { building: "house", "roof:shape": "flat" }, rect(160, 0, 10, 10)),
    way(8, { building: "house", height: "9", "roof:shape": "gabled", "roof:height": "3" }, rect(180, 0, 10, 10)),
    way(9, { building: "house", "roof:shape": "round" }, rect(200, 0, 10, 10)),
  ]);
  const b = Object.fromEntries(r.buildings.map((x) => [x.id, x]));
  assert.deepEqual([b.w1.roof, b.w1.roofHeight], ["hipped", 2.5]);
  assert.deepEqual([b.w2.roof, b.w2.roofHeight], ["gabled", 2.5]);
  assert.deepEqual([b.w3.roof, b.w3.roofHeight], ["gabled", 4]);
  assert.deepEqual([b.w4.roof, b.w4.roofHeight], ["gabled", 6]);
  assert.deepEqual([b.w5.roof, b.w5.roofHeight], ["flat", 0]);
  assert.equal(b.w6.roof, "gabled");
  assert.equal(b.w7.roofHeight, 0);
  assert.deepEqual([b.w8.height, b.w8.roofHeight], [6, 3], "`height` is the total: eaves = total - roof");
  assert.equal(b.w9.roof, "gabled", "an unknown shape falls back to the kind's default");
});

test("min_height lifts a building but never above its top", () => {
  const r = parse([way(1, { building: "yes", height: "10", min_height: "4" }, rect(0, 0, 20, 20)), way(2, { building: "yes", height: "10", min_height: "40" }, rect(30, 0, 20, 20))]);
  assert.equal(r.buildings[0].minHeight, 4);
  assert.ok(r.buildings[1].minHeight < r.buildings[1].height);
});

test("colours: CSS names and #hex pass, anything else is dropped", () => {
  assert.equal(cssColor("Red"), "red");
  assert.equal(cssColor("#A0B0c0"), "#a0b0c0");
  assert.equal(cssColor("#fff"), "#fff");
  for (const bad of ["red; background:url(x)", "rgb(1,2,3)", "#12345", "reddish", "", undefined, "url(javascript:1)"]) assert.equal(cssColor(bad), undefined, String(bad));
  const r = parse([way(1, { building: "house", "roof:colour": "brown", "building:colour": "<script>" }, rect(0, 0, 10, 10))]);
  assert.equal(r.buildings[0].roofColor, "brown");
  assert.equal(r.buildings[0].wallColor, undefined);
});

test("parseMetres accepts plain metres only", () => {
  assert.equal(parseMetres("12"), 12);
  assert.equal(parseMetres(" 7,5 m "), 7.5);
  for (const bad of ["12 ft", "10-12", "", "0", "-3", "1e3", "9999", undefined]) assert.equal(parseMetres(bad), undefined, String(bad));
});

test("a multipolygon joins its pieces into one outline and keeps the courtyard as a hole", () => {
  const outer = rect(0, 0, 40, 40);
  const a = outer.slice(0, 3);
  const b = outer.slice(2);
  const hole = rect(10, 10, 10, 10);
  const r = parse([{ type: "relation", id: 9, tags: { building: "apartments", type: "multipolygon" }, members: [{ type: "way", role: "outer", geometry: b }, { type: "way", role: "outer", geometry: a }, { type: "way", role: "inner", geometry: hole }] }]);
  assert.equal(r.buildings.length, 1);
  assert.equal(r.buildings[0].id, "r9");
  near(polygonArea(r.buildings[0].ring), 1600, 1);
  assert.equal(r.buildings[0].holes?.length, 1);
  near(polygonArea(r.buildings[0].holes?.[0] ?? []), 100, 1);
});

test("two outer rings make two shapes, a ring that never closes is dropped", () => {
  const open = rect(0, 0, 10, 10).slice(0, 3);
  assert.equal(joinRings([open]).length, 0);
  const r = parse([{ type: "relation", id: 4, tags: { natural: "water", type: "multipolygon" }, members: [{ type: "way", role: "outer", geometry: rect(0, 0, 20, 20) }, { type: "way", role: "outer", geometry: rect(50, 50, 20, 20) }] }]);
  assert.deepEqual(r.areas.map((x) => x.id).sort(), ["r4-0", "r4-1"]);
});

test("things completely outside the radius are dropped, ones that reach into it stay", () => {
  const tree = siteToLatLon(C, [300, 0]);
  const r = parse(
    [
      way(1, { building: "yes" }, rect(500, 500, 20, 20)),
      way(2, { building: "yes" }, rect(90, -10, 30, 20)),
      way(3, { highway: "residential" }, [siteToLatLon(C, [-400, -300]), siteToLatLon(C, [400, -300])]),
      way(4, { highway: "residential" }, [siteToLatLon(C, [-400, 0]), siteToLatLon(C, [400, 0])]),
      { type: "node", id: 5, ...tree, tags: { natural: "tree" } },
    ],
    100,
  );
  assert.deepEqual(r.buildings.map((b) => b.id), ["w2"]);
  assert.deepEqual(r.roads.map((x) => x.id), ["w4"]);
  assert.equal(r.trees.length, 0);
});

test("degenerate shapes are dropped: too few points, an open way, a tiny sliver", () => {
  const r = parse([
    way(1, { building: "yes" }, rect(0, 0, 10, 10).slice(0, 2)),
    way(2, { building: "yes" }, rect(0, 0, 10, 10).slice(0, 4)),
    way(3, { building: "yes" }, rect(0, 0, 0.5, 0.5)),
    way(4, { building: "yes" }, rect(30, 0, 10, 10)),
    way(5, { building: "no" }, rect(60, 0, 10, 10)),
    way(6, { building: "yes", location: "underground" }, rect(90, 0, 10, 10)),
  ]);
  assert.deepEqual(r.buildings.map((b) => b.id), ["w4"]);
});

test("trees: height, crown, leaf and species from the tags", () => {
  const at = (x: number, tags: Record<string, string>, id: number) => ({ type: "node", id, ...siteToLatLon(C, [x, 0]), tags: { natural: "tree", ...tags } });
  const r = parse([
    at(0, { height: "14", diameter_crown: "6", species: "Quercus robur" }, 1),
    at(5, { genus: "Pinus" }, 2),
    at(10, {}, 3),
    at(15, { leaf_type: "needleleaved", species: "mystery" }, 4),
    at(20, { "species:en": "Birch" }, 5),
  ]);
  const t = r.trees.sort((p, q) => p.x - q.x);
  assert.deepEqual([t[0].species, t[0].height, t[0].crown, t[0].leaf, t[0].source], ["oak", 14, 6, "broad", "osm"]);
  assert.deepEqual([t[1].species, t[1].leaf], ["pine", "needle"]);
  assert.equal(t[2].species, undefined);
  assert.ok(t[2].height > 0 && t[2].crown > 0);
  assert.deepEqual([t[3].species, t[3].leaf], [undefined, "needle"]);
  assert.equal(t[4].species, "birch");
});

test("a tree row becomes evenly spaced trees", () => {
  const r = parse([way(1, { natural: "tree_row" }, [siteToLatLon(C, [0, 0]), siteToLatLon(C, [70, 0])])]);
  assert.ok(r.trees.length >= 10 && r.trees.length <= 11, String(r.trees.length));
});

test("the tree cap keeps the ones nearest the centre and says so", () => {
  const els = Array.from({ length: MAX_TREES + 5 }, (_, i) => ({ type: "node", id: i + 1, ...siteToLatLon(C, [(i % 200) - 100, Math.floor(i / 200)]), tags: { natural: "tree" } }));
  const r = parse(els, 600);
  assert.equal(r.trees.length, MAX_TREES);
  assert.equal(r.notes.length, 1);
});

test("areas: kinds from the tags, broad ground first and water last", () => {
  const r = parse([
    way(1, { natural: "water" }, rect(0, 0, 30, 30)),
    way(2, { landuse: "grass" }, rect(-50, -50, 100, 100)),
    way(3, { natural: "wood", leaf_type: "needleleaved" }, rect(60, 0, 40, 40)),
    way(4, { landuse: "residential" }, rect(-100, -100, 200, 200)),
    way(5, { amenity: "parking" }, rect(-20, 60, 20, 10)),
    way(6, { landuse: "quarry" }, rect(0, 0, 10, 10)),
    way(7, { leisure: "swimming_pool" }, rect(0, 0, 10, 10)),
  ]);
  assert.deepEqual(r.areas.map((a) => a.kind), ["residential", "grass", "wood", "paving", "water"]);
  assert.equal(r.areas.find((a) => a.kind === "wood")?.leaf, "needle");
});

test("roads: kinds and widths, lanes and width tags, tunnels skipped", () => {
  const line = (x: number) => [siteToLatLon(C, [x, -20]), siteToLatLon(C, [x, 20])];
  const r = parse([
    way(1, { highway: "residential" }, line(0)),
    way(2, { highway: "primary", lanes: "4" }, line(5)),
    way(3, { highway: "service", width: "2,5" }, line(10)),
    way(4, { highway: "tertiary" }, line(15)),
    way(5, { highway: "footway" }, line(20)),
    way(6, { highway: "residential", tunnel: "yes" }, line(25)),
    way(7, { railway: "rail" }, line(30)),
    way(8, { waterway: "stream" }, line(35)),
    way(9, { highway: "bus_stop" }, line(40)),
    way(10, { highway: "trunk" }, line(45)),
  ]);
  const by = Object.fromEntries(r.roads.map((x) => [x.id, x]));
  assert.deepEqual([by.w1.kind, by.w1.width], ["residential", 5.5]);
  assert.equal(by.w2.width, 12.8);
  assert.equal(by.w3.width, 2.5);
  assert.equal(by.w4.kind, "secondary");
  assert.equal(by.w5.kind, "footway");
  assert.equal(by.w6, undefined);
  assert.equal(by.w7.kind, "railway");
  assert.deepEqual([by.w8.kind, by.w8.width], ["river", 2]);
  assert.equal(by.w9, undefined);
  assert.equal(by.w10.kind, "motorway");
});

test("garbage in gives empty lists, not a throw", () => {
  for (const bad of [null, undefined, 5, "x", {}, { elements: "no" }, { elements: [null, 3, { type: "way" }, { type: "way", id: 1, geometry: "x", tags: { building: "yes" } }] }]) {
    const r = parseOverpass(bad, C, 250);
    assert.deepEqual([r.buildings.length, r.trees.length, r.areas.length, r.roads.length], [0, 0, 0, 0]);
  }
});
