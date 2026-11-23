import type { Def, Part } from "./catalog.ts";
import { CERAMIC, MATT, PLASTIC, STONE, WOOD, cy, turned, type Opt } from "./partsKit.ts";
import type { Species } from "./vegetation.ts";

/**
 * Houseplants and artificial plants of the catalog (ids start with "pl_"): a lathe-turned pot or vase plus one procedural plant (lib/vegPlants.ts) that the
 * item's finish tints. Also the building blocks (`plantOn`, `potParts`, `PLANT_GREEN`) lib/decor/plants.ts uses to upgrade the older blocky plant kinds.
 * Labels carry the height; local coordinates are metres from the footprint centre, y up, front = +z.
 */
const PLANT_GREEN = "#4f8a3a";
const SOIL = "#3b2d22";
const TERRA = "#b8683f";
const WHITE = "#ebe7de";
const BLACK = "#2a2c30";
const CONCRETE = "#a29f98";
const BASKET = "#b89a6a";
const SAND = "#d6cfc4";

type PotStyle = "terracotta" | "ceramic" | "matt" | "concrete" | "basket" | "vase" | "bowl" | "stand";
type Prof = [number, number][];
/** Profiles in metres from the base up for a pot of rim radius r and height h. */
const PROFILES: Record<PotStyle, (r: number, h: number) => Prof> = {
  terracotta: (r, h) => [[r * 0.6, 0], [r * 0.66, h * 0.04], [r * 0.9, h * 0.8], [r * 0.9, h * 0.86], [r, h * 0.88], [r, h]],
  ceramic: (r, h) => [[r * 0.7, 0], [r * 0.74, h * 0.03], [r * 0.94, h * 0.9], [r, h * 0.94], [r, h]],
  matt: (r, h) => [[r * 0.78, 0], [r * 0.82, h * 0.04], [r * 0.97, h * 0.94], [r, h * 0.96], [r, h]],
  concrete: (r, h) => [[r * 0.94, 0], [r, h * 0.03], [r, h * 0.97], [r * 0.97, h]],
  basket: (r, h) => [[r * 0.8, 0], [r * 0.95, h * 0.5], [r, h * 0.94], [r * 1.04, h]],
  vase: (r, h) => [[r * 0.5, 0], [r * 0.8, h * 0.06], [r, h * 0.35], [r * 0.88, h * 0.62], [r * 0.45, h * 0.86], [r * 0.52, h]],
  bowl: (r, h) => [[r * 0.5, 0], [r * 0.7, h * 0.15], [r * 0.9, h * 0.55], [r, h * 0.85], [r * 0.97, h]],
  stand: (r, h) => [[r * 0.7, 0], [r * 0.74, h * 0.03], [r * 0.94, h * 0.9], [r, h * 0.94], [r, h]],
};
const FINISH: Record<PotStyle, Opt> = {
  terracotta: { tex: "ceramic", rough: 0.85 },
  ceramic: CERAMIC,
  matt: { ...PLASTIC, rough: 0.55 },
  concrete: { ...STONE, rough: 0.8 },
  basket: { tex: "fabric", rough: 0.95 },
  vase: CERAMIC,
  bowl: CERAMIC,
  stand: CERAMIC,
};

/** A pot standing on `lift` (legs when lifted) and its soil. `top` is the height of the rim; the soil sits just above it. Vases carry no soil. */
function potParts(style: PotStyle, r: number, h: number, colour: string, lift = 0): { parts: Part[]; top: number } {
  const parts: Part[] = [];
  if (lift > 0) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      parts.push(cy(Math.cos(a) * r * 0.62, lift / 2, Math.sin(a) * r * 0.62, 0.024, lift, "#b98a55", { ...WOOD, m: true }));
    }
    parts.push(cy(0, lift - 0.006, 0, r * 1.5, 0.012, "#b98a55", { ...WOOD, m: true }));
  }
  const p = turned(0, lift, 0, PROFILES[style](r, h), colour, { ...FINISH[style], m: true });
  parts.push(p);
  const top = lift + h;
  if (style !== "vase") parts.push(cy(0, top + 0.002, 0, r * 1.62, 0.012, SOIL, { ...MATT }));
  return { parts, top };
}

/** A plant of `species` in a w x h x d box standing on y0. */
export const plantOn = (species: Species, w: number, h: number, d: number, y0: number, seed = 0, top = PLANT_GREEN): Part => ({ p: [0, y0 + h / 2, 0], s: [w, h, d], c: top, veg: { species, seed }, m: true });

type Kind = {
  label: string;
  species: Species;
  /** footprint and total height of the item; the plant is as wide as the footprint (plantW / plantD override) */
  w: number;
  d?: number;
  h: number;
  plantW?: number;
  plantD?: number;
  pot: { style: PotStyle; colour: string; r: number; h: number; lift?: number };
  seed?: number;
  top?: string;
  /** share of the plant's height at which the pot rim sits (trailing plants hang below it) */
  rim?: number;
  /** the plant starts this far below the pot rim (it grows out of the soil) */
  sink?: number;
  tags: string;
};

const TAGS = "plant houseplant indoor green decor pot ";

function kind(k: Kind): Def {
  const { parts, top } = potParts(k.pot.style, k.pot.r, k.pot.h, k.pot.colour, k.pot.lift ?? 0);
  const sink = k.sink ?? (k.pot.style === "vase" ? 0.02 : 0.012);
  const rim = k.rim ?? 0;
  const H = (k.h - top + sink) / (1 - rim);
  const w = k.plantW ?? k.w, d = k.plantD ?? k.d ?? w;
  parts.push(plantOn(k.species, w, H, d, top - sink - rim * H, k.seed, k.top));
  return { label: k.label, brand: "Generic", cat: "Decor", w: k.w, d: k.d ?? k.w, h: k.h, parts, tags: TAGS + k.tags };
}

/** a ceiling hook, three cords and a hanging pot; the plant hangs from its rim */
function ceilingHang(label: string, species: Species, w: number, plantH: number, rim: number, o: { potR: number; potH: number; colour: string; style: PotStyle; tags: string; seed?: number }): Def {
  const H = 2.6, rimY = 1.8;
  const cord = "#d9cfb8";
  const parts: Part[] = [cy(0, H - 0.01, 0, 0.07, 0.02, WHITE, { ...PLASTIC })];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push(cy(Math.cos(a) * o.potR * 0.5, (H + rimY - o.potH * 0.5) / 2, Math.sin(a) * o.potR * 0.5, 0.008, H - rimY + o.potH * 0.5, cord, { tex: "fabric", rough: 0.95 }));
  }
  parts.push(turned(0, rimY - o.potH, 0, PROFILES[o.style](o.potR, o.potH), o.colour, { ...FINISH[o.style], m: true }));
  parts.push(cy(0, rimY + 0.002, 0, o.potR * 1.62, 0.012, SOIL, MATT));
  parts.push(plantOn(species, w, plantH, w, rimY - rim * plantH, o.seed ?? 0));
  return { label, brand: "Generic", cat: "Decor", w, d: w, h: H, parts, tags: TAGS + o.tags };
}

/** a plant panel on a wall: top edge at `top` (absolute mounting height) */
function wallPanel(label: string, species: Species, w: number, h: number, top: number, tags: string): Def {
  const D = species === "hp_ivy_wall" ? 0.09 : 0.07;
  return { wall: true, label, brand: "Generic", cat: "Decor", w, d: D, h: top, parts: [plantOn(species, w, h, D, top - h, 0, "#3d7a38")], tags: TAGS + tags };
}

const trio = (): Def => {
  const parts: Part[] = [];
  [-0.1, 0, 0.1].forEach((x, i) => {
    const p = turned(x, 0, i === 1 ? 0.005 : 0, PROFILES.terracotta(0.04, 0.055), i === 1 ? WHITE : i === 0 ? TERRA : "#8a9a8a", { ...FINISH.terracotta, m: true });
    parts.push(p, cy(x, 0.057, i === 1 ? 0.005 : 0, 0.07, 0.008, SOIL, MATT));
  });
  parts.push(plantOn("hp_succulents", 0.3, 0.1, 0.14, 0.058, 0));
  return { label: "Succulent trio in small pots 17 cm", brand: "Generic", cat: "Decor", w: 0.32, d: 0.14, h: 0.17, parts, tags: TAGS + "succulent cactus echeveria desk tabletop windowsill small" };
};

const terrarium = (): Def => {
  const r = 0.12;
  const glass: Part = { ...turned(0, 0.015, 0, [[r * 0.5, 0], [r * 0.85, 0.03], [r, 0.09], [r * 0.9, 0.16], [r * 0.5, 0.215], [r * 0.4, 0.235]], "#c9e4ea", { glass: true, rough: 0.05 }) };
  const base = turned(0, 0, 0, [[r * 0.55, 0], [r * 0.6, 0.012], [r * 0.5, 0.015]], "#6b4a35", { ...WOOD, m: true });
  return {
    label: "Glass terrarium with plants 25 cm", brand: "Generic", cat: "Decor", w: 0.25, d: 0.25, h: 0.25,
    parts: [base, cy(0, 0.03, 0, r * 1.25, 0.02, "#6b6258", STONE), cy(0, 0.045, 0, r * 1.1, 0.012, SOIL, MATT), plantOn("hp_terrarium", 0.2, 0.17, 0.2, 0.05, 0, "#4f7a38"), glass],
    tags: TAGS + "terrarium glass bowl moss tiny garden miniature",
  };
};

export const PLANTS_V2: Record<string, Def> = {
  // ---- floor plants
  pl_fiddle_fig_150: kind({ label: "Fiddle-leaf fig 1.5 m", species: "hp_fiddle_fig", w: 0.75, h: 1.5, plantW: 0.72, pot: { style: "ceramic", colour: WHITE, r: 0.17, h: 0.3 }, tags: "fiddle leaf fig ficus lyrata tree" }),
  pl_monstera_120: kind({ label: "Monstera 1.2 m", species: "hp_monstera", w: 1.0, h: 1.2, pot: { style: "terracotta", colour: TERRA, r: 0.2, h: 0.3 }, tags: "monstera swiss cheese plant deliciosa tropical big leaf" }),
  pl_rubber_130: kind({ label: "Rubber plant 1.3 m", species: "hp_rubber_plant", w: 0.6, h: 1.3, plantW: 0.56, pot: { style: "matt", colour: BLACK, r: 0.16, h: 0.3 }, tags: "rubber plant ficus elastica tree" }),
  pl_weeping_fig_160: kind({ label: "Weeping fig 1.6 m", species: "hp_ficus", w: 0.8, h: 1.6, pot: { style: "concrete", colour: CONCRETE, r: 0.22, h: 0.32 }, tags: "weeping fig ficus benjamina tree" }),
  pl_snake_tall_90: kind({ label: "Snake plant, tall 90 cm", species: "hp_snake_tall", w: 0.4, h: 0.9, plantW: 0.36, pot: { style: "matt", colour: BLACK, r: 0.12, h: 0.22 }, tags: "snake plant sansevieria mother in law tongue" }),
  pl_snake_short_45: kind({ label: "Snake plant, short 45 cm", species: "hp_snake_short", w: 0.34, h: 0.45, plantW: 0.32, pot: { style: "terracotta", colour: SAND, r: 0.1, h: 0.14 }, tags: "snake plant sansevieria succulent" }),
  pl_zz_70: kind({ label: "ZZ plant 70 cm", species: "hp_zz_plant", w: 0.55, h: 0.7, pot: { style: "ceramic", colour: WHITE, r: 0.14, h: 0.2 }, tags: "zz plant zamioculcas easy care" }),
  pl_areca_palm_140: kind({ label: "Areca palm 1.4 m", species: "hp_areca_palm", w: 1.0, h: 1.4, pot: { style: "basket", colour: BASKET, r: 0.2, h: 0.28 }, tags: "areca palm butterfly palm tropical frond" }),
  pl_kentia_palm_180: kind({ label: "Kentia palm 1.8 m", species: "hp_kentia_palm", w: 1.1, h: 1.8, pot: { style: "ceramic", colour: "#cfc9bd", r: 0.2, h: 0.34 }, tags: "kentia palm howea tall frond tropical" }),
  pl_yucca_130: kind({ label: "Yucca 1.3 m", species: "hp_yucca", w: 0.8, h: 1.3, pot: { style: "terracotta", colour: "#8a4a30", r: 0.2, h: 0.3 }, tags: "yucca cane spiky tree" }),
  pl_dracaena_120: kind({ label: "Dracaena 1.2 m", species: "hp_dracaena", w: 0.6, h: 1.2, pot: { style: "ceramic", colour: "#7a7d82", r: 0.15, h: 0.26 }, tags: "dracaena dragon tree cane" }),
  pl_philodendron_70: kind({ label: "Heartleaf philodendron 70 cm", species: "hp_philodendron", w: 0.7, h: 0.7, pot: { style: "basket", colour: BASKET, r: 0.15, h: 0.22 }, tags: "philodendron heartleaf climbing" }),
  pl_calathea_60: kind({ label: "Calathea 60 cm", species: "hp_calathea", w: 0.6, h: 0.6, pot: { style: "ceramic", colour: "#e8d9c4", r: 0.14, h: 0.2 }, tags: "calathea prayer plant striped leaf maranta" }),
  pl_boston_fern_stand: kind({ label: "Boston fern on a stand 90 cm", species: "hp_boston_fern", w: 0.7, h: 0.9, pot: { style: "stand", colour: SAND, r: 0.16, h: 0.18, lift: 0.4 }, tags: "boston fern nephrolepis stand" }),
  pl_olive_160: kind({ label: "Olive tree in pot 1.6 m", species: "hp_olive", w: 0.8, h: 1.6, pot: { style: "terracotta", colour: "#c47b55", r: 0.25, h: 0.34 }, tags: "olive tree mediterranean silver leaves" }),
  pl_cactus_columnar_120: kind({ label: "Tall cactus 1.2 m", species: "hp_cactus_columnar", w: 0.42, h: 1.2, pot: { style: "terracotta", colour: TERRA, r: 0.12, h: 0.2 }, tags: "cactus saguaro desert spiky" }),
  pl_lady_palm_120: kind({ label: "Lady palm 1.2 m", species: "hp_lady_palm", w: 0.7, h: 1.2, pot: { style: "matt", colour: "#3a3d42", r: 0.17, h: 0.26 }, tags: "lady palm rhapis fan palm" }),
  pl_pampas_vase_120: kind({ label: "Pampas grass in a floor vase 1.2 m", species: "hp_pampas", w: 0.45, h: 1.2, pot: { style: "vase", colour: "#d6cfc4", r: 0.15, h: 0.4 }, tags: "pampas grass dried plume boho vase artificial fake" }),
  pl_dried_branches_140: kind({ label: "Dried branches in a tall vase 1.4 m", species: "hp_dried_branches", w: 0.5, h: 1.4, pot: { style: "vase", colour: "#2d2e32", r: 0.12, h: 0.5 }, tags: "dried branches twigs bare stems vase boho artificial fake" }),
  pl_artificial_bush_80: kind({ label: "Artificial leafy plant 80 cm", species: "hp_fake_bush", w: 0.6, h: 0.8, pot: { style: "matt", colour: "#2f3135", r: 0.15, h: 0.2 }, tags: "artificial fake plastic silk plant" }),
  pl_topiary_90: kind({ label: "Topiary ball on a stem 90 cm", species: "hp_topiary", w: 0.4, h: 0.9, pot: { style: "concrete", colour: "#8f8d86", r: 0.13, h: 0.2 }, tags: "topiary boxwood ball artificial fake tree" }),
  // ---- tabletop plants
  pl_aloe_35: kind({ label: "Aloe vera 35 cm", species: "hp_aloe", w: 0.4, h: 0.35, plantW: 0.38, pot: { style: "terracotta", colour: TERRA, r: 0.09, h: 0.12 }, tags: "aloe vera succulent medicinal windowsill" }),
  pl_agave_40: kind({ label: "Agave 40 cm", species: "hp_agave", w: 0.5, h: 0.4, pot: { style: "concrete", colour: "#8f8d86", r: 0.11, h: 0.13 }, tags: "agave succulent desert blue" }),
  pl_jade_35: kind({ label: "Jade plant 35 cm", species: "hp_jade", w: 0.3, h: 0.35, pot: { style: "ceramic", colour: "#e9c9a0", r: 0.08, h: 0.11 }, tags: "jade plant money tree crassula succulent" }),
  pl_barrel_cactus_22: kind({ label: "Barrel cactus 22 cm", species: "hp_barrel_cactus", w: 0.18, h: 0.22, pot: { style: "terracotta", colour: TERRA, r: 0.07, h: 0.08 }, tags: "barrel cactus spiky desert small" }),
  pl_prickly_pear_45: kind({ label: "Prickly pear cactus 45 cm", species: "hp_prickly_pear", w: 0.34, h: 0.45, pot: { style: "terracotta", colour: "#c47b55", r: 0.1, h: 0.12 }, tags: "prickly pear opuntia cactus paddle" }),
  pl_orchid_55: kind({ label: "Orchid 55 cm", species: "hp_orchid", w: 0.3, d: 0.18, h: 0.55, plantW: 0.3, pot: { style: "ceramic", colour: WHITE, r: 0.07, h: 0.12 }, tags: "orchid phalaenopsis flowers blooming flower" }),
  pl_bonsai_35: kind({ label: "Bonsai tree 35 cm", species: "hp_bonsai", w: 0.36, h: 0.35, plantW: 0.34, pot: { style: "bowl", colour: "#3a5f7a", r: 0.15, h: 0.06 }, tags: "bonsai miniature tree japanese" }),
  pl_lavender_35: kind({ label: "Lavender pot 35 cm", species: "hp_lavender", w: 0.3, h: 0.35, pot: { style: "terracotta", colour: TERRA, r: 0.1, h: 0.13 }, tags: "lavender herb flowers purple" }),
  pl_rosemary_40: kind({ label: "Rosemary pot 40 cm", species: "hp_rosemary", w: 0.32, h: 0.4, pot: { style: "ceramic", colour: "#e6e0d2", r: 0.09, h: 0.13 }, tags: "rosemary herb kitchen" }),
  pl_basil_30: kind({ label: "Basil pot 30 cm", species: "hp_basil", w: 0.24, h: 0.3, pot: { style: "terracotta", colour: "#c0714a", r: 0.07, h: 0.1 }, tags: "basil herb kitchen windowsill" }),
  pl_mint_30: kind({ label: "Mint pot 30 cm", species: "hp_mint", w: 0.26, h: 0.3, pot: { style: "ceramic", colour: "#9fb8a8", r: 0.07, h: 0.1 }, tags: "mint herb kitchen windowsill" }),
  pl_pilea_25: kind({ label: "Pilea, Chinese money plant 25 cm", species: "hp_pilea", w: 0.24, h: 0.25, pot: { style: "ceramic", colour: "#e8a868", r: 0.055, h: 0.08 }, tags: "pilea chinese money plant coin small" }),
  pl_spider_plant_45: kind({ label: "Spider plant 45 cm", species: "hp_spider_plant", w: 0.5, h: 0.45, pot: { style: "ceramic", colour: WHITE, r: 0.12, h: 0.16 }, tags: "spider plant chlorophytum arching" }),
  pl_eucalyptus_vase_80: kind({ label: "Eucalyptus stems in a vase 80 cm", species: "hp_eucalyptus", w: 0.4, h: 0.8, pot: { style: "vase", colour: "#e8e2d4", r: 0.08, h: 0.3 }, tags: "eucalyptus stems bouquet cut flowers vase fresh artificial" }),
  pl_boxwood_ball_35: kind({ label: "Boxwood ball in a pot 35 cm", species: "hp_boxwood_ball", w: 0.36, h: 0.35, plantW: 0.3, pot: { style: "concrete", colour: "#9a9892", r: 0.09, h: 0.1 }, tags: "boxwood ball topiary artificial fake hedge" }),
  pl_succulent_trio: trio(),
  pl_terrarium_25: terrarium(),
  // ---- trailing, hanging and wall plants
  pl_pothos_stand_85: kind({ label: "Pothos on a plant stand 85 cm", species: "hp_pothos_shelf", w: 0.5, h: 0.85, pot: { style: "stand", colour: WHITE, r: 0.12, h: 0.14, lift: 0.4 }, rim: 0.545, tags: "pothos devils ivy trailing vine stand" }),
  pl_ceiling_pothos: ceilingHang("Hanging pothos in a ceiling pot", "hp_pothos_hanging", 0.5, 0.9, 0.69, { potR: 0.11, potH: 0.12, colour: WHITE, style: "ceramic", tags: "pothos trailing vine hanging ceiling" }),
  pl_ceiling_basket_fern: ceilingHang("Hanging basket with fern and ivy", "hp_hanging_basket", 0.45, 0.55, 0.545, { potR: 0.12, potH: 0.12, colour: BASKET, style: "basket", tags: "hanging basket fern ivy trailing ceiling" }),
  pl_wall_boxwood_50: wallPanel("Boxwood wall panel 50 x 50 cm", "hp_boxwood_panel", 0.5, 0.5, 1.8, "boxwood hedge wall greenery panel vertical garden artificial fake"),
  pl_wall_ivy_100: wallPanel("Greenery wall strip 1 m", "hp_ivy_wall", 1.0, 0.5, 1.8, "ivy leaves greenery wall panel vertical garden artificial fake"),
};

export { ceilingHang, kind as plantKind, type Kind };
