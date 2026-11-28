import test from "node:test";
import assert from "node:assert/strict";
import { GOVERNOR, createGovernor, median, type Governor } from "./qualityGovernor.ts";
import { lowerTier } from "./quality.ts";
import type { Tier } from "./quality.ts";

/** Feed `ms`-long frames for `totalMs` of wall time; returns the first step the governor asked for. */
function run(g: Governor, ms: number, totalMs: number, tier: Tier, manual = false, godraysOn = false) {
  for (let t = 0; t < totalMs; t += ms) {
    const r = g.frame(ms, tier, manual, godraysOn);
    if (r) return r;
  }
  return null;
}
const SETTLE = GOVERNOR.settleMs;
const WINDOW = GOVERNOR.windowMs;

test("median of odd, even and empty lists", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

test("fast frames never lower the tier", () => {
  const g = createGovernor();
  assert.equal(run(g, 16, SETTLE + WINDOW * 10, "ultra"), null);
});

test("slow frames lower one tier, only after the settle time and two slow windows", () => {
  const g = createGovernor();
  assert.equal(run(g, 80, SETTLE + WINDOW, "ultra"), null, "one slow window is forgiven");
  assert.equal(run(g, 80, WINDOW + 200, "ultra"), "high", "the second one steps down exactly one tier");
});

test("a fast window between slow ones resets the count (no flapping on a brief hiccup)", () => {
  const g = createGovernor();
  run(g, 80, SETTLE + WINDOW, "high");
  run(g, 16, WINDOW + 100, "high");
  assert.equal(run(g, 80, WINDOW + 100, "high"), null);
});

test("the median decides, not the worst frame", () => {
  const g = createGovernor();
  // one 300 ms stall in every ten frames, the rest at 16 ms: median is fast
  const frames = Array.from({ length: 10 }, (_, i) => (i === 0 ? 300 : 16));
  let out = null;
  for (let t = 0; t < SETTLE + WINDOW * 6; t += 1) out = out ?? g.frame(frames[t % 10], "high", false);
  assert.equal(out, null);
});

test("settling after a step down: the new tier gets time before it is judged again", () => {
  const g = createGovernor();
  run(g, 80, SETTLE + WINDOW * 2 + 200, "ultra");
  assert.equal(run(g, 80, SETTLE - 400, "high"), null);
  assert.equal(run(g, 80, WINDOW * 3, "high"), "medium");
});

test("Light steps down to Eco, and Eco is the floor", () => {
  const g = createGovernor();
  assert.equal(run(g, 200, SETTLE + WINDOW * 4, "low"), "eco");
  const floor = createGovernor();
  assert.equal(run(floor, 200, SETTLE + WINDOW * 20, "eco"), null);
  assert.equal(lowerTier("eco"), "eco");
  assert.equal(lowerTier("low"), "eco");
});

test("a 30 fps cap is not slow: capped frames (33 ms) never lower a tier", () => {
  const g = createGovernor();
  assert.equal(run(g, 1000 / 30, SETTLE + WINDOW * 20, "low"), null);
});

test("the owner's own choice is never changed", () => {
  const g = createGovernor();
  assert.equal(run(g, 200, SETTLE + WINDOW * 20, "ultra", true), null);
});

test("reset gives the scene time to settle again", () => {
  const g = createGovernor();
  run(g, 80, SETTLE + WINDOW, "high");
  g.reset();
  assert.equal(run(g, 80, SETTLE - 200, "high"), null);
});

test("stalled frames and too few frames are not measurements", () => {
  const g = createGovernor();
  assert.equal(run(g, 5000, 60000, "ultra"), null, "a hidden tab resuming reports multi-second frames");
  assert.equal(g.frame(0, "ultra", false), null);
  assert.equal(g.frame(NaN, "ultra", false), null);
  // a 2 fps page: a window holds fewer than minFrames frames, so it is not judged
  const slowPage = createGovernor();
  assert.equal(run(slowPage, 900, SETTLE + WINDOW * 10, "ultra"), null);
});

test("slow frames shed the God rays first, then lower the tier", () => {
  const g = createGovernor();
  assert.equal(run(g, 80, SETTLE + WINDOW * 3, "ultra", false, true), "godrays", "the costliest optional effect goes before any detail does");
  assert.equal(run(g, 80, SETTLE + WINDOW * 3, "ultra", false, false), "high", "still slow with them off: now the tier steps down");
});

test("God rays are shed only when the tier is automatic", () => {
  assert.equal(run(createGovernor(), 200, SETTLE + WINDOW * 20, "ultra", true, true), null);
});
