import assert from "node:assert/strict";
import { test } from "node:test";
import { NetError, fetchPlan } from "./dbApi.ts";
import { fetchStates } from "./ha.ts";
import { currentStaleAt, noteStaleAnswer, offlineNote, subscribeStale, timeAgo } from "./offlineStatus.ts";
import { CACHED_AT_HEADER, STALE_HEADER, cachedAtOf, isStaleAnswer } from "./swRules.ts";

const MIN = 60_000;
const NOW = 1_800_000_000_000;

test("timeAgo grows from minutes to hours to days, and never goes negative", () => {
  assert.equal(timeAgo(NOW - 5_000, NOW), timeAgo(NOW + 5_000, NOW), "a clock a little ahead reads like now");
  assert.equal(timeAgo(NOW - 12 * MIN, NOW), "12 min ago");
  assert.equal(timeAgo(NOW - 3 * 60 * MIN - 1, NOW), "3 h ago");
  assert.equal(timeAgo(NOW - 2 * 24 * 60 * MIN, NOW), "2 days ago");
  assert.notEqual(timeAgo(NOW - MIN, NOW), timeAgo(NOW - 2 * MIN, NOW));
});

test("the chip is absent while everything is live and says how old the data is otherwise", () => {
  const live = { online: true, haError: null, staleAt: null, lastLiveAt: NOW - MIN };
  assert.equal(offlineNote(live, NOW), null);
  for (const down of [{ online: false }, { haError: "Home Assistant HTTP 502" }, { staleAt: NOW - 12 * MIN }]) {
    const note = offlineNote({ ...live, ...down }, NOW);
    assert.ok(note, JSON.stringify(down));
  }
  const stale = offlineNote({ ...live, staleAt: NOW - 12 * MIN }, NOW);
  assert.ok(stale?.includes(timeAgo(NOW - 12 * MIN, NOW)), "a stored copy is dated by when it was stored, not by the last poll");
  const failing = offlineNote({ ...live, haError: "x" }, NOW);
  assert.ok(failing?.includes(timeAgo(NOW - MIN, NOW)), "a failing poll is dated by the last good one");
  const never = offlineNote({ online: false, haError: "x", staleAt: null, lastLiveAt: 0 }, NOW);
  assert.ok(never && !never.includes("ago"), "no data yet: no made-up age");
});

test("the stale mark is read back as a time only on a marked answer", () => {
  const marked = new Headers({ [STALE_HEADER]: "stale", [CACHED_AT_HEADER]: "1700000000000" });
  assert.equal(isStaleAnswer(marked), true);
  assert.equal(cachedAtOf(marked), 1_700_000_000_000);
  assert.equal(cachedAtOf(new Headers({ [CACHED_AT_HEADER]: "1700000000000" })), null, "a time without the mark is not stale");
  assert.equal(cachedAtOf(new Headers({ [STALE_HEADER]: "stale", [CACHED_AT_HEADER]: "soon" })), null);
  assert.equal(isStaleAnswer(new Headers()), false);
});

test("a states answer from the worker's cache is shown, flagged; the next live answer clears the flag", async () => {
  const seen: (number | null)[] = [];
  const off = subscribeStale(() => seen.push(currentStaleAt()));
  const list = [{ entity_id: "light.a", state: "on", attributes: {} }];
  const stale: typeof fetch = async () => Response.json(list, { headers: { [STALE_HEADER]: "stale", [CACHED_AT_HEADER]: "1700000000000", etag: '"s1"' } });
  assert.deepEqual(await fetchStates(stale), list);
  assert.equal(currentStaleAt(), 1_700_000_000_000);
  const live: typeof fetch = async () => Response.json(list, { headers: { etag: '"s2"' } });
  await fetchStates(live);
  assert.equal(currentStaleAt(), null);
  off();
  noteStaleAnswer(5);
  noteStaleAnswer(null);
  assert.deepEqual(seen, [1_700_000_000_000, null], "listeners hear changes, and stop after unsubscribing");
});

test("a plan the worker answered from its cache counts as 'server unreachable', so it can never replace a newer saved revision", async () => {
  const real = globalThis.fetch;
  const body = JSON.stringify({ rev: 3, updatedAt: 1, format: 1, plan: {} });
  try {
    globalThis.fetch = async () => new Response(body, { headers: { "content-type": "application/json", [STALE_HEADER]: "stale", [CACHED_AT_HEADER]: "1700000000000" } });
    await assert.rejects(fetchPlan(1), NetError);
    globalThis.fetch = async () => new Response(body, { headers: { "content-type": "application/json" } });
    assert.equal((await fetchPlan(1)).rev, 3);
  } finally {
    globalThis.fetch = real;
  }
});
