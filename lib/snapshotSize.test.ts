import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SNAPSHOT_SCALE, isConstrained, pixelBudget, planSnapshotSize, type GlLimits } from "./snapshotSize.ts";

const BIG: GlLimits = { maxTexture: 16384, maxRenderbuffer: 16384, maxViewport: [16384, 16384] };
const view = { width: 1440, height: 900 };

test("a size inside every limit is exactly the scale times the view", () => {
  const s = planSnapshotSize(view, 2, BIG, 16_000_000);
  assert.deepEqual([s.width, s.height, s.clamped, s.limit], [2880, 1800, false, null]);
  assert.equal(s.ratio, 2);
});

test("the pixel budget shrinks a picture and keeps its shape", () => {
  const s = planSnapshotSize(view, 4, BIG, 12_000_000);
  assert.equal(s.clamped, true);
  assert.equal(s.limit, "memory");
  assert.ok(s.width * s.height <= 12_000_000);
  assert.ok(s.width * s.height > 11_000_000, "uses what the budget allows");
  assert.ok(Math.abs(s.width / s.height - 1440 / 900) < 0.01);
});

test("the graphics chip's smallest limit wins and the long side stays within it", () => {
  const small: GlLimits = { maxTexture: 4096, maxRenderbuffer: 8192, maxViewport: [8192, 2048] };
  const s = planSnapshotSize({ width: 1000, height: 500 }, 4, small, 100_000_000);
  assert.equal(s.limit, "gpu");
  assert.ok(Math.max(s.width, s.height) <= 2048);
  assert.equal(s.width, 2048);
});

test("a view that already exceeds the limits at 1x is brought down too, never to zero", () => {
  const tiny: GlLimits = { maxTexture: 512, maxRenderbuffer: 512, maxViewport: [512, 512] };
  const s = planSnapshotSize({ width: 4000, height: 3000 }, 1, tiny, 1_000_000);
  assert.ok(s.width <= 512 && s.height >= 1);
  assert.equal(s.clamped, true);
});

test("nonsense input never gives a zero or non-finite size", () => {
  for (const [w, h, sc] of [[0, 0, 0], [NaN, 100, 2], [100, -5, Infinity], [1, 1, 0.0001]] as const) {
    const s = planSnapshotSize({ width: w, height: h }, sc, { maxTexture: NaN, maxRenderbuffer: 0, maxViewport: [0, NaN] }, NaN);
    assert.ok(s.width >= 1 && s.height >= 1 && Number.isFinite(s.ratio) && s.ratio > 0, JSON.stringify([w, h, sc, s]));
  }
});

test("the drawing buffer three.js makes from the ratio is the size reported", () => {
  for (const sc of [1, 2, 4]) {
    const s = planSnapshotSize({ width: 1439.5, height: 811 }, sc, BIG, 12_000_000);
    assert.equal(Math.floor(1439.5 * s.ratio), s.width);
    assert.equal(Math.floor(811 * s.ratio), s.height);
  }
});

test("small and weak devices get the smallest budget and are recognised", () => {
  assert.equal(isConstrained({ tier: "eco", vp: "regular", kiosk: false }), true);
  assert.equal(isConstrained({ tier: "high", vp: "tiny", kiosk: false }), true);
  assert.equal(isConstrained({ tier: "high", vp: "regular", kiosk: true }), true);
  assert.equal(isConstrained({ tier: "ultra", vp: "regular", kiosk: false }), false);
  assert.ok(pixelBudget(true, "film") < pixelBudget(false, "film"));
  assert.ok(pixelBudget(false, "film") < pixelBudget(false, "none"));
  // 4x of the 800x480 wall display fits what a constrained device may do; the default never exceeds 2x
  assert.equal(planSnapshotSize({ width: 800, height: 480 }, 4, { maxTexture: 4096, maxRenderbuffer: 4096, maxViewport: [4096, 4096] }, pixelBudget(true, "none")).clamped, false);
  assert.ok(DEFAULT_SNAPSHOT_SCALE <= 2);
});
