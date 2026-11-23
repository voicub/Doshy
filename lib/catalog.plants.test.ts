import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, KINDS } from "./catalog.ts";
import { PLANTS_V2 } from "./catalog.plants.ts";
import { searchKinds } from "./catalogSearch.ts";
import { halfExtent } from "./decor/kit.ts";
import { classify } from "./placement.ts";
import { isSpecies } from "./vegetation.ts";

const TOL = 0.03; // metres a part may stick out of the footprint
const entries = Object.entries(PLANTS_V2);

/** w, d, h of the older plant kinds before the realism pass (exact floats: saved plans keep every piece where it is) */
const OLD_SIZES: Record<string, [number, number, number]> = {
  plant: [0.4, 0.4, 0.93],
  of_wall_plant: [0.3, 0.3, 0.9],
  kt_plant_trailing: [0.2, 0.2, 0.55],
  dc_plant_fiddle_160: [0.7, 0.7, 1.6],
  dc_plant_fiddle_110: [0.48999999999999994, 0.48999999999999994, 1.1],
  dc_plant_monstera_110: [1.09, 1.08, 1.24],
  dc_plant_monstera_150: [1.48, 1.47, 1.69],
  dc_plant_cactus_tall: [0.5, 0.47600000000000003, 1.37],
  dc_plant_cactus_small: [0.28, 0.28, 0.41],
  dc_plant_cactus_barrel: [0.22, 0.22, 0.3],
  dc_ceiling_hanging_plant: [0.5, 0.5, 2.6],
  dc_plant_palm_150: [1.1, 1.02, 1.56],
  dc_plant_palm_200: [1.47, 1.36, 2.07],
  dc_plant_succulents: [0.34, 0.14, 0.14],
  dc_plant_snake_100: [0.30600000000000005, 0.30600000000000005, 1.07],
  dc_plant_snake_60: [0.272, 0.272, 0.64],
  dc_plant_rubber: [0.6, 0.6, 1.31],
  dc_plant_olive: [0.72, 0.7, 1.67],
  dc_plant_orchid: [0.28, 0.18, 0.5],
  dc_plant_pampas: [0.45, 0.45, 1.3],
};

test("there are at least 36 new plant kinds with unique pl_ ids that stay in the shared catalog unchanged", () => {
  assert.ok(entries.length >= 36, `only ${entries.length}`);
  const labels = new Set<string>();
  for (const [id, d] of entries) {
    assert.match(id, /^pl_[a-z0-9_]+$/);
    assert.equal(CATALOG[id], d, `${id} is overridden by another catalog file`);
    assert.equal(d.cat, "Decor");
    assert.ok(d.label.length > 3 && d.label.length <= 70, `${id} label length`);
    assert.ok(!labels.has(d.label), `${id}: duplicate label`);
    labels.add(d.label);
  }
  assert.deepEqual(KINDS.filter((k) => k.startsWith("pl_") && !(k in PLANTS_V2)), [], "another file uses the pl_ prefix");
});

test("every plant kind has sizes, one tintable houseplant of an existing species, a lathe pot or vase, and every part inside its footprint", () => {
  const bad: string[] = [];
  for (const [id, d] of [...entries, ...Object.keys(OLD_SIZES).map((k) => [k, CATALOG[k]] as const)]) {
    if (!(d.w > 0 && d.d > 0 && d.h > 0)) bad.push(`${id}: size`);
    const veg = d.parts.filter((p) => p.veg);
    if (veg.length !== 1) bad.push(`${id}: ${veg.length} plant parts`);
    for (const p of veg) {
      if (!isSpecies(p.veg!.species)) bad.push(`${id}: unknown species ${p.veg!.species}`);
      if (!p.m) bad.push(`${id}: the plant is not tinted by the finish`);
    }
    if (!id.includes("_wall_") && !d.parts.some((p) => p.shape === "lathe")) bad.push(`${id}: no turned pot or vase`);
    if (d.parts.some((p) => p.shape === "sph" || p.shape === "box" || (!p.shape && !p.veg && id.startsWith("pl_") && p.s[1] > 0.1 && p.s[0] > 0.1 && p.s[2] > 0.1))) bad.push(`${id}: a blocky leaf or trunk is left`);
    d.parts.forEach((p, i) => {
      if (!p.s.every((v) => v > 0 && Number.isFinite(v)) || !p.p.every(Number.isFinite)) return void bad.push(`${id} part ${i}: bad numbers`);
      const [hx, hy, hz] = halfExtent(p);
      if (Math.abs(p.p[0]) + hx > d.w / 2 + TOL) bad.push(`${id} part ${i}: outside width ${d.w}`);
      if (Math.abs(p.p[2]) + hz > d.d / 2 + TOL) bad.push(`${id} part ${i}: outside depth ${d.d}`);
      if (p.p[1] - hy < -TOL || p.p[1] + hy > d.h + TOL) bad.push(`${id} part ${i}: outside height ${d.h} (${(p.p[1] - hy).toFixed(2)}..${(p.p[1] + hy).toFixed(2)})`);
    });
  }
  assert.deepEqual(bad, []);
});

test("the older plant kinds keep their exact size, id and mounting", () => {
  for (const [id, [w, d, h]] of Object.entries(OLD_SIZES)) {
    const k = CATALOG[id];
    assert.ok(k, `${id} was removed`);
    assert.deepEqual([k.w, k.d, k.h], [w, d, h], id);
  }
  assert.ok(CATALOG.of_wall_plant.wall, "the wall plant stays wall-mounted");
  assert.equal(classify(CATALOG.dc_ceiling_hanging_plant, "dc_ceiling_hanging_plant"), "ceiling");
});

test("ceiling and wall plants are placed the way they are used", () => {
  for (const [id, d] of entries) {
    const cls = classify(d, id);
    if (id.includes("ceiling")) assert.ok(cls === "ceiling" && d.h >= 2.5, `${id} must hang from the ceiling`);
    if (id.includes("_wall_")) assert.ok(d.wall && d.d <= 0.12, `${id} is a thin wall piece`);
  }
});

test("search finds the plants by everyday words", () => {
  const find = (q: string) => searchKinds(CATALOG, KINDS, q);
  const all = Object.keys(PLANTS_V2);
  for (const q of ["plant", "houseplant", "green"]) assert.deepEqual(all.filter((k) => !find(q).includes(k)), [], `"${q}" misses plants`);
  const wants: Record<string, string[]> = {
    cactus: ["pl_cactus_columnar_120", "pl_barrel_cactus_22", "pl_prickly_pear_45", "dc_plant_cactus_tall"],
    succulent: ["pl_succulent_trio", "pl_aloe_35", "pl_jade_35"],
    fern: ["pl_boston_fern_stand"],
    palm: ["pl_areca_palm_140", "pl_kentia_palm_180", "dc_plant_palm_150"],
    herb: ["pl_basil_30", "pl_mint_30", "pl_rosemary_40", "pl_lavender_35"],
    bonsai: ["pl_bonsai_35"],
    orchid: ["pl_orchid_55", "dc_plant_orchid"],
    flowers: ["pl_orchid_55"],
    "fake plant": ["pl_artificial_bush_80", "pl_topiary_90", "plant"],
    artificial: ["pl_wall_boxwood_50", "pl_pampas_vase_120"],
    tree: ["pl_olive_160", "pl_fiddle_fig_150"],
    monstera: ["pl_monstera_120", "dc_plant_monstera_110"],
    terrarium: ["pl_terrarium_25"],
    vase: ["pl_eucalyptus_vase_80", "pl_pampas_vase_120"],
  };
  for (const [q, ids] of Object.entries(wants)) assert.deepEqual(ids.filter((k) => !find(q).includes(k)), [], `"${q}" misses`);
});
