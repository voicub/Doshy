import assert from "node:assert/strict";
import { test } from "node:test";
import { MvtError, decodeMvt } from "./mvt.ts";
import { hole, mvtLayer, mvtTile, square, varint } from "./siteOvertureFixture.ts";

test("a polygon with a hole: the clockwise ring is the outline, the counter-clockwise one its hole; tags resolve through the key and value tables", () => {
  const tile = mvtTile([
    mvtLayer("building", [
      { id: 7, props: { height: 12.5, num_floors: 4, class: "residential", has_parts: true, level: -1, big: 5_000_000_000 }, polygons: [[square(100, 200, 400), hole(200, 300, 100)]] },
      { props: { class: "garage" }, polygons: [[square(0, 0, 10)]] },
    ]),
  ]);
  const [layer] = decodeMvt(tile);
  assert.equal(layer.name, "building");
  assert.equal(layer.extent, 4096);
  assert.equal(layer.features.length, 2);
  const [a, b] = layer.features;
  assert.equal(a.id, 7);
  assert.deepEqual(a.props, { height: 12.5, num_floors: 4, class: "residential", has_parts: true, level: -1, big: 5_000_000_000 });
  assert.equal(a.polygons.length, 1);
  assert.deepEqual(a.polygons[0][0], [[100, 200], [500, 200], [500, 600], [100, 600]]);
  assert.deepEqual(a.polygons[0][1], [[200, 300], [200, 400], [300, 400], [300, 300]], "the hole");
  assert.equal(b.id, undefined);
  assert.deepEqual(b.props, { class: "garage" });
});

test("a multipolygon gives one polygon per outline, each with its own holes", () => {
  const tile = mvtTile([mvtLayer("building", [{ props: {}, polygons: [[square(0, 0, 50), hole(10, 10, 10)], [square(100, 100, 30)]] }])]);
  const [f] = decodeMvt(tile)[0].features;
  assert.equal(f.polygons.length, 2);
  assert.equal(f.polygons[0].length, 2);
  assert.equal(f.polygons[1].length, 1);
});

test("negative coordinates (a building cut by the tile edge, drawn a little outside) and a custom extent", () => {
  const tile = mvtTile([mvtLayer("building", [{ props: {}, polygons: [[square(-64, -64, 200)]] }], 8192)]);
  const [layer] = decodeMvt(tile);
  assert.equal(layer.extent, 8192);
  assert.deepEqual(layer.features[0].polygons[0][0][0], [-64, -64]);
});

test("only the layers asked for are decoded; others are skipped whole", () => {
  const tile = mvtTile([mvtLayer("building_part", [{ props: { a: 1 }, polygons: [[square(0, 0, 9)]] }]), mvtLayer("building", [{ props: { b: 2 }, polygons: [[square(0, 0, 9)]] }]), mvtLayer("other", [{ props: {}, polygons: [[square(0, 0, 9)]] }])]);
  assert.deepEqual(decodeMvt(tile, ["building"]).map((l) => l.name), ["building"]);
  assert.deepEqual(decodeMvt(tile).map((l) => l.name), ["building_part", "building", "other"]);
  assert.deepEqual(decodeMvt(tile, ["nothing"]), []);
});

test("points are read without geometry (only polygons are decoded)", () => {
  const tile = mvtTile([mvtLayer("poi", [{ props: { n: "x" }, type: 1 }])]);
  assert.deepEqual(decodeMvt(tile)[0].features[0].polygons, []);
});

test("damaged tiles throw MvtError: truncated, a length past the end, a bad command, an endless varint", () => {
  const good = mvtTile([mvtLayer("building", [{ props: { h: 3 }, polygons: [[square(0, 0, 40)]] }])]);
  assert.ok(decodeMvt(good).length === 1);
  assert.throws(() => decodeMvt(good.subarray(0, good.length - 3)), MvtError);
  assert.throws(() => decodeMvt(Uint8Array.from([...varint(3 * 8 + 2), ...varint(5000), 1, 2, 3])), MvtError, "a field longer than the tile");
  assert.throws(() => decodeMvt(Uint8Array.from([0x1a, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80])), MvtError, "a varint that never ends");
  // a geometry command that claims a million points in a handful of bytes
  const claim = mvtTile([[...mvtLayer("building", [{ props: {}, polygons: [[square(0, 0, 4)]] }])]]);
  const bad = Uint8Array.from(claim);
  const at = bad.indexOf(0x09); // the first MoveTo(1)
  assert.ok(at > 0);
  bad[at] = 0x7f; // not a known command id
  assert.throws(() => decodeMvt(bad), MvtError);
  assert.deepEqual(decodeMvt(new Uint8Array()), [], "an empty tile is no layers");
});
