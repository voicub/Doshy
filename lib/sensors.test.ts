import test from "node:test";
import assert from "node:assert/strict";
import { classifySensor, fmtNum, ledLevel, numericClass, ramp, uvBand } from "./sensors.ts";
import type { HAState } from "./ha.ts";

const ent = (entity_id: string, state: string, attributes: HAState["attributes"] = {}) => ({ entity_id, state, attributes });

test("leak sensor: red, drips and is an alert while wet, calm and grey while dry", () => {
  const wet = classifySensor(ent("binary_sensor.sink_leak", "on", { device_class: "moisture" }))!;
  assert.deepEqual([wet.anim, wet.alert, wet.color], ["drip", true, "#ff4d4d"]);
  const dry = classifySensor(ent("binary_sensor.sink_leak", "off", { device_class: "moisture" }))!;
  assert.deepEqual([dry.anim, dry.alert], ["none", false]);
});

test("door open is amber and blinks; closed is calm", () => {
  const open = classifySensor(ent("binary_sensor.front", "on", { device_class: "door" }))!;
  assert.deepEqual([open.anim, open.color, open.alert], ["blink", "#ffb02e", true]);
  assert.equal(classifySensor(ent("binary_sensor.front", "off", { device_class: "door" }))!.anim, "none");
});

test("presence, occupancy and motion all draw calm radar rings while on", () => {
  for (const dc of ["presence", "occupancy", "motion"]) assert.equal(classifySensor(ent(`binary_sensor.${dc}`, "on", { device_class: dc }))!.anim, "radar");
  assert.equal(classifySensor(ent("binary_sensor.p", "off", { device_class: "presence" }))!.anim, "none");
});

test("vibration shakes, smoke pulses red", () => {
  assert.equal(classifySensor(ent("binary_sensor.v", "on", { device_class: "vibration" }))!.anim, "shake");
  const s = classifySensor(ent("binary_sensor.s", "on", { device_class: "smoke" }))!;
  assert.deepEqual([s.anim, s.color], ["pulse", "#ff4d4d"]);
});

test("connectivity: offline is the alert, online is fine", () => {
  assert.equal(classifySensor(ent("binary_sensor.c", "off", { device_class: "connectivity" }))!.alert, true);
  assert.equal(classifySensor(ent("binary_sensor.c", "on", { device_class: "connectivity" }))!.alert, false);
});

test("temperature runs cool blue to warm orange and handles Fahrenheit", () => {
  const cold = classifySensor(ent("sensor.t", "8", { device_class: "temperature", unit_of_measurement: "°C" }))!;
  const warm = classifySensor(ent("sensor.t", "30", { device_class: "temperature", unit_of_measurement: "°C" }))!;
  assert.equal(cold.color, "#4aa3ff");
  assert.equal(warm.color, "#ff8a3c");
  assert.equal(cold.value, "8°C");
  assert.equal(classifySensor(ent("sensor.t", "86", { device_class: "temperature", unit_of_measurement: "°F" }))!.color, warm.color);
});

test("lux reads '412 lx' and gets brighter as it gets lighter", () => {
  const dim = classifySensor(ent("sensor.l", "412", { device_class: "illuminance", unit_of_measurement: "lx" }))!;
  assert.equal(dim.value, "412 lx");
  const bright = classifySensor(ent("sensor.l", "20000", { device_class: "illuminance", unit_of_measurement: "lx" }))!;
  const lum = (c: string) => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16);
  assert.ok(lum(bright.color) > lum(dim.color));
  assert.ok(lum(dim.color) > lum(classifySensor(ent("sensor.l", "1", { device_class: "illuminance" }))!.color));
});

test("UV index: bands and colours", () => {
  const uv = (v: string) => classifySensor(ent("sensor.uv", v, { unit_of_measurement: "UV index" }))!;
  assert.equal(uv("6").kind, "uv");
  assert.deepEqual([uvBand(1), uvBand(4), uvBand(9), uvBand(12)], ["low", "moderate", "very high", "extreme"]);
  assert.equal(uv("1").color, "#43d17a");
  assert.equal(uv("12").color, "#b46bff");
});

test("CO2 goes green, amber, red", () => {
  const c = (v: string) => classifySensor(ent("sensor.c", v, { device_class: "carbon_dioxide", unit_of_measurement: "ppm" }))!;
  assert.equal(c("600").color, "#43d17a");
  assert.equal(c("1000").color, "#ffb02e");
  assert.equal(c("2500").color, "#ff4d4d");
  assert.equal(c("2500").alert, true);
});

test("class-less sensors are recognised by unit, then by name", () => {
  assert.equal(numericClass(ent("sensor.x", "5", { unit_of_measurement: "dB" })), "noise");
  assert.equal(numericClass(ent("sensor.washer_power", "5", { unit_of_measurement: "W" })), "power");
  assert.equal(numericClass(ent("sensor.hall_humidity", "50", { unit_of_measurement: "%" })), "humidity");
  assert.equal(numericClass(ent("sensor.door_battery", "50", { unit_of_measurement: "%" })), "battery");
  assert.equal(numericClass(ent("sensor.whatever", "50", { unit_of_measurement: "%" })), "value");
});

test("battery below 15 percent is red and an alert", () => {
  const b = classifySensor(ent("sensor.b", "9", { device_class: "battery", unit_of_measurement: "%" }))!;
  assert.deepEqual([b.value, b.color, b.alert], ["9%", "#ff4d4d", true]);
});

test("unavailable sensors are grey, calm and dim", () => {
  const s = classifySensor(ent("binary_sensor.m", "unavailable", { device_class: "motion" }))!;
  assert.deepEqual([s.unavailable, s.anim], [true, "none"]);
  assert.ok(ledLevel(s) < ledLevel(classifySensor(ent("binary_sensor.m", "off", { device_class: "motion" }))!));
});

test("locks and sirens classify; lights and switches do not", () => {
  assert.equal(classifySensor(ent("lock.front", "unlocked"))!.color, "#ffb02e");
  assert.equal(classifySensor(ent("lock.front", "jammed"))!.alert, true);
  assert.equal(classifySensor(ent("siren.hall", "on"))!.anim, "pulse");
  assert.equal(classifySensor(ent("light.hall", "on")), null);
  assert.equal(classifySensor(ent("switch.plug", "on")), null);
  assert.equal(classifySensor(undefined), null);
});

test("number formatting and colour ramps clamp at both ends", () => {
  assert.deepEqual([fmtNum(412), fmtNum(21.46), fmtNum(0.123), fmtNum(1234.6)], ["412", "21.5", "0.12", "1235"]);
  assert.equal(ramp(-50, [[0, "#000000"], [10, "#ffffff"]]), "#000000");
  assert.equal(ramp(5, [[0, "#000000"], [10, "#ffffff"]]), "#808080");
  assert.equal(ramp(99, [[0, "#000000"], [10, "#ffffff"]]), "#ffffff");
});
