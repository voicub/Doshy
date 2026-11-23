import assert from "node:assert/strict";
import { test } from "node:test";
import { ttlCache } from "./ttlCache.ts";

const clock = (start = 1000) => {
  let t = start;
  return Object.assign(() => t, { advance: (ms: number) => void (t += ms) });
};
const counter = <T>(value: (n: number) => T) => {
  let calls = 0;
  return { load: async () => value(++calls), calls: () => calls };
};

test("an answer is reused until it is older than the ttl", async () => {
  const now = clock();
  const c = ttlCache<number>(1000, 4, now);
  const src = counter((n) => n);
  assert.equal(await c.get("a", src.load), 1);
  now.advance(999);
  assert.equal(await c.get("a", src.load), 1);
  now.advance(1);
  assert.equal(await c.get("a", src.load), 2);
  assert.equal(src.calls(), 2);
});

test("callers that ask while a fetch is running share it, even `fresh` ones", async () => {
  const c = ttlCache<string>(1000, 4);
  let release!: (v: string) => void;
  let calls = 0;
  const slow = () => (calls++, new Promise<string>((r) => (release = r)));
  const first = c.get("a", slow);
  const second = c.get("a", slow, { fresh: true });
  release("done");
  assert.deepEqual(await Promise.all([first, second]), ["done", "done"]);
  assert.equal(calls, 1);
});

test("`fresh` skips a stored answer, and a failure is not kept", async () => {
  const c = ttlCache<number>(1000, 4);
  const src = counter((n) => n);
  await c.get("a", src.load);
  assert.equal(await c.get("a", src.load, { fresh: true }), 2);
  const boom = () => Promise.reject(new Error("down"));
  await assert.rejects(c.get("b", boom), /down/);
  assert.equal(await c.get("b", src.load), 3);
});

test("the oldest key goes when the cache is full, expired ones first", async () => {
  const now = clock();
  const c = ttlCache<number>(1000, 2, now);
  const src = counter((n) => n);
  await c.get("a", src.load);
  now.advance(10);
  await c.get("b", src.load);
  await c.get("c", src.load); // full: "a" (oldest) is dropped
  assert.equal(src.calls(), 3);
  await c.get("b", src.load);
  assert.equal(src.calls(), 3, "b survived");
  await c.get("a", src.load);
  assert.equal(src.calls(), 4, "a was evicted");
});

test("clear forgets stored answers and does not store a fetch that was already running", async () => {
  const c = ttlCache<string>(1000, 4);
  let release!: (v: string) => void;
  const running = c.get("a", () => new Promise<string>((r) => (release = r)));
  c.clear();
  release("old");
  assert.equal(await running, "old");
  assert.equal(await c.get("a", async () => "new"), "new");
});
