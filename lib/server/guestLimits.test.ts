import assert from "node:assert/strict";
import { test } from "node:test";
import { PIN_LOCK_MS, PIN_TRIES_PER_ADDRESS, clientAddress, createGuestLimits, createLockout, createRateLimit } from "./guestLimits.ts";

test("a rate limit lets `max` requests through per window and starts fresh in the next", () => {
  const r = createRateLimit({ max: 3, windowMs: 1000, maxKeys: 10 });
  assert.deepEqual([0, 1, 2, 3].map((i) => r.allow("a", 100 + i)), [true, true, true, false]);
  assert.equal(r.allow("b", 150), true, "another key has its own count");
  assert.equal(r.allow("a", 1100), true);
});

test("5 wrong PINs lock a link for 15 minutes, and the lockout is not shortened or extended by trying again", () => {
  const l = createLockout({ maxFails: PIN_TRIES_PER_ADDRESS, windowMs: PIN_LOCK_MS, lockMs: PIN_LOCK_MS, maxKeys: 10 });
  const t0 = 1_000_000;
  assert.deepEqual([0, 1, 2, 3].map((i) => l.fail("k", t0 + i)), [4, 3, 2, 1], "tries left");
  assert.equal(l.locked("k", t0 + 4), 0, "not yet");
  assert.equal(l.fail("k", t0 + 4), 0, "the fifth wrong one");
  assert.equal(l.locked("k", t0 + 5), PIN_LOCK_MS - 1);
  assert.equal(l.fail("k", t0 + 1000), 0);
  assert.equal(l.locked("k", t0 + 1000), PIN_LOCK_MS - 996, "a try during the lockout does not extend it");
  assert.equal(l.locked("k", t0 + 4 + PIN_LOCK_MS), 0, "over");
  assert.equal(l.fail("k", t0 + 4 + PIN_LOCK_MS), 4, "and a new count starts");
});

test("wrong tries spread over more than the window do not add up; a right one gives the count back", () => {
  const l = createLockout({ maxFails: 3, windowMs: 1000, lockMs: 5000, maxKeys: 10 });
  l.fail("k", 0);
  l.fail("k", 10);
  assert.equal(l.fail("k", 2000), 2, "the window passed: counting from one again");
  l.fail("k", 2001);
  l.clear("k");
  assert.equal(l.locked("k", 2002), 0);
  assert.equal(l.fail("k", 2003), 2);
});

test("the tables stay bounded: inventing keys pushes out the oldest, and never grows without end", () => {
  const l = createLockout({ maxFails: 1, windowMs: 1000, lockMs: 1_000_000, maxKeys: 3 });
  for (const k of ["a", "b", "c"]) l.fail(k, 1);
  assert.ok(l.locked("c", 2) > 0);
  l.fail("d", 2);
  assert.equal(l.locked("a", 3), 0, "the oldest entry made room");
  assert.ok(l.locked("d", 3) > 0);
  const r = createRateLimit({ max: 1, windowMs: 1_000_000, maxKeys: 2 });
  for (const k of ["a", "b", "c", "d"]) assert.equal(r.allow(k, 1), true);
  assert.equal(r.allow("d", 2), false, "the newest keys are still counted");
});

test("a link's wrong PINs are counted for the whole link too, so a changing address does not help", () => {
  const { pinByAddress, pinByLink } = createGuestLimits();
  for (let i = 0; i < 25; i++) {
    pinByAddress.fail(`10.0.0.${i}|link`, 1000);
    pinByLink.fail("link", 1000);
  }
  assert.equal(pinByAddress.locked("10.0.0.99|link", 1001), 0, "that address never failed");
  assert.ok(pinByLink.locked("link", 1001) > 0);
});

test("the caller's address is what the nearest proxy says, not what the client claims", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  assert.equal(clientAddress(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" })), "203.0.113.7", "the last entry: the first one can be written by the client");
  assert.equal(clientAddress(h({ "x-forwarded-for": "2001:DB8::1" })), "2001:db8::1");
  assert.equal(clientAddress(h({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
  assert.equal(clientAddress(h({})), "unknown");
  assert.equal(clientAddress(h({ "x-forwarded-for": "<script>" })), "unknown", "never a key made of arbitrary text");
});
