import assert from "node:assert/strict";
import test from "node:test";
import { RETIRE_MS, disposeLater } from "./disposeLater.ts";

function fakeClock() {
  const jobs: { fn: () => void; ms: number }[] = [];
  return { jobs, schedule: (fn: () => void, ms: number) => void jobs.push({ fn, ms }) };
}

test("things are disposed when the timer fires, not before", () => {
  const clock = fakeClock();
  const freed: string[] = [];
  disposeLater([{ dispose: () => freed.push("a") }, { dispose: () => freed.push("b") }], undefined, clock.schedule);
  assert.deepEqual(freed, []);
  assert.equal(clock.jobs[0].ms, RETIRE_MS);
  clock.jobs[0].fn();
  assert.deepEqual(freed, ["a", "b"]);
});

test("the list is copied at once, so the caller can clear its cache and keep going", () => {
  const clock = fakeClock();
  const cache = new Map([["x", { dispose: () => void freed.push("x") }]]);
  const freed: string[] = [];
  disposeLater(cache.values(), 10, clock.schedule);
  cache.clear();
  clock.jobs[0].fn();
  assert.deepEqual(freed, ["x"]);
});

test("nothing to dispose schedules nothing; empty slots are skipped", () => {
  const clock = fakeClock();
  disposeLater([], 10, clock.schedule);
  disposeLater([null, undefined], 10, clock.schedule);
  assert.equal(clock.jobs.length, 0);
});
