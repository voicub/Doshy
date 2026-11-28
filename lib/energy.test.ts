import test from "node:test";
import assert from "node:assert/strict";
import { ENERGY_COLORS, batteryState, energyNow, flowLines, formatCost, formatKwh, gridState, hasLiveSources, kwhSince, mixColors, parseSources, priceOf, roomShares, sourceStatus, type Anchors, type EStates, type EnergySources } from "./energy.ts";

const st = (state: string, unit?: string, extra: Record<string, string> = {}) => ({ state, attributes: { unit_of_measurement: unit, ...extra } });
const src = (extra: Partial<EnergySources> = {}): EnergySources => ({ currency: "EUR", ...extra });

test("parseSources keeps only well-formed ids, booleans and a sane price", () => {
  const s = parseSources({ solar: "sensor.pv", grid: "not an id", gridInvert: true, batteryInvert: "yes", fixedPrice: 0.3, currency: "  USD  ", junk: 1 });
  assert.deepEqual(s, { currency: "USD", solar: "sensor.pv", gridInvert: true, fixedPrice: 0.3 });
  assert.deepEqual(parseSources(null), { currency: "EUR" });
  assert.equal(parseSources({ fixedPrice: -1 }).fixedPrice, undefined);
  assert.equal(parseSources({ fixedPrice: 5000 }).fixedPrice, undefined);
  assert.equal(parseSources({ currency: "   " }).currency, "EUR");
  assert.equal(parseSources({ currency: "ABCDEFGHIJKL" }).currency.length, 8);
});

test("only sources that move power count as live", () => {
  assert.equal(hasLiveSources(src({ price: "sensor.p", carSoc: "sensor.c" })), false);
  assert.equal(hasLiveSources(src({ ev: "sensor.wallbox" })), true);
});

test("grid and battery signs follow the Home Assistant convention and invert flips them", () => {
  const states: EStates = { "sensor.g": st("-1.5", "kW"), "sensor.b": st("800", "W") };
  const a = energyNow(src({ grid: "sensor.g", battery: "sensor.b" }), states);
  assert.equal(a.exportW, 1500);
  assert.equal(a.importW, 0);
  assert.equal(a.batteryDischargeW, 800);
  const b = energyNow(src({ grid: "sensor.g", gridInvert: true, battery: "sensor.b", batteryInvert: true }), states);
  assert.equal(b.importW, 1500);
  assert.equal(b.exportW, 0);
  assert.equal(b.batteryChargeW, 800);
});

test("the house figure balances every source and leaves the car out", () => {
  const states: EStates = { "sensor.s": st("3000", "W"), "sensor.g": st("500", "W"), "sensor.b": st("-1000", "W"), "sensor.e": st("1.2", "kW") };
  const n = energyNow(src({ solar: "sensor.s", grid: "sensor.g", battery: "sensor.b", ev: "sensor.e" }), states);
  assert.equal(n.houseW, 3000 + 500 - 1000 - 1200);
  assert.equal(n.evW, 1200);
});

test("the house figure is never negative and is unknown when a picked sensor cannot be read", () => {
  assert.equal(energyNow(src({ grid: "sensor.g", ev: "sensor.e" }), { "sensor.g": st("100", "W"), "sensor.e": st("7000", "W") }).houseW, 0);
  const broken = energyNow(src({ solar: "sensor.s", grid: "sensor.g" }), { "sensor.s": st("unavailable", "W"), "sensor.g": st("400", "W") });
  assert.equal(broken.houseW, undefined);
  assert.equal(broken.available.solar, false);
  assert.equal(energyNow(src({ solar: "sensor.s" }), { "sensor.s": st("900", "W") }).houseW, undefined, "solar alone cannot say what the house uses");
});

test("self-consumption counts everything not exported, so a charging battery counts as used", () => {
  const states: EStates = { "sensor.s": st("4000", "W"), "sensor.g": st("-1000", "W") };
  assert.equal(energyNow(src({ solar: "sensor.s", grid: "sensor.g" }), states).selfConsumptionPct, 75);
  assert.equal(energyNow(src({ solar: "sensor.s", grid: "sensor.g" }), { "sensor.s": st("4000", "W"), "sensor.g": st("0", "W") }).selfConsumptionPct, 100);
  assert.equal(energyNow(src({ solar: "sensor.s", grid: "sensor.g" }), { "sensor.s": st("5", "W"), "sensor.g": st("0", "W") }).selfConsumptionPct, undefined, "idle solar says nothing");
});

test("battery percent is clamped and ignores unusable readings", () => {
  assert.equal(energyNow(src({ batterySoc: "sensor.soc" }), { "sensor.soc": st("104", "%") }).socPct, 100);
  assert.equal(energyNow(src({ batterySoc: "sensor.soc" }), { "sensor.soc": st("unknown", "%") }).socPct, undefined);
});

test("the price comes from the sensor with its currency, else the fixed number", () => {
  assert.deepEqual(priceOf(src({ price: "sensor.p" }), { "sensor.p": st("0.31", "USD/kWh") }), { pricePerKwh: 0.31, currency: "USD" });
  assert.deepEqual(priceOf(src({ price: "sensor.p" }), { "sensor.p": st("250", "EUR/MWh") }), { pricePerKwh: 0.25, currency: "EUR" });
  assert.deepEqual(priceOf(src({ price: "sensor.p", currency: "CHF" }), { "sensor.p": st("28", "ct/kWh") }), { pricePerKwh: 0.28, currency: "CHF" });
  assert.deepEqual(priceOf(src({ price: "sensor.p", fixedPrice: 0.2 }), { "sensor.p": st("unavailable") }), { pricePerKwh: 0.2, currency: "EUR" });
  assert.equal(priceOf(src(), {}).pricePerKwh, undefined);
});

test("cost per hour is the import in kW times the price, zero when exporting, unknown without a price", () => {
  const price = { "sensor.p": st("0.30", "EUR/kWh") };
  assert.equal(energyNow(src({ grid: "sensor.g", price: "sensor.p" }), { ...price, "sensor.g": st("2000", "W") }).costPerHour, 0.6);
  assert.equal(energyNow(src({ grid: "sensor.g", price: "sensor.p" }), { ...price, "sensor.g": st("-2000", "W") }).costPerHour, 0);
  assert.equal(energyNow(src({ grid: "sensor.g" }), { "sensor.g": st("2000", "W") }).costPerHour, undefined);
});

test("room shares are biggest first, with the unattributed rest as other and never above the whole", () => {
  const s = roomShares([{ id: "a", watts: 300 }, { id: "b", watts: 100 }, { id: "c", watts: 0 }], 1000);
  assert.deepEqual(s.map((r) => r.id), ["a", "b", "other"]);
  assert.equal(s[0].share, 0.3);
  assert.equal(s[2].watts, 600);
  const overlap = roomShares([{ id: "a", watts: 900 }, { id: "b", watts: 300 }], 500);
  assert.deepEqual(overlap.map((r) => r.id), ["a", "b"]);
  assert.ok(Math.abs(overlap.reduce((n, r) => n + r.share, 0) - 1) < 1e-9);
  assert.deepEqual(roomShares([], undefined), []);
});

test("mixing colours weights by watts", () => {
  assert.equal(mixColors([["#000000", 1], ["#ffffff", 1]]), "#808080");
  assert.equal(mixColors([["#ff0000", 3], ["#0000ff", 0]]), "#ff0000");
  assert.equal(mixColors([["#ff0000", 0]]), ENERGY_COLORS.ev);
});

const anchors: Anchors = {
  hub: [5, 1, 5],
  sources: { solar: [5, 1, -1], grid: [5, 1, 11], battery: [11, 1, 5], ev: [-1, 1, 5] },
  rooms: [{ id: "kitchen", at: [3, 0, 3] }, { id: "bed", at: [7, 0, 7] }],
};

test("lines: every source with a reading gets one, and its direction follows the power", () => {
  const states: EStates = { "sensor.s": st("2000", "W"), "sensor.g": st("-1200", "W"), "sensor.b": st("-300", "W"), "sensor.e": st("7", "W") };
  const now = energyNow(src({ solar: "sensor.s", grid: "sensor.g", battery: "sensor.b", ev: "sensor.e" }), states);
  const by = Object.fromEntries(flowLines(anchors, now, {}).map((l) => [l.key, l]));
  assert.equal(by.solar.direction, 1);
  assert.equal(by.solar.color, ENERGY_COLORS.solar);
  assert.equal(by.grid.direction, -1, "export runs out of the hub");
  assert.equal(by.grid.color, ENERGY_COLORS.export);
  assert.equal(by.grid.watts, 1200);
  assert.equal(by.battery.direction, -1, "charging runs into the battery");
  assert.equal(by.ev.direction, 0, "7 W is idle");
  assert.deepEqual(by.solar.to, anchors.hub);
});

test("lines: no line for a source without a reading, rooms without a figure are skipped, room lines take the supply colour", () => {
  const now = energyNow(src({ solar: "sensor.s", grid: "sensor.g" }), { "sensor.s": st("unavailable", "W"), "sensor.g": st("1000", "W") });
  const lines = flowLines(anchors, now, { kitchen: 400, bed: undefined });
  assert.deepEqual(lines.map((l) => l.key), ["grid", "room:kitchen"]);
  const room = lines[1];
  assert.equal(room.color, ENERGY_COLORS.import);
  assert.equal(room.direction, 1);
  assert.deepEqual(room.from, anchors.hub);
  assert.deepEqual(room.to, [3, 0, 3]);
});

test("money and kWh words", () => {
  assert.equal(formatCost(0.314, "EUR", "/h"), "0.31 EUR/h");
  assert.equal(formatCost(142.6, "EUR"), "143 EUR");
  assert.equal(formatCost(undefined, "EUR"), "n/a");
  assert.equal(formatKwh(3.456), "3.46 kWh");
  assert.equal(formatKwh(18.64), "18.6 kWh");
  assert.equal(formatKwh(142.4), "142 kWh");
});

test("kWh since midnight sums the rises, survives a counter reset and converts Wh", () => {
  const midnight = 1000;
  const lifetime = { kind: "num" as const, t: [500, 1500, 2500, 3500], v: [100, 100.5, 101.5, 103] };
  assert.equal(kwhSince(lifetime, midnight, "kWh", 103.5), 3.5);
  const daily = { kind: "num" as const, t: [500, 1500, 2500], v: [20, 0.5, 2] };
  assert.equal(kwhSince(daily, midnight, "kWh", 2.5), 2, "the drop across the reset adds nothing");
  assert.ok(Math.abs(kwhSince({ kind: "num", t: [1500], v: [2000] }, midnight, "Wh", 2500) - 0.5) < 1e-9);
});

test("sources are described in words so a still picture shows the direction", () => {
  const n = energyNow(src({ solar: "sensor.s", grid: "sensor.g", battery: "sensor.b", ev: "sensor.e" }), { "sensor.s": st("2000", "W"), "sensor.g": st("-500", "W"), "sensor.b": st("-900", "W"), "sensor.e": st("unavailable", "W") });
  assert.equal(gridState(n), "exporting");
  assert.equal(batteryState(n), "charging");
  assert.equal(sourceStatus("solar", n), "producing");
  assert.equal(sourceStatus("grid", n), "exporting");
  assert.equal(sourceStatus("battery", n), "charging");
  assert.equal(sourceStatus("ev", n), "n/a");
  assert.equal(gridState(energyNow(src({ grid: "sensor.g" }), { "sensor.g": st("4", "W") })), "idle");
});
