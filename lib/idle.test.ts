import assert from "node:assert/strict";
import test from "node:test";
import { createIdle, type IdleClock } from "./idle.ts";

/** A clock the test moves by hand; timers fire when `advance` passes them. */
function fakeClock() {
  let t = 1000;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: IdleClock = {
    now: () => t,
    setTimer: (fn, ms) => {
      timers.set(next, { at: t + ms, fn });
      return next++;
    },
    clearTimer: (h) => void timers.delete(h as number),
  };
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      t = Math.max(t, due[1].at);
      due[1].fn();
    }
    t = end;
  };
  return { clock, advance, pending: () => timers.size };
}

test("goes idle after the timeout with no activity", () => {
  const { clock, advance } = fakeClock();
  const seen: boolean[] = [];
  const idle = createIdle(clock, (v) => seen.push(v));
  idle.setTimeout(120_000);
  advance(119_000);
  assert.equal(idle.isIdle(), false);
  advance(1_000);
  assert.equal(idle.isIdle(), true);
  assert.deepEqual(seen, [true]);
});

test("a touch pushes the deadline back without a timer per touch", () => {
  const { clock, advance, pending } = fakeClock();
  const idle = createIdle(clock, () => {});
  idle.setTimeout(100_000);
  for (let i = 0; i < 50; i++) {
    advance(1_900);
    idle.poke();
  }
  assert.equal(pending(), 1, "one timer however many touches");
  assert.equal(idle.isIdle(), false);
  advance(99_000);
  assert.equal(idle.isIdle(), false);
  advance(1_000);
  assert.equal(idle.isIdle(), true);
});

test("activity while idle does not wake; wake() does and the count restarts", () => {
  const { clock, advance } = fakeClock();
  const seen: boolean[] = [];
  const idle = createIdle(clock, (v) => seen.push(v));
  idle.setTimeout(60_000);
  advance(60_000);
  idle.poke();
  assert.equal(idle.isIdle(), true);
  idle.wake();
  assert.equal(idle.isIdle(), false);
  advance(59_000);
  assert.equal(idle.isIdle(), false);
  advance(1_000);
  assert.equal(idle.isIdle(), true);
  assert.deepEqual(seen, [true, false, true]);
});

test("0 turns it off and wakes a sleeping screen; sleep() goes idle at once", () => {
  const { clock, advance, pending } = fakeClock();
  const seen: boolean[] = [];
  const idle = createIdle(clock, (v) => seen.push(v));
  idle.setTimeout(0);
  advance(10 * 60_000);
  assert.equal(idle.isIdle(), false);
  assert.equal(pending(), 0);
  idle.sleep();
  assert.equal(idle.isIdle(), true);
  idle.setTimeout(0);
  assert.equal(idle.isIdle(), false);
  assert.deepEqual(seen, [true, false]);
});

test("changing the timeout restarts the count", () => {
  const { clock, advance } = fakeClock();
  const idle = createIdle(clock, () => {});
  idle.setTimeout(60_000);
  advance(50_000);
  idle.setTimeout(120_000);
  advance(100_000);
  assert.equal(idle.isIdle(), false);
  advance(20_000);
  assert.equal(idle.isIdle(), true);
});
