import test from "node:test";
import assert from "node:assert/strict";
import {
  addFlowTo, autoInvert, dropOrphanFlows, flowWatts, formatPower, guessPowerEntity, guessSocEntity, intensity, makePath, patchFlowIn, pointAt, proposeFlows, pulseOf, readWatts, removeFlowFrom, roleOf,
  routeFlow, sankeyOf, smoothTo, summarize, toneOf, wallCrossings, type States,
} from "./flows.ts";
import type { Item, Plan } from "./types.ts";
import { removeLevelFrom } from "./planOps.ts";

const item = (id: string, kind: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({ id, kind, x, y, rot: 0, w: 1, d: 1, h: 1, ...extra });
const plan = (items: Item[], extra: Partial<Plan> = {}): Plan => ({ walls: [], openings: [], rooms: [], items, ...extra });
const sensor = (id: string, state: string, unit: string, extra: Record<string, string> = {}) => [id, { entity_id: id, state, attributes: { unit_of_measurement: unit, ...extra } }] as const;
const states = (...s: (readonly [string, object])[]) => Object.fromEntries(s) as States;

test("power readings are normalised to watts and unusable ones are undefined", () => {
  assert.equal(readWatts(sensor("sensor.a", "2.4", "kW")[1]), 2400);
  assert.equal(readWatts(sensor("sensor.a", "350", "W")[1]), 350);
  assert.equal(readWatts(sensor("sensor.a", "0.5", "MW")[1]), 500000);
  assert.equal(readWatts({ state: "120" }), 120, "no unit: watts");
  assert.equal(readWatts(sensor("sensor.a", "5", "kWh")[1]), undefined, "energy is not power");
  assert.equal(readWatts(sensor("sensor.a", "unavailable", "W")[1]), undefined);
  assert.equal(readWatts(sensor("sensor.a", "", "W")[1]), undefined);
  assert.equal(readWatts(undefined), undefined);
});

test("invert flips the sign of a flow, never producing negative zero", () => {
  const s = states(sensor("sensor.p", "1.5", "kW"), sensor("sensor.z", "0", "W"));
  assert.equal(flowWatts({ id: "f", from: "a", to: "b", entity: "sensor.p" }, s), 1500);
  assert.equal(flowWatts({ id: "f", from: "a", to: "b", entity: "sensor.p", invert: true }, s), -1500);
  assert.ok(Object.is(flowWatts({ id: "f", from: "a", to: "b", entity: "sensor.z", invert: true }, s), 0));
  assert.equal(flowWatts({ id: "f", from: "a", to: "b" }, s), undefined);
});

test("smoothing approaches the reading without overshooting and snaps when close", () => {
  let v = 0;
  for (let i = 0; i < 10; i++) {
    const next = smoothTo(v, 1000, 0.1);
    assert.ok(next > v && next < 1000);
    v = next;
  }
  assert.equal(smoothTo(999.7, 1000, 0.016), 1000);
  assert.equal(smoothTo(5, 500, 0), 5, "no time, no change");
});

test("particle speed and density grow with power on a log scale and idle lines stand still", () => {
  assert.equal(pulseOf(0).speed, 0);
  assert.equal(pulseOf(undefined).speed, 0);
  const [low, mid, high] = [pulseOf(50), pulseOf(500), pulseOf(5000)];
  assert.ok(low.speed > 0 && low.speed < mid.speed && mid.speed < high.speed);
  assert.ok(low.spacing > mid.spacing && mid.spacing > high.spacing);
  assert.ok(high.speed < 2 && low.speed > 0.3, "both ends stay readable");
  assert.ok(intensity(5000) < 1 && intensity(50) > 0.1);
  assert.equal(pulseOf(-800).speed, pulseOf(800).speed, "direction does not change the speed");
});

test("power is formatted as W below a kilowatt and kW above", () => {
  assert.deepEqual([formatPower(350), formatPower(-2400), formatPower(12400), formatPower(4), formatPower(undefined)], ["350 W", "2.4 kW", "12 kW", "0 W", "n/a"]);
});

test("roles are recognised from kind ids and labels", () => {
  const roles = ["solar_panel", "pv_array", "solar_inverter", "home_battery", "grid_meter", "house_board", "ev_wallbox", "ev_car", "sofa"].map(roleOf);
  assert.deepEqual(roles, ["solar", "solar", "inverter", "battery", "meter", "board", "charger", "car", null]);
});

test("colours follow where the power goes, and one-way sensors reading negative are flipped on connect", () => {
  assert.equal(toneOf("solar", "inverter"), "generation");
  assert.equal(toneOf("meter", "board"), "import");
  assert.equal(toneOf("board", "meter"), "export");
  assert.equal(toneOf("board", "charger"), "consumption");
  assert.equal(autoInvert("solar", "inverter", -900), true);
  assert.equal(autoInvert("board", "charger", -7000), true);
  assert.equal(autoInvert("meter", "board", -900), false, "a grid meter is two-way");
  assert.equal(autoInvert("solar", "inverter", 900), false);
  assert.equal(autoInvert("solar", "inverter", undefined), false);
});

const L0 = { id: "L0", name: "Ground", elevation: 0, height: 2.78 };
const L1 = { id: "L1", name: "Up", elevation: 2.78, height: 2.78 };
const wall = (x1: number, y1: number, x2: number, y2: number) => ({ id: `w${x1}${y1}`, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster" as const });

test("a clear room gives a smooth arc that starts and ends at the items", () => {
  const a = item("a", "k", 1, 1);
  const b = item("b", "k", 6, 1);
  const pts = routeFlow(plan([a, b]), a, b);
  assert.ok(pts.length > 6, "an arc is sampled");
  assert.ok(Math.abs(pts[0][0] - 1.5) < 0.1 && Math.abs(pts[pts.length - 1][0] - 5.5) < 0.1, "trimmed to the edges of the items");
  assert.ok(Math.max(...pts.map((p) => p[1])) > pts[0][1], "the arc rises");
});

test("a wall in the way sends the line around it when that crosses fewer walls", () => {
  const a = item("a", "k", 2, 2);
  const b = item("b", "k", 8, 7);
  const p = plan([a, b], { walls: [wall(5, 0, 5, 6)] });
  assert.equal(wallCrossings(p.walls, [2, 2], [8, 7]), 1);
  const pts = routeFlow(p, a, b);
  for (let i = 1; i < pts.length; i++) assert.equal(wallCrossings(p.walls, [pts[i - 1][0], pts[i - 1][2]], [pts[i][0], pts[i][2]]), 0);
});

test("items on different levels are joined vertically through the floor", () => {
  const a = item("a", "k", 3, 3, { level: "L0" });
  const b = item("b", "k", 3.4, 3.2, { level: "L1" });
  const pts = routeFlow(plan([a, b], { levels: [L0, L1] }), a, b);
  const ys = pts.map((p) => p[1]);
  assert.ok(ys[ys.length - 1] > ys[0] + 1.5, "from the ground item up to the upper one");
  assert.ok(ys.every((y, i) => i === 0 || y >= ys[i - 1] - 1e-9), "never dips");
});

test("a path can be walked by distance", () => {
  const p = makePath([[0, 0, 0], [4, 0, 0], [4, 0, 3]]);
  assert.equal(p.len, 7);
  assert.deepEqual(pointAt(p, 2), [2, 0, 0]);
  const tan: [number, number, number] = [0, 0, 0];
  assert.deepEqual(pointAt(p, 5.5, undefined, tan), [4, 0, 1.5]);
  assert.deepEqual(tan, [0, 0, 1]);
  assert.deepEqual(pointAt(p, 99), [4, 0, 3], "clamped to the end");
});

const system = () =>
  plan([
    item("pv", "solar_panel", 1, 1), item("inv", "solar_inverter", 3, 1), item("bat", "home_battery", 4, 1), item("brd", "house_board", 5, 2),
    item("wb", "ev_wallbox", 8, 2), item("car", "ev_car", 9, 3), item("mtr", "grid_meter", 6, 4), item("sofa", "sofa", 2, 5),
  ]);

test("auto-connect proposes the standard wiring once", () => {
  const p = system();
  const edges = proposeFlows(p).map((e) => `${e.fromRole}>${e.toRole}`).sort();
  assert.deepEqual(edges, ["board>charger", "charger>car", "inverter>battery", "inverter>board", "meter>board", "solar>inverter"]);
  const first = proposeFlows(p)[0];
  assert.equal(proposeFlows({ ...p, flows: [{ id: "f", from: first.to, to: first.from }] }).length, 5, "an existing link (either way) is not proposed again");
  assert.deepEqual(proposeFlows(plan([item("s", "sofa", 0, 0)])), []);
});

test("without a house board the inverter is the hub", () => {
  const p = plan([item("inv", "solar_inverter", 0, 0), item("wb", "ev_wallbox", 5, 0), item("mtr", "grid_meter", 0, 5)]);
  assert.deepEqual(proposeFlows(p).map((e) => `${e.fromRole}>${e.toRole}`).sort(), ["inverter>charger", "meter>inverter"]);
});

test("sensors are guessed from their names, each used once", () => {
  const s = states(
    sensor("sensor.solar_power", "1000", "W", { friendly_name: "Solar production" }),
    sensor("sensor.battery_power", "200", "W", { device_class: "power" }),
    sensor("sensor.grid_power", "-300", "W"),
    sensor("sensor.solar_energy", "12", "kWh"),
    sensor("sensor.kitchen_temp", "20", "°C"),
  );
  const edges = proposeFlows(system(), s);
  const by = Object.fromEntries(edges.map((e) => [`${e.fromRole}>${e.toRole}`, e.entity]));
  assert.equal(by["solar>inverter"], "sensor.solar_power");
  assert.equal(by["inverter>battery"], "sensor.battery_power");
  assert.equal(by["meter>board"], "sensor.grid_power");
  assert.equal(by["charger>car"], undefined);
  assert.equal(guessPowerEntity(s, ["solar"], new Set(["sensor.solar_power"])), undefined, "energy sensors and taken ones are skipped");
});

test("the battery charge sensor is the one named soc, not any battery percentage", () => {
  const s = states(
    sensor("sensor.door_battery", "80", "%", { device_class: "battery" }),
    sensor("sensor.home_battery_soc", "64", "%"),
    sensor("sensor.storage_battery_level", "50", "%"),
  );
  assert.equal(guessSocEntity(s), "sensor.home_battery_soc");
  assert.equal(guessSocEntity(states(sensor("sensor.door_battery", "80", "%"))), undefined);
});

test("flow edits add, patch and remove, and an item's flows go with it", () => {
  const p = system();
  const { plan: a, id } = addFlowTo(p, { from: "pv", to: "inv", entity: "sensor.x" }, () => "f1");
  assert.equal(id, "f1");
  assert.equal(addFlowTo(p, { from: "pv", to: "pv" }).id, null, "no self loop");
  assert.equal(addFlowTo(p, { from: "pv", to: "ghost" }).id, null);
  assert.equal(patchFlowIn(a, "f1", { invert: true }).flows![0].invert, true);
  assert.equal(patchFlowIn(a, "nope", { invert: true }), a);
  assert.equal(removeFlowFrom(a, "f1").flows!.length, 0);
  const gone = dropOrphanFlows({ ...a, items: a.items.filter((i) => i.id !== "inv") });
  assert.equal(gone.flows!.length, 0);
  assert.equal(dropOrphanFlows(a), a, "unchanged when nothing is orphaned");
});

const live = () => {
  const p = { ...system(), items: system().items.map((i) => (i.id === "bat" ? { ...i, params: { soc: "sensor.soc" } } : i)) };
  const flows = [
    { id: "1", from: "pv", to: "inv", entity: "sensor.pv" },
    { id: "2", from: "inv", to: "bat", entity: "sensor.bat" },
    { id: "3", from: "inv", to: "brd", entity: "sensor.house" },
    { id: "4", from: "brd", to: "wb", entity: "sensor.ev" },
    { id: "5", from: "mtr", to: "brd", entity: "sensor.grid" },
  ];
  return { ...p, flows };
};

test("the summary balances: solar + grid + battery = home + car + charging + export", () => {
  const s = summarize(live(), states(sensor("sensor.pv", "4", "kW"), sensor("sensor.bat", "1000", "W"), sensor("sensor.house", "3", "kW"), sensor("sensor.ev", "0", "W"), sensor("sensor.grid", "-500", "W"), sensor("sensor.soc", "64", "%")));
  assert.equal(s.live, true);
  assert.equal(s.productionW, 4000);
  assert.equal(s.exportW, 500);
  assert.equal(s.importW, 0);
  assert.equal(s.batteryW, 1000);
  assert.equal(s.homeW, 2500);
  assert.equal(s.soc, 64);
  assert.ok(Math.abs(s.selfPct! - 87.5) < 1e-9);
});

test("a battery discharging and the grid importing feed the home and the car", () => {
  const s = summarize(live(), states(sensor("sensor.pv", "0", "W"), sensor("sensor.bat", "-2", "kW"), sensor("sensor.house", "2", "kW"), sensor("sensor.ev", "7.4", "kW"), sensor("sensor.grid", "6", "kW")));
  assert.equal(s.batteryW, -2000);
  assert.equal(s.importW, 6000);
  assert.equal(s.evW, 7400);
  assert.equal(s.selfPct, undefined);
  assert.equal(s.homeW, 600);
});

test("no readings: the summary is not live", () => {
  assert.equal(summarize(live(), {}).live, false);
  assert.deepEqual(sankeyOf(summarize(live(), {})), { sources: [], sinks: [], links: [], total: 0 });
});

test("the Sankey conserves power: both sides and every link add up", () => {
  const s = summarize(live(), states(sensor("sensor.pv", "4", "kW"), sensor("sensor.bat", "1000", "W"), sensor("sensor.house", "3", "kW"), sensor("sensor.ev", "1500", "W"), sensor("sensor.grid", "-500", "W")));
  const k = sankeyOf(s);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum(k.sources.map((n) => n.w)) - k.total) < 1e-6);
  assert.ok(Math.abs(sum(k.sinks.map((n) => n.w)) - k.total) < 1e-6);
  for (const n of k.sources) assert.ok(Math.abs(sum(k.links.filter((l) => l.from === n.id).map((l) => l.w)) - n.w) < 1e-6);
  for (const n of k.sinks) assert.ok(Math.abs(sum(k.links.filter((l) => l.to === n.id).map((l) => l.w)) - n.w) < 1e-6);
  assert.deepEqual(k.sinks.map((n) => n.id).sort(), ["charge", "ev", "export", "home"]);
});

test("removing a level removes the flows of the items on it", () => {
  const p = plan([item("a", "k", 1, 1, { level: "L0" }), item("b", "k", 2, 2, { level: "L1" }), item("c", "k", 3, 3, { level: "L0" })], { levels: [L0, L1], flows: [{ id: "f1", from: "a", to: "b" }, { id: "f2", from: "a", to: "c" }] });
  assert.deepEqual(removeLevelFrom(p, "L1").flows!.map((f) => f.id), ["f2"]);
});
