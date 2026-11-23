import assert from "node:assert/strict";
import test from "node:test";
import { contentShift, freeArea, insetOf, NO_INSETS, panToFree } from "./viewInset.ts";

test("a side sheet on the right edge is a right inset, a bottom sheet a bottom inset", () => {
  assert.deepEqual(insetOf({ left: 420, top: 44, right: 800, bottom: 372 }, 800, 480), { ...NO_INSETS, right: 380 });
  assert.deepEqual(insetOf({ left: 0, top: 500, right: 390, bottom: 844 }, 390, 844), { ...NO_INSETS, bottom: 344 });
  assert.deepEqual(insetOf({ left: 10, top: 10, right: 100, bottom: 50 }, 800, 480), NO_INSETS);
});

test("the free area is what the bars leave, never less than a quarter of the canvas", () => {
  assert.deepEqual(freeArea(800, 480, { left: 0, right: 380, top: 44, bottom: 112 }), { x0: 0, y0: 44, x1: 420, y1: 368 });
  const f = freeArea(100, 100, { left: 0, right: 500, top: 0, bottom: 500 });
  assert.ok(f.x1 - f.x0 >= 25 && f.y1 - f.y0 >= 25);
});

test("the content shifts so the middle of the free area shows the old middle", () => {
  assert.deepEqual(contentShift(800, 480, { x0: 0, y0: 44, x1: 420, y1: 368 }), { x: -190, y: -34 });
});

test("a selection already in the free area is left alone, one behind a sheet is brought to its middle", () => {
  const free = { x0: 0, y0: 44, x1: 420, y1: 368 };
  assert.deepEqual(panToFree({ x0: 100, y0: 100, x1: 180, y1: 160 }, free), { x: 0, y: 0 });
  assert.deepEqual(panToFree({ x0: 600, y0: 100, x1: 680, y1: 160 }, free), { x: 210 - 640, y: 206 - 130 });
});
