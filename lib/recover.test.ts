import assert from "node:assert/strict";
import { test } from "node:test";
import { CRASH_QUIET_MS, crashRetryMs, nextStreak } from "./recover.ts";

test("problems close together count up, a quiet spell starts a new problem", () => {
  const first = nextStreak(null, 1_000, 60_000);
  const second = nextStreak(first, 20_000, 60_000);
  const third = nextStreak(second, 50_000, 60_000);
  assert.deepEqual([first.n, second.n, third.n], [0, 1, 2]);
  assert.equal(nextStreak(third, 50_000 + 60_000, 60_000).n, 0);
});

test("the retry pause never shrinks, and stays inside the quiet spell so a repeating crash stays one streak", () => {
  const pauses = Array.from({ length: 10 }, (_, n) => crashRetryMs(n));
  assert.deepEqual(pauses, [...pauses].sort((a, b) => a - b));
  assert.ok(pauses[0] > 0);
  assert.ok(Math.max(...pauses) < CRASH_QUIET_MS);
});
