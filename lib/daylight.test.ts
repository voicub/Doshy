import test from "node:test";
import assert from "node:assert/strict";
import { clock, dateOfDay, dayLabel, dayLight, dayLightText, dayOfYear, instantOf, offsetLabel, planSun, seasonDay, sunAt, sunSamples, sunWords, type Place } from "./daylight.ts";

const BUCHAREST: Place = { lat: 44.43, lon: 26.1 };
const SYDNEY: Place = { lat: -33.87, lon: 151.21 };
const TROMSO: Place = { lat: 69.65, lon: 18.96 };
const YEAR = 2026;
const JUN21 = dayOfYear(YEAR, 5, 21);
const DEC21 = dayOfYear(YEAR, 11, 21);

/** The highest the sun gets on a day, minute by minute: that is solar noon. */
const noon = (place: Place, doy: number, offsetMin: number) => sunSamples(place, YEAR, doy, offsetMin, 1).reduce((best, s) => (s.elevation > best.elevation ? s : best));

test("a wall-clock time becomes the right UTC instant", () => {
  assert.equal(instantOf(YEAR, JUN21, 12, 180).toISOString(), "2026-06-21T09:00:00.000Z");
  assert.equal(instantOf(YEAR, JUN21, 7.5, -300).toISOString(), "2026-06-21T12:30:00.000Z");
  assert.equal(instantOf(YEAR, 1, 0.5, 120).toISOString(), "2025-12-31T22:30:00.000Z", "a clock ahead of UTC at half past midnight is still the day before in UTC");
});

test("day of year and calendar date agree, with 29 February counted in leap years", () => {
  assert.equal(JUN21, 172);
  assert.deepEqual(dateOfDay(YEAR, 172), { month: 5, day: 21 });
  assert.equal(dayOfYear(2028, 5, 21), 173);
  assert.equal(dayLabel(YEAR, 1), "1 Jan");
  assert.equal(dayLabel(YEAR, 365), "31 Dec");
});

test("summer solstice noon in Bucharest: the sun stands 90 - 44.43 + 23.44 = 69 degrees high, due south", () => {
  const n = noon(BUCHAREST, JUN21, 180);
  assert.ok(Math.abs(n.elevation - 69) < 0.5, `elevation ${n.elevation}`);
  assert.ok(Math.abs(n.azimuth - 180) < 2, `azimuth ${n.azimuth}`);
  assert.ok(Math.abs(n.minutes / 60 - 13.3) < 0.1, `solar noon is about 13:17 summer time, got minute ${n.minutes}`);
});

test("winter solstice noon in Bucharest is 90 - 44.43 - 23.44 = 22 degrees", () => {
  const n = noon(BUCHAREST, DEC21, 120);
  assert.ok(Math.abs(n.elevation - 22.1) < 0.5, `elevation ${n.elevation}`);
});

test("southern winter: the Sydney sun at noon is 32.7 degrees high and in the NORTH", () => {
  const n = noon(SYDNEY, JUN21, 600);
  assert.ok(Math.abs(n.elevation - 32.7) < 0.6, `elevation ${n.elevation}`);
  const fromNorth = Math.min(n.azimuth, 360 - n.azimuth);
  assert.ok(fromNorth < 3, `azimuth ${n.azimuth}`);
});

test("at the equator on the equinox the noon sun is overhead", () => {
  // solar noon at longitude 0 on 20 March is about 12:07 UTC (the equation of time is -7 minutes)
  const s = sunAt({ lat: 0, lon: 0 }, YEAR, dayOfYear(YEAR, 2, 20), 12.12, 0);
  assert.ok(s.elevation > 89, `elevation ${s.elevation}`);
});

test("the sun is far below the horizon at midnight", () => {
  const june = sunAt(BUCHAREST, YEAR, JUN21, 0, 180).elevation;
  assert.ok(june < -15 && june > -30, `June midnight ${june} (expected about -22)`);
  assert.ok(sunAt(BUCHAREST, YEAR, DEC21, 0, 120).elevation < -60, "December midnight is about -69");
});

test("sunrise and sunset in Bucharest at the June solstice (summer time) fall within 8 minutes of 05:31 and 21:04", () => {
  const d = dayLight(BUCHAREST, YEAR, JUN21, 180);
  assert.equal(d.polar, null);
  assert.ok(d.rise !== null && Math.abs(d.rise - (5 + 31 / 60)) < 8 / 60, `rise ${d.rise}`);
  assert.ok(d.set !== null && Math.abs(d.set - (21 + 4 / 60)) < 8 / 60, `set ${d.set}`);
  assert.equal(dayLightText({ rise: 4 + 40 / 60, set: 21 + 5 / 60, polar: null }), "Sunrise 04:40 / Sunset 21:05");
});

test("polar day and polar night above the Arctic circle", () => {
  assert.equal(dayLight(TROMSO, YEAR, JUN21, 120).polar, "day");
  assert.equal(dayLight(TROMSO, YEAR, DEC21, 60).polar, "night");
  assert.equal(sunSamples(TROMSO, YEAR, JUN21, 120, 10).length, 144, "the sun is up at every one of the 144 ten-minute samples");
  assert.equal(sunSamples(TROMSO, YEAR, DEC21, 60, 10).length, 0);
  assert.match(dayLightText(dayLight(TROMSO, YEAR, DEC21, 60)), /does not rise/);
});

test("sun samples only list daylight, and the summer day is longer than the winter day", () => {
  const summer = sunSamples(BUCHAREST, YEAR, JUN21, 180, 10);
  const winter = sunSamples(BUCHAREST, YEAR, DEC21, 120, 10);
  assert.ok(summer.every((s) => s.elevation > 0));
  assert.ok(Math.abs(summer.length - 93) <= 2, `${summer.length} ten-minute samples (15.5 hours of sun)`);
  assert.ok(Math.abs(winter.length - 52) <= 3, `${winter.length} ten-minute samples (8.5 hours of sun)`);
});

test("the sun direction in the plan frame turns with the plan's bearing", () => {
  const east = planSun(90, 30, 0);
  assert.ok(Math.abs(east.ux - 1) < 1e-9 && Math.abs(east.uy) < 1e-9, "sun in the east shows to the right of a north-up plan");
  assert.ok(Math.abs(east.slope - Math.tan(Math.PI / 6)) < 1e-9);
  assert.ok(Math.abs(planSun(0, 10, 0).uy + 1) < 1e-9, "sun in the north is plan up (-y)");
  const south = planSun(180, 45, 90); // plan up points east, so south is the plan's right-hand side
  assert.ok(Math.abs(south.ux - 1) < 1e-9 && Math.abs(south.uy) < 1e-9);
  assert.ok(Math.abs(south.slope - 1) < 1e-9);
  const behind = planSun(10, 20, 350); // sun 20 degrees clockwise of a plan that is turned 350 degrees
  assert.ok(Math.abs(Math.hypot(behind.ux, behind.uy) - 1) < 1e-9);
  assert.ok(behind.ux > 0.3 && behind.uy < -0.9, "20 degrees clockwise of plan up");
});

test("season presets switch hemisphere with the latitude", () => {
  assert.equal(seasonDay(YEAR, "winter", 44.43), DEC21);
  assert.equal(seasonDay(YEAR, "summer", 44.43), JUN21);
  assert.equal(seasonDay(YEAR, "winter", -33.87), JUN21);
  assert.equal(seasonDay(YEAR, "summer", -33.87), DEC21);
  assert.equal(seasonDay(YEAR, "equinox", 44.43), 79);
  assert.equal(seasonDay(YEAR, "equinox", -33.87), 79);
});

test("clock and offset labels", () => {
  assert.equal(clock(14.5), "14:30");
  assert.equal(clock(5 / 60), "00:05");
  assert.equal(clock(24), "24:00");
  assert.equal(clock(23.999), "24:00", "rounds to the minute before wrapping");
  assert.equal(offsetLabel(120), "UTC+02:00");
  assert.equal(offsetLabel(-330), "UTC-05:30");
});

test("the sun in words: height and the nearest of eight compass points, and below the horizon", () => {
  assert.equal(sunWords({ elevation: 46.6, azimuth: 134 }), "47° high in the south-east");
  assert.equal(sunWords({ elevation: 20, azimuth: 359 }), "20° high in the north", "just before north wraps to north");
  assert.equal(sunWords({ elevation: 20, azimuth: 22 }), "20° high in the north");
  assert.equal(sunWords({ elevation: 20, azimuth: 23 }), "20° high in the north-east");
  assert.equal(sunWords({ elevation: -12.4, azimuth: 10 }), "below the horizon (12° under)");
});
