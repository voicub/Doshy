import assert from "node:assert/strict";
import test from "node:test";
import { pressureAlert } from "./alerts.ts";
import { pressureOptions } from "./entitySuggest.ts";
import { weatherFromInputs } from "./liveSky.ts";
import { pressureReading, classifyTendency, type PressureEntity } from "./pressure.ts";
import { pressureSamples } from "./pressureHistory.ts";
import { cleanPressurePrefs, homeAltitude } from "./pressurePrefs.ts";
import { pressureLine } from "./wallFacts.ts";
import { pressureTip } from "./pressureText.ts";
import type { HAState } from "./ha.ts";

const sensor: HAState = { entity_id: "sensor.balcony_pressure", state: "1013", attributes: { friendly_name: "Balcony barometer", device_class: "atmospheric_pressure", unit_of_measurement: "hPa" } };
const reading = pressureReading({ [sensor.entity_id]: sensor });

test("pressure alert requires opt in, a usable source and very rapid fall, and never editing", () => {
  for (const [enabled, editing, source, delta, count] of [[true, false, reading, -7, 1], [false, false, reading, -7, 0], [true, true, reading, -7, 0], [true, false, null, -7, 0], [true, false, reading, -6, 0], [true, false, reading, 7, 0]] as const) {
    const alerts = pressureAlert(source, classifyTendency(delta), enabled, editing, 1234);
    assert.equal(alerts.length, count);
    if (count) assert.deepEqual([alerts[0].source, alerts[0].severity, alerts[0].since], ["weather", "info", 1234]);
  }
});

test("pressure history handles sensors and weather attribute changes in native units", () => {
  assert.equal(pressureSamples({ [sensor.entity_id]: { kind: "num", t: [1, 2], v: [1013, 1012] } }, sensor.entity_id, "hPa")[0].hpa, 1013);
  const weather = pressureSamples({ "weather.home|pressure": { kind: "state", changes: [{ t: 1, s: "29.92" }, { t: 2, s: "unknown" }, { t: 3, s: "29.90" }] } }, "weather.home", "inHg");
  assert.equal(weather.length, 2);
  assert.ok(Math.abs(weather[0].hpa - 1013.2) < 0.1);
  assert.deepEqual(pressureSamples({}, "weather.home", "hPa"), []);
});

test("pressure settings validate persisted inputs and use terrain unless manually overridden", () => {
  assert.deepEqual(cleanPressurePrefs({ entity: "bad id", correct: "yes", altitudeM: 1e8, alerts: 1 }), { entity: null, correct: false, altitudeM: null, alerts: false });
  const prefs = cleanPressurePrefs({ entity: sensor.entity_id, correct: true, altitudeM: 120.4, alerts: true });
  assert.equal(homeAltitude(prefs, 300), 120);
  assert.equal(homeAltitude({ altitudeM: null }, 222.2), 222);
  assert.equal(homeAltitude({ altitudeM: null }, undefined), undefined);
});

test("pressure cloudiness readiness is clamped and never overrides weather entities or manual weather", () => {
  assert.equal(weatherFromInputs({ pressureDelta3h: -3 }, "auto").cloud, 0.1);
  const nudge = weatherFromInputs({ pressureDelta3h: -100 }, "auto");
  assert.equal(nudge.kind, "cloudy");
  assert.ok(nudge.cloud <= 0.35);
  assert.equal(nudge.intensity, 0);
  assert.equal(weatherFromInputs({ weatherId: "weather.home", condition: "sunny", pressureDelta3h: -100 }, "auto").kind, "clear");
  assert.equal(weatherFromInputs({ pressureDelta3h: -100 }, "snow").kind, "snow");
});

test("suggestions include unavailable barometers but exclude gas pressure; absent source leaves wall data absent", () => {
  const offline = { ...sensor, state: "unavailable" };
  assert.deepEqual(pressureOptions({ [sensor.entity_id]: offline, "sensor.gas_pressure": { entity_id: "sensor.gas_pressure", state: "1010", attributes: { device_class: "pressure", unit_of_measurement: "hPa" } } }).map((s) => s.entity_id), [sensor.entity_id]);
  assert.equal(pressureLine(null, undefined, "auto"), null);
  assert.ok(reading);
  assert.ok(pressureLine(reading, classifyTendency(2), "inHg")?.includes("inHg"));
  assert.ok(pressureTip(reading, classifyTendency(-7), undefined, "kPa").includes("kPa"));
});

test("unavailable weather attributes never masquerade as a current reading", () => {
  const unavailable: PressureEntity = { entity_id: "weather.home", state: "unavailable", attributes: { pressure: 1013, pressure_unit: "hPa" } };
  assert.equal(pressureReading({ [unavailable.entity_id]: unavailable }), null);
});
