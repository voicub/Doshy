import assert from "node:assert/strict";
import test from "node:test";
import { afterDrag } from "./sheet.ts";

test("a tap on the handle toggles peek and full", () => {
  assert.equal(afterDrag("peek", 2), "full");
  assert.equal(afterDrag("full", -3), "peek");
});

test("a swipe up opens fully, a swipe down shrinks, a long swipe down closes a peeking sheet", () => {
  assert.equal(afterDrag("peek", -60), "full");
  assert.equal(afterDrag("full", 60), "peek");
  assert.equal(afterDrag("peek", 120), "close");
  assert.equal(afterDrag("full", 120), "peek");
});

test("a short drag changes nothing", () => {
  assert.equal(afterDrag("peek", 20), "peek");
  assert.equal(afterDrag("full", -20), "full");
});
