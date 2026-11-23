import test from "node:test";
import assert from "node:assert/strict";
import { inflate, minProxySize, nextCycle, CYCLE_MS } from "./pickMath.ts";

test("minProxySize is inversely proportional to zoom and bigger for touch", () => {
  assert.ok(Math.abs(minProxySize(100, false) * 2 - minProxySize(50, false)) < 1e-9);
  assert.ok(minProxySize(100, true) > minProxySize(100, false));
  assert.ok(minProxySize(0, false) > 1000);
});

test("inflate grows small boxes per axis and leaves big ones alone", () => {
  assert.deepEqual(inflate([0.05, 0.03, 0.08], 0.3), [0.3, 0.3, 0.3]);
  assert.deepEqual(inflate([0.9, 0.02, 0.5], 0.3), [0.9, 0.02, 0.5]);
});

test("nextCycle: same spot cycles and wraps", () => {
  const ids = ["a", "b", "c"];
  let c = nextCycle(null, ids, { x: 10, y: 10 }, 0);
  assert.deepEqual([c.index, c.cycled], [0, false]);
  c = nextCycle(c, ids, { x: 12, y: 11 }, 500);
  assert.deepEqual([c.index, c.cycled], [1, true]);
  c = nextCycle(c, ids, { x: 12, y: 11 }, 900);
  assert.equal(c.index, 2);
  c = nextCycle(c, ids, { x: 12, y: 11 }, 1200);
  assert.equal(c.index, 0);
});

test("nextCycle resets on another spot, late click, or other candidates", () => {
  const ids = ["a", "b"];
  const first = nextCycle(null, ids, { x: 0, y: 0 }, 0);
  assert.equal(nextCycle(first, ids, { x: 50, y: 0 }, 100).index, 0);
  assert.equal(nextCycle(first, ids, { x: 0, y: 0 }, CYCLE_MS + 1).cycled, false);
  assert.equal(nextCycle(first, ["a", "c"], { x: 0, y: 0 }, 100).cycled, false);
});

test("nextCycle never cycles a single candidate", () => {
  const one = nextCycle(null, ["a"], { x: 0, y: 0 }, 0);
  const again = nextCycle(one, ["a"], { x: 0, y: 0 }, 100);
  assert.deepEqual([again.index, again.cycled], [0, false]);
});
