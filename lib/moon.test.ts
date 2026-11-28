import test from "node:test";
import assert from "node:assert/strict";
import { MOON_NAMES, moonDiscPath, moonFromName, moonGain, moonPhase } from "./moon.ts";

const DAY = 1 / 29.530588853; // one day of the cycle

/** Distance between two points of the cycle (0 and 1 are the same moment). */
const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

test("the computed phase is within a day of known new and full moons", () => {
  const news = ["2025-06-25T10:31:00Z", "2026-01-18T19:52:00Z"];
  const fulls = ["2025-05-12T16:56:00Z", "2026-01-03T10:03:00Z"];
  for (const d of news) {
    const m = moonPhase(new Date(d));
    assert.ok(apart(m.phase, 0) < DAY, `new ${d}: ${m.phase}`);
    assert.equal(m.name, "new_moon");
  }
  for (const d of fulls) {
    const m = moonPhase(new Date(d));
    assert.ok(apart(m.phase, 0.5) < DAY, `full ${d}: ${m.phase}`);
    assert.equal(m.name, "full_moon");
    assert.ok(m.illumination > 0.99);
  }
});

test("a week after the new moon it is a first quarter, a week after the full moon a last quarter", () => {
  assert.equal(moonPhase(new Date("2025-07-02T20:00:00Z")).name, "first_quarter");
  assert.equal(moonPhase(new Date("2025-05-20T11:00:00Z")).name, "last_quarter");
});

test("Home Assistant's phase names map to a phase, anything else is ignored", () => {
  assert.deepEqual(MOON_NAMES.map((n) => moonFromName(n)?.name), [...MOON_NAMES]);
  assert.equal(moonFromName("full_moon")?.illumination, 1);
  assert.equal(moonFromName("new_moon")?.illumination, 0);
  assert.equal(moonFromName("unavailable"), undefined);
});

test("moonlight is brighter at a full moon than at a new moon, and never drops to nothing", () => {
  assert.ok(moonGain(1) > moonGain(0.5));
  assert.ok(moonGain(0.5) > moonGain(0));
  assert.ok(moonGain(0) > 0.3);
  assert.equal(moonGain(7), moonGain(1));
});

test("the moon glyph is empty at a new moon and a whole disc at a full moon, lit on the growing side first", () => {
  assert.ok(moonDiscPath(0.5, 7).includes("A7 7 0 0 0 0 7")); // full: the left half, then the right half closes the disc
  assert.ok(moonDiscPath(0.125, 7).startsWith("M0 -7A7 7 0 0 1")); // growing crescent: lit on the right
  assert.ok(moonDiscPath(0.875, 7).startsWith("M0 -7A7 7 0 0 0")); // shrinking crescent: lit on the left
});
