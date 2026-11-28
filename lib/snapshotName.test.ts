import assert from "node:assert/strict";
import { test } from "node:test";
import { captionLayout, defaultCaption, fileName, slug } from "./snapshotName.ts";

test("a plan name becomes a safe file name part", () => {
  assert.equal(slug("Casa Mică & Grădina"), "casa-mica-gradina");
  assert.equal(slug("../../etc/passwd"), "etc-passwd");
  assert.equal(slug("a\\b/c:d*e?f\"g<h>i|j"), "a-b-c-d-e-f-g-h-i-j");
  assert.equal(slug("   "), "plan");
  assert.equal(slug("🏠🏠"), "plan");
  assert.equal(slug("x".repeat(100)).length, 40);
  assert.ok(!slug("word ".repeat(30)).endsWith("-"));
});

test("a file name carries the plan, the injected date and the detail, with no path characters", () => {
  const d = new Date(2026, 10, 26, 23, 59);
  assert.equal(fileName("Home", d, "2880x1800", "png"), "doshy-home-2026-11-26-2880x1800.png");
  assert.equal(fileName("Home", new Date(2026, 0, 5), "10s", "webm"), "doshy-home-2026-01-05-10s.webm");
  assert.doesNotMatch(fileName("a/b\\c", d, "1x/2", "p/ng"), /[\\/]/);
  assert.match(fileName("", d, "", "../"), /^doshy-plan-2026-11-26-plan\.bin$/);
});

test("the default caption names the plan, with a fallback", () => {
  assert.equal(defaultCaption("Home"), "Doshy: Home");
  assert.equal(defaultCaption("  "), "Doshy: my home");
});

const ink = (font: number) => font * 9; // a 9 em wide text

test("the caption plate lies inside the picture whatever the size or length", () => {
  for (const [w, h, per] of [[800, 480, 9], [2880, 1800, 9], [5760, 3600, 9], [64, 64, 9], [300, 200, 90], [800, 480, 0], [40, 4000, 9]] as const) {
    const b = captionLayout(w, h, (f) => f * per);
    assert.ok(b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0, JSON.stringify([w, h, per, b]));
    assert.ok(b.x + b.w <= Math.max(w, b.w) + 1e-9 && b.y + b.h <= h + 1e-9, JSON.stringify([w, h, per, b]));
    assert.ok(b.textY <= b.y + b.h && b.textX >= b.x);
  }
});

test("the caption keeps the same look at every size: the type grows with the picture", () => {
  const small = captionLayout(800, 480, ink);
  const big = captionLayout(3200, 1920, ink);
  assert.ok(Math.abs(big.font / small.font - 4) < 0.2);
  assert.ok(big.font > small.font);
  assert.ok(small.font < 480 * 0.05, "small and tasteful, not a headline");
});

test("a caption too long for the picture shrinks its type to fit", () => {
  const b = captionLayout(400, 300, (f) => f * 60);
  assert.ok(b.x + b.w <= 400 + 1e-6);
  assert.ok(b.font < 7);
  assert.ok(captionLayout(400, 300, ink).font > b.font);
});
