import assert from "node:assert/strict";
import { test } from "node:test";
import { IOU_MATCH, mergeBuildings, overlapArea, overlapOf, sameBuilding, withHeight } from "./siteOvertureMerge.ts";
import type { SiteBuilding, XY } from "./siteTypes.ts";

const rect = (x: number, y: number, w: number, d: number): XY[] => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];

function b(id: string, ring: XY[], over: Partial<SiteBuilding> = {}): SiteBuilding {
  return { id, ring, height: 6, minHeight: 0, roof: "gabled", roofHeight: 2, kind: "yes", ...over };
}
const osm = (id: string, ring: XY[], over: Partial<SiteBuilding> = {}) => b(id, ring, over);
const ov = (id: string, ring: XY[], over: Partial<SiteBuilding> = {}) => b(id, ring, { from: "overture", ...over });

test("overlap is measured on the footprints, holes included", () => {
  assert.ok(Math.abs(overlapArea(b("a", rect(0, 0, 10, 10)), b("b", rect(5, 0, 10, 10))) - 50) < 6, "half a 10 x 10 square");
  assert.equal(overlapArea(b("a", rect(0, 0, 10, 10)), b("b", rect(20, 0, 10, 10))), 0);
  const ring = b("a", rect(0, 0, 20, 20), { holes: [rect(5, 5, 10, 10)] });
  assert.ok(overlapArea(ring, b("c", rect(5, 5, 10, 10))) < 4, "a courtyard is not covered");
  const o = overlapOf(b("a", rect(0, 0, 10, 10)), b("b", rect(0, 0, 10, 5)));
  assert.ok(o.ofB > 0.9 && o.ofA > 0.4 && o.ofA < 0.6, JSON.stringify(o));
});

test("the same building in two sources: much overlap, or one inside the other; neighbours that merely touch are different", () => {
  assert.ok(sameBuilding(b("a", rect(0, 0, 10, 10)), b("b", rect(0.5, 0.5, 10, 10))));
  assert.ok(sameBuilding(b("a", rect(0, 0, 30, 10)), b("b", rect(0, 0, 10, 10))), "a terrace and one of its houses");
  assert.ok(!sameBuilding(b("a", rect(0, 0, 10, 10)), b("b", rect(10, 0, 10, 10))), "next door");
  assert.ok(!sameBuilding(b("a", rect(0, 0, 10, 10)), b("b", rect(7, 7, 10, 10))), "a corner overlap");
  assert.ok(IOU_MATCH > 0 && IOU_MATCH < 1);
});

test("OpenStreetMap alone and Overture alone are passed through", () => {
  const o = [osm("o1", rect(0, 0, 10, 10))];
  const v = [ov("v1", rect(0, 0, 10, 10), { real: true, height: 20 }), ov("v2", rect(50, 0, 10, 10))];
  assert.deepEqual(mergeBuildings(o, v, "osm").buildings, o);
  const only = mergeBuildings(o, v, "overture");
  assert.deepEqual(only.buildings.map((x) => x.id), ["v1", "v2"]);
  assert.equal(only.stats.withHeight, 1);
});

test("both: a guessed OpenStreetMap height takes Overture's real one, keeping OpenStreetMap's footprint and id", () => {
  const o = osm("o1", rect(0, 0, 10, 10), { height: 6, roof: "gabled" });
  const v = ov("v1", rect(0.3, 0.2, 10, 10), { real: true, height: 21, roof: "flat", roofHeight: 0, wallColor: "#aabbcc" });
  const { buildings, stats } = mergeBuildings([o], [v], "both");
  assert.equal(buildings.length, 1);
  assert.deepEqual([buildings[0].id, buildings[0].height, buildings[0].roof, buildings[0].real, buildings[0].wallColor], ["o1", 21, "flat", true, "#aabbcc"]);
  assert.deepEqual(buildings[0].ring, o.ring);
  assert.deepEqual([stats.osmWithHeight, stats.withHeight, stats.heightsGained, stats.added], [0, 1, 1, 0]);
});

test("both: an OpenStreetMap height that is real is never replaced (its colours may be filled in)", () => {
  const o = osm("o1", rect(0, 0, 10, 10), { height: 9, real: true, roofColor: "red" });
  const v = ov("v1", rect(0, 0, 10, 10), { real: true, height: 30, wallColor: "#112233", roofColor: "blue" });
  const [r] = mergeBuildings([o], [v], "both").buildings;
  assert.deepEqual([r.height, r.wallColor, r.roofColor], [9, "#112233", "red"]);
});

test("both: when Overture has no real height either, nothing changes", () => {
  const o = osm("o1", rect(0, 0, 10, 10));
  const [r] = mergeBuildings([o], [ov("v1", rect(0, 0, 10, 10))], "both").buildings;
  assert.deepEqual(r, o);
});

test("both: a terrace OpenStreetMap drew as one block is replaced by the finer Overture houses; a small shed inside a block is not enough", () => {
  const block = osm("block", rect(0, 0, 30, 10));
  const houses = [0, 10, 20].map((x, i) => ov(`h${i}`, rect(x, 0, 10, 10), { real: true, height: 8 + i }));
  const r = mergeBuildings([block], houses, "both");
  assert.deepEqual(r.buildings.map((x) => x.id).sort(), ["h0", "h1", "h2"]);
  assert.equal(r.stats.withHeight, 3);
  const shed = mergeBuildings([block], [ov("s", rect(2, 2, 3, 3), { real: true, height: 3 })], "both");
  assert.deepEqual(shed.buildings.map((x) => x.id), ["block"], "a shed covers too little of the block to replace it");
  assert.equal(shed.buildings[0].real, undefined, "and does not lend it its height");
});

test("both: Overture-only buildings are added, nearest first, and OpenStreetMap-only ones stay", () => {
  const o = [osm("far", rect(100, 0, 10, 10)), osm("near", rect(10, 0, 10, 10))];
  const v = [ov("new", rect(-30, 0, 10, 10), { real: true, height: 12 })];
  const r = mergeBuildings(o, v, "both");
  assert.deepEqual(r.buildings.map((x) => x.id), ["near", "new", "far"]);
  assert.deepEqual([r.stats.osmTotal, r.stats.total, r.stats.added, r.stats.matched], [2, 3, 1, 0]);
});

test("both: one Overture building over two OpenStreetMap houses gives its height to both and is not added twice", () => {
  const o = [osm("a", rect(0, 0, 10, 10)), osm("c", rect(10, 0, 10, 10))];
  const v = ov("one", rect(0, 0, 20, 10), { real: true, height: 14 });
  const r = mergeBuildings(o, [v], "both");
  assert.equal(r.buildings.length, 2);
  assert.deepEqual(r.buildings.map((x) => x.height), [14, 14]);
});

test("many buildings stay fast and the totals add up", () => {
  const o: SiteBuilding[] = [];
  const v: SiteBuilding[] = [];
  for (let i = 0; i < 40; i++) {
    for (let j = 0; j < 40; j++) {
      o.push(osm(`o${i}-${j}`, rect(i * 15, j * 15, 10, 10)));
      if ((i + j) % 2) v.push(ov(`v${i}-${j}`, rect(i * 15 + 0.4, j * 15 - 0.3, 10, 10), { real: true, height: 10 }));
    }
  }
  const t0 = performance.now();
  const r = mergeBuildings(o, v, "both");
  assert.ok(performance.now() - t0 < 2000, "1600 + 800 footprints in well under two seconds");
  assert.equal(r.stats.heightsGained, 800);
  assert.equal(withHeight(r.buildings), 800);
  assert.equal(r.buildings.length, 1600);
});
