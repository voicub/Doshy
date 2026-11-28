import assert from "node:assert/strict";
import { test } from "node:test";
import { moonMagnitude, moonPosition, planetPositions, schlyterDay, sunPositionEq } from "./planets.ts";

const example = new Date("1990-04-19T00:00:00Z");
// Paul Schlyter, https://stjarnhimlen.se/comp/tutorial.html sections 5, 8, 14.
// Published Astronomical Almanac comparison, geocentric equinox of date.
test("Schlyter worked example Sun, Moon and Mercury agree within 0.1 degree", () => {
  assert.equal(schlyterDay(example), -3543);
  const sun = sunPositionEq(example);
  assert.ok(Math.abs(sun.ra - 26.65) < 0.1);
  assert.ok(Math.abs(sun.dec - 11.0061) < 0.1);
  const moon = moonPosition(example);
  assert.ok(Math.abs(moon.ra - 309.4881) < 0.1);
  assert.ok(Math.abs(moon.dec + 19.0741) < 0.1);
  const mercury = planetPositions(example).find((p) => p.id === "mercury");
  assert.ok(mercury);
  assert.ok(Math.abs(mercury.ra - 43.2535) < 0.1);
  assert.ok(Math.abs(mercury.dec - 19.6458) < 0.1);
  assert.ok(Math.abs(mercury.distanceAu - 0.748262) < 0.001);
});

test("Mars and Jupiter reproduce published heliocentric example transformed to equatorial", () => {
  // Tutorial sections 11/12: Mars lon 290.6297 lat -1.6203 r 1.417194;
  // Jupiter perturbed lon 105.2423 lat 0.1113 r 5.19508. Sun x/y from section 14.
  for (const [id, lon, lat, radius] of [["mars", 290.6297, -1.6203, 1.417194], ["jupiter", 105.2423, 0.1113, 5.19508]] as const) {
    const rad = Math.PI / 180;
    const x = radius * Math.cos(lon * rad) * Math.cos(lat * rad) + 0.881048;
    const y = radius * Math.sin(lon * rad) * Math.cos(lat * rad) + 0.482098;
    const z = radius * Math.sin(lat * rad);
    const obliquity = 23.4406 * rad;
    const ye = y * Math.cos(obliquity) - z * Math.sin(obliquity);
    const ze = y * Math.sin(obliquity) + z * Math.cos(obliquity);
    const ra = (Math.atan2(ye, x) / rad + 360) % 360;
    const dec = Math.atan2(ze, Math.hypot(x, ye)) / rad;
    const actual = planetPositions(example).find((p) => p.id === id);
    assert.ok(actual);
    assert.ok(Math.abs(actual.ra - ra) < 0.1);
    assert.ok(Math.abs(actual.dec - dec) < 0.1);
  }
});

test("planet magnitudes, distances and coordinates remain plausible across seasons", () => {
  for (const month of [0, 3, 6, 9]) {
    const at = new Date(Date.UTC(2026, month, 1));
    const planets = planetPositions(at);
    assert.equal(planets.length, 5);
    for (const p of planets) {
      assert.ok(p.ra >= 0 && p.ra < 360 && Math.abs(p.dec) <= 90);
      assert.ok(p.distanceAu > 0 && p.mag > -6 && p.mag < 8);
    }
    const venus = planets.find((p) => p.id === "venus");
    assert.ok(venus && venus.mag < -3);
    const moon = moonPosition(at);
    assert.ok(moon.distanceKm > 340_000 && moon.distanceKm < 410_000);
    assert.ok(Number.isFinite(moonMagnitude(at)));
  }
});
