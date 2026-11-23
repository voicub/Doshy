import test from "node:test";
import assert from "node:assert/strict";
import { computeSky, daylightOf, sunPosition, weatherOf } from "./sky.ts";
import type { HAState } from "./ha.ts";

const st = (entity_id: string, state: string, attributes: HAState["attributes"] = {}): HAState => ({ entity_id, state, attributes });
const AUTO = { timeMode: "auto", weatherMode: "auto" } as const;

test("sun is high and due south at local solar noon in Bucharest at midsummer", () => {
  // solar noon in Bucharest (26.1 E) is about 10:16 UTC on the solstice
  const { elevation, azimuth } = sunPosition(new Date("2026-06-21T10:16:00Z"), 44.43, 26.1);
  assert.ok(elevation > 68 && elevation < 70.5, `elevation ${elevation}`);
  assert.ok(Math.abs(azimuth - 180) < 6, `azimuth ${azimuth}`);
});

test("sun is below the horizon at local midnight and rises in the east", () => {
  assert.ok(sunPosition(new Date("2026-11-20T22:16:00Z"), 44.43, 26.1).elevation < -15);
  const morning = sunPosition(new Date("2026-06-21T03:30:00Z"), 44.43, 26.1);
  assert.ok(morning.elevation > 0 && morning.azimuth > 40 && morning.azimuth < 110, `az ${morning.azimuth} el ${morning.elevation}`);
});

test("daylight blends smoothly through twilight", () => {
  assert.equal(daylightOf(-20), 0);
  assert.equal(daylightOf(30), 1);
  const mid = daylightOf(1);
  assert.ok(mid > 0.3 && mid < 0.7);
});

test("auto mode prefers sun.sun over the computed sun, manual mode ignores both", () => {
  const states = { "sun.sun": st("sun.sun", "above_horizon", { elevation: 12, azimuth: 250 }) };
  const auto = computeSky(states, new Date("2026-11-20T10:00:00Z"), AUTO, "day");
  assert.equal(auto.source, "sun.sun");
  assert.equal(auto.elevation, 12);
  const manual = computeSky(states, new Date("2026-11-20T10:00:00Z"), { timeMode: "manual", weatherMode: "auto" }, "night");
  assert.equal(manual.source, "manual");
  assert.equal(manual.phase, "night");
});

test("zone.home coordinates feed the computed sun when sun.sun is absent", () => {
  const sky = computeSky({ "zone.home": st("zone.home", "zoning", { latitude: -33.9, longitude: 151.2 }) }, new Date("2026-06-21T02:00:00Z"), AUTO, "day");
  assert.equal(sky.source, "computed");
  // 12:00 local winter noon in Sydney: sun is up and to the north
  assert.ok(sky.elevation > 20 && (sky.azimuth < 40 || sky.azimuth > 320), `${sky.elevation} ${sky.azimuth}`);
});

test("Home Assistant conditions map to weather kinds, a forced mode overrides them", () => {
  const rainy = { "weather.home": st("weather.home", "pouring", { wind_speed: 36, temperature: 7 }) };
  const w = weatherOf(rainy, "auto");
  assert.equal(w.kind, "rain");
  assert.equal(w.intensity, 1);
  assert.equal(w.wind, 10); // 36 km/h
  assert.equal(weatherOf(rainy, "snow").kind, "snow");
  assert.equal(weatherOf({ "weather.home": st("weather.home", "lightning-rainy") }, "auto").kind, "storm");
  assert.equal(weatherOf({}, "auto").kind, "clear");
});

test("season and holiday follow the date and the home latitude, a forced mode overrides them", () => {
  const winterDay = new Date(2026, 11, 24, 12);
  const auto = computeSky({}, winterDay, AUTO, "day");
  assert.deepEqual([auto.season.season, auto.holiday?.id, auto.holiday?.strength], ["winter", "CHRISTMAS", 1]);
  const south = computeSky({ "zone.home": st("zone.home", "zoning", { latitude: -33.9, longitude: 151.2 }) }, winterDay, AUTO, "day");
  assert.equal(south.season.season, "summer");
  const forced = computeSky({}, winterDay, { ...AUTO, seasonMode: "spring", holidayMode: "HALLOWEEN" }, "day");
  assert.deepEqual([forced.season, forced.holiday], [{ season: "spring", next: "summer", mix: 0 }, { id: "HALLOWEEN", strength: 1 }]);
  assert.equal(computeSky({}, winterDay, { ...AUTO, holidayMode: "none" }, "day").holiday, null);
  const easter = computeSky({}, new Date(2026, 3, 5, 12), { ...AUTO, easterRite: "western" }, "day");
  assert.equal(easter.holiday?.id, "EASTER");
});
