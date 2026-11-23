import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, CylinderGeometry, SphereGeometry, Vector3 } from "three";
import { bakeParts, placementMatrix, placementOf, sharedGroups } from "./partBake.ts";

const box = (p: [number, number, number], s: [number, number, number], extra: object = {}) => ({ p, s, ...extra });
const round = (v: Vector3) => v.toArray().map((n) => Math.round(n * 1e6) / 1e6 + 0); // + 0: no negative zero

test("sharedGroups joins equal keys, keeps order, and leaves singles and nulls alone", () => {
  const a = {};
  const b = {};
  assert.deepEqual(sharedGroups([a, b, a, null, b, a, {}]), [[0, 2, 5], [1, 4]]);
  assert.deepEqual(sharedGroups([null, null]), []);
  assert.deepEqual(sharedGroups([]), []);
});

test("a part's matrix moves, turns and (for a sphere) squashes its geometry like the mesh transform did", () => {
  const m = placementMatrix(placementOf(box([1, 2, 3], [0.4, 0.2, 0.1], { shape: "sph", r: [0, Math.PI / 2, 0] })));
  const v = new Vector3(0, 0, 1).applyMatrix4(m); // one unit along +z: turned to +x, squashed by s[2] / s[0] = 0.25
  assert.ok(Math.abs(v.x - (1 + 0.25)) < 1e-9 && Math.abs(v.y - 2) < 1e-9 && Math.abs(v.z - 3) < 1e-9, `got ${v.toArray()}`);
});

test("baking keeps every vertex of every part, in the right place", () => {
  const parts = [box([0, 0.5, 0], [1, 1, 1]), box([2, 0.1, 0], [0.5, 0.2, 0.5]), box([-1, 3, 1], [0.2, 0.2, 0.2], { shape: "sph" })];
  const geos = [new BoxGeometry(1, 1, 1), new BoxGeometry(0.5, 0.2, 0.5), new SphereGeometry(0.1, 8, 6)];
  const baked = bakeParts(parts.map(placementOf), geos);
  assert.ok(baked);
  assert.equal(baked.getAttribute("position").count, geos.reduce((n, g) => n + g.getAttribute("position").count, 0));
  assert.equal(baked.index?.count, geos.reduce((n, g) => n + (g.index?.count ?? 0), 0));
  baked.computeBoundingBox();
  const bounds = baked.boundingBox;
  assert.ok(bounds);
  assert.deepEqual(round(bounds.min), [-1.1, 0, -0.5]);
  assert.deepEqual(round(bounds.max), [2.25, 3.1, 1.1]);
  assert.equal(geos[0].getAttribute("position").getX(0), 0.5, "the part's own geometry is untouched");
});

test("a unit geometry takes its size from the placement's scale", () => {
  const baked = bakeParts([{ p: [1, 0, 0], scale: [2, 4, 6] }], [new BoxGeometry(1, 1, 1)]);
  assert.ok(baked);
  baked.computeBoundingBox();
  assert.ok(baked.boundingBox);
  assert.deepEqual(round(baked.boundingBox.min), [0, -2, -3]);
  assert.deepEqual(round(baked.boundingBox.max), [2, 2, 3]);
});

test("baking mixes indexed and unindexed parts (rounded boxes are unindexed)", () => {
  const flat = new BoxGeometry(1, 1, 1).toNonIndexed();
  const baked = bakeParts([box([0, 0, 0], [1, 1, 1]), box([3, 0, 0], [1, 1, 1])].map(placementOf), [flat, new CylinderGeometry(0.5, 0.5, 1, 8)]);
  assert.ok(baked);
  assert.equal(baked.index, null);
});

test("baked normals follow the part's rotation", () => {
  const baked = bakeParts([placementOf(box([0, 0, 0], [1, 1, 1], { r: [0, 0, Math.PI / 2] }))], [new BoxGeometry(1, 1, 1)]);
  assert.ok(baked);
  const n = baked.getAttribute("normal");
  const up = [...Array(n.count).keys()].filter((i) => n.getY(i) > 0.99).length;
  assert.equal(up, 4, "a box turned a quarter about z still has one face looking up");
});
