import test from "node:test";
import assert from "node:assert/strict";
import { beaufort, compass8, gustAt, windBend, windFromSensors } from "./wind.ts";
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
