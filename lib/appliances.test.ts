import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG, CATEGORIES } from "./catalog.ts";
import { APPLIANCES } from "./catalog.appliances.ts";

const TOL = 0.006;
const entries = Object.entries(APPLIANCES);

/** Half extents of a part's axis-aligned bounds, after its Euler (XYZ) rotation. */
function half(p: { s: [number, number, number]; r?: [number, number, number] }): [number, number, number] {
  const [rx, ry, rz] = p.r ?? [0, 0, 0];
  const [a, b, c] = [Math.cos(rx), Math.cos(ry), Math.cos(rz)];
  const [d, e, f] = [Math.sin(rx), Math.sin(ry), Math.sin(rz)];
  // R = Rx * Ry * Rz (three.js default order)
  const R = [
    [b * c, -b * f, e],
    [a * f + d * e * c, a * c - d * e * f, -d * b],
    [d * f - a * e * c, d * c + a * e * f, a * b],
  ];
  return [0, 1, 2].map((i) => R[i].reduce((sum, v, j) => sum + Math.abs(v) * (p.s[j] / 2), 0)) as [number, number, number];
}

test("there is a big appliance set, merged into the catalog without clashes", () => {
  assert.ok(entries.length >= 60, `${entries.length} kinds`);
  for (const [k, d] of entries) {
    assert.ok(k.startsWith("ap_"), k);
    assert.equal(CATALOG[k], d, `${k} is shadowed by another catalog`);
  }
});

test("every appliance has a valid category, real size and parts inside its footprint", () => {
  const bad: string[] = [];
  for (const [k, d] of entries) {
    assert.ok(d.cat === "Appliances" || d.cat === "Climate", `${k} category ${d.cat}`);
    assert.ok(CATEGORIES.includes(d.cat), k);
    assert.ok(d.w > 0 && d.d > 0 && d.h > 0 && d.label.length > 0 && d.parts.length >= 3, k);
    for (const p of d.parts) {
      const [hx, hy, hz] = half(p);
      const out = Math.abs(p.p[0]) + hx - d.w / 2 > TOL || Math.abs(p.p[2]) + hz - d.d / 2 > TOL || p.p[1] + hy - d.h > TOL || p.p[1] - hy < -TOL;
      if (out) bad.push(`${k} part ${JSON.stringify(p.p)} size ${JSON.stringify(p.s)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("anything with a screen, lamp or display lights up, and motors turn", () => {
  const dead = entries.filter(([, d]) => !d.parts.some((p) => p.glow || p.spin)).map(([k]) => k);
  // passive pieces: nothing electrical to show
  const passive = ["ap_ironing_board", "ap_drying_rack", "ap_radiator_panel", "ap_radiator_towel", "ap_stick_vacuum_wall"];
  assert.deepEqual(dead.filter((k) => !passive.includes(k)), []);
  for (const [k, d] of entries) for (const p of d.parts) if (p.spin) assert.ok(p.spin.rpm > 0 && (p.spin.swing === undefined || p.spin.swing > 0), k);
  for (const k of ["ap_washer_front", "ap_dryer", "ap_washer_dryer_tower", "ap_ceiling_fan", "ap_ac_outdoor", "ap_heat_pump_outdoor", "ap_stand_mixer"]) {
    assert.ok(APPLIANCES[k].parts.some((p) => p.spin), `${k} has a spinning part`);
  }
  assert.ok(APPLIANCES.ap_ac_split_indoor.parts.some((p) => p.spin?.swing), "the wall air conditioner has a swinging flap");
});

test("ceiling and wall pieces follow the placement conventions", () => {
  for (const [k, d] of entries) {
    if (k.includes("ceiling")) assert.equal(d.h, 2.6, k);
    if (d.wall) assert.ok(Math.min(...d.parts.map((p) => p.p[1] - half(p)[1])) >= -TOL && d.h >= 0.9, k);
  }
  for (const k of ["ap_ac_split_indoor", "ap_hood_chimney", "ap_boiler_combi", "ap_underfloor_manifold"]) assert.ok(APPLIANCES[k].wall, k);
});

test("TVs have real 16:9 screens in five sizes, wall and stand versions, and light the room", () => {
  for (const inch of [32, 43, 55, 65, 75]) {
    for (const mount of ["wall", "stand"]) {
      const d = APPLIANCES[`ap_tv_${inch}_${mount}`];
      assert.ok(d, `${inch} ${mount}`);
      assert.ok(d.light, "a TV casts light when playing");
      const screen = d.parts.filter((p) => p.glow).sort((a, b) => b.s[0] * b.s[1] - a.s[0] * a.s[1])[0];
      assert.ok(Math.abs(screen.s[0] / screen.s[1] - 16 / 9) < 0.08, `${inch} ${mount} aspect`);
      const diag = Math.hypot(screen.s[0], screen.s[1]) / 0.0254;
      assert.ok(Math.abs(diag - inch) < inch * 0.08, `${inch} ${mount} diagonal ${diag.toFixed(1)}`);
      assert.equal(!!d.wall, mount === "wall");
    }
  }
});
