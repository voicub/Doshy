import assert from "node:assert/strict";
import { test } from "node:test";
import { bodiesAt, extinctionMag, gmstDegrees, julianDay, limitingMagnitude, lstDegrees, magnitudeFade, precess, precessor, raDecToAltAz } from "./nightsky.ts";

const j2000 = new Date("2000-01-01T12:00:00Z");
test("Julian day and GMST match J2000 and Meeus example 12.a (1987 April 10)", () => {
  assert.equal(julianDay(j2000), 2451545);
  assert.ok(Math.abs(gmstDegrees(j2000) / 15 - 18.697374558) < 1e-8);
  const date = new Date("1987-04-10T00:00:00Z");
  // Astronomical Algorithms, ch.12: 13h 10m 46.3668s, tolerance 0.01 seconds.
  assert.ok(Math.abs(gmstDegrees(date) / 15 - (13 + 10 / 60 + 46.3668 / 3600)) < 0.01 / 3600);
  assert.ok(Math.abs(lstDegrees(date, 15) - (gmstDegrees(date) + 15) % 360) < 1e-10);
});

test("meridian geometry, Polaris latitude and Sirius culmination", () => {
  const date = new Date("2026-01-01T00:00:00Z");
  const lst = lstDegrees(date, 0);
  const sirius = raDecToAltAz(lst, -16.7161, date, 45, 0);
  assert.ok(Math.abs(sirius.alt - (90 - 45 - 16.7161)) < 1e-9);
  assert.ok(Math.abs(sirius.az - 180) < 1e-9);
  assert.ok(Math.abs(raDecToAltAz(lst, 70, date, 45, 0).az) < 1e-9);
  for (const hour of [0, 6, 12, 18]) {
    const at = new Date(Date.UTC(2026, 0, 1, hour));
    const p = precess(37.9546, 89.2641, at);
    assert.ok(Math.abs(raDecToAltAz(p.ra, p.dec, at, 45, 0).alt - 45) < 1);
  }
});

test("precession identity and Meeus theta Persei example 21.b", () => {
  const same = precess(41.0499417, 49.2284667, j2000);
  assert.ok(Math.abs(same.ra - 41.0499417) < 1e-10);
  assert.ok(Math.abs(same.dec - 49.2284667) < 1e-10);
  // Meeus 2028 Nov 13.19, proper motion omitted here: allow one arcminute.
  const date = new Date("2028-11-13T04:33:36Z");
  const moved = precess(41.0499417, 49.2284667, date);
  assert.ok(Math.abs(moved.ra - 41.5472) < 1 / 60);
  assert.ok(Math.abs(moved.dec - 49.3485) < 1 / 60);
  assert.deepEqual(precessor(date)(41.0499417, 49.2284667), moved);
});

test("extinction and visibility are finite, clamped and monotone", () => {
  assert.ok(Math.abs(extinctionMag(90) - 0.2) < 0.001);
  assert.ok(extinctionMag(0) > extinctionMag(30));
  assert.ok(Number.isFinite(extinctionMag(-10)));
  assert.equal(limitingMagnitude(-20, -10, 0, 0), 6);
  assert.ok(limitingMagnitude(-20, 45, 1, 0) < 6);
  assert.ok(limitingMagnitude(0, -10, 0, 0) < limitingMagnitude(-6, -10, 0, 0));
  assert.ok(limitingMagnitude(-20, -10, 0, 1) < -5);
  assert.equal(magnitudeFade(-5, 6), 1);
  assert.equal(magnitudeFade(8, 6), 0);
  assert.ok(magnitudeFade(5, 6) > magnitudeFade(6, 6));
});

test("observer bodies include exactly Sun, Moon and five planets with finite coordinates", () => {
  const bodies = bodiesAt(j2000, 45, 25);
  assert.equal(bodies.length, 7);
  assert.equal(new Set(bodies.map((b) => b.id)).size, 7);
  assert.equal(bodies.find((b) => b.id === "sun")?.mag, -26.74);
  for (const b of bodies) {
    assert.deepEqual(Object.keys(b).sort(), ["alt", "az", "id", "mag", "name"]);
    assert.ok(Number.isFinite(b.mag) && b.alt >= -91 && b.alt <= 90 && b.az >= 0 && b.az < 360);
  }
});
