import assert from "node:assert/strict";
import { test } from "node:test";
import { guestUrl, linkLine } from "./guestLinkText.ts";

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
const HOUR = 3_600_000;
const base = { expiresAt: null, expired: false, lastUsedAt: null, pin: false, live: false, location: false };

test("a link that was never opened and never expires", () => {
  assert.equal(linkLine(base, NOW), "No PIN \u00b7 never expires \u00b7 not opened yet");
});

test("a PIN, an expiry in hours and the last visit are said in plain words", () => {
  const line = linkLine({ ...base, pin: true, expiresAt: NOW + 3 * HOUR, lastUsedAt: NOW - 5 * 60_000 }, NOW);
  assert.equal(line, "PIN \u00b7 expires in 3 hours \u00b7 last opened 5 minutes ago");
});

test("short and long expiries, and an expired link", () => {
  assert.match(linkLine({ ...base, expiresAt: NOW + 20 * 60_000 }, NOW), /expires in 20 minutes/);
  assert.match(linkLine({ ...base, expiresAt: NOW + 1 * 60_000 / 2 }, NOW), /expires in 1 minute\b/);
  assert.match(linkLine({ ...base, expiresAt: NOW + 7 * 24 * HOUR }, NOW), /expires in 7 days/);
  assert.match(linkLine({ ...base, expiresAt: NOW - HOUR, expired: true }, NOW), /\bexpired\b/);
});

test("the options that share more are always named", () => {
  assert.match(linkLine({ ...base, live: true, location: true }, NOW), /shows live states \u00b7 shows the real location$/);
});

test("the address is the page's own origin, /view/ and the token", () => {
  assert.equal(guestUrl("https://doshy.example", "AbCdEfGhIjKlMnOpQrStUv"), "https://doshy.example/view/AbCdEfGhIjKlMnOpQrStUv");
});
