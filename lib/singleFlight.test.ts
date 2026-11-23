import assert from "node:assert/strict";
import { test } from "node:test";
import { singleFlight } from "./singleFlight.ts";

test("overlapping calls share the run in progress", async () => {
  let runs = 0;
  const gate = Promise.withResolvers<number>();
  const poll = singleFlight(() => {
    runs++;
    return gate.promise;
  });
  const a = poll();
  const b = poll();
  gate.resolve(7);
  assert.deepEqual(await Promise.all([a, b]), [7, 7]);
  assert.equal(runs, 1);
});

test("a call after the run settled starts a new one, also after a failure", async () => {
  let runs = 0;
  const poll = singleFlight(async () => {
    if (++runs === 1) throw new Error("down");
    return runs;
  });
  await assert.rejects(poll(), /down/);
  assert.equal(await poll(), 2);
  assert.equal(await poll(), 3);
});
