import assert from "node:assert/strict";
import { test } from "node:test";
import { siteToLatLon, tileOf } from "./geo.ts";
import { decodeMvt } from "./mvt.ts";
import { MAX_OVERTURE_TILES, OVERTURE_ZOOM, assembleBuildings, buildingsOfFeature, buildingsOfTile, overtureTiles, type TileId } from "./siteOverture.ts";
import { mvtLayer, mvtTile, type FixtureFeature } from "./siteOvertureFixture.ts";
import { worldPixel } from "./siteTerrainTiles.ts";
import type { MvtFeature } from "./mvt.ts";
import type { XY } from "./siteTypes.ts";

const C = { lat: 51.4779, lon: -0.0015 };
const TILE: TileId = { z: OVERTURE_ZOOM, ...tileOf(C.lat, C.lon, OVERTURE_ZOOM) };

/** A clockwise rectangle at site metres (x east, y south) as tile units of TILE. */
function rectAt(x: number, y: number, w: number, d: number): [number, number][] {
  const px = ([sx, sy]: XY): [number, number] => {
    const p = siteToLatLon(C, [sx, sy]);
    const [wx, wy] = worldPixel(p.lat, p.lon, TILE.z);
    return [Math.round(((wx / 256 - TILE.x) * 4096)), Math.round(((wy / 256 - TILE.y) * 4096))];
  };
  return [px([x, y]), px([x + w, y]), px([x + w, y + d]), px([x, y + d])];
}

const layerOf = (features: FixtureFeature[], name = "building") => decodeMvt(mvtTile([mvtLayer(name, features)]))[0];
const one = (props: FixtureFeature["props"], ring = rectAt(10, 10, 12, 8)): MvtFeature => layerOf([{ props, polygons: [[ring]] }]).features[0];
const make = (props: FixtureFeature["props"], part = false) => buildingsOfFeature(one(props), TILE, 4096, C, part);

test("the z14 tiles of a site: the home's tile, two at a seam, within the cap; never a tile the site does not touch", () => {
  const tiles = overtureTiles(C, 250);
  assert.ok(tiles && tiles.length >= 1 && tiles.length <= 4);
  assert.ok(tiles.some((t) => t.x === TILE.x && t.y === TILE.y));
  assert.ok(tiles.every((t) => t.z === OVERTURE_ZOOM));
  assert.ok((overtureTiles(C, 600)?.length ?? 99) <= 9);
  // exactly on the corner of four tiles: all four are needed, even for a tiny site
  const n = 2 ** OVERTURE_ZOOM;
  const corner = { lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * 5000) / n))) * 180) / Math.PI, lon: (8192 / n) * 360 - 180 };
  assert.equal(overtureTiles(corner, 100)?.length, 4);
  assert.equal(overtureTiles({ lat: 80, lon: 0 }, 600) === undefined || (overtureTiles({ lat: 80, lon: 0 }, 600)?.length ?? 0) <= MAX_OVERTURE_TILES, true);
});

test("a footprint lands where it should: tile units back to metres about the centre", () => {
  const [b] = make({ height: 9 });
  assert.ok(b);
  const xs = b.ring.map((p) => p[0]);
  const ys = b.ring.map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...xs) - 10) < 0.6 && Math.abs(Math.max(...xs) - 22) < 0.6, `x ${xs}`);
  assert.ok(Math.abs(Math.min(...ys) - 10) < 0.6 && Math.abs(Math.max(...ys) - 18) < 0.6, `y ${ys}`);
  assert.equal(b.from, "overture");
});

test("heights: `height` runs to the ridge, floors count 3 m each, otherwise a guess by kind; `real` says which", () => {
  const withRoof = make({ height: 10, roof_shape: "gabled", roof_height: 3, class: "residential" })[0];
  assert.deepEqual([withRoof.height, withRoof.roofHeight, withRoof.roof, withRoof.real], [7, 3, "gabled", true]);
  const flat = make({ height: 12, roof_shape: "flat" })[0];
  assert.deepEqual([flat.height, flat.roofHeight, flat.roof, flat.real], [12, 0, "flat", true]);
  const floors = make({ num_floors: 5, roof_shape: "flat" })[0];
  assert.deepEqual([floors.height, floors.real], [15, true]);
  const guess = make({ class: "apartments" })[0];
  assert.deepEqual([guess.height, guess.roof, guess.real], [15, "flat", undefined]);
  const house = make({ class: "house" })[0];
  assert.deepEqual([house.height, house.roof, house.real], [6, "gabled", undefined]);
  const roofCap = make({ height: 4, roof_shape: "gabled", roof_height: 9 })[0];
  assert.deepEqual([roofCap.height, roofCap.roofHeight], [2.5, 1.5], "a roof taller than the building leaves at least 2.5 m of wall");
  const junk = make({ height: -3, num_floors: 0, roof_height: Number.NaN })[0];
  assert.equal(junk.real, undefined, "a non-positive height is no height");
  assert.equal(make({ height: 9000 })[0].real, undefined, "an absurd height is no height");
});

test("roof shapes map onto the scene's six; lift comes from min_height or min_floor", () => {
  const shapes: Record<string, string> = { flat: "flat", gabled: "gabled", gambrel: "gabled", saltbox: "gabled", hipped: "hipped", half_hipped: "hipped", mansard: "hipped", pyramidal: "pyramidal", skillion: "skillion", dome: "dome", onion: "dome", round: "dome" };
  for (const [from, to] of Object.entries(shapes)) assert.equal(make({ height: 20, roof_shape: from })[0].roof, to, from);
  assert.equal(make({ height: 20, roof_shape: "rainbow" })[0].roof, "gabled", "an unknown shape falls back to the kind's usual roof (a small unmarked building: pitched)");
  const lifted = make({ height: 20, min_height: 6 })[0];
  assert.equal(lifted.minHeight, 6);
  assert.equal(make({ height: 20, min_floor: 2 })[0].minHeight, 6);
  assert.equal(make({ height: 20 })[0].minHeight, 0);
});

test("colours pass only as CSS names or hex; underground and tiny things are left out", () => {
  const c = make({ height: 8, facade_color: "#A0B1C2", roof_color: "firebrick" })[0];
  assert.deepEqual([c.wallColor, c.roofColor], ["#a0b1c2", "firebrick"]);
  const bad = make({ height: 8, facade_color: "url(javascript:alert(1))", roof_color: "#12" })[0];
  assert.deepEqual([bad.wallColor, bad.roofColor], [undefined, undefined]);
  assert.deepEqual(make({ height: 8, is_underground: true }), []);
  assert.deepEqual(buildingsOfFeature(one({ height: 8 }, rectAt(0, 0, 1.5, 1.5)), TILE, 4096, C, false), [], "a 2 square metre footprint is a pillar");
});

test("the kind is the class when it is a plain word, else the subtype, else 'yes'", () => {
  assert.equal(make({ class: "church", height: 20 })[0].kind, "church");
  assert.equal(make({ subtype: "religious", height: 20 })[0].kind, "religious");
  assert.equal(make({ class: "Not A Word!", height: 20 })[0].kind, "yes");
  assert.equal(make({ height: 20 })[0].kind, "yes");
});

test("a building with parts is drawn by its parts when they cover it; a tower on a podium keeps the podium", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const parentRing = rectAt(0, 0, 30, 20);
  const layers = (partRings: [number, number][][]) =>
    decodeMvt(
      mvtTile([
        mvtLayer("building", [{ props: { id, has_parts: true, height: 30 }, polygons: [[parentRing]] }]),
        mvtLayer("building_part", partRings.map((r, i) => ({ props: { id: `part-${i}-aaaaaaaa`, building_id: id, height: 10 + i * 10 }, polygons: [[r]] }))),
      ]),
    );
  const whole = assembleBuildings([buildingsOfTile(layers([rectAt(0, 0, 15, 20), rectAt(15, 0, 15, 20)]), TILE, C)], 250);
  assert.equal(whole.length, 2, "both halves replace the parent");
  assert.ok(whole.every((b) => b.id.startsWith("ovp-")));
  const tower = assembleBuildings([buildingsOfTile(layers([rectAt(10, 5, 6, 6)]), TILE, C)], 250);
  assert.equal(tower.length, 2, "the parent stays, the tower stands on it");
  assert.deepEqual(tower.map((b) => b.id.split("-")[0]).sort(), ["ov", "ovp"]);
});

test("a feature cut by a tile edge arrives once per tile with unique ids, and the radius and the count are enforced, nearest first", () => {
  const same = { props: { id: "aaaaaaaa-0000-0000-0000-000000000000", height: 9 }, polygons: [[rectAt(5, 5, 10, 10)]] } satisfies FixtureFeature;
  const far = { props: { id: "bbbbbbbb-0000-0000-0000-000000000000", height: 9 }, polygons: [[rectAt(700, 700, 10, 10)]] } satisfies FixtureFeature;
  const near = { props: { id: "cccccccc-0000-0000-0000-000000000000", height: 9 }, polygons: [[rectAt(-40, -40, 10, 10)]] } satisfies FixtureFeature;
  const tileA = buildingsOfTile(decodeMvt(mvtTile([mvtLayer("building", [same, far, near])])), TILE, C);
  const tileB = buildingsOfTile(decodeMvt(mvtTile([mvtLayer("building", [same])])), TILE, C);
  const out = assembleBuildings([tileA, tileB], 250);
  assert.equal(out.length, 3, "the one 700 m away is outside a 250 m site");
  assert.equal(new Set(out.map((b) => b.id)).size, 3, "ids are unique");
  assert.ok(out[0].id.includes("cccccccc") || out[0].id.includes("aaaaaaaa"), "nearest first");
});
