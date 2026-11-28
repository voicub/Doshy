import assert from "node:assert/strict";
import { test } from "node:test";
import type { Seg } from "./traceDetect.ts";
import { freshWalls, nearestPoint, snapPoints, toPlanSeg } from "./traceSuggest.ts";

// A 400 x 300 px picture, 0.02 m a pixel, centred at (4, 3): its top-left corner is plan (0, 0).
const placed = { w: 400, h: 300, x: 4, y: 3, scale: 0.02, rotation: 0 };
const seg = (x1: number, y1: number, x2: number, y2: number): Seg => ({ x1, y1, x2, y2, t: 6 });

test("a suggestion lands where its pixels are on the plan, ends on the 0.05 m grid", () => {
  // 43 px -> 0.86 m -> 0.85; 357 px -> 7.14 m -> 7.15
  assert.deepEqual(toPlanSeg(seg(43, 43, 357, 43), placed), { a: { x: 0.85, y: 0.85 }, b: { x: 7.15, y: 0.85 } });
});

test("the transform's turn and offset apply: a quarter turn sends the picture's right side down the plan", () => {
  const t = { ...placed, rotation: 90 };
  // picture point (400, 150) is 4 m right of the centre -> 4 m below it: (4, 7); picture point (200, 150) is the centre line: x stays 4
  assert.deepEqual(toPlanSeg(seg(200, 150, 400, 150), t), { a: { x: 4, y: 3 }, b: { x: 4, y: 7 } });
});

test("walls that meet at one picture point meet at one plan point", () => {
  const a = toPlanSeg(seg(43, 43, 357, 43), placed);
  const b = toPlanSeg(seg(43, 43, 43, 257), placed);
  assert.deepEqual(a?.a, b?.a);
});

test("a suggestion that collapses to under 10 cm is dropped", () => {
  assert.equal(toPlanSeg(seg(10, 10, 14, 10), placed), null); // 4 px = 0.08 m
  assert.notEqual(toPlanSeg(seg(10, 10, 20, 10), placed), null); // 10 px = 0.2 m
});

test("walls already on the plan, either way round, and repeats are not offered again", () => {
  const w = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
  const got = freshWalls([w(0, 0, 4, 0)], [w(4, 0, 0, 0), w(0, 0, 0, 3), w(0, 3, 0, 0), w(0.004, 0, 4, 0), w(1, 1, 2, 1)]);
  assert.deepEqual(got, [w(0, 0, 0, 3), w(1, 1, 2, 1)]);
});

test("snap points are the ends and the crossings, each once", () => {
  // a plus sign: horizontal 100..300 at y 150, vertical 200 at y 50..250 -> 4 ends + the crossing (200, 150) = plan (4, 3)
  const pts = snapPoints([seg(100, 150, 300, 150), seg(200, 50, 200, 250)], placed);
  assert.equal(pts.length, 5);
  assert.deepEqual(pts.find((p) => p.x === 4 && p.y === 3), { x: 4, y: 3 });
  // two walls sharing a corner give it once
  assert.equal(snapPoints([seg(0, 0, 100, 0), seg(0, 0, 0, 100)], placed).length, 3);
});

test("two strokes that do not touch have no crossing", () => {
  assert.equal(snapPoints([seg(0, 100, 50, 100), seg(200, 0, 200, 300)], placed).length, 4);
});

test("the nearest point within reach, never one that is skipped or too far", () => {
  const pts = [{ x: 1, y: 1 }, { x: 1.1, y: 1 }, { x: 5, y: 5 }];
  assert.deepEqual(nearestPoint(pts, { x: 1.09, y: 1 }, 0.2), { x: 1.1, y: 1 });
  assert.deepEqual(nearestPoint(pts, { x: 1.09, y: 1 }, 0.2, (q) => q.x === 1.1), { x: 1, y: 1 });
  assert.equal(nearestPoint(pts, { x: 3, y: 3 }, 0.2), null);
});
