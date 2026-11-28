import assert from "node:assert/strict";
import test from "node:test";
import type { HAState } from "./ha.ts";
import { fromScale, heatPoints, rangeFor, sensorCounts, snap, toScale, type HeatMetric, type HeatPoint } from "./heatmap.ts";
import { analyseHeat, buildField, readingsKey, roomExtremes, type Field, type RoomStat } from "./heatmapField.ts";
import { paletteColor } from "./heatmapPalette.ts";
import type { Item, Plan, Room, Wall } from "./types.ts";

const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({ id, name: id, x, y, w, h, color: "#fff", floor: "wood", ...extra });
const wall = (id: string, ax: number, ay: number, bx: number, by: number, level?: string): Wall => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, style: "plaster", level });
const sensorItem = (id: string, entity: string, x: number, y: number, level?: string): Item => ({ id, kind: "sensor", x, y, rot: 0, w: 0.1, d: 0.1, h: 0.1, entity, level });
const plan = (p: Partial<Plan>): Plan => ({ walls: [], openings: [], rooms: [], items: [], ...p });
const sensor = (id: string, state: string, cls: string, unit?: string): HAState => ({ entity_id: id, state, attributes: { device_class: cls, ...(unit ? { unit_of_measurement: unit } : {}) } });
const states = (...list: HAState[]) => Object.fromEntries(list.map((s) => [s.entity_id, s]));

const RANGE = [0, 40] as const;
const point = (x: number, y: number, value: number): HeatPoint => ({ x, y, value, entity: `sensor.t${x}_${y}` });

/** The value drawn at a plan position: the nearest cell, decoded from its byte back across the colour range. */
function valueAt(f: Field, x: number, y: number, range: readonly [number, number] = RANGE, metric: HeatMetric = "temperature") {
  const i = Math.floor((x - f.x0) / f.cell);
  const j = Math.floor((y - f.y0) / f.cell);
  const lo = toScale(metric, range[0]);
  return fromScale(metric, lo + (f.data[(j * f.w + i) * 4] / 255) * (toScale(metric, range[1]) - lo));
}
const cellAt = (f: Field, x: number, y: number) => {
  const k = (Math.floor((y - f.y0) / f.cell) * f.w + Math.floor((x - f.x0) / f.cell)) * 4;
  return { r: f.data[k], g: f.data[k + 1], a: f.data[k + 3] };
};
const build = (points: HeatPoint[], rooms: Room[], walls: Wall[] = [], flat = false, metric: HeatMetric = "temperature", range: readonly [number, number] = RANGE) => {
  const f = buildField(points, { rooms, walls }, { metric, range, flat });
  assert.ok(f);
  return f;
};

test("temperature in Fahrenheit is converted to Celsius and flagged", () => {
  const p = plan({ rooms: [room("a", 0, 0, 5, 4)], items: [sensorItem("i", "sensor.t", 2, 2)] });
  const [pt] = heatPoints(p, states(sensor("sensor.t", "68", "temperature", "°F")), "temperature", "L0");
  assert.equal(pt.value, 20);
  assert.equal(pt.f, true);
});

test("unavailable, unknown, absurd, internal, wrong-class and wrong-unit readings are ignored", () => {
  const ids = ["sensor.a", "sensor.b", "sensor.c", "sensor.cpu_temperature", "sensor.e", "sensor.f", "sensor.ok"];
  const p = plan({ rooms: [room("a", 0, 0, 5, 4)], items: ids.map((id, n) => sensorItem(`i${n}`, id, 1 + n * 0.5, 2)) });
  const s = states(
    sensor("sensor.a", "unavailable", "temperature", "°C"),
    sensor("sensor.b", "unknown", "temperature", "°C"),
    sensor("sensor.c", "999", "temperature", "°C"),
    sensor("sensor.cpu_temperature", "55", "temperature", "°C"),
    sensor("sensor.e", "20", "humidity", "%"),
    sensor("sensor.f", "300", "temperature", "K"),
    sensor("sensor.ok", "21.04", "temperature", "°C"),
  );
  const pts = heatPoints(p, s, "temperature", "L0");
  assert.deepEqual(pts.map((x) => [x.entity, x.value]), [["sensor.ok", 21]]);
});

test("a thermostat gives its current temperature and humidity", () => {
  const p = plan({ rooms: [room("a", 0, 0, 5, 4)], items: [sensorItem("i", "climate.hall", 2, 2)] });
  const s = states({ entity_id: "climate.hall", state: "heat", attributes: { current_temperature: 19.5, current_humidity: 44 } });
  assert.equal(heatPoints(p, s, "temperature", "L0")[0].value, 19.5);
  assert.equal(heatPoints(p, s, "humidity", "L0")[0].value, 44);
  assert.deepEqual(heatPoints(p, s, "co2", "L0"), []);
});

test("a room's own sensor field is placed at the room centre only when no sensor is placed in it", () => {
  const rooms = [room("a", 0, 0, 4, 4, { tempEntity: "sensor.field" }), room("b", 4, 0, 4, 4, { tempEntity: "sensor.field_b" })];
  const p = plan({ rooms, items: [sensorItem("i", "sensor.placed", 6, 1)] });
  const s = states(sensor("sensor.field", "18", "temperature", "°C"), sensor("sensor.field_b", "25", "temperature", "°C"), sensor("sensor.placed", "21", "temperature", "°C"));
  const pts = heatPoints(p, s, "temperature", "L0");
  assert.deepEqual(pts.map((x) => [x.x, x.y, x.value]), [[6, 1, 21], [2, 2, 18]]);
});

test("a room reading from the live figures is used when the room has no field of its own", () => {
  const p = plan({ rooms: [room("a", 0, 0, 4, 4)] });
  const pts = heatPoints(p, {}, "humidity", "L0", { a: { humidity: { value: 51, unit: "%", entity: "sensor.x" } } });
  assert.deepEqual(pts.map((x) => x.value), [51]);
});

test("sensors on other levels and outside every room do not count", () => {
  const levels = [{ id: "L1", name: "G", elevation: 0, height: 3 }, { id: "L2", name: "U", elevation: 3, height: 3 }];
  const p = plan({
    levels,
    rooms: [room("a", 0, 0, 4, 4, { level: "L1" }), room("g", 10, 0, 4, 4, { level: "L1", floor: "grass" })],
    items: [sensorItem("i1", "sensor.up", 1, 1, "L2"), sensorItem("i2", "sensor.garden", 11, 1, "L1"), sensorItem("i3", "sensor.in", 1, 1, "L1")],
  });
  const s = states(sensor("sensor.up", "30", "temperature", "°C"), sensor("sensor.garden", "5", "temperature", "°C"), sensor("sensor.in", "21", "temperature", "°C"));
  assert.deepEqual(heatPoints(p, s, "temperature", "L1").map((x) => x.entity), ["sensor.in"]);
});

test("sensor counts ignore the value, so an unavailable sensor still enables its metric", () => {
  const p = plan({ rooms: [room("a", 0, 0, 4, 4)], items: [sensorItem("i", "sensor.lux", 1, 1)] });
  const c = sensorCounts(p, states(sensor("sensor.lux", "unavailable", "illuminance", "lx")));
  assert.deepEqual([c.light, c.temperature, c.noise], [1, 0, 0]);
});

test("a cell on a sensor shows that sensor's value", () => {
  const f = build([point(1, 1, 10), point(9, 1, 30)], [room("a", 0, 0, 10, 2)]);
  assert.ok(Math.abs(valueAt(f, 1, 1) - 10) < 0.5);
  assert.ok(Math.abs(valueAt(f, 9, 1) - 30) < 0.5);
});

test("between two sensors in one room the value rises steadily", () => {
  const f = build([point(1, 1, 10), point(9, 1, 30)], [room("a", 0, 0, 10, 2)]);
  let prev = -1;
  for (let x = 1; x <= 9; x += 0.25) {
    const v = valueAt(f, x, 1);
    assert.ok(v >= prev - 1e-9, `x=${x}`);
    prev = v;
  }
  assert.ok(Math.abs(valueAt(f, 5, 1) - 20) < 1);
});

test("a wall keeps the far room closer to its own sensor", () => {
  const rooms = [room("a", 0, 0, 5, 4), room("b", 5, 0, 5, 4)];
  const sensors = [point(2.5, 2, 10), point(7.5, 2, 30)];
  const open = build(sensors, rooms);
  const walled = build(sensors, rooms, [wall("w", 5, 0, 5, 4)]);
  assert.ok(valueAt(walled, 5.5, 2) > valueAt(open, 5.5, 2) + 3);
  assert.ok(valueAt(walled, 5.5, 2) > 27);
  assert.ok(valueAt(walled, 4.5, 2) < 13);
});

test("a fence does not block the spread", () => {
  const rooms = [room("a", 0, 0, 5, 4), room("b", 5, 0, 5, 4)];
  const sensors = [point(2.5, 2, 10), point(7.5, 2, 30)];
  const fence: Wall = { ...wall("f", 5, 0, 5, 4), style: "fence_picket" };
  assert.equal(valueAt(build(sensors, rooms, [fence]), 5.5, 2), valueAt(build(sensors, rooms), 5.5, 2));
});

test("cells outside every room are masked out, an alcove belongs to its room", () => {
  const rooms = [room("a", 0, 0, 2, 2), room("b", 6, 6, 2, 2), room("alc", 2, 0, 1, 1, { parent: "a" })];
  const f = build([point(1, 1, 20), point(7, 7, 22)], rooms);
  assert.equal(cellAt(f, 4, 4).a, 0);
  assert.equal(cellAt(f, 1, 1).a, 255);
  assert.equal(cellAt(f, 2.5, 0.5).a, 255);
  assert.ok(f.w <= 128 && f.h <= 128 && Math.max(f.w, f.h) >= 127);
});

test("a room without a sensor is flagged as estimated and takes its neighbours' value", () => {
  const rooms = [room("a", 0, 0, 4, 4), room("b", 4, 0, 4, 4), room("c", 8, 0, 4, 4)];
  const f = build([point(2, 2, 10), point(6, 2, 30)], rooms);
  assert.equal(cellAt(f, 10, 2).g, 255);
  assert.equal(cellAt(f, 2, 2).g, 0);
  assert.deepEqual(f.rooms.map((r) => [r.id, r.estimated]), [["a", false], ["b", false], ["c", true]]);
  assert.ok((f.rooms[2].mean as number) > 20);
});

test("flat mode: one value per room, estimated rooms copy the nearest measured room", () => {
  const rooms = [room("a", 0, 0, 4, 4), room("b", 4, 0, 4, 4), room("c", 8, 0, 4, 4)];
  const f = build([point(1, 1, 10), point(3, 3, 14), point(5, 2, 30)], rooms, [], true);
  const a = new Set<number>();
  for (let x = 0.2; x < 4; x += 0.3) a.add(cellAt(f, x, 1.5).r);
  assert.equal(a.size, 1);
  assert.ok(Math.abs(valueAt(f, 2, 2) - 12) < 0.5);
  assert.ok(Math.abs(valueAt(f, 10, 2) - 30) < 0.5);
  assert.equal(cellAt(f, 10, 2).g, 255);
});

test("a level without a usable reading has no field", () => {
  assert.equal(buildField([], { rooms: [room("a", 0, 0, 4, 4)], walls: [] }, { metric: "temperature", range: RANGE }), null);
});

test("light is interpolated on a log scale", () => {
  const f = build([point(1, 1, 10), point(9, 1, 1000)], [room("a", 0, 0, 10, 2)], [], false, "light", [0, 1000]);
  const mid = valueAt(f, 5, 1, [0, 1000], "light");
  assert.ok(mid > 60 && mid < 160, String(mid));
});

test("colour ranges are rounded and never too narrow", () => {
  const t = rangeFor("temperature", [20.4, 21.2]);
  assert.ok(t[1] - t[0] >= 4 && t[0] <= 20.4 && t[1] >= 21.2 && Number.isInteger(t[0]) && Number.isInteger(t[1]));
  assert.deepEqual(rangeFor("temperature", [16.2, 24.9]), [16, 25]);
  assert.deepEqual(rangeFor("temperature", []), [18, 26]);
  assert.deepEqual(rangeFor("humidity", [35, 50]), [20, 80]);
  assert.deepEqual(rangeFor("humidity", [10, 95]), [10, 100]);
  assert.deepEqual(rangeFor("co2", [450, 2300]), [400, 2500]);
  assert.deepEqual(rangeFor("light", [0, 3200]), [0, 5000]);
  assert.deepEqual(rangeFor("light", [5, 80]), [0, 1000]);
  assert.deepEqual(rangeFor("noise", [35, 95]), [30, 100]);
});

test("palettes start and end on their own colours and clamp", () => {
  assert.deepEqual(paletteColor("viridis", 0), [68, 1, 84]);
  assert.deepEqual(paletteColor("viridis", 1), [253, 231, 37]);
  assert.deepEqual(paletteColor("viridis", 7), [253, 231, 37]);
  assert.deepEqual(paletteColor("viridis", Number.NaN), [68, 1, 84]);
  assert.deepEqual(paletteColor("diverging", 0.5), [247, 247, 247]);
  assert.deepEqual(paletteColor("turbo", 0), [48, 18, 59]);
  const half = paletteColor("viridis", 1 / 16);
  assert.ok(half[0] > 68 && half[0] < 71);
});

test("readings are snapped so tiny changes do not redraw", () => {
  assert.equal(snap("temperature", 21.04), 21);
  assert.equal(snap("temperature", 21.06), 21.1);
  assert.equal(snap("co2", 704), 700);
  assert.ok(Math.abs(snap("light", 100) - 100) <= 5);
  const k = (v: number) => readingsKey([{ x: 1, y: 2, value: snap("temperature", v), entity: "e" }]);
  assert.equal(k(21.01), k(21.04));
  assert.notEqual(k(21), k(21.3));
});

test("the analysis is reused until a reading really changes", () => {
  const p = plan({ rooms: [room("a", 0, 0, 5, 4)], items: [sensorItem("i", "sensor.t", 2, 2)] });
  const at = (v: string) => analyseHeat(p, states(sensor("sensor.t", v, "temperature", "°C")), "temperature", false);
  const first = at("21.01");
  assert.equal(at("21.04"), first);
  assert.notEqual(at("21.5"), first);
  assert.notEqual(analyseHeat(p, states(sensor("sensor.t", "21.5", "temperature", "°C")), "temperature", true), at("21.5"));
  assert.equal(first.count, 1);
  assert.ok(first.fields.L0);
});

test("where it is coldest and hottest: only rooms with a sensor, no room twice", () => {
  const r = (id: string, mean: number | null, estimated = false): RoomStat => ({ id, name: id, mean, estimated });
  const four = roomExtremes([r("a", 18), r("b", 22), r("c", 20), r("d", 25), r("e", 5, true)]);
  assert.deepEqual(four.low.map((x) => x.id), ["a", "c"]);
  assert.deepEqual(four.high.map((x) => x.id), ["d", "b"]);
  const three = roomExtremes([r("a", 18), r("b", 22), r("c", 20)]);
  assert.deepEqual([three.low.map((x) => x.id), three.high.map((x) => x.id)], [["a", "c"], ["b"]]);
  assert.deepEqual(roomExtremes([r("a", 18)]), { low: [r("a", 18)], high: [] });
});
