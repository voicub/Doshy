import assert from "node:assert/strict";
import test from "node:test";
import { attrsOf, classify, orientationOf } from "./viewport.ts";

test("the 7 inch displays and phones are tiny or small, desktops are regular", () => {
  assert.equal(classify(800, 480), "tiny");
  assert.equal(classify(390, 844), "tiny");
  assert.equal(classify(844, 390), "tiny");
  assert.equal(classify(1024, 600), "small");
  assert.equal(classify(1280, 800), "regular");
  assert.equal(classify(1600, 900), "regular");
});

test("the owner's choice overrides the screen", () => {
  assert.equal(classify(1600, 900, "compact"), "small");
  assert.equal(classify(800, 480, "regular"), "regular");
  assert.equal(classify(800, 480, "compact"), "tiny", "a tiny screen stays tiny when compact is chosen");
});

test("attributes carry the class, the orientation, touch and kiosk", () => {
  assert.deepEqual(attrsOf({ width: 800, height: 480, coarse: true, kiosk: true }), { "data-vp": "tiny", "data-orient": "landscape", "data-coarse": "1", "data-kiosk": "1" });
  assert.equal(orientationOf(390, 844), "portrait");
});
