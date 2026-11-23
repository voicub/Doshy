import assert from "node:assert/strict";
import { test } from "node:test";
import { timedOut, within } from "./requestTimeout.ts";

test("a request nobody answers is aborted by the deadline", async () => {
  const signal = within(20);
  const done = Promise.withResolvers<unknown>();
  signal.addEventListener("abort", () => done.resolve(signal.reason), { once: true });
  assert.ok(timedOut(await done.promise));
});

test("the caller's own abort still wins, and is not a timeout", () => {
  const own = new AbortController();
  const signal = within(10_000, own.signal);
  own.abort();
  assert.ok(signal.aborted);
  assert.ok(!timedOut(signal.reason));
});
