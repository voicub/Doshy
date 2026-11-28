import test from "node:test";
import assert from "node:assert/strict";
import { roomArea } from "./blueprint.ts";
import { dist, hostOf, keepNewest, polygonArea, polygonPerimeter, rectUnionPerimeter, roomParts, roomPerimeter, roomSpan, spread } from "./measure.ts";
import type { Room } from "./types.ts";

const room = (id: string, x: number, y: number, w: number, h: number, parent?: string): Room => ({ id, name: id, x, y, w, h, color: "#fff", floor: "wood", ...(parent ? { parent } : {}) });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test("distance is the straight line, spread the two legs of it", () => {
  close(dist({ x: 1, y: 1 }, { x: 4, y: 5 }), 5);
  assert.deepEqual(spread({ x: 4, y: 1 }, { x: 1, y: 5 }), { dx: 3, dy: 4 });
});

test("polygon area does not depend on the winding or the start", () => {
  const sq = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
  close(polygonArea(sq), 4);
  close(polygonArea([...sq].reverse()), 4);
  close(polygonArea([sq[2], sq[3], sq[0], sq[1]]), 4);
  close(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }]), 6);
});

test("an L shaped polygon: area 10, perimeter 14", () => {
  const l = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 0, y: 3 }];
  close(polygonArea(l), 10);
  close(polygonPerimeter(l), 14);
});

test("fewer than three points enclose nothing; an open line has no closing side", () => {
  assert.equal(polygonArea([{ x: 0, y: 0 }, { x: 5, y: 5 }]), 0);
  const tri = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }];
  close(polygonPerimeter(tri, false), 7);
  close(polygonPerimeter(tri), 12);
  close(polygonPerimeter([{ x: 0, y: 0 }, { x: 3, y: 4 }]), 5);
});

test("outline of a union of rectangles", () => {
  close(rectUnionPerimeter([{ x: 0, y: 0, w: 4, h: 3 }]), 14);
  close(rectUnionPerimeter([{ x: 0, y: 0, w: 4, h: 3 }, { x: 4, y: 0, w: 2, h: 2 }]), 18); // an L: the same as its bounding 6 x 3 box
  close(rectUnionPerimeter([{ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 }]), 12); // the shared edge is inside, not outline
  close(rectUnionPerimeter([{ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 }]), 12); // overlapping squares: a staircase of the 3 x 3 box
  close(rectUnionPerimeter([{ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 }]), 8); // two separate rooms add up
  close(rectUnionPerimeter([]), 0);
});

test("a room counts its extensions, but not door threshold strips", () => {
  const rooms = [room("a", 0, 0, 4, 3), room("b", 4, 0, 2, 2, "a"), room("strip", 4, 2, 0.1, 2, "a")];
  const host = rooms[0];
  assert.equal(roomParts({ rooms }, host).length, 2);
  close(roomPerimeter({ rooms }, host), 18);
  assert.deepEqual(roomSpan({ rooms }, host), { w: 6, h: 3 });
  const area = roomParts({ rooms }, host).reduce((s, r) => s + r.w * r.h, 0);
  close(area, roomArea({ rooms }, host)); // the same set of rooms the label's area adds up: 12 + 4
});

test("a tap on an extension means its host room", () => {
  const rooms = [room("a", 0, 0, 4, 3), room("b", 4, 0, 2, 2, "a")];
  assert.equal(hostOf({ rooms }, rooms[1]).id, "a");
  assert.equal(hostOf({ rooms }, rooms[0]).id, "a");
});

test("the kept list is newest first and never longer than the limit", () => {
  assert.deepEqual(keepNewest([2, 1], 3), [3, 2, 1]);
  assert.deepEqual(keepNewest([1, 2, 3, 4, 5, 6, 7, 8], 9), [9, 1, 2, 3, 4, 5, 6, 7]);
});
