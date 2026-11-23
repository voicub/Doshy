import test from "node:test";
import assert from "node:assert/strict";
import { occluded, type Slab } from "./occlusion.ts";

// the south wall of a room: from (0, 6) east for 8 m, 12 cm thick, floor to 2.58 m
const south: Slab = { x: 0, z: 6, ux: 1, uz: 0, len: 8, r: 0.06, y0: 0, y1: 2.58 };
const low: Slab = { ...south, y1: 0.9 };
// the isometric camera sits south-east and above: sight lines toward it run (+1, +1, +1)
const D = [1, 1, 1] as const;

test("a label inside the room is hidden by the near wall it looks through", () => {
  assert.ok(occluded(3, 0.8, 5.5, ...D, [south]));
});

test("a cut-away wall only hides what is low behind it", () => {
  assert.ok(!occluded(3, 0.8, 5.5, ...D, [low]), "0.8 m up, 0.5 m behind: the sight line clears a 0.9 m wall");
  assert.ok(occluded(3, 0.1, 5.8, ...D, [low]), "at the foot of the wall it is still hidden");
});

test("a label above the wall top is never hidden by it", () => {
  assert.ok(!occluded(3, 2.7, 5.5, ...D, [south]));
});

test("a label on the wall itself (a door tag, a wall sensor) is not hidden by that wall", () => {
  assert.ok(!occluded(3, 1.5, 6, ...D, [south]));
  assert.ok(!occluded(3, 1.5, 6.03, ...D, [south]));
});

test("the far wall and a wall beyond the end do not hide it", () => {
  const north: Slab = { ...south, z: 0 };
  assert.ok(!occluded(3, 0.8, 5.5, ...D, [north]), "the wall is behind the label as seen from the camera");
  const end: Slab = { x: 20, z: 6, ux: 1, uz: 0, len: 4, r: 0.06, y0: 0, y1: 2.58 };
  assert.ok(!occluded(3, 0.8, 5.5, ...D, [end]), "the sight line misses a wall that is elsewhere");
});

test("works for a wall that is not axis aligned", () => {
  const k = Math.SQRT1_2;
  const diag: Slab = { x: 6, z: 0, ux: -k, uz: k, len: 8.5, r: 0.06, y0: 0, y1: 2.58 }; // from (6,0) toward (0,6)
  assert.ok(occluded(2, 0.5, 2, ...D, [diag]));
  assert.ok(!occluded(5, 0.5, 5, ...D, [diag]), "past the wall (x + z = 10), the camera side of it");
});

test("no slabs, nothing hidden", () => {
  assert.ok(!occluded(1, 1, 1, ...D, []));
});
