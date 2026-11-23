import assert from "node:assert/strict";
import test from "node:test";
import { appliedScale, cleanDisplay, DISPLAY_DEFAULTS, effectiveSize, saverMinutes, saverMs, scaleOf, wakeWanted } from "./display.ts";
import { classify } from "./viewport.ts";

test("scale grows from small to extra large and normal is exactly 1", () => {
  assert.equal(scaleOf("normal"), 1);
  assert.ok(scaleOf("small") < 1 && scaleOf("large") > 1 && scaleOf("xlarge") > scaleOf("large"));
});

test("a bigger interface leaves fewer css pixels, so the layout class follows", () => {
  assert.deepEqual(effectiveSize(1024, 600, 1.25), { width: 819, height: 480 });
  assert.equal(classify(1024, 600), "small");
  const e = effectiveSize(1024, 600, 1.25);
  assert.equal(classify(e.width, e.height), "tiny", "1024x600 at Large is as roomy as 819x480");
  assert.deepEqual(effectiveSize(800, 480, 0), { width: 800, height: 480 }, "a broken scale does not divide by zero");
});

test("stored settings are checked: bad values fall back to the defaults", () => {
  assert.deepEqual(cleanDisplay(undefined), DISPLAY_DEFAULTS);
  assert.deepEqual(cleanDisplay("x"), DISPLAY_DEFAULTS);
  assert.deepEqual(cleanDisplay({ size: "huge", wake: "yes", saver: -3, style: "disco" }), DISPLAY_DEFAULTS);
  assert.deepEqual(cleanDisplay({ size: "large", wake: false, saver: 5, style: "dim" }), { size: "large", wake: false, saver: 5, style: "dim" });
  assert.equal(cleanDisplay({ saver: 99999 }).saver, 240, "capped");
  assert.equal(cleanDisplay({ saver: NaN }).saver, null);
});

test("keep-screen-on and the screensaver default on in a kiosk, off elsewhere, and an explicit choice always wins", () => {
  assert.equal(wakeWanted(DISPLAY_DEFAULTS, true), true);
  assert.equal(wakeWanted(DISPLAY_DEFAULTS, false), false);
  assert.equal(wakeWanted({ ...DISPLAY_DEFAULTS, wake: false }, true), false);
  assert.equal(saverMinutes(DISPLAY_DEFAULTS, true), 15);
  assert.equal(saverMinutes(DISPLAY_DEFAULTS, false), 0);
  assert.equal(saverMinutes({ ...DISPLAY_DEFAULTS, saver: 0 }, true), 0, "Off stays off in a kiosk");
  assert.equal(saverMs({ ...DISPLAY_DEFAULTS, saver: 2 }, false), 120_000);
});

test("a bigger interface is held back so the screen never gets smaller than the compact layouts can use", () => {
  assert.equal(appliedScale("normal", 800, 480), 1);
  assert.equal(appliedScale("large", 800, 480), 1.25, "a 7 inch 800x480 can take Large");
  assert.equal(appliedScale("xlarge", 800, 480), 1.33, "but Extra large stops where 360 px are left");
  assert.equal(appliedScale("xlarge", 1280, 800), 1.5, "a 1280x800 panel takes all of it");
  assert.equal(appliedScale("xlarge", 390, 844), 1.08, "a phone barely grows");
  assert.equal(appliedScale("large", 320, 568), 1, "and never shrinks the other way");
  assert.equal(appliedScale("small", 390, 844), 0.9, "Small is never held back");
});
