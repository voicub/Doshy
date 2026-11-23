import { TILE, type Level, type Mesh, type SpeciesDef } from "./vegBuilder.ts";
import type { Rng, V3 } from "./mathUtil.ts";
import { ball, blades, fronds, petioled, tree, vines } from "./vegPlantFamilies.ts";
import { bush, columnar, nodes, pads, spikes } from "./vegPlantFamilies2.ts";
import { barrel, bonsai, canes, dried, eucalyptus, hangingBasket, orchid, pampas, panel, succulents, terrarium, topiary } from "./vegPlantFamilies3.ts";
import { init, type Ctx } from "./vegPlantKit.ts";
import { PLANT_TILE as P } from "./vegPlantTiles.ts";

/**
 * Houseplant and artificial-plant species (merged into SPECIES in lib/vegetation.ts), all `indoor`: colours are baked into the vertices (KIND.house), no season,
 * no snow, no wind. Each entry only picks parameters for a family in lib/vegPlantFamilies*.ts. The natural `size` is what the geometry is fitted to; the catalog
 * (lib/catalog.plants.ts) stands each species in a pot. Ids start with `hp_` so they never clash with the garden species.
 * `budget` is the triangle ceiling at level 0 (the tests scale it by LEVEL_MULT for levels 1..3).
 */
const make = (fn: (c: Ctx) => void) => (m: Mesh, rng: Rng, q: number, level: Level) => fn({ m, rng, q, level });
const plant = (label: string, size: V3, budget: number, fn: (c: Ctx) => void): SpeciesDef => ({ label, size, indoor: true, budget, build: make(fn) });

export const PLANT_SPECIES = {
  hp_fiddle_fig: plant("Fiddle-leaf fig", [0.9, 1.5, 0.9], 450, (c) => tree(c, { H: 1.5, R: 0.45, trunkR: 0.016, bark: "#7a6650", lean: 0.05, wob: 0.06, leaf: { tile: P.fiddle, tone: "#3f6e36", len: [0.28, 0.4], ratio: 0.78, vary: 0.12, droop: 0.6, twist: 0.35, fresh: 0.5 }, n: 18, from: 0.3, elev: [-0.1, 0.75] })),
  hp_monstera: plant("Monstera", [1.1, 1.1, 1.1], 450, (c) => petioled(c, { n: 11, tile: P.monstera, tone: "#2f6a3a", stem: "#4a7a40", stemR: 0.008, rise: [0.3, 0.75], reach: [0.3, 0.1], len: [0.2, 0.36], ratio: 1.0, elev: [0.0, 0.35], droop: 0.6, vary: 0.1, twist: 0.35 })),
  hp_rubber_plant: plant("Rubber plant", [0.6, 1.3, 0.6], 450, (c) => tree(c, { H: 1.3, R: 0.32, trunkR: 0.015, bark: "#6a5a45", lean: 0.03, wob: 0.05, leaf: { tile: P.ficus, tone: "#33683a", len: [0.22, 0.3], ratio: 0.5, vary: 0.1, droop: 0.35, twist: 0.3, fresh: 0.6 }, n: 24, from: 0.2, elev: [0.05, 0.85] })),
  hp_ficus: plant("Weeping fig", [0.8, 1.6, 0.8], 700, (c) => tree(c, { H: 1.3, R: 0.35, trunkR: 0.02, bark: "#6e5d4a", lean: 0.04, wob: 0.1, leaf: { tile: P.ficus, tone: "#4f8f3f", len: [0.08, 0.11], ratio: 0.55, vary: 0.14, droop: 0.4, twist: 0.4, fresh: 0.7 }, n: 40, from: 0.4, elev: [-0.2, 0.9], branches: { n: 7, at: [0.3, 0.62], len: 0.38, up: 0.8, rad: 0.009 }, crowns: { tile: P.bonsai, tone: "#4f8f3f", r: [0.2, 0.18, 0.2], size: 0.22, n: 90, vary: 0.12 } })),
  hp_snake_tall: plant("Snake plant, tall", [0.35, 0.9, 0.35], 200, (c) => blades(c, { n: 9, tile: P.snake, tone: "#4a7d48", len: [0.5, 0.9], wid: [0.09, 0.12], spread: 0.07, elev: [1.25, 1.5], droop: 0.1, vary: 0.12, tall: 0.4 })),
  hp_snake_short: plant("Snake plant, short", [0.4, 0.42, 0.4], 250, (c) => blades(c, { n: 12, tile: P.snake, tone: "#4a7d48", len: [0.2, 0.42], wid: [0.08, 0.11], spread: 0.1, elev: [0.95, 1.35], droop: 0.3, vary: 0.12, tall: 0.5 })),
  hp_zz_plant: plant("ZZ plant", [0.6, 0.7, 0.6], 450, (c) => fronds(c, { n: 8, tile: P.zz, tone: "#244f2a", len: [0.5, 0.7], wid: 0.2, elev: [1.15, 1.45], arch: 0.6, bare: 0.18, stem: "#3f5a3a", stemR: 0.008, vary: 0.1 })),
  hp_areca_palm: plant("Areca palm", [1.0, 1.4, 1.0], 600, (c) => fronds(c, { n: 14, tile: P.frond, tone: "#4a8a3a", len: [0.75, 1.0], wid: 0.3, elev: [1.1, 1.5], arch: 0.75, bare: 0.22, stem: "#8a9a4a", stemR: 0.007, vary: 0.12 })),
  hp_kentia_palm: plant("Kentia palm", [1.1, 1.8, 1.1], 450, (c) => fronds(c, { n: 8, tile: P.frond, tone: "#3f7a3a", len: [0.9, 1.15], wid: 0.34, elev: [1.15, 1.5], arch: 0.65, bare: 0.4, stem: "#5a7a3a", stemR: 0.007, vary: 0.1, cane: { h: 0.35, r: 0.012, lean: 0.03, hex: "#6a5a3a" } })),
  hp_yucca: plant("Yucca", [0.8, 1.3, 0.8], 500, (c) => canes(c, { canes: 3, h: [0.6, 0.95], r: 0.028, hex: "#8a7050", head: { n: 18, tile: P.yucca, tone: "#3a6a3a", len: [0.28, 0.42], wid: [0.04, 0.055], elev: [0.15, 1.35], droop: 0.25 }, lean: 0.08 })),
  hp_dracaena: plant("Dracaena", [0.6, 1.2, 0.6], 450, (c) => canes(c, { canes: 3, h: [0.5, 0.95], r: 0.016, hex: "#7a6a50", head: { n: 16, tile: P.yucca, tone: "#2f6a38", len: [0.26, 0.38], wid: [0.045, 0.06], elev: [0.1, 1.3], droop: 0.55 }, lean: 0.12 })),
  hp_pothos_shelf: plant("Pothos on a shelf", [0.5, 0.55, 0.5], 900, (c) => {
    petioled(c, { n: 12, tile: P.heart, tone: "#3a7a3a", origin: [0, 0.3, 0], stem: "#6a8a4a", stemR: 0.0025, rise: [0.04, 0.2], reach: [0.12, 0.03], len: [0.08, 0.13], ratio: 1, elev: [0.1, 0.9], droop: 0.4, vary: 0.14, twist: 0.4 });
    vines(c, { n: 7, origin: [0, 0.3, 0], spread: 0.1, reach: [0.1, 0.22], drop: [0.2, 0.3], arc: 0.04, vine: { tile: P.vine, tone: "#3a7a3a", w: 0.14 }, leaf: { tile: P.heart, tone: "#3f8040", len: [0.07, 0.11], n: 22, vary: 0.14 }, stem: "#5a7a3a" });
  }),
  hp_pothos_trailing: plant("Trailing pothos", [0.3, 0.5, 0.3], 750, (c) => {
    petioled(c, { n: 6, tile: P.heart, tone: "#3a7a3a", origin: [0, 0.42, 0], stem: "#6a8a4a", stemR: 0.0025, rise: [0.02, 0.08], reach: [0.07, 0.02], len: [0.07, 0.1], ratio: 1, elev: [0.1, 0.8], droop: 0.4, vary: 0.14, twist: 0.4 });
    vines(c, { n: 8, origin: [0, 0.42, 0], spread: 0.06, reach: [0.04, 0.12], drop: [0.3, 0.42], arc: 0.03, vine: { tile: P.vine, tone: "#3a7a3a", w: 0.12 }, leaf: { tile: P.heart, tone: "#3f8040", len: [0.06, 0.09], n: 26, vary: 0.14 }, stem: "#5a7a3a" });
  }),
  hp_pothos_hanging: plant("Hanging pothos", [0.5, 0.9, 0.5], 1000, (c) => {
    petioled(c, { n: 10, tile: P.heart, tone: "#3a7a3a", origin: [0, 0.62, 0], stem: "#6a8a4a", stemR: 0.0025, rise: [0.03, 0.18], reach: [0.1, 0.03], len: [0.08, 0.12], ratio: 1, elev: [0.1, 0.9], droop: 0.4, vary: 0.14, twist: 0.4 });
    vines(c, { n: 9, origin: [0, 0.62, 0], spread: 0.1, reach: [0.06, 0.2], drop: [0.35, 0.6], arc: 0.05, vine: { tile: P.vine, tone: "#3a7a3a", w: 0.15 }, leaf: { tile: P.heart, tone: "#3f8040", len: [0.07, 0.11], n: 40, vary: 0.14 }, stem: "#5a7a3a" });
  }),
  hp_philodendron: plant("Heartleaf philodendron", [0.7, 0.7, 0.7], 550, (c) => petioled(c, { n: 16, tile: P.heart, tone: "#2f6a38", stem: "#5a7a40", stemR: 0.004, rise: [0.18, 0.55], reach: [0.26, 0.07], len: [0.1, 0.19], ratio: 1, elev: [0.05, 0.6], droop: 0.45, vary: 0.12, twist: 0.4 })),
  hp_calathea: plant("Calathea", [0.6, 0.6, 0.6], 400, (c) => petioled(c, { n: 11, tile: P.calathea, tone: "#356e3a", stem: "#5a7a40", stemR: 0.004, rise: [0.14, 0.4], reach: [0.14, 0.03], len: [0.2, 0.3], ratio: 0.55, elev: [0.5, 1.15], droop: 0.35, vary: 0.1, twist: 0.35 })),
  hp_aloe: plant("Aloe vera", [0.4, 0.35, 0.4], 300, (c) => blades(c, { n: 14, tile: P.aloe, tone: "#5a8a5a", len: [0.18, 0.34], wid: [0.06, 0.075], spread: 0.02, elev: [0.45, 1.35], droop: 0.25, vary: 0.1, tall: 0.8 })),
  hp_agave: plant("Agave", [0.5, 0.4, 0.5], 300, (c) => blades(c, { n: 18, tile: P.aloe, tone: "#6f9a8a", len: [0.2, 0.38], wid: [0.07, 0.09], spread: 0.015, elev: [0.2, 1.25], droop: 0.2, vary: 0.08, tall: 0.8 })),
  hp_jade: plant("Jade plant", [0.3, 0.35, 0.3], 400, (c) => nodes(c, { stems: 5, h: [0.18, 0.3], lean: 0.4, r: 0.009, stem: "#7a6a4a", nodes: 7, tile: P.fat, tone: "#3d7a44", len: [0.04, 0.06], ratio: 0.62, elev: 0.5, droop: 0.1, vary: 0.1, from: 0.25, woody: 1 })),
  hp_succulents: plant("Succulent trio", [0.3, 0.05, 0.14], 300, (c) => succulents(c)),
  hp_cactus_columnar: plant("Columnar cactus", [0.3, 1.2, 0.3], 900, (c) => columnar(c, { H: 1.2, R: 0.055, arms: 2, ribs: 9, tone: "#4f8346", spines: { tile: P.spines, tone: "#f0e6bc", size: 0.05 } })),
  hp_barrel_cactus: plant("Barrel cactus", [0.22, 0.2, 0.22], 600, (c) => barrel(c, { H: 0.2, R: 0.1, ribs: 14, tone: "#4f8346", spines: { tile: P.spines, tone: "#f4ecc4", size: 0.055 } })),
  hp_prickly_pear: plant("Prickly pear", [0.4, 0.45, 0.35], 200, (c) => pads(c, { tile: P.pad, tone: "#7bab64", size: [0.14, 0.18], n: 9, spread: 0.3 })),
  hp_orchid: plant("Orchid", [0.35, 0.55, 0.18], 300, (c) => orchid(c)),
  hp_bonsai: plant("Bonsai", [0.4, 0.35, 0.35], 400, (c) => bonsai(c)),
  hp_boston_fern: plant("Boston fern", [0.7, 0.55, 0.7], 450, (c) => fronds(c, { n: 18, tile: P.fern, tone: "#3f8a3a", len: [0.35, 0.5], wid: 0.2, elev: [0.7, 1.3], arch: 0.7, bare: 0, stem: "#5a7a3a", stemR: 0.003, vary: 0.12 })),
  hp_olive: plant("Olive tree", [0.8, 1.6, 0.8], 700, (c) => tree(c, { H: 1.3, R: 0.35, trunkR: 0.03, bark: "#6a5a4a", lean: 0.05, wob: 0.12, leaf: { tile: P.ficus, tone: "#7d9070", len: [0.05, 0.075], ratio: 0.22, vary: 0.1, droop: 0.3, twist: 0.5, fresh: 0.4 }, n: 60, from: 0.4, elev: [0.0, 1.0], branches: { n: 7, at: [0.35, 0.7], len: 0.4, up: 0.75, rad: 0.012 }, crowns: { tile: TILE.narrow, tone: "#8fa07c", r: [0.22, 0.18, 0.22], size: 0.26, n: 90, vary: 0.1 } })),
  hp_lavender: plant("Lavender", [0.35, 0.35, 0.35], 600, (c) => {
    bush(c, { n: 26, tile: P.rosemary, tone: "#7f9a78", w: 0.06, h: [0.1, 0.2], lean: [0.3, 0.9], spread: 0.12, woody: "#6a5a3a", woodyR: 0.004, vary: 0.1 });
    spikes(c, { n: 14, tile: P.lavender, tone: "#8a68c0", w: 0.04, len: 0.14, h: [0.14, 0.2], spread: 0.13, stem: "#6a8a5a", stemR: 0.0015, cross: true, vary: 0.1 });
  }),
  hp_rosemary: plant("Rosemary", [0.35, 0.4, 0.35], 350, (c) => bush(c, { n: 40, tile: P.rosemary, tone: "#4a7a4a", w: 0.09, h: [0.18, 0.34], lean: [0.1, 0.6], spread: 0.14, woody: "#6a5a3a", woodyR: 0.004, vary: 0.1 })),
  hp_basil: plant("Basil", [0.28, 0.3, 0.28], 300, (c) => nodes(c, { stems: 4, h: [0.18, 0.28], lean: 0.22, r: 0.003, stem: "#6a8a3a", nodes: 5, tile: P.basil, tone: "#3f8a38", len: [0.04, 0.08], ratio: 0.75, elev: 0.6, droop: 0.3, vary: 0.12, from: 0.2 })),
  hp_mint: plant("Mint", [0.3, 0.3, 0.3], 600, (c) => nodes(c, { stems: 8, h: [0.16, 0.26], lean: 0.35, r: 0.0025, stem: "#6a8a4a", nodes: 4, tile: P.mint, tone: "#3a8a40", len: [0.03, 0.05], ratio: 0.85, elev: 0.5, droop: 0.2, vary: 0.12, from: 0.15 })),
  hp_pampas: plant("Pampas grass", [0.45, 1.0, 0.45], 300, (c) => pampas(c)),
  hp_dried_branches: plant("Dried branches", [0.5, 1.1, 0.5], 500, (c) => dried(c)),
  hp_eucalyptus: plant("Eucalyptus stems", [0.4, 0.8, 0.4], 300, (c) => eucalyptus(c)),
  hp_boxwood_ball: plant("Boxwood ball", [0.35, 0.35, 0.35], 250, (c) => {
    init(c.m, 0.35, 0.18);
    ball(c, { centre: [0, 0.175, 0], radius: 0.175, n: 60, tile: P.boxwood, tone: "#3d7a38", size: 0.1, vary: 0.12 });
  }),
  hp_boxwood_panel: plant("Boxwood panel", [0.5, 0.5, 0.07], 400, (c) => panel(c, { w: 0.5, h: 0.5, depth: 0.045, n: 110, tile: P.boxwood, tone: "#3d7a38", back: "#1f3a20", size: 0.1, vary: 0.14 })),
  hp_ivy_wall: plant("Ivy wall panel", [1.0, 0.5, 0.09], 500, (c) => panel(c, { w: 1.0, h: 0.5, depth: 0.05, n: 170, tile: P.fake, tone: "#3a7a3a", back: "#1f3a20", size: 0.1, vary: 0.2 })),
  hp_hanging_basket: plant("Hanging basket", [0.45, 0.55, 0.45], 600, (c) => hangingBasket(c)),
  hp_terrarium: plant("Terrarium plants", [0.22, 0.22, 0.22], 300, (c) => terrarium(c)),
  hp_pilea: plant("Pilea", [0.25, 0.25, 0.25], 450, (c) => petioled(c, { n: 14, tile: P.pilea, tone: "#4f8f3f", stem: "#7a9a5a", stemR: 0.0018, rise: [0.04, 0.14], reach: [0.07, 0.02], len: [0.05, 0.08], ratio: 1, elev: [0.5, 1.1], droop: 0.2, vary: 0.1, twist: 0.3 })),
  hp_spider_plant: plant("Spider plant", [0.5, 0.45, 0.5], 400, (c) => blades(c, { n: 26, tile: P.spider, tone: "#4f8a3f", len: [0.28, 0.42], wid: [0.035, 0.05], spread: 0.03, elev: [0.7, 1.2], droop: 0.9, vary: 0.1, tall: 0 })),
  hp_topiary: plant("Topiary ball on a stem", [0.4, 0.9, 0.4], 300, (c) => topiary(c)),
  hp_lady_palm: plant("Lady palm", [0.7, 1.2, 0.7], 450, (c) => petioled(c, { n: 9, tile: P.fan, tone: "#3a7a3a", stem: "#5a7a3a", stemR: 0.004, rise: [0.5, 0.85], reach: [0.14, 0.04], len: [0.2, 0.28], ratio: 1.1, elev: [0.6, 1.0], droop: 0.5, vary: 0.1, twist: 0.3 })),
  hp_fake_bush: plant("Artificial leafy plant", [0.6, 0.8, 0.6], 600, (c) => petioled(c, { n: 18, tile: P.fake, tone: "#3a7a3a", stem: "#4a6a3a", stemR: 0.004, rise: [0.18, 0.55], reach: [0.12, 0.04], len: [0.16, 0.24], ratio: 0.5, elev: [0.3, 1.1], droop: 0.5, vary: 0.08, twist: 0.3 })),
} satisfies Record<string, SpeciesDef>;

