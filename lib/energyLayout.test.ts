import test from "node:test";
import assert from "node:assert/strict";
import { arcPoints, energyLayout, evCar } from "./energyLayout.ts";
import { carSoc, carSocEntity } from "./energyCar.ts";
import { fillSources, parseEnergyPrefs } from "./energyPrefs.ts";
import type { EStates } from "./energy.ts";
import type { States } from "./flows.ts";
import type { Item, Plan, Room } from "./types.ts";

const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({ id, name: id, x, y, w, h, color: "#fff", floor: "wood", ...extra });
const item = (id: string, kind: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({ id, kind, x, y, rot: 0, w: 1, d: 1, h: 1, ...extra });
const plan = (rooms: Room[], items: Item[] = [], extra: Partial<Plan> = {}): Plan => ({ walls: [], openings: [], rooms, items, ...extra });

test("layout puts the hub in the middle, sources outside on four sides, one anchor per top-level room", () => {
  const l = energyLayout(plan([room("a", 0, 0, 6, 4), room("alcove", 6, 0, 2, 2, { parent: "a" }), room("b", 0, 4, 8, 4)]));
  assert.ok(l);
  assert.deepEqual([l.hub[0], l.hub[2]], [4, 4]);
  assert.deepEqual(l.rooms.map((r) => r.id), ["a", "b"]);
  assert.ok(l.sources.solar && l.sources.solar[2] < 0, "solar north of the building (plan up)");
  assert.ok(l.sources.grid && l.sources.grid[2] > 8, "grid south");
  assert.ok(l.sources.battery && l.sources.battery[0] > 8, "battery east");
  assert.ok(l.sources.ev && l.sources.ev[0] < 0, "charger west");
  assert.equal(energyLayout(plan([])), null);
});

test("layout follows the compass bearing: north is where it really is on the plan", () => {
  const l = energyLayout(plan([room("a", 0, 0, 10, 10)], [], { bearing: 90 })); // plan up points east, so north is plan left
  assert.ok(l?.sources.solar && l.sources.solar[0] < 0 && Math.abs(l.sources.solar[2] - 5) < 1e-9);
});

test("the charger goes to the linked car when there is one", () => {
  const p = plan([room("a", 0, 0, 10, 10)], [item("c1", "car_generic_hatchback", 12, 3), item("c2", "car_other", 2, 2, { entity: "device_tracker.tesla" })]);
  assert.equal(evCar(p)?.id, "c2");
  const l = energyLayout(p);
  assert.deepEqual([l?.sources.ev?.[0], l?.sources.ev?.[2]], [2, 2]);
  assert.equal(evCar(plan([room("a", 0, 0, 1, 1)], [item("t", "table", 0, 0, { entity: "light.x" })])), undefined);
});

test("an arc starts and ends on its points and bulges up", () => {
  const pts = arcPoints([0, 1, 0], [4, 1, 0], 8);
  assert.equal(pts.length, 9);
  assert.deepEqual(pts[0], [0, 1, 0]);
  assert.deepEqual(pts[8], [4, 1, 0]);
  assert.ok(pts[4][1] > 1);
});

const sensor = (state: string, unit: string, extra: Record<string, string> = {}) => ({ state, attributes: { unit_of_measurement: unit, ...extra } });

test("a car's battery sensor is the percent battery sensor that shares its tracker's name", () => {
  const states: EStates = {
    "device_tracker.my_tesla_location": { state: "home" },
    "sensor.my_tesla_battery_level": sensor("63", "%", { device_class: "battery" }),
    "sensor.my_tesla_battery_range": sensor("250", "km", { device_class: "distance" }),
    "sensor.other_car_battery_level": sensor("11", "%", { device_class: "battery" }),
  };
  assert.equal(carSocEntity("device_tracker.my_tesla_location", states), "sensor.my_tesla_battery_level");
  assert.equal(carSocEntity("device_tracker.zoe", states), undefined);
  assert.equal(carSocEntity("device_tracker.me", states), undefined, "a very short name would match anything");
});

test("the car's charge: the picked sensor first, then the tracker's attribute, then the matching sensor", () => {
  const states: EStates = {
    "device_tracker.my_ev": { state: "home", attributes: { battery_level: 55 } },
    "sensor.picked": sensor("80", "%"),
    "sensor.my_ev_battery": sensor("40", "%", { device_class: "battery" }),
  };
  assert.equal(carSoc({ currency: "EUR", carSoc: "sensor.picked" }, "device_tracker.my_ev", states), 80);
  assert.equal(carSoc({ currency: "EUR" }, "device_tracker.my_ev", states), 55);
  assert.equal(carSoc({ currency: "EUR", carSoc: "sensor.gone" }, "device_tracker.my_ev", { ...states, "device_tracker.my_ev": { state: "home" } }), 40);
  assert.equal(carSoc({ currency: "EUR" }, "device_tracker.zzz", {}), undefined);
});

test("the Energy dashboard setup is read defensively", () => {
  const g = parseEnergyPrefs({
    energy_sources: [
      { type: "solar", stat_energy_from: "sensor.pv_total" },
      { type: "solar", stat_energy_from: "sensor.second_pv" },
      { type: "grid", flow_from: [{ stat_energy_from: "sensor.grid_in", entity_energy_price: null, number_energy_price: 0.27 }], flow_to: [{ stat_energy_to: "sensor.grid_out" }], power: [{ stat_rate: "sensor.grid_w" }] },
      { type: "battery", stat_energy_from: "sensor.b_out", stat_energy_to: "sensor.b_in", power_config: { stat_rate_inverted: "sensor.b_w" } },
      { type: "gas", stat_energy_from: "sensor.gas" },
    ],
  });
  assert.deepEqual(g, { solarKwh: "sensor.pv_total", importKwh: "sensor.grid_in", fixedPrice: 0.27, exportKwh: "sensor.grid_out", grid: "sensor.grid_w", battery: "sensor.b_w", batteryInvert: true });
  assert.deepEqual(parseEnergyPrefs({ energy_sources: [{ type: "grid", flow_from: [{ entity_energy_price: "sensor.price", number_energy_price: 0.5 }] }] }), { price: "sensor.price" });
  for (const junk of [null, 5, "x", [], {}, { energy_sources: "no" }, { energy_sources: [null, 3, { type: "grid", flow_from: "x" }] }]) assert.deepEqual(parseEnergyPrefs(junk), {});
  assert.deepEqual(parseEnergyPrefs({ energy_sources: [{ type: "solar", stat_energy_from: "not valid" }] }), {});
});

const live = (id: string, state: string, unit: string, extra: Record<string, string> = {}) => [id, { entity_id: id, state, attributes: { unit_of_measurement: unit, ...extra } }] as const;
const states = Object.fromEntries([
  live("sensor.solar_power", "1200", "W"),
  live("sensor.grid_power", "300", "W"),
  live("sensor.home_battery_power", "-100", "W"),
  live("sensor.wallbox_power", "0", "W"),
  live("sensor.home_battery_soc", "55", "%"),
  live("sensor.tariff_price", "0.3", "EUR/kWh"),
  live("sensor.pv_total", "1000", "kWh"),
]) as States;

test("filling the gaps prefers Home Assistant's setup, then names, and never overwrites the user", () => {
  const r = fillSources({ currency: "EUR", solar: "sensor.mine" }, { grid: "sensor.grid_power", solarKwh: "sensor.pv_total", fixedPrice: 0.2 }, { ...states, "sensor.mine": states["sensor.solar_power"] });
  assert.equal(r.next.solar, "sensor.mine", "kept");
  assert.equal(r.next.grid, "sensor.grid_power");
  assert.equal(r.next.solarKwh, "sensor.pv_total");
  assert.equal(r.next.battery, "sensor.home_battery_power");
  assert.equal(r.next.ev, "sensor.wallbox_power");
  assert.equal(r.next.batterySoc, "sensor.home_battery_soc");
  assert.equal(r.next.price, undefined, "Home Assistant's fixed price is used instead of a price sensor guess");
  assert.equal(r.next.fixedPrice, 0.2);
  assert.equal(r.fromHa, 3, "grid, kWh counter, fixed price");
  assert.ok(r.byName >= 3);
});

test("a price sensor is found by name when no price is set", () => {
  assert.equal(fillSources({ currency: "EUR" }, null, states).next.price, "sensor.tariff_price");
});

test("filling the gaps skips sensors that do not exist and uses no sensor twice", () => {
  const r = fillSources({ currency: "EUR" }, { grid: "sensor.vanished" }, states);
  assert.notEqual(r.next.grid, "sensor.vanished");
  const used = Object.values(r.next).filter((v) => typeof v === "string" && v.startsWith("sensor."));
  assert.equal(new Set(used).size, used.length);
  const none = fillSources({ currency: "EUR" }, null, {});
  assert.deepEqual(none.next, { currency: "EUR" });
});

test("a fixed price the user set blocks a price sensor guess", () => {
  assert.equal(fillSources({ currency: "EUR", fixedPrice: 0.5 }, null, states).next.price, undefined);
});
