import test from "node:test";
import assert from "node:assert/strict";
import { beaufort, compass8, gustAt, gustiness, windBend, windFromSensors, windToMs } from "./wind.ts";
import type { HAState } from "./ha.ts";

const st = (entity_id: string, state: string, attributes: HAState["attributes"] = {}): HAState => ({ entity_id, state, attributes });

test("bend grows with speed and gusts, is zero in calm air and never exceeds 1", () => {
  assert.equal(windBend(0), 0);
  assert.ok(windBend(3) < windBend(8) && windBend(8) < windBend(15));
  assert.ok(windBend(5, 1) > windBend(5, 0));
  assert.equal(windBend(80, 1), 1);
});

test("gusts stay in 0..1 and vanish in a calm", () => {
  for (let t = 0; t < 600; t += 0.7) {
    const g = gustAt(t, 12);
    assert.ok(g >= 0 && g <= 1);
    assert.equal(gustAt(t, 0), 0);
  }
});

test("Beaufort names and compass points", () => {
  assert.equal(beaufort(0).force, 0);
  assert.equal(beaufort(30).force, 11);
  assert.equal(compass8(0), "N");
  assert.equal(compass8(135), "SE");
  assert.equal(compass8(-45), "NW");
  assert.equal(compass8(359), "N");
});

test("wind sensors: speed converted to m/s from km/h, direction read as degrees", () => {
  const found = windFromSensors({
    "sensor.station_wind_speed": st("sensor.station_wind_speed", "36", { unit_of_measurement: "km/h" }),
    "sensor.station_wind_bearing": st("sensor.station_wind_bearing", "225"),
    "sensor.station_temperature": st("sensor.station_temperature", "21"),
  });
  assert.equal(found.speed, 10);
  assert.equal(found.from, 225);
  assert.deepEqual(windFromSensors({ "sensor.x": st("sensor.x", "unavailable") }), { speed: undefined, from: undefined });
});

test("wind speeds convert to m/s from the unit they come in, with a per-source default for a missing unit", () => {
  assert.equal(windToMs(10, "m/s"), 10);
  assert.ok(Math.abs(windToMs(36, "km/h") - 10) < 1e-9);
  assert.ok(Math.abs(windToMs(10, " MPH ") - 4.4704) < 1e-9);
  assert.ok(Math.abs(windToMs(10, "kn") - 5.14444) < 1e-9);
  assert.equal(windToMs(10, undefined), 10);
  assert.ok(Math.abs(windToMs(36, undefined, "km/h") - 10) < 1e-9);
  assert.equal(windToMs(10, "furlongs per fortnight"), 10);
});

test("gustiness: no reading keeps the usual swing, steady air has little, a gust 60% over the mean has all of it", () => {
  assert.equal(gustiness(5, undefined), 1);
  assert.equal(gustiness(5, 5), 0.2);
  assert.equal(gustiness(5, 8), 1);
  assert.ok(gustiness(5, 6.5) > 0.2 && gustiness(5, 6.5) < 1);
  assert.equal(gustiness(0, 3), 1);
});
