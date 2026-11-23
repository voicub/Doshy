import assert from "node:assert/strict";
import { test } from "node:test";
import { readCapped } from "./readCapped.ts";

/** A body that arrives in chunks of `step` bytes, with byte i holding i % 251. */
const body = (n: number, step = 1000) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (let at = 0; at < n; at += step) c.enqueue(Uint8Array.from({ length: Math.min(step, n - at) }, (_, i) => (at + i) % 251));
      c.close();
    },
  });
const expected = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);

test("a body is returned whole, with no hint, an exact hint, a hint that is too small and one that is too big", async () => {
  for (const hint of [0, 5000, 10, 99_999]) assert.deepEqual(await readCapped(body(5000), 1_000_000, hint), expected(5000), `hint ${hint}`);
});

test("a body over the cap is refused, one exactly at it is not", async () => {
  assert.equal(await readCapped(body(100), 99), null);
  assert.equal((await readCapped(body(100), 100))?.byteLength, 100);
});

test("an announced size cannot raise the cap", async () => {
  assert.equal(await readCapped(body(5000), 4000, 1_000_000), null);
});

test("an empty body is an empty buffer", async () => {
  assert.equal((await readCapped(body(0), 10))?.byteLength, 0);
});

test("many small chunks past the first guess are reassembled in order", async () => {
  assert.deepEqual(await readCapped(body(300_000, 7), 1_000_000), expected(300_000));
});
