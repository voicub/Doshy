import assert from "node:assert/strict";
import { test } from "node:test";
import { issAt, issCouldBeUp, issLook, issLookAt, parseIssFix, predictIssPasses, trail } from "./iss.ts";

const raw = { latitude: 0, longitude: 0, altitude: 420, velocity: 27600, timestamp: 1767225600, units: "kilometers" };
const fix = parseIssFix(raw)!;
const previous = { ...fix, lat: -1.5, lon: -1, timestamp: fix.timestamp - 30 };

test("ISS parser validates every numeric field and units without coercion", () => {
  assert.ok(fix && fix.footprintKm > 4000);
  for (const value of [null, [], "bad", {}, { ...raw, units: "miles" }]) assert.equal(parseIssFix(value), null);
  for (const field of ["latitude", "longitude", "altitude", "velocity", "timestamp", "footprint"]) {
    for (const value of [NaN, Infinity, "1", null]) assert.equal(parseIssFix({ ...raw, [field]: value }), null);
  }
  for (const [field, value] of [["latitude", 91], ["longitude", -181], ["altitude", 100], ["velocity", 0], ["timestamp", 1], ["footprint", 30000]] as const) {
    assert.equal(parseIssFix({ ...raw, [field]: value }), null);
  }
});

test("ISS overhead and opposite side obey spherical geometry", () => {
  const overhead = issLook(fix, 0, 0);
  assert.ok(Math.abs(overhead.elevation - 90) < 1e-8);
  assert.ok(Math.abs(overhead.rangeKm - 420) < 1e-8);
  assert.ok(issLook(fix, 0, 180).elevation < -89);
  assert.equal(issCouldBeUp(fix, 0, 0), true);
  assert.equal(issCouldBeUp(fix, 0, 180), false);
  assert.equal(issCouldBeUp(fix, 0, 30, 10), true);
});

test("circular orbit anchors exactly and bounded trail follows same propagator", () => {
  const at = new Date(fix.timestamp * 1000);
  const position = issAt(fix, previous, at);
  assert.ok(Math.abs(position.lat - fix.lat) < 1e-8 && Math.abs(position.lon - fix.lon) < 1e-8);
  assert.deepEqual(issLookAt(fix, previous, at, 0, 0), issLook(position, 0, 0));
  const points = trail(fix, 120, 120, 30, previous);
  assert.equal(points.length, 9);
  for (const p of points) {
    assert.ok(Math.abs(p.lat) <= 51.65 && p.lon >= -180 && p.lon <= 180);
    assert.deepEqual({ lat: p.lat, lon: p.lon, altitudeKm: p.altitudeKm }, issAt(fix, previous, new Date((fix.timestamp + p.dt) * 1000)));
  }
  assert.ok(issAt(fix, previous, new Date((fix.timestamp + 60) * 1000)).lat > 0);
});

test("passes are ordered and include an already underway overhead pass", () => {
  const from = new Date(fix.timestamp * 1000);
  const passes = predictIssPasses(fix, previous, 0, 0, from, 12);
  assert.ok(passes.length > 0);
  const current = passes[0];
  assert.ok(current.start < from && current.end > from);
  assert.ok(current.maxElevation > 89);
  for (let i = 0; i < passes.length; i++) {
    const p = passes[i];
    assert.ok(p.start < p.peak && p.peak < p.end);
    assert.ok(p.maxElevation > 0 && p.maxElevation <= 90);
    assert.ok(Math.abs(issLookAt(fix, previous, p.start, 0, 0).elevation) < 0.1);
    assert.ok(Math.abs(issLookAt(fix, previous, p.end, 0, 0).elevation) < 0.1);
    if (i) assert.ok(p.start > passes[i - 1].end);
  }
  const short = predictIssPasses(fix, previous, 0, 0, from, 0.01);
  assert.ok(short.length > 0 && short[0].end > from); // Pass end beyond window must not be discarded.
});
