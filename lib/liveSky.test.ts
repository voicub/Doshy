import test from "node:test";
import assert from "node:assert/strict";
import { REAL_PINS, findWeatherId, followsReality, fogThickness, kindAtTemperature, parsePins, pinsWhenOff, precipIntensity, readInputs, weatherFromInputs, type RawStates } from "./liveSky.ts";

type RawState = RawStates[string];
const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): RawState => ({ entity_id, state, attributes });
const states = (...list: RawState[]): RawStates => Object.fromEntries(list.map((s) => [s.entity_id, s]));
const wx = (...list: RawState[]) => weatherFromInputs(readInputs(states(...list)), "auto");

test("conditions map to kinds, a missing or unknown condition is a clear sky", () => {
  assert.equal(wx(st("weather.home", "pouring")).kind, "rain");
  assert.equal(wx(st("weather.home", "lightning-rainy")).kind, "storm");
  assert.equal(wx(st("weather.home", "partlycloudy")).kind, "cloudy");
  assert.equal(wx(st("weather.home", "unavailable")).kind, "clear");
  assert.equal(wx(st("weather.home", "constructor")).kind, "clear");
  assert.equal(wx().kind, "clear");
});

test("cloud coverage wins over the condition's own cloud value", () => {
  const rainy = (attrs: Record<string, unknown>) => wx(st("weather.home", "rainy", attrs));
  assert.equal(rainy({}).cloud, 0.9);
  assert.equal(rainy({ cloud_coverage: 80 }).cloud, 0.8);
  assert.equal(rainy({ cloud_coverage: 0 }).cloud, 0);
  assert.equal(rainy({ cloud_coverage: 250 }).cloud, 1);
  assert.equal(rainy({ cloud_coverage: "80" }).cloud, 0.9, "a text value is not a reading");
});

test("the wind speed is converted from the entity's own unit, km/h when none is given", () => {
  const speed = (attrs: Record<string, unknown>) => wx(st("weather.home", "sunny", attrs)).wind;
  assert.ok(Math.abs(speed({ wind_speed: 36 }) - 10) < 1e-9);
  assert.ok(Math.abs(speed({ wind_speed: 36, wind_speed_unit: "km/h" }) - 10) < 1e-9);
  assert.equal(speed({ wind_speed: 10, wind_speed_unit: "m/s" }), 10);
  assert.ok(Math.abs(speed({ wind_speed: 10, wind_speed_unit: "mph" }) - 4.4704) < 1e-9);
  assert.ok(Math.abs(speed({ wind_speed: 10, wind_speed_unit: "kn" }) - 5.14444) < 1e-9);
  assert.ok(Math.abs(speed({ wind_speed: 10, wind_speed_unit: "ft/s" }) - 3.048) < 1e-9);
  assert.equal(wx(st("weather.home", "sunny", { wind_speed: 18, wind_speed_unit: "km/h", wind_gust_speed: 36 })).gust, 10);
  assert.equal(wx(st("weather.home", "sunny")).gust, undefined);
});

test("a weather station's wind sensor is used only when the entity has no wind of its own", () => {
  const sensors = [st("sensor.wind_speed", "5", { unit_of_measurement: "m/s" }), st("sensor.wind_bearing", "90")];
  const own = wx(st("weather.home", "sunny", { wind_speed: 36, wind_bearing: 10 }), ...sensors);
  assert.deepEqual([own.wind, own.windFrom], [10, 10]);
  const station = wx(st("weather.home", "sunny"), ...sensors);
  assert.deepEqual([station.wind, station.windFrom], [5, 90]);
});

test("precipitation scales rain and snow, and a dry reading leaves the condition's own intensity", () => {
  const rain = (mm: number | undefined, unit?: string) => wx(st("weather.home", "rainy", { precipitation: mm, precipitation_unit: unit })).intensity;
  assert.ok(precipIntensity(0.2) < precipIntensity(2.5) && precipIntensity(2.5) < precipIntensity(7.6) && precipIntensity(7.6) < precipIntensity(25));
  assert.ok(precipIntensity(0) >= 0.15 && precipIntensity(500) <= 1);
  assert.equal(rain(undefined), 0.5);
  assert.equal(rain(0), 0.5);
  assert.equal(rain(8), precipIntensity(8));
  assert.ok(Math.abs(rain(0.5, "in") - precipIntensity(12.7)) < 1e-9, "inches are converted");
  assert.equal(wx(st("weather.home", "snowy", { precipitation: 1 })).intensity, precipIntensity(1));
  assert.equal(wx(st("weather.home", "lightning-rainy", { precipitation: 1 })).intensity, 0.85, "a storm keeps its own strength");
});

test("visibility thickens fog only", () => {
  assert.ok(fogThickness(0.2) > fogThickness(1) && fogThickness(1) > fogThickness(4));
  assert.equal(fogThickness(20), 0);
  assert.equal(wx(st("weather.home", "fog", { visibility: 1 })).intensity, fogThickness(1));
  assert.equal(wx(st("weather.home", "fog", { visibility: 1000, visibility_unit: "m" })).intensity, fogThickness(1));
  assert.equal(wx(st("weather.home", "fog")).intensity, 0.7);
  assert.equal(wx(st("weather.home", "cloudy", { visibility: 0.5 })).intensity, 0);
});

test("temperature decides at the margins: freezing rain is snow, sleet in mild air is rain, °F is converted", () => {
  assert.equal(kindAtTemperature("rain", "rainy", -3), "snow");
  assert.equal(kindAtTemperature("rain", "rainy", 4), "rain");
  assert.equal(kindAtTemperature("snow", "snowy-rainy", 5), "rain");
  assert.equal(kindAtTemperature("snow", "snowy-rainy", 0), "snow");
  assert.equal(kindAtTemperature("snow", "snowy", 5), "snow");
  assert.equal(kindAtTemperature("rain", "rainy", undefined), "rain");
  assert.equal(wx(st("weather.home", "pouring", { temperature: 23, temperature_unit: "°F" })).kind, "snow");
  assert.equal(wx(st("weather.home", "pouring", { temperature: 23, temperature_unit: "°F" })).temp, -5);
  assert.equal(wx(st("weather.home", "pouring", { temperature: 7, temperature_unit: "°C" })).temp, 7);
});

test("a forced weather ignores the entity's numbers but keeps its wind", () => {
  const w = weatherFromInputs(readInputs(states(st("weather.home", "sunny", { wind_speed: 36, cloud_coverage: 0 }))), "storm");
  assert.deepEqual([w.kind, w.cloud, w.condition, w.wind], ["storm", 1, "manual", 10]);
  const pinned = weatherFromInputs(readInputs(states(st("weather.home", "sunny", { wind_speed: 36 }))), "auto", { speed: 3, from: 45 });
  assert.deepEqual([pinned.wind, pinned.windFrom, pinned.gust], [3, 45, undefined]);
});

test("the entity to follow: the owner's pick, else one named like the home, else the first by id", () => {
  const s = states(st("weather.openweathermap", "sunny"), st("weather.forecast_home", "rainy"), st("weather.aaa", "sunny"));
  assert.equal(findWeatherId(s), "weather.forecast_home");
  assert.equal(findWeatherId(s, "weather.openweathermap"), "weather.openweathermap");
  assert.equal(findWeatherId(s, "weather.gone"), "weather.forecast_home", "a pick that vanished falls back to auto");
  assert.equal(findWeatherId(s, "light.kitchen"), "weather.forecast_home", "only weather entities can be picked");
  assert.equal(findWeatherId(states(st("weather.zeta", "sunny"), st("weather.alpha", "sunny"))), "weather.alpha");
  assert.equal(findWeatherId({}), undefined);
  assert.equal(readInputs(s, "weather.openweathermap").condition, "sunny");
});

test("the moon comes from Home Assistant's sensor when there is a real phase", () => {
  assert.equal(readInputs(states(st("sensor.moon_phase", "full_moon"))).moon, "full_moon");
  assert.equal(readInputs(states(st("sensor.moon", "waning_crescent"))).moon, "waning_crescent");
  assert.equal(readInputs(states(st("moon.home", "first_quarter"))).moon, "first_quarter");
  assert.equal(readInputs(states(st("sensor.moon_phase", "unknown"))).moon, undefined);
  assert.equal(readInputs({}).moon, undefined);
});

test("the sun and the home position are read only when valid", () => {
  const ok = readInputs(states(st("sun.sun", "above_horizon", { elevation: 20, azimuth: 200 }), st("zone.home", "zoning", { latitude: 1, longitude: 2 })));
  assert.deepEqual([ok.sunEl, ok.sunAz, ok.lat, ok.lon], [20, 200, 1, 2]);
  const half = readInputs(states(st("sun.sun", "above_horizon", { elevation: 20 })));
  assert.deepEqual([half.sunEl, half.sunAz], [undefined, undefined]);
});

test("reading the same states twice gives equal inputs, so a poll that changes nothing the sky uses is no change", () => {
  const a = states(st("weather.home", "rainy", { cloud_coverage: 80 }), st("light.hall", "on", { brightness: 10 }));
  const b = states(st("weather.home", "rainy", { cloud_coverage: 80 }), st("light.hall", "off"));
  assert.deepEqual(readInputs(a), readInputs(b));
});

test("pins: a set of all-real choices follows reality, switching off brings the earlier manual choices back or freezes what is on screen", () => {
  assert.ok(followsReality(REAL_PINS));
  assert.ok(!followsReality({ ...REAL_PINS, wind: { speed: 4, from: 270 } }));
  const now = { phase: "dusk", kind: "rain", windSpeed: 7, windFrom: 200 } as const;
  const earlier = { time: "night", weather: "snow", wind: "auto" } as const;
  assert.deepEqual(pinsWhenOff(earlier, now), earlier);
  assert.deepEqual(pinsWhenOff(null, now), { time: "dusk", weather: "rain", wind: { speed: 7, from: 200 } });
  assert.deepEqual(pinsWhenOff(REAL_PINS, now), { time: "dusk", weather: "rain", wind: { speed: 7, from: 200 } });
});

test("stored pins are validated whole", () => {
  assert.deepEqual(parsePins({ time: "night", weather: "storm", wind: { speed: 3, from: 90 } }), { time: "night", weather: "storm", wind: { speed: 3, from: 90 } });
  assert.deepEqual(parsePins({ time: "auto", weather: "auto", wind: "auto" }), REAL_PINS);
  assert.equal(parsePins({ time: "noon", weather: "auto", wind: "auto" }), null);
  assert.equal(parsePins({ time: "auto", weather: "hail", wind: "auto" }), null);
  assert.equal(parsePins({ time: "auto", weather: "auto", wind: { speed: "x", from: 1 } }), null);
  assert.equal(parsePins(null), null);
  assert.equal(parsePins("auto"), null);
});
