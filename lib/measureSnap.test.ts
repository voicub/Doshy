import test from "node:test";
import assert from "node:assert/strict";
import { snapPoint, snapPoints, type SnapPoints } from "./measureSnap.ts";
import type { Room, Wall } from "./types.ts";

const wall = (id: string, ax: number, ay: number, bx: number, by: number): Wall => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, style: "plaster" });
const room: Room = { id: "r", name: "r", x: 0, y: 0, w: 4, h: 3, color: "#fff", floor: "wood" };
const square = [wall("n", 0, 0, 4, 0), wall("e", 4, 0, 4, 3), wall("s", 4, 3, 0, 3), wall("w", 0, 3, 0, 0)];
const pts = snapPoints(square, [room]);
const opts = { radius: 0.1, grid: 0.05 };

test("the snap points of a closed room: 8 face corners, 4 wall ends and 4 room corners (the last two coincide)", () => {
  assert.equal(pts.corners.length, 8);
  assert.equal(pts.ends.length, 4);
  assert.equal(pts.rooms.length, 4);
});

test("a click near the inside corner of two walls lands on that face corner", () => {
  const r = snapPoint({ x: 0.08, y: 0.07 }, pts, opts);
  assert.equal(r.kind, "corner");
  assert.deepEqual([+r.p.x.toFixed(6), +r.p.y.toFixed(6)], [0.06, 0.06]);
});

test("the nearest candidate wins: a click on the centre end point is not pulled to a face corner", () => {
  const r = snapPoint({ x: 0.005, y: 0.004 }, pts, opts);
  assert.equal(r.kind, "end");
  assert.deepEqual(r.p, { x: 0, y: 0 });
});

test("at an equal distance a corner beats an end, and an end beats a room corner", () => {
  const same: SnapPoints = { corners: [{ x: 1, y: 1 }], ends: [{ x: 1, y: 1 }], rooms: [{ x: 1, y: 1 }] };
  assert.equal(snapPoint({ x: 1.01, y: 1 }, same, opts).kind, "corner");
  assert.equal(snapPoint({ x: 1.01, y: 1 }, { ...same, corners: [] }, opts).kind, "end");
  assert.equal(snapPoint({ x: 1.01, y: 1 }, { ...same, corners: [], ends: [] }, opts).kind, "room");
});

test("outside the radius the point goes to the grid", () => {
  const r = snapPoint({ x: 2.013, y: 1.527 }, pts, opts);
  assert.equal(r.kind, "grid");
  assert.deepEqual(r.p, { x: 2, y: 1.55 });
});

test("a candidate exactly at the radius still counts, one just past it does not", () => {
  const one: SnapPoints = { corners: [], ends: [{ x: 0, y: 0 }], rooms: [] };
  assert.equal(snapPoint({ x: 0.1, y: 0 }, one, { radius: 0.1, grid: 0 }).kind, "end");
  assert.equal(snapPoint({ x: 0.1001, y: 0 }, one, { radius: 0.1, grid: 0 }).kind, "free");
});

test("a bigger grid (Shift) rounds to it", () => {
  assert.deepEqual(snapPoint({ x: 2.2, y: 1.4 }, pts, { radius: 0.05, grid: 0.25 }).p, { x: 2.25, y: 1.5 });
});

test("Alt means exactly where the pointer is, even right on a corner", () => {
  const r = snapPoint({ x: 0.003, y: 0.002 }, pts, { ...opts, free: true });
  assert.deepEqual(r, { p: { x: 0.003, y: 0.002 }, kind: "free" });
});
