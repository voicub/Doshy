import type { Def, Part } from "../catalog.ts";
import { ceilingHang, plantKind, plantOn, type Kind } from "../catalog.plants.ts";
import { CERAMIC, MATT, WOOD, b, cy, turned } from "../partsKit.ts";

/**
 * The older plant kinds (ids dc_plant_*, dc_ceiling_hanging_plant, plus the three in other catalog files: kt_plant_trailing, of_wall_plant, FEJKA plant):
 * a turned pot and one procedural plant (lib/vegPlants.ts) instead of boxes and spheres. Sizes (w, d, h) are frozen: saved plans keep every piece where it was.
 * The pot and plant helpers are shared with the new pl_ kinds (lib/catalog.plants.ts).
 */
const TERRA = "#b8683f";
const SAND = "#d6cfc4";
const WHITE = "#f2f1ee";
const BLACK = "#2a2c30";

const old = (label: string, species: Kind["species"], w: number, d: number, h: number, pot: Kind["pot"], tags: string, rim?: number): Def => plantKind({ label, species, w, d, h, pot, tags, rim });

/** a tray with three pots of succulents */
const succulents = (): Def => {
  const parts: Part[] = [b(0, 0.01, 0, 0.34, 0.02, 0.14, "#b98a55", { ...WOOD, m: true })];
  [-0.11, 0, 0.11].forEach((x, i) => {
    parts.push(turned(x, 0.02, 0, [[0.026, 0], [0.03, 0.004], [0.04, 0.036], [0.042, 0.04]], i === 1 ? SAND : i === 0 ? TERRA : "#6b9a8a", { ...CERAMIC, m: true }));
    parts.push(cy(x, 0.062, 0, 0.07, 0.006, "#3b2d22", MATT));
  });
  parts.push(plantOn("hp_succulents", 0.32, 0.075, 0.13, 0.062));
  return { label: "Succulent trio on a tray", brand: "Generic", cat: "Decor", w: 0.34, d: 0.14, h: 0.14, parts, tags: "plant houseplant succulent cactus desk windowsill small" };
};

const sizes = old;

export const PLANTS: Record<string, Def> = {
  dc_plant_fiddle_160: sizes("Fiddle-leaf fig 1.6 m", "hp_fiddle_fig", 0.7, 0.7, 1.6, { style: "ceramic", colour: SAND, r: 0.16, h: 0.32 }, "fiddle leaf fig ficus tree"),
  dc_plant_fiddle_110: sizes("Fiddle-leaf fig, small 1.1 m", "hp_fiddle_fig", 0.48999999999999994, 0.48999999999999994, 1.1, { style: "terracotta", colour: TERRA, r: 0.11, h: 0.22 }, "fiddle leaf fig ficus tree"),
  dc_plant_monstera_110: sizes("Monstera 1.1 m", "hp_monstera", 1.09, 1.08, 1.24, { style: "ceramic", colour: SAND, r: 0.15, h: 0.28 }, "monstera swiss cheese plant tropical"),
  dc_plant_monstera_150: sizes("Monstera, large 1.5 m", "hp_monstera", 1.48, 1.47, 1.69, { style: "matt", colour: BLACK, r: 0.2, h: 0.38 }, "monstera swiss cheese plant tropical"),
  dc_plant_cactus_tall: sizes("Cactus, tall 1.2 m", "hp_cactus_columnar", 0.5, 0.47600000000000003, 1.37, { style: "terracotta", colour: TERRA, r: 0.15, h: 0.24 }, "cactus saguaro desert spiky"),
  dc_plant_cactus_small: sizes("Cactus, small 35 cm", "hp_cactus_columnar", 0.28, 0.28, 0.41, { style: "terracotta", colour: TERRA, r: 0.065, h: 0.1 }, "cactus small desert spiky"),
  dc_plant_cactus_barrel: sizes("Barrel cactus 30 cm", "hp_barrel_cactus", 0.22, 0.22, 0.3, { style: "ceramic", colour: SAND, r: 0.09, h: 0.12 }, "barrel cactus desert spiky"),
  dc_ceiling_hanging_plant: ceilingHang("Hanging plant in macrame holder", "hp_pothos_hanging", 0.5, 0.9, 0.69, { potR: 0.1, potH: 0.13, colour: TERRA, style: "terracotta", tags: "hanging pothos trailing macrame ceiling" }),
  dc_plant_palm_150: sizes("Palm 1.5 m", "hp_areca_palm", 1.1, 1.02, 1.56, { style: "ceramic", colour: SAND, r: 0.17, h: 0.34 }, "palm areca tropical frond"),
  dc_plant_palm_200: sizes("Palm, tall 2.0 m", "hp_kentia_palm", 1.47, 1.36, 2.07, { style: "ceramic", colour: SAND, r: 0.23, h: 0.45 }, "palm kentia tropical frond tall"),
  dc_plant_succulents: succulents(),
  dc_plant_snake_100: sizes("Snake plant, tall 1.0 m", "hp_snake_tall", 0.30600000000000005, 0.30600000000000005, 1.07, { style: "matt", colour: BLACK, r: 0.13, h: 0.22 }, "snake plant sansevieria"),
  dc_plant_snake_60: sizes("Snake plant, small 60 cm", "hp_snake_short", 0.272, 0.272, 0.64, { style: "matt", colour: BLACK, r: 0.1, h: 0.16 }, "snake plant sansevieria"),
  dc_plant_rubber: sizes("Rubber plant 1.3 m", "hp_rubber_plant", 0.6, 0.6, 1.31, { style: "matt", colour: BLACK, r: 0.15, h: 0.3 }, "rubber plant ficus elastica"),
  dc_plant_olive: sizes("Olive tree in pot 1.6 m", "hp_olive", 0.72, 0.7, 1.67, { style: "ceramic", colour: SAND, r: 0.18, h: 0.34 }, "olive tree mediterranean"),
  dc_plant_orchid: sizes("Orchid in white pot", "hp_orchid", 0.28, 0.18, 0.5, { style: "ceramic", colour: WHITE, r: 0.06, h: 0.12 }, "orchid phalaenopsis flower blooming"),
  dc_plant_pampas: sizes("Pampas grass in tall vase", "hp_pampas", 0.45, 0.45, 1.3, { style: "vase", colour: SAND, r: 0.13, h: 0.4 }, "pampas grass dried plume vase boho"),
};

/** FEJKA plant (lib/catalog.base-decor.ts): a fake leafy plant in a ceramic pot, same box as before. */
export const fejkaPlant = (): Def => ({ ...old("FEJKA plant", "hp_fake_bush", 0.4, 0.4, 0.93, { style: "ceramic", colour: "#b5a99a", r: 0.14, h: 0.24 }, "artificial fake plant"), brand: "IKEA" });
/** Trailing ivy in a tall white pot (lib/catalog.home-kitchen.ts, on top of the kitchen units): vines run down the pot. */
export const trailingIvy = (): Def => old("Trailing ivy in white pot", "hp_pothos_shelf", 0.2, 0.2, 0.55, { style: "ceramic", colour: "#ecebe6", r: 0.07, h: 0.32 }, "ivy pothos trailing", 0.545);

/** Hanging trailing plant (lib/catalog.home-office.ts): a small pot on the wall, strands running down. */
export const wallTrailing = (): Def => {
  const potY = 0.72;
  const pot = turned(0, potY, -0.04, [[0.04, 0], [0.046, 0.01], [0.06, 0.085], [0.062, 0.1]], "#202225", { ...CERAMIC, m: true });
  const rimY = potY + 0.1, H = 0.6;
  return {
    wall: true, label: "Hanging trailing plant", brand: "Generic", cat: "Decor", w: 0.3, d: 0.3, h: 0.9,
    parts: [pot, cy(0, rimY + 0.002, -0.04, 0.1, 0.008, "#3b2d22", MATT), { ...plantOn("hp_pothos_trailing", 0.28, H, 0.24, rimY - 0.012 - 0.84 * H), p: [0, rimY - 0.012 - 0.84 * H + H / 2, -0.04] }],
    tags: "plant houseplant trailing pothos hanging wall",
  };
};
