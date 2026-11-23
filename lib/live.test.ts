import test from "node:test";
import assert from "node:assert/strict";
import { houseLive, humidityComfort, initials, pushSample, roomLive, stabilize, tempComfort } from "./live.ts";
import type { HAState } from "./ha.ts";
import type { Plan, Room } from "./types.ts";

const room = (id: string, extra: Partial<Room> = {}): Room => ({ id, name: id, x: 0, y: 0, w: 1, h: 1, floor: "wood", color: "#fff", ...extra });
const plan = (rooms: Room[]): Plan => ({ walls: [], openings: [], items: [], rooms });
const st = (entity_id: string, state: string, attributes: HAState["attributes"] = {}, last_changed?: string): HAState => ({ entity_id, state, attributes, last_changed });
const map = (...l: HAState[]) => Object.fromEntries(l.map((s) => [s.entity_id, s]));
const T = (min: number) => new Date(Date.UTC(2026, 0, 1, 12, min)).toISOString();

test("explicit fields: sensor, climate current_temperature, summed power, presence since the earliest still-on sensor", () => {
  const office = room("office", { tempEntity: "climate.t", humidityEntity: "sensor.h", presenceEntities: ["binary_sensor.a", "binary_sensor.b"], powerEntities: ["sensor.p1", "sensor.p2"] });
  const states = map(
    st("climate.t", "heat", { current_temperature: 21.5 }),
    st("sensor.h", "45", { unit_of_measurement: "%" }),
    st("binary_sensor.a", "on", {}, T(10)),
    st("binary_sensor.b", "on", {}, T(5)),
    st("sensor.p1", "120", { unit_of_measurement: "W" }),
    st("sensor.p2", "0.5", { unit_of_measurement: "kW" }),
  );
  const l = roomLive(plan([office]), states, office);
  assert.deepEqual(l.temp, { value: 21.5, unit: "°C", entity: "climate.t" });
  assert.equal(l.humidity?.value, 45);
  assert.equal(l.presence, true);
  assert.equal(l.presenceSince, Date.parse(T(5)));
  assert.equal(l.powerW, 620);
  assert.equal(l.tempComfort, "ok");
  assert.equal(l.humidityComfort, "ok");
});

test("presence: empty since the latest flip, null without a working sensor", () => {
  const r = room("r", { presenceEntities: ["binary_sensor.a", "binary_sensor.b"] });
  const off = roomLive(plan([r]), map(st("binary_sensor.a", "off", {}, T(1)), st("binary_sensor.b", "off", {}, T(9))), r);
  assert.equal(off.presence, false);
  assert.equal(off.presenceSince, Date.parse(T(9)));
  assert.equal(roomLive(plan([r]), map(st("binary_sensor.a", "unavailable"), st("binary_sensor.b", "unknown")), r).presence, null);
  assert.equal(roomLive(plan([room("x")]), {}, room("x")).presence, null);
});

test("alcoves fold into their parent", () => {
  const bed = room("bed");
  const alcove = room("alcove", { parent: "bed", tempEntity: "sensor.t", powerEntities: ["sensor.p"] });
  const states = map(st("sensor.t", "18.2", { unit_of_measurement: "°C" }), st("sensor.p", "10", { unit_of_measurement: "W" }));
  const l = roomLive(plan([bed, alcove]), states, bed);
  assert.equal(l.temp?.value, 18.2);
  assert.equal(l.powerW, 10);
  assert.equal(l.tempComfort, "cool");
});

test("area fallback skips device-internal temperatures and non-room sensors", () => {
  const r = room("kitchen", { areas: ["kitchen"] });
  const entityArea = { "sensor.plug_device_temperature": "kitchen", "sensor.k_temp": "kitchen", "sensor.k_hum": "kitchen", "sensor.o_temp": "office", "binary_sensor.k_motion": "kitchen", "sensor.k_power": "kitchen" };
  const states = map(
    st("sensor.plug_device_temperature", "55", { unit_of_measurement: "°C", device_class: "temperature" }),
    st("sensor.k_temp", "26", { unit_of_measurement: "°C", device_class: "temperature" }),
    st("sensor.k_hum", "70", { unit_of_measurement: "%", device_class: "humidity" }),
    st("sensor.o_temp", "10", { unit_of_measurement: "°C", device_class: "temperature" }),
    st("binary_sensor.k_motion", "on", { device_class: "motion" }, T(0)),
    st("sensor.k_power", "40", { unit_of_measurement: "W", device_class: "power" }),
  );
  const l = roomLive(plan([r]), states, r, { entityArea, areas: [{ id: "kitchen", name: "Kitchen" }] });
  assert.equal(l.temp?.entity, "sensor.k_temp");
  assert.equal(l.tempComfort, "warm");
  assert.equal(l.humidityComfort, "humid");
  assert.equal(l.presence, true);
  assert.equal(l.powerW, 40);
});

test("a configured but dead sensor does not fall back to the area", () => {
  const r = room("o", { areas: ["o"], tempEntity: "sensor.gone" });
  const l = roomLive(plan([r]), map(st("sensor.x", "20", { unit_of_measurement: "°C", device_class: "temperature" })), r, { entityArea: { "sensor.x": "o" }, areas: [{ id: "o", name: "O" }] });
  assert.equal(l.temp, undefined);
});

test("comfort bands, Fahrenheit converts", () => {
  assert.deepEqual([10, 18, 22, 26, 30].map((v) => tempComfort(v)), ["cold", "cool", "ok", "warm", "hot"]);
  assert.equal(tempComfort(72, "°F"), "ok");
  assert.deepEqual([20, 45, 70].map(humidityComfort), ["dry", "ok", "humid"]);
});

test("houseLive reads the well-known entities, degrades when missing, skips untracked persons", () => {
  assert.deepEqual(houseLive({}), { powerW: undefined, energyKwh: undefined, outsideTemp: undefined, outsideHumidity: undefined, meanTemp: undefined, meanHumidity: undefined, persons: [] });
  const h = houseLive(map(
    st("sensor.house_power_power", "294", { unit_of_measurement: "W" }),
    st("sensor.house_power_energy", "2517700", { unit_of_measurement: "Wh" }),
    st("sensor.outside_temperature", "7.3"),
    st("person.a", "home", { friendly_name: "Alex Smith" }),
    st("person.b", "not_home", { friendly_name: "Sam Jones \u2764\ufe0f\u200d\ud83d\udd25" }),
    st("person.c", "unknown", { friendly_name: "Heimdall" }),
  ));
  assert.equal(h.powerW, 294);
  assert.ok(Math.abs((h.energyKwh ?? 0) - 2517.7) < 1e-9);
  assert.equal(h.outsideTemp, 7.3);
  assert.deepEqual(h.persons, [{ entity: "person.a", name: "Alex Smith", home: true }, { entity: "person.b", name: "Sam Jones", home: false }]);
  assert.equal(initials("Alex Smith"), "AS");
});

test("pushSample keeps the newest N", () => {
  let l = pushSample(undefined, 0, 0, 3);
  for (let i = 1; i < 6; i++) l = pushSample(l, i, i, 3);
  assert.deepEqual(l, { t: [3, 4, 5], v: [3, 4, 5] });
});

test("stabilize keeps unchanged branches by identity", () => {
  const prev = { a: { v: 1 }, b: { v: 2 } };
  const next = stabilize(prev, { a: { v: 1 }, b: { v: 3 } });
  assert.equal(next.a, prev.a);
  assert.notEqual(next, prev);
  assert.equal(stabilize(prev, { a: { v: 1 }, b: { v: 2 } }), prev);
});

test("area fallback ignores sensors named after another room (HA files bedroom sensors under Kitchen)", () => {
  const living = room("living", { name: "Living & kitchen", areas: ["kitchen"] });
  const bedroom = room("bed", { name: "Bedroom" });
  const states = map(
    st("sensor.bedroom_climate_temperature", "20.8", { unit_of_measurement: "°C", device_class: "temperature" }),
    st("climate.flat_thermostat", "heat", { current_temperature: 22.3 }),
  );
  const entityArea = { "sensor.bedroom_climate_temperature": "kitchen", "climate.flat_thermostat": "kitchen" };
  const l = roomLive(plan([living, bedroom]), states, living, { entityArea, areas: [{ id: "kitchen", name: "Kitchen" }] });
  assert.equal(l.temp?.entity, "climate.flat_thermostat");
  assert.equal(l.temp?.value, 22.3);
});
