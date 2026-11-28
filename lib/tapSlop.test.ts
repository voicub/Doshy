import assert from "node:assert/strict";
import test from "node:test";
import { tapSlopPx, withinTapSlop } from "./tapSlop.ts";

test("a finger gets Chromium's click allowance, a mouse the tight one", () => {
  assert.equal(tapSlopPx("touch"), 15);
  assert.equal(tapSlopPx("pen"), 10);
  assert.equal(tapSlopPx("mouse"), 6);
  assert.equal(tapSlopPx(""), 6); // unknown pointer types behave like a mouse
});

test("a wobble of 9 px is a tap for a finger and a drag for a mouse", () => {
  assert.equal(withinTapSlop(6, 6.5, "touch"), true);
  assert.equal(withinTapSlop(6, 6.5, "mouse"), false);
});

test("the slop is a circle, not a square, and its edge counts as a tap", () => {
  assert.equal(withinTapSlop(15, 0, "touch"), true);
  assert.equal(withinTapSlop(11, 11, "touch"), false); // 15.56 px away
  assert.equal(withinTapSlop(-3, 4, "mouse"), true); // 5 px
});

test("a caller keeps its own mouse value, a finger still gets the browser's", () => {
  assert.equal(tapSlopPx("mouse", 8), 8);
  assert.equal(tapSlopPx("touch", 8), 15);
  assert.equal(withinTapSlop(7, 3, "mouse", 8), true); // 7.6 px
});
