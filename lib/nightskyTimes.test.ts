import assert from "node:assert/strict";
import { test } from "node:test";
import { bodiesAt, raDecToAltAz } from "./nightsky.ts";
import { sunPositionEq } from "./planets.ts";
import { bodyEvents, nightAnchor, sunTimes, tonight } from "./nightskyTimes.ts";

test("Greenwich equinox night has correctly ordered twilight crossings", () => {
  const times = sunTimes(new Date("2026-03-20T12:00:00Z"), 51.4779, 0);
  assert.equal(times.polar, null);
  const ordered = [times.sunset, times.civilDusk, times.nauticalDusk, times.astroDusk, times.astroDawn, times.nauticalDawn, times.civilDawn, times.sunrise];
  for (let i = 0; i < ordered.length; i++) {
    const at = ordered[i];
    assert.ok(at);
    if (i) assert.ok(at.getTime() > ordered[i - 1]!.getTime());
    const s = sunPositionEq(at);
    const actual = raDecToAltAz(s.ra, s.dec, at, 51.4779, 0).alt;
    assert.ok(Math.abs(actual - [-0.833, -6, -12, -18, -18, -12, -6, -0.833][i]) < 0.01);
  }
  // Equinox London sunset approximately 18:10 UTC, sunrise 06:00: loose 20 min weather-independent check.
  assert.ok(Math.abs(times.sunset!.getTime() - Date.parse("2026-03-20T18:10:00Z")) < 20 * 60000);
  assert.ok(Math.abs(times.sunrise!.getTime() - Date.parse("2026-03-21T06:00:00Z")) < 20 * 60000);
});

test("polar day and night return null solar crossings and finite summaries", () => {
  for (const [date, polar] of [["2026-06-21T12:00:00Z", "day"], ["2026-12-21T12:00:00Z", "night"]] as const) {
    const at = new Date(date);
    const times = sunTimes(at, 80, 0);
    assert.equal(times.polar, polar);
    assert.equal(times.sunset, null);
    assert.equal(times.sunrise, null);
    const summary = tonight(at, 80, 0);
    assert.ok(Number.isFinite(summary.dusk.getTime()) && summary.dawn >= summary.dusk);
    assert.equal(summary.planets.length, 5);
  }
});

test("longitude anchors preserve the same night before dawn and across the date line", () => {
  assert.equal(nightAnchor(new Date("2026-03-21T02:00:00Z"), 0).toISOString(), "2026-03-20T12:00:00.000Z");
  assert.equal(nightAnchor(new Date("2026-03-20T12:00:00Z"), 180).toISOString(), "2026-03-20T00:00:00.000Z");
});

test("body rise/set/transit refer to actual horizon crossings within 24 hours", () => {
  const at = new Date("2026-03-20T00:00:00Z");
  for (const id of ["moon", "venus", "jupiter"] as const) {
    const event = bodyEvents(id, at, 45, 0);
    assert.ok(event.maxAlt >= -90 && event.maxAlt <= 90);
    for (const crossing of [event.rise, event.set]) if (crossing) {
      assert.ok(crossing >= at && crossing.getTime() <= at.getTime() + 86400000);
      const b = bodiesAt(crossing, 45, 0).find((body) => body.id === id)!;
      assert.ok(Math.abs(b.alt - (id === "moon" ? -0.833 : -0.567)) < 0.01);
    }
    if (event.transit) {
      const b = bodiesAt(event.transit, 45, 0).find((body) => body.id === id)!;
      assert.ok(Math.abs(b.alt - event.maxAlt) < 0.001);
    }
  }
  const summary = tonight(at, 45, 0);
  assert.ok(summary.dawn >= summary.dusk);
  assert.ok(summary.moon.illumination >= 0 && summary.moon.illumination <= 1);
  for (const p of summary.planets) {
    assert.ok(Number.isFinite(p.bestAlt) && Number.isFinite(p.bestAz) && Number.isFinite(p.mag));
    if (p.visible) assert.ok(p.from && p.to && p.to >= p.from && p.from >= summary.dusk && p.to <= summary.dawn);
  }
});
