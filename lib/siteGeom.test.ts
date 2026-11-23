import assert from "node:assert/strict";
import { test } from "node:test";
import { dedupeRing, pointInPolygon, pointInShape, polygonArea, polygonBounds, polygonCentroid, polygonOverlapsRect, ringSpan, rotateRing, segmentsIntersect, signedArea } from "./siteGeom.ts";
import type { XY } from "./siteTypes.ts";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const sq = (x: number, y: number, w: number, h: number): XY[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

test("area and centroid of a rectangle, either winding", () => {
  const r = sq(2, 3, 10, 4);
  near(polygonArea(r), 40);
  near(polygonArea([...r].reverse()), 40);
  assert.ok(signedArea(r) > 0 && signedArea([...r].reverse()) < 0);
  const c = polygonCentroid(r);
  near(c[0], 7);
  near(c[1], 5);
});

test("centroid of an L shape is its centre of mass, off-centre", () => {
  const l: XY[] = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]];
  const c = polygonCentroid(l);
  near(c[0], 9.5 / 7);
  near(c[1], 9.5 / 7);
  assert.equal(pointInPolygon(c, l), false, "the centre of mass of an L lies in its notch");
});

test("degenerate ring: centroid is the mean of its points", () => {
  assert.deepEqual(polygonCentroid([[0, 0], [2, 2], [4, 4]]), [2, 2]);
});

test("pointInPolygon handles concave rings and holes", () => {
  const u: XY[] = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]];
  assert.equal(pointInPolygon([5, 1], u), true);
  assert.equal(pointInPolygon([5, 6], u), false);
  assert.equal(pointInPolygon([-1, 5], u), false);
  const outer = sq(0, 0, 10, 10);
  const hole = sq(4, 4, 2, 2);
  assert.equal(pointInShape([5, 5], outer, [hole]), false);
  assert.equal(pointInShape([1, 1], outer, [hole]), true);
});

test("segments cross, touch or miss", () => {
  assert.equal(segmentsIntersect([0, 0], [4, 4], [0, 4], [4, 0]), true);
  assert.equal(segmentsIntersect([0, 0], [2, 0], [2, 0], [4, 0]), true);
  assert.equal(segmentsIntersect([0, 0], [1, 0], [2, 0], [3, 0]), false);
  assert.equal(segmentsIntersect([0, 0], [4, 0], [0, 1], [4, 1]), false);
});

test("polygonOverlapsRect: inside, straddling, swallowing, crossing without a corner inside, apart", () => {
  const rect = { x0: 0, y0: 0, x1: 10, y1: 10 };
  assert.equal(polygonOverlapsRect(sq(2, 2, 3, 3), rect), true);
  assert.equal(polygonOverlapsRect(sq(8, 8, 5, 5), rect), true);
  assert.equal(polygonOverlapsRect(sq(-5, -5, 30, 30), rect), true);
  assert.equal(polygonOverlapsRect(sq(-5, 4, 20, 2), rect), true, "a long bar through the middle");
  assert.equal(polygonOverlapsRect(sq(11, 0, 3, 3), rect), false);
  assert.equal(polygonOverlapsRect([[12, 0], [20, 0], [20, 12]], rect), false, "bounding boxes overlap, shapes do not");
  assert.equal(polygonOverlapsRect([[0, 0], [1, 1]], rect), false, "not a polygon");
});

test("rotateRing: a quarter turn clockwise on screen sends east to south", () => {
  const r = rotateRing([[10, 0]], 90);
  near(r[0][0], 0);
  near(r[0][1], 10);
  const about = rotateRing([[12, 5]], 180, [10, 5]);
  near(about[0][0], 8);
  near(about[0][1], 5);
});

test("polygonBounds", () => {
  assert.deepEqual(polygonBounds(sq(1, 2, 3, 4)), { x0: 1, y0: 2, x1: 4, y1: 6 });
});

test("ringSpan follows the longest edge, not the axes", () => {
  const [long, short] = ringSpan(rotateRing(sq(0, 0, 30, 6), 37));
  near(long, 30, 1e-6);
  near(short, 6, 1e-6);
});

test("dedupeRing drops repeated points and a repeated closing point", () => {
  assert.deepEqual(dedupeRing([[0, 0], [0, 0], [1, 0], [1, 1], [0, 0]]), [[0, 0], [1, 0], [1, 1]]);
});
