import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECK_MS, stallWaitMs, verdict } from "./frameWatchdog.ts";

test("frames arriving within the wait are fine; none for longer is a stall", () => {
  assert.equal(verdict(5_000, 4_000, 3_000, 10_000), "ok");
  assert.equal(verdict(20_000, 19_000, 9_000, 10_000), "stalled");
});

test("a page that was blocked is not a stalled scene", () => {
  // the look itself came late: the timer could not run, so no frame could have been drawn either
  assert.equal(verdict(40_000, 40_000 - 10 * CHECK_MS, 3_000, 10_000), "blocked");
});

test("each stall in a row waits longer before the next, up to a ceiling", () => {
  const waits = Array.from({ length: 12 }, (_, n) => stallWaitMs(n));
  assert.ok(waits[1] > waits[0], "the second stall waits longer than the first");
  assert.deepEqual(waits, [...waits].sort((a, b) => a - b));
  assert.equal(stallWaitMs(40), stallWaitMs(41), "a ceiling, not unbounded growth");
});
