import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRESSURE_UNITS, classifyTendency, dialFraction, displayUnit, entityHpa, formatChange, formatPressure, fromHpa, isPressureEntity, pressureReading, pressureSensors,
  samplesFromSeries, seaLevelFromStation, stormWarning, tendencyArrow, toHpa, trend3h, zambretti, type PressureEntity, type Sample,
} from "./pressure.ts";
import { cleanPressureHomes } from "./pressurePrefs.ts";

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): PressureEntity => ({ entity_id, state, attributes });
const near = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const states = (...list: PressureEntity[]): Record<string, PressureEntity> => Object.fromEntries(list.map((s) => [s.entity_id, s]));

// ---- units -----------------------------------------------------------------------------------------------------------------------------------

test("known pressures convert to hectopascals", () => {
  near(toHpa(29.92, "inHg") ?? NaN, 1013.2, 0.1);
  near(toHpa(760, "mmHg") ?? NaN, 1013.25, 0.01);
  near(toHpa(101.325, "kPa") ?? NaN, 1013.25, 0.001);
  near(toHpa(101325, "Pa") ?? NaN, 1013.25, 0.001);
  near(toHpa(14.696, "psi") ?? NaN, 1013.25, 0.01);
  assert.equal(toHpa(1.01325, "bar"), 1013.25);
  assert.equal(toHpa(1013, "mbar"), 1013);
});

test("units are matched without regard to case and unknown ones give nothing", () => {
  assert.equal(toHpa(1000, "HPA"), 1000);
  assert.equal(toHpa(1000, "°C"), undefined);
  assert.equal(toHpa(1000, undefined), undefined);
  assert.equal(toHpa(Number.NaN, "hPa"), undefined);
  assert.equal(toHpa(1000, "constructor"), undefined); // a table lookup by a Home Assistant string never reaches the prototype
});

test("converting to a display unit and back loses nothing", () => {
  for (const unit of PRESSURE_UNITS) for (const hpa of [870, 1013.25, 1085]) near(toHpa(fromHpa(hpa, unit), unit) ?? NaN, hpa, 1e-9);
});

test("formatting follows the chosen unit, and Auto the entity's own", () => {
  assert.equal(formatPressure(1013.25, "hPa"), "1013 hPa");
  assert.equal(formatPressure(1013.25, "kPa"), "101.3 kPa");
  assert.equal(formatPressure(1013.25, "inHg"), "29.92 inHg");
  assert.equal(formatPressure(1013.25, "mmHg"), "760 mmHg");
  assert.equal(formatPressure(1013.25, "auto", "inHg"), "29.92 inHg");
  assert.equal(formatPressure(1013.25, "auto", "mbar"), "1013 hPa");
  assert.equal(formatPressure(1013.25, "auto", undefined), "1013 hPa");
  assert.equal(formatPressure(1013.25, "kPa", "inHg"), "101.3 kPa");
  assert.equal(displayUnit("auto", "psi"), "hPa");
});

test("a change keeps its sign and the unit's precision", () => {
  assert.equal(formatChange(1.24, "hPa"), "+1.2 hPa");
  assert.equal(formatChange(-3, "hPa"), "-3.0 hPa");
  assert.equal(formatChange(0, "hPa"), "0.0 hPa");
  assert.equal(formatChange(-3.386, "inHg"), "-0.10 inHg");
});

// ---- detection --------------------------------------------------------------------------------------------------------------------------------

test("a sensor with the atmospheric_pressure class is a barometer in any unit", () => {
  for (const [value, unit, hpa] of [["1013.2", "hPa", 1013.2], ["29.92", "inHg", 1013.2], ["101.3", "kPa", 1013], ["760", "mmHg", 1013.25], ["101325", "Pa", 1013.25]] as const) {
    const s = st("sensor.balcony_pressure", value, { device_class: "atmospheric_pressure", unit_of_measurement: unit });
    assert.ok(isPressureEntity(s), unit);
    near(entityHpa(s) ?? NaN, hpa, 0.1);
  }
});

test("a station at altitude may read far below sea level when Home Assistant calls it atmospheric", () => {
  assert.ok(isPressureEntity(st("sensor.cabin", "840", { device_class: "atmospheric_pressure", unit_of_measurement: "hPa" })));
  assert.ok(!isPressureEntity(st("sensor.pressure_hut", "840", { unit_of_measurement: "hPa" }))); // by name alone only the sea-level range counts
});

test("old sensors are found by name and unit", () => {
  assert.ok(isPressureEntity(st("sensor.esp_bme280_pressure", "1009", { unit_of_measurement: "hPa" })));
  assert.ok(isPressureEntity(st("sensor.barometer", "29.8", { unit_of_measurement: "inHg" })));
  assert.ok(isPressureEntity(st("sensor.attic", "1012", { unit_of_measurement: "mbar", friendly_name: "Attic baro" })));
  assert.ok(isPressureEntity(st("sensor.esp_pressure", "1009", { device_class: "pressure", unit_of_measurement: "hPa" }))); // ESPHome's BME280
});

test("gas, water and tyre pressure are not the weather", () => {
  assert.ok(!isPressureEntity(st("sensor.boiler_pressure", "1.4", { device_class: "pressure", unit_of_measurement: "bar" })));
  assert.ok(!isPressureEntity(st("sensor.car_tire_pressure", "230", { device_class: "pressure", unit_of_measurement: "kPa" })));
  assert.ok(!isPressureEntity(st("sensor.water_pressure", "1010", { device_class: "pressure", unit_of_measurement: "hPa" })));
  assert.ok(!isPressureEntity(st("sensor.gas_line_pressure", "1010", { unit_of_measurement: "hPa" })));
  assert.ok(!isPressureEntity(st("sensor.pump_pressure", "2.1", { unit_of_measurement: "psi" })));
  assert.ok(!isPressureEntity(st("sensor.blood_pressure", "120", { unit_of_measurement: "mmHg" })));
  assert.ok(!isPressureEntity(st("sensor.pipe_pressure", "300", { device_class: "pressure", unit_of_measurement: "kPa" }))); // kPa, but 3000 hPa is no sky
});

test("a name or a unit alone is not enough", () => {
  assert.ok(!isPressureEntity(st("sensor.kitchen_temperature", "1013", { unit_of_measurement: "hPa" })));
  assert.ok(!isPressureEntity(st("sensor.pressure_setting", "1013", { unit_of_measurement: "W" })));
  assert.ok(!isPressureEntity(st("sensor.pressure_label", "1013")));
  assert.ok(!isPressureEntity(st("light.pressure_lamp", "on")));
  assert.ok(!isPressureEntity(st("binary_sensor.low_pressure", "on", { device_class: "problem" })));
});

test("an unavailable barometer is still a barometer but gives no reading", () => {
  const s = st("sensor.balcony_pressure", "unavailable", { device_class: "atmospheric_pressure", unit_of_measurement: "hPa" });
  assert.ok(isPressureEntity(s));
  assert.equal(entityHpa(s), undefined);
  assert.equal(pressureReading(states(s)), null);
  assert.equal(pressureReading(states(st("sensor.balcony_pressure", "unknown", { device_class: "atmospheric_pressure", unit_of_measurement: "hPa" }))), null);
});

test("garbage and implausible readings are ignored", () => {
  for (const v of ["abc", "", "1e9", "0", "-5", "NaN", "5000"]) {
    assert.equal(entityHpa(st("sensor.baro", v, { device_class: "atmospheric_pressure", unit_of_measurement: "hPa" })), undefined, v);
  }
  assert.equal(entityHpa(st("sensor.baro", "1013", { device_class: "atmospheric_pressure", unit_of_measurement: "°C" })), undefined);
  assert.ok(!isPressureEntity(st("sensor.esp_pressure", "55", { unit_of_measurement: "hPa" }))); // a number that is no pressure: not a barometer, whatever it is called
  assert.equal(pressureSensors(states(st("sensor.baro", "1e9", { unit_of_measurement: "hPa" }))).length, 0);
});

test("a weather entity's pressure counts in its own unit", () => {
  assert.equal(pressureReading(states(st("weather.home", "sunny", { pressure: 1021, pressure_unit: "hPa" })))?.hpa, 1021);
  const inHg = pressureReading(states(st("weather.home", "sunny", { pressure: 29.92, pressure_unit: "inHg" })));
  near(inHg?.hpa ?? NaN, 1013.2, 0.1);
  assert.equal(inHg?.unit, "inHg");
  near(pressureReading(states(st("weather.home", "sunny", { pressure: 760, pressure_unit: "mmHg" })))?.hpa ?? NaN, 1013.25, 0.01);
  assert.equal(pressureReading(states(st("weather.home", "sunny", { pressure: 101.3, pressure_unit: "kPa" })))?.unit, "kPa");
});

test("a weather entity without a unit is read by its size", () => {
  assert.equal(pressureReading(states(st("weather.home", "sunny", { pressure: 1005 })))?.hpa, 1005);
  assert.equal(pressureReading(states(st("weather.home", "sunny", { pressure: 29.9 })))?.unit, "inHg");
  assert.equal(pressureReading(states(st("weather.home", "sunny", { pressure: 760 })))?.unit, "mmHg");
});

test("a weather entity with nothing usable gives no reading", () => {
  assert.equal(pressureReading(states(st("weather.home", "sunny", {}))), null);
  assert.equal(pressureReading(states(st("weather.home", "sunny", { pressure: 5 }))), null);
  assert.equal(pressureReading(states(st("weather.home", "sunny", { pressure: 1013, pressure_unit: "m/s" }))), null);
  assert.equal(pressureReading(states(st("weather.home", "sunny", { pressure: 99999 }))), null);
});

test("the sea-level sensor wins over the station sensor, and a chosen entity wins over both", () => {
  const station = st("sensor.balcony_pressure", "955", { device_class: "atmospheric_pressure", unit_of_measurement: "hPa", friendly_name: "Absolute pressure" });
  const sea = st("sensor.gw1100_relative_pressure", "1016", { device_class: "atmospheric_pressure", unit_of_measurement: "hPa" });
  const weather = st("weather.home", "sunny", { pressure: 1020, pressure_unit: "hPa" });
  const all = states(station, sea, weather);
  assert.equal(pressureReading(all)?.entity, "sensor.gw1100_relative_pressure");
  assert.equal(pressureReading(all, { entity: "weather.home" })?.entity, "weather.home");
  assert.equal(pressureReading(all, { entity: "sensor.balcony_pressure" })?.level, "station");
  assert.equal(pressureReading(states(station, weather))?.entity, "weather.home"); // sea-level beats an uncorrected station
  assert.equal(pressureReading(states(station))?.entity, "sensor.balcony_pressure");
});

test("a chosen entity that has no reading hands over to the automatic choice", () => {
  const sea = st("sensor.slp", "1016", { device_class: "atmospheric_pressure", unit_of_measurement: "hPa" });
  const dead = st("sensor.balcony_pressure", "unavailable", { device_class: "atmospheric_pressure", unit_of_measurement: "hPa" });
  assert.equal(pressureReading(states(sea, dead), { entity: "sensor.balcony_pressure" })?.entity, "sensor.slp");
  assert.equal(pressureReading(states(sea), { entity: "sensor.gone" })?.entity, "sensor.slp");
});

test("a hand-picked sensor needs no clever name", () => {
  const odd = st("sensor.xiaomi_lumi_1", "1004", { unit_of_measurement: "hPa" });
  assert.equal(pressureReading(states(odd)), null);
  assert.equal(pressureReading(states(odd), { entity: "sensor.xiaomi_lumi_1" })?.hpa, 1004);
});

test("sea-level and station names tell the level apart", () => {
  const level = (id: string) => pressureSensors(states(st(id, "1013", { unit_of_measurement: "hPa", device_class: "atmospheric_pressure" })))[0].level;
  assert.equal(level("sensor.sea_level_pressure"), "sea");
  assert.equal(level("sensor.home_slp"), "sea");
  assert.equal(level("sensor.gw1000a_relative_pressure"), "sea");
  assert.equal(level("sensor.station_pressure"), "station");
  assert.equal(level("sensor.gw1000a_absolute_pressure"), "station");
  assert.equal(level("sensor.balcony_pressure"), "unknown");
  assert.equal(level("sensor.absolutely_pressure_x"), "unknown"); // "absolutely" is not "absolute"
});

test("a station reading is corrected to sea level only when asked, and never when it says it is at sea level", () => {
  const station = st("sensor.balcony_pressure", "899", { device_class: "atmospheric_pressure", unit_of_measurement: "hPa" });
  const raw = pressureReading(states(station), { elevationM: 1000 });
  assert.equal(raw?.hpa, 899);
  assert.equal(raw?.corrected, false);
  const fixed = pressureReading(states(station), { elevationM: 1000, correct: true });
  assert.equal(fixed?.corrected, true);
  assert.equal(fixed?.rawHpa, 899);
  assert.ok((fixed?.hpa ?? 0) > 1010 && (fixed?.hpa ?? 0) < 1015);
  assert.equal(pressureReading(states(station), { correct: true })?.corrected, false); // no altitude, nothing to correct with
  const sea = st("sensor.sea_level_pressure", "1013", { device_class: "atmospheric_pressure", unit_of_measurement: "hPa" });
  assert.equal(pressureReading(states(sea), { elevationM: 1000, correct: true })?.hpa, 1013);
});

// ---- sea level ---------------------------------------------------------------------------------------------------------------------------------

test("the International Standard Atmosphere is reduced back to 1013.25 hPa", () => {
  near(seaLevelFromStation(898.76, 1000, 8.5), 1013.25, 0.2); // ISA: 898.76 hPa at 1000 m where the air is 8.5 C
  near(seaLevelFromStation(898.76, 1000), 1013.25, 0.2); // standard temperature is the default
  near(seaLevelFromStation(795.01, 2000), 1013.25, 0.3);
});

test("at sea level, with no altitude, or with nonsense, the reading is unchanged", () => {
  assert.equal(seaLevelFromStation(1013.25, 0), 1013.25);
  assert.equal(seaLevelFromStation(1000, Number.NaN), 1000);
  assert.equal(seaLevelFromStation(Number.NaN, 100).toString(), "NaN");
});

test("a station below sea level reads higher than the sea-level value", () => {
  assert.ok(seaLevelFromStation(1020, -50) < 1020);
});

// ---- tendency ----------------------------------------------------------------------------------------------------------------------------------

test("the Met Office tendency bands, at and either side of every boundary", () => {
  const label = (d: number) => classifyTendency(d).label;
  assert.equal(label(0), "steady");
  assert.equal(label(0.04), "steady");
  assert.equal(label(-0.04), "steady");
  assert.equal(label(0.1), "rising slowly");
  assert.equal(label(1.5), "rising slowly");
  assert.equal(label(1.54), "rising slowly");
  assert.equal(label(1.6), "rising");
  assert.equal(label(3.5), "rising");
  assert.equal(label(3.6), "rising quickly");
  assert.equal(label(6.0), "rising quickly");
  assert.equal(label(6.04), "rising quickly");
  assert.equal(label(6.1), "rising very rapidly");
  assert.equal(label(25), "rising very rapidly");
  assert.equal(label(-0.1), "falling slowly");
  assert.equal(label(-1.5), "falling slowly");
  assert.equal(label(-1.6), "falling");
  assert.equal(label(-3.5), "falling");
  assert.equal(label(-3.6), "falling quickly");
  assert.equal(label(-6.0), "falling quickly");
  assert.equal(label(-6.1), "falling very rapidly");
});

test("the readings between the published bands go to the nearer one", () => {
  assert.equal(classifyTendency(1.55).label, "rising"); // 1.5 and 1.6 are the published edges; 1.55 reads 1.6 to a tenth
  assert.equal(classifyTendency(-3.55).label, "falling quickly");
});

test("the tendency's direction, level and arrow agree", () => {
  const t = classifyTendency(-7);
  assert.equal(t.direction, "falling");
  assert.equal(t.level, 4);
  assert.equal(tendencyArrow(t), "↓↓");
  assert.equal(tendencyArrow(classifyTendency(0)), "→");
  assert.equal(tendencyArrow(classifyTendency(0.5)), "↗");
  assert.equal(tendencyArrow(classifyTendency(2)), "↑");
});

const H = 3_600_000;
/** A pressure that falls `perHour` hPa an hour, sampled every `stepMin` minutes for `hours`. */
function ramp(hours: number, perHour: number, stepMin = 10, start = 1013, t0 = 1_700_000_000_000): Sample[] {
  const out: Sample[] = [];
  for (let m = 0; m <= hours * 60; m += stepMin) out.push({ t: t0 + m * 60_000, hpa: start + (perHour * m) / 60 });
  return out;
}

test("a steady fall of 1 hPa an hour is 3 hPa in three hours", () => {
  const t = trend3h(ramp(6, -1));
  near(t?.deltaHpa3h ?? NaN, -3, 1e-9);
  assert.equal(t?.label, "falling");
});

test("only the last three hours count", () => {
  const early = ramp(3, -2, 10, 1030);
  const flat = ramp(3, 0, 10, 1024, early[early.length - 1].t).slice(1);
  assert.equal(trend3h([...early, ...flat])?.label, "steady");
});

test("sparse, irregular samples are interpolated at the start of the window", () => {
  const t0 = 1_700_000_000_000;
  const t = trend3h([{ t: t0, hpa: 1010 }, { t: t0 + 5 * H, hpa: 1000 }, { t: t0 + 6 * H, hpa: 999 }]);
  // at 3 h before the end (t0 + 3 h) the line from 1010 (t0) to 1000 (t0 + 5 h) is at 1004
  near(t?.deltaHpa3h ?? NaN, 999 - 1004, 1e-9);
});

test("samples out of order or twice give the same answer as sorted ones", () => {
  const s = ramp(4, 1);
  assert.deepEqual(trend3h([...s].reverse()), trend3h(s));
  assert.deepEqual(trend3h([...s, ...s]), trend3h(s));
});

test("too little history is no tendency", () => {
  assert.equal(trend3h([]), undefined);
  assert.equal(trend3h([{ t: 0, hpa: 1013 }]), undefined);
  assert.equal(trend3h(ramp(2, -1)), undefined);
  assert.ok(trend3h(ramp(3, -1)) !== undefined);
  assert.equal(trend3h(ramp(2.5, -1)), undefined);
});

test("the latest value is held up to now", () => {
  const s = ramp(3, -1); // falls to 1010 and then nothing is recorded: Home Assistant only logs changes
  const now = s[s.length - 1].t + 3 * H;
  const t = trend3h(s, now);
  assert.equal(t?.label, "steady"); // for the last three hours it has not moved
  assert.equal(trend3h(s, s[s.length - 1].t - 5 * H)?.label, "falling"); // a clock behind the data does not move the window before it
});

test("implausible spikes are dropped, not averaged in", () => {
  const s = ramp(4, 0);
  s[10] = { ...s[10], hpa: 5 };
  s[12] = { ...s[12], hpa: Number.NaN };
  assert.equal(trend3h(s)?.label, "steady");
});

test("history series become hPa samples in the sensor's unit", () => {
  const s = samplesFromSeries([1, 2, 3], [29.92, 29.9, 29.88], "inHg");
  assert.equal(s.length, 3);
  near(s[0].hpa, 1013.2, 0.1);
  assert.deepEqual(samplesFromSeries([1], [5], "°C"), []);
  assert.equal(samplesFromSeries([1, 2], [1000], "hPa").length, 1);
});

test("only a very rapid fall is a storm warning", () => {
  assert.equal(stormWarning(classifyTendency(-6.5)), true);
  assert.equal(stormWarning(classifyTendency(-6)), false);
  assert.equal(stormWarning(classifyTendency(7)), false);
  assert.equal(stormWarning(undefined), false);
});

// ---- Zambretti ---------------------------------------------------------------------------------------------------------------------------------
// Expected letters are worked out from the published formulas and lookup tables of the SAS "Zambretti Algorithm for Weather Forecasting" example
// (Z = 127 - 0.12 P falling, 144 - 0.13 P steady, 185 - 0.16 P rising; Z 1 to 9, 10 to 19, 20 to 32), with the pressures chosen so that no value sits on an integer.

const winter = { month: 1 };

test("known inputs give the published forecast", () => {
  assert.equal(zambretti(1010, -3, winter).letter, "O"); // Z = 5.8 -> 5, "Showery, becoming more unsettled"
  assert.equal(zambretti(990, -3, winter).letter, "V"); // 8.2 -> 8
  assert.equal(zambretti(1001, 0, winter).letter, "K"); // 13.87 -> 13, "Fairly fine, showers likely"
  assert.equal(zambretti(1030, 0, winter).letter, "A"); // 10.1 -> 10, "Settled fine"
  assert.equal(zambretti(1005, 3, winter).letter, "G"); // 24.2 -> 24, "Fairly fine, possible showers early"
  assert.equal(zambretti(960, 3, winter).letter, "Y"); // 31.4 -> 31, "Stormy, possibly improving"
  assert.equal(zambretti(1015, 3, winter).letter, "C"); // 22.6 -> 22, "Becoming fine"
});

// Scott (2011, drkfs.net/zambretti.html, tables 1a to 1c) read the forecast letters off a real Negretti & Zambra dial at these sea-level pressures. The formulas are a straight-line
// fit of that dial, so a letter can be a step or two off but never further.
const DIAL_READINGS: Record<"falling" | "steady" | "rising", { change: number; rows: string; points: [string, number][] }> = {
  falling: { change: -3, rows: "ABDHORUVX", points: [["A", 1050], ["B", 1040], ["D", 1024], ["H", 1018], ["O", 1010], ["R", 1004], ["U", 998], ["V", 991], ["X", 985]] },
  steady: { change: 0, rows: "ABEKNPSWXZ", points: [["A", 1033], ["B", 1023], ["E", 1014], ["K", 1008], ["N", 1000], ["P", 994], ["S", 989], ["W", 981], ["X", 974], ["Z", 960]] },
  rising: { change: 3, rows: "ABCFGIJLMQTYZ", points: [["A", 1030], ["B", 1022], ["C", 1012], ["F", 1007], ["G", 1000], ["I", 995], ["J", 990], ["L", 984], ["M", 978], ["Q", 970], ["T", 965], ["Y", 959], ["Z", 947]] },
};

test("the formulas follow a real Zambretti dial within two steps and mostly exactly", () => {
  let exact = 0;
  let total = 0;
  for (const { change, rows, points } of Object.values(DIAL_READINGS)) {
    for (const [letter, hpa] of points) {
      const off = Math.abs(rows.indexOf(zambretti(hpa, change, winter).letter) - rows.indexOf(letter));
      assert.ok(off <= 2, `${letter} at ${hpa} hPa came out ${off} steps away`);
      total++;
      if (off === 0) exact++;
    }
  }
  assert.ok(exact / total >= 0.6, `${exact} of ${total} exact`);
});

test("the outcome comes with plain English and the scale it was read on", () => {
  const z = zambretti(1030, 0, winter);
  assert.equal(z.scale, "steady");
  assert.ok(z.text.length > 0);
  assert.equal(zambretti(1010, -3, winter).scale, "falling");
  assert.equal(zambretti(1010, 3, winter).scale, "rising");
});

test("the scale is chosen at 1.6 hPa in three hours", () => {
  assert.equal(zambretti(1000, 1.59, winter).scale, "steady");
  assert.equal(zambretti(1000, 1.6, winter).scale, "rising");
  assert.equal(zambretti(1000, -1.59, winter).scale, "steady");
  assert.equal(zambretti(1000, -1.6, winter).scale, "falling");
});

test("higher pressure never forecasts worse weather on the same scale", () => {
  for (const delta of [-3, 0, 3]) {
    let last = "Z";
    for (let p = 940; p <= 1060; p += 1) {
      const letter = zambretti(p, delta, winter).letter;
      assert.ok(letter <= last, `${p} hPa, change ${delta}: ${letter} after ${last}`);
      last = letter;
    }
  }
});

test("a wind from the south is worse, from the north no change, from the east or west one step", () => {
  const at = (windFromDeg: number) => zambretti(1010, -3, { ...winter, windFromDeg }).letter;
  assert.equal(at(0), "O"); // Z 5
  assert.equal(at(90), "R"); // 6
  assert.equal(at(270), "R");
  assert.equal(at(180), "U"); // 7
  assert.equal(zambretti(1010, -3, winter).letter, at(0)); // no wind reading = no correction
});

test("in the southern hemisphere the wind and the seasons turn round", () => {
  // January is summer there: a falling barometer reads one step worse than in a northern January (5 + 1)
  assert.equal(zambretti(1010, -3, { month: 1, hemisphere: "south" }).letter, "R");
  assert.equal(zambretti(1010, -3, { month: 7, hemisphere: "south" }).letter, "O");
  // a wind from the north there is the warm one: it counts as the "south" wind of the north (+2)
  assert.equal(zambretti(1010, -3, { month: 1, hemisphere: "south", windFromDeg: 0 }).letter, "V");
  assert.equal(zambretti(1010, -3, { month: 1, hemisphere: "south", windFromDeg: 180 }).letter, "R");
});

test("summer makes a rising barometer one step kinder and a falling one one step worse", () => {
  assert.equal(zambretti(1005, 3, { month: 7 }).letter, "F"); // 24 - 1 = 23
  assert.equal(zambretti(1010, -3, { month: 7 }).letter, "R"); // 5 + 1 = 6
  assert.equal(zambretti(1001, 0, { month: 7 }).letter, "K"); // steady: none
});

test("outside what a scale was made for the nearest end is shown and flagged", () => {
  const low = zambretti(900, -3, winter); // falling is calibrated for 985 to 1050
  assert.equal(low.letter, "X");
  assert.equal(low.extreme, true);
  const high = zambretti(1070, -3, winter);
  assert.equal(high.letter, "A");
  assert.equal(high.extreme, true);
  assert.equal(zambretti(1010, -3, winter).extreme, false);
  assert.equal(zambretti(900, 3, { month: 1, windFromDeg: 180 }).letter, "Z"); // the south wind cannot push past the last row
});

// ---- the wall barometer's dial -----------------------------------------------------------------------------------------------------------------

test("the needle spans 960 to 1060 hPa and stops at the ends", () => {
  assert.equal(dialFraction(960), 0);
  assert.equal(dialFraction(1060), 1);
  assert.equal(dialFraction(1010), 0.5);
  assert.equal(dialFraction(900), 0);
  assert.equal(dialFraction(1200), 1);
});

test("pressure choices are kept per home, and settings saved before homes existed belong to the main home", () => {
  assert.deepEqual(cleanPressureHomes({ entity: "sensor.baro", correct: true, altitudeM: 300, alerts: false }), { main: { entity: "sensor.baro", correct: true, altitudeM: 300, alerts: false } });
  const homes = cleanPressureHomes({ homes: { main: { altitudeM: 10 }, cabin: { altitudeM: 1400, correct: true }, "bad id!": { altitudeM: 5 } } });
  assert.equal(homes.main.altitudeM, 10);
  assert.equal(homes.cabin.altitudeM, 1400);
  assert.equal(homes.cabin.entity, null);
  assert.equal("bad id!" in homes, false);
  assert.deepEqual(cleanPressureHomes("x"), {});
});
