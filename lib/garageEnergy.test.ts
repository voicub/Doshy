import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, CATEGORIES } from "./catalog.ts";
import { ENERGY, BATTERY_BARS } from "./catalog.energy.ts";
import { GARAGE } from "./catalog.garage.ts";
import { OUTDOOR } from "./catalog.outdoor.ts";
import { FLOOR_T, bounds } from "./partKit.ts";

const TOL = 0.05;
const AREAS = [
  ["Garage & EV", GARAGE],
  ["Energy", ENERGY],
  ["Outdoor", OUTDOOR],
] as const;

test("every garage, energy and outdoor kind is registered, unique and in its category", () => {
  const seen = new Set<string>();
  for (const [cat, area] of AREAS) {
    assert.ok(Object.keys(area).length > 0, `${cat} has kinds`);
    for (const [k, d] of Object.entries(area)) {
      assert.ok(!seen.has(k), `duplicate id ${k}`);
      seen.add(k);
      assert.equal(CATALOG[k], d, `${k} is overwritten by another area`);
      assert.equal(d.cat, cat, `${k} category`);
      assert.ok(CATEGORIES.includes(d.cat));
    }
  }
});

test("every def has a footprint and all parts sit inside it, on the floor and below its height", () => {
  const bad: string[] = [];
  for (const [, area] of AREAS) {
    for (const [k, d] of Object.entries(area)) {
      if (!(d.w > 0 && d.d > 0 && d.h > 0) || d.parts.length === 0) bad.push(`${k} has no size or no parts`);
      const o = bounds(d.parts);
      if (-o.x0 > d.w / 2 + TOL || o.x1 > d.w / 2 + TOL) bad.push(`${k} x ${o.x0.toFixed(2)}..${o.x1.toFixed(2)} vs w ${d.w}`);
      if (-o.z0 > d.d / 2 + TOL || o.z1 > d.d / 2 + TOL) bad.push(`${k} z ${o.z0.toFixed(2)}..${o.z1.toFixed(2)} vs d ${d.d}`);
      if (o.y0 < -0.01) bad.push(`${k} sinks below the floor (${o.y0.toFixed(3)})`);
      if (o.y1 > d.h + TOL) bad.push(`${k} top ${o.y1.toFixed(2)} above h ${d.h}`);
      if (d.parts.some((p) => !p.s.every((v) => v > 0))) bad.push(`${k} has a flat part`);
      if (o.y1 < FLOOR_T + 0.015) bad.push(`${k} is buried in the floor slab (top ${o.y1.toFixed(3)})`);
    }
  }
  assert.deepEqual(bad, []);
});

test("outdoor ids never contain the words the live power lines react to", () => {
  for (const k of Object.keys(OUTDOOR)) assert.ok(!/car|ev_|pv|solar|grid|meter|board|fuse|breaker|battery|charger|wallbox|inverter|powerwall|distribution/i.test(k), k);
});

test("energy kinds are findable by role word", () => {
  const has = (re: RegExp) => Object.keys(ENERGY).some((k) => re.test(k));
  for (const re of [/solar/, /inverter/, /battery/, /meter/, /grid/, /board/, /generator/]) assert.ok(has(re), String(re));
});

test("batteries end with five level LEDs, lowest first, and nothing else glows", () => {
  const kinds = Object.keys(BATTERY_BARS);
  assert.ok(kinds.length >= 2);
  for (const k of kinds) {
    const parts = ENERGY[k].parts;
    const idx = BATTERY_BARS[k];
    assert.equal(idx.length, 5, k);
    assert.deepEqual(idx, [parts.length - 5, parts.length - 4, parts.length - 3, parts.length - 2, parts.length - 1]);
    for (let i = 1; i < 5; i++) assert.ok(parts[idx[i]].p[1] > parts[idx[i - 1]].p[1], `${k} bars rise`);
  }
});

test("chargers glow while charging and a charging cable ends at the car side", () => {
  for (const k of ["ev_wallbox", "ev_charger_pedestal", "ev_charger_portable"]) assert.ok(GARAGE[k].parts.some((p) => p.glow), k);
  for (const k of Object.keys(GARAGE).filter((k) => k.startsWith("gar_charging_cable"))) {
    const d = GARAGE[k];
    assert.ok(d.h <= FLOOR_T + 0.05, "lies on the floor");
    const lit = d.parts.find((p) => p.glow)!;
    assert.ok(lit.p[2] > 0, "the connector with the light is at +z, where the car is");
  }
});

test("a wall-mounted battery hangs above the floor and a floor battery stands on it", () => {
  const wall = bounds(ENERGY.energy_battery_wall.parts), floor = bounds(ENERGY.energy_battery_tower.parts);
  assert.ok(wall.y0 > 0.2 && ENERGY.energy_battery_wall.wall);
  assert.ok(floor.y0 < 0.01 && !ENERGY.energy_battery_tower.wall);
});

test("a tilted roof panel follows a 30 degree roof", () => {
  const o = bounds(ENERGY.solar_roof_30.parts);
  const run = o.z1 - o.z0, rise = o.y1 - o.y0;
  assert.ok(Math.abs(Math.atan2(rise, run) - Math.PI / 6) < 0.12, `slope ${((Math.atan2(rise, run) * 180) / Math.PI).toFixed(1)} deg`);
});
