import type { BufferGeometry } from "three";
import { KIND, LEVELS, Mesh, TILE, fit, type Level, type SpeciesDef } from "./vegBuilder.ts";
import { hashStr, rngOf } from "./mathUtil.ts";
import { BUILDERS, type Broad, type Shrub, type Spruce } from "./vegSpecies.ts";
import { PLANT_SPECIES } from "./vegPlants.ts";
import { mixHex, nextSeason, seasonPalette, type Season } from "./season.ts";
import type { YearLook } from "./seasonYear.ts";

/**
 * Procedural organic vegetation: trees, shrubs, hedges, grasses and flowers built from tapered branch tubes, noise-displaced
 * clumps and alpha-tested leaf cards, with no model files. Each species has a few seeded variants, cached; the geometry is
 * season-agnostic (colour, leaf cover, snow and wind are decided in the shader, see components/scene/foliageMaterial.ts).
 * Pure (no DOM): the geometry tests run under `node --test`.
 */
export const VARIANTS = 4;
export { KIND, TILE, tileRect, ATLAS_COLS, ATLAS_ROWS, LEVEL_MULT, levelOfFoliage, type Level } from "./vegBuilder.ts";
export { LEVELS };
export type { SpeciesDef };


const B = BUILDERS;
const OAK: Broad = { size: [2.8, 4.6, 2.8], trunkH: 1.3, trunkR: 0.17, leader: 0.55, limbs: 7, limbAng: 0.95, limbLen: 1.5, taper: 0.35, kids: 2, droop: 0.15, up: 0.5, lean: 0.12, blobR: 0.92, flat: 0.8, spacing: 0.8, cards: 24, card: 0.78, tile: 1, kind: KIND.broad, lt: [1, 1, 1], bark: "#4d433a", barkStyle: 0, slots: [0.4, 0.3, 0.3] };
const o = (base: Broad, over: Partial<Broad>): Broad => ({ ...base, ...over });

const GARDEN_SPECIES = {
  // ---- trees
  oak: { label: "Oak", size: [2.8, 4.6, 2.8], tree: true, budget: 1500, build: (m, r, q) => B.broadleaf(m, r, q, OAK) },
  birch: { label: "Birch", size: [1.9, 4.2, 1.9], tree: true, budget: 1500, build: (m, r, q) => B.broadleaf(m, r, q, o(OAK, { size: [1.9, 4.2, 1.9], trunkH: 1.9, trunkR: 0.075, leader: 0.8, limbs: 8, limbAng: 0.6, limbLen: 1.0, taper: 0.3, droop: 0.5, up: 0.3, lean: 0.25, blobR: 0.6, flat: 0.9, spacing: 0.55, cards: 20, card: 0.46, tile: 2, lt: [1.15, 1.15, 0.85], bark: "#d9d5c9", barkStyle: 1, slots: [0.25, 0.2, 0.55], roots: 3 })) },
  maple: { label: "Maple", size: [2.6, 4.2, 2.6], tree: true, budget: 1500, build: (m, r, q) => B.broadleaf(m, r, q, o(OAK, { size: [2.6, 4.2, 2.6], trunkH: 1.2, trunkR: 0.15, limbs: 7, limbAng: 0.9, limbLen: 1.4, blobR: 0.82, flat: 0.85, cards: 26, card: 0.62, tile: 5, bark: "#5a4a40", slots: [0.15, 0.7, 0.15] })) },
  linden: { label: "Linden", size: [2.3, 4.6, 2.3], tree: true, budget: 1500, build: (m, r, q) => B.broadleaf(m, r, q, o(OAK, { size: [2.3, 4.6, 2.3], trunkH: 1.4, trunkR: 0.14, leader: 0.7, limbs: 8, limbAng: 0.62, limbLen: 1.25, taper: 0.45, blobR: 0.78, flat: 1.0, spacing: 0.7, cards: 23, card: 0.58, tile: 2, lt: [1.05, 1.1, 0.95], bark: "#51483f", slots: [0.3, 0.2, 0.5] })) },
  willow: { label: "Willow", size: [3.4, 4.6, 3.4], tree: true, budget: 1500, build: (m, r, q) => B.broadleaf(m, r, q, o(OAK, { size: [3.4, 4.6, 3.4], trunkH: 1.0, trunkR: 0.2, leader: 0.35, limbs: 6, limbAng: 1.0, limbLen: 1.7, taper: 0.3, droop: 0.7, blobR: 0.7, flat: 0.8, spacing: 0.8, cards: 13, card: 0.58, tile: 3, lt: [1.1, 1.15, 0.9], bark: "#4a4238", slots: [0.3, 0.2, 0.5], strands: { n: 3, len: 1.5, w: 0.22 } })) },
  poplar: { label: "Poplar", size: [1.3, 5.4, 1.3], tree: true, budget: 1500, build: (m, r, q) => B.column(m, r, q, [1.3, 5.4, 1.3], { blobs: 9, card: 0.55, cards: 26, tile: 2, kind: KIND.broad, lt: [1.05, 1.1, 0.9], slots: [0.4, 0.3, 0.3], bark: "#6b5f50", trunkH: 0.9, bulge: 0.3 }) },
  cypress: { label: "Cypress", size: [1.0, 4.2, 1.0], tree: true, evergreen: true, budget: 1500, build: (m, r, q) => B.column(m, r, q, [1.0, 4.2, 1.0], { blobs: 8, card: 0.5, cards: 22, tile: 4, kind: KIND.conifer, lt: [0.85, 0.95, 0.85], slots: [0.4, 0.3, 0.3], bark: "#5a4a3a", trunkH: 0.4, bulge: 0.6 }) },
  cherry: { label: "Cherry", size: [2.8, 3.6, 2.8], tree: true, budget: 1500, build: (m, r, q) => B.broadleaf(m, r, q, o(OAK, { size: [2.8, 3.6, 2.8], trunkH: 1.0, trunkR: 0.12, leader: 0.5, limbs: 6, limbAng: 0.85, limbLen: 1.3, blobR: 0.72, flat: 0.8, spacing: 0.75, cards: 16, card: 0.55, tile: 2, bark: "#6a4f46", slots: [0.4, 0.3, 0.3], blossom: { n: 10, tone: "#f6c4d6", size: 0.3 }, fruit: { n: 2, dia: 0.07, tones: ["#9a1a2a", "#b3262f"] } })) },
  apple: { label: "Apple", size: [2.6, 3.2, 2.6], tree: true, budget: 1500, build: (m, r, q) => B.broadleaf(m, r, q, o(OAK, { size: [2.6, 3.2, 2.6], trunkH: 0.9, trunkR: 0.12, leader: 0.4, limbs: 6, limbAng: 0.95, limbLen: 1.3, blobR: 0.7, flat: 0.85, spacing: 0.75, cards: 16, card: 0.55, tile: 1, bark: "#5a4e42", slots: [0.4, 0.3, 0.3], blossom: { n: 9, tone: "#fbeaf0", size: 0.28 }, fruit: { n: 2, dia: 0.11, tones: ["#c8302f", "#d8453a", "#a8c23a"] } })) },
  pine: { label: "Pine", size: [2.6, 5.0, 2.6], tree: true, evergreen: true, budget: 1500, build: (m, r, q) => B.broadleaf(m, r, q, o(OAK, { size: [2.6, 5.0, 2.6], trunkH: 2.5, trunkR: 0.13, leader: 0.55, limbs: 6, limbAng: 1.2, limbLen: 1.3, taper: 0.25, kids: 2, up: 0.3, lean: 0.25, blobR: 0.85, flat: 0.42, spacing: 0.85, cards: 30, card: 0.62, tile: 4, kind: KIND.conifer, lt: [0.9, 1, 0.9], bark: "#6b4a38", slots: [0.4, 0.3, 0.3], twist: 1.5 })) },
  spruce: { label: "Spruce", size: [2.2, 4.8, 2.2], tree: true, evergreen: true, budget: 1500, build: (m, r, q) => B.spruce(m, r, q, { size: [2.2, 4.8, 2.2], tiers: 10, card: 0.5, lt: [0.9, 1, 0.95], skirt: 0.6, bark: "#4a3a2e" } satisfies Spruce) },
  fir: { label: "Fir", size: [1.8, 4.0, 1.8], tree: true, evergreen: true, budget: 1500, build: (m, r, q) => B.spruce(m, r, q, { size: [1.8, 4.0, 1.8], tiers: 8, card: 0.45, lt: [0.85, 1, 1], skirt: 0.3, bark: "#4a3a2e" } satisfies Spruce) },
  palm: { label: "Palm", size: [3.2, 4.4, 3.2], tree: true, evergreen: true, budget: 1500, build: (m, r, q) => B.palm(m, r, q) },
  olive: { label: "Olive", size: [2.6, 2.8, 2.6], tree: true, evergreen: true, budget: 1500, build: (m, r, q) => B.broadleaf(m, r, q, o(OAK, { size: [2.6, 2.8, 2.6], trunkH: 0.7, trunkR: 0.14, leader: 0.35, limbs: 6, limbAng: 0.9, limbLen: 1.1, blobR: 0.5, flat: 0.7, spacing: 0.55, cards: 16, card: 0.36, tile: 3, kind: KIND.conifer, lt: [0.95, 1.2, 1.05], bark: "#6b5f52", slots: [0.2, 0.3, 0.5], twist: 3, lean: 0.35 })) },
  // ---- shrubs and hedges
  shrub: { label: "Round shrub", size: [0.9, 0.7, 0.8], budget: 700, build: (m, r, q) => B.shrub(m, r, q, { size: [0.9, 0.7, 0.8], blobs: 4, cards: 16, card: 0.3, tile: 2, kind: KIND.bush, lt: [1, 1, 1] } satisfies Shrub) },
  hydrangea: { label: "Hydrangea", size: [1.0, 0.85, 0.95], budget: 800, build: (m, r, q) => B.shrub(m, r, q, { size: [1.0, 0.85, 0.95], blobs: 4, cards: 14, card: 0.34, tile: 1, kind: KIND.bush, lt: [1, 1, 1], flowers: { n: 14, size: 0.2, kind: KIND.bloom, tones: ["#8aa8f0", "#a8b8f4", "#c9a0e8"], tile: 6 } } satisfies Shrub) },
  rose: { label: "Rose bush", size: [0.8, 0.9, 0.8], budget: 800, build: (m, r, q) => B.shrub(m, r, q, { size: [0.8, 0.9, 0.8], blobs: 3, cards: 14, card: 0.26, tile: 2, kind: KIND.bush, lt: [0.9, 1, 0.9], flowers: { n: 12, size: 0.13, kind: KIND.bloom, tones: ["#e0405a", "#f06a86", "#fff0f0"], tile: 8 } } satisfies Shrub) },
  bush_pink: { label: "Flowering bush, pink", size: [0.9, 0.85, 0.9], budget: 800, build: (m, r, q) => B.shrub(m, r, q, { size: [0.9, 0.85, 0.9], blobs: 4, cards: 14, card: 0.3, tile: 2, kind: KIND.bush, lt: [1, 1, 1], flowers: { n: 16, size: 0.16, kind: KIND.bloom, tones: ["#e07aa6", "#f4b6cf", "#fbe0ea"], tile: 6 } } satisfies Shrub) },
  bush_yellow: { label: "Flowering bush, yellow", size: [0.9, 0.85, 0.9], budget: 800, build: (m, r, q) => B.shrub(m, r, q, { size: [0.9, 0.85, 0.9], blobs: 4, cards: 14, card: 0.3, tile: 2, kind: KIND.bush, lt: [1, 1, 1], flowers: { n: 16, size: 0.15, kind: KIND.bloom, tones: ["#f2c230", "#f6dc7a", "#ffe97a"], tile: 8 } } satisfies Shrub) },
  lavender: { label: "Lavender", size: [0.7, 0.6, 0.7], budget: 600, build: (m, r, q) => B.flowerPlant(m, r, { n: Math.round(16 * q), h: 0.55, spread: 0.3, head: 0.18, tile: 13, tones: ["#8a64c8", "#a07ad8", "#7a58b8"], rise: true, spike: true }) },
  hedge: { label: "Hedge", size: [1.2, 0.8, 0.6], budget: 500, build: (m, r, q) => B.hedge(m, r, q, [1.2, 0.8, 0.6]) },
  hedge_long: { label: "Long hedge", size: [3.0, 1.2, 0.6], budget: 900, build: (m, r, q) => B.hedge(m, r, q, [3.0, 1.2, 0.6]) },
  hedge_row: { label: "Garden hedge row", size: [2.9, 0.75, 0.6], budget: 500, build: (m, r, q) => B.hedge(m, r, q, [2.9, 0.75, 0.6]) },
  // ---- grasses, ferns, plants
  grass_tall: { label: "Ornamental grass", size: [0.9, 1.0, 0.9], budget: 500, build: (m, r) => B.blades(m, r, { n: 16, h: 1.0, spread: 0.45, w: 0.09, kind: KIND.grass, segs: 4, arch: 1, tone: [1.05, 1.05, 0.95] }) },
  reed: { label: "Reeds", size: [0.7, 1.6, 0.7], budget: 500, build: (m, r) => B.blades(m, r, { n: 10, h: 1.6, spread: 0.3, w: 0.07, kind: KIND.grass, segs: 4, arch: 0.6, tone: [1, 1, 0.9], cat: true }) },
  fern: { label: "Fern", size: [0.8, 0.5, 0.8], budget: 400, build: (m, r, q) => B.fern(m, r, q) },
  bamboo: { label: "Bamboo", size: [1.2, 3.6, 1.2], evergreen: true, budget: 800, build: (m, r, q) => B.bamboo(m, r, q) },
  daisy: { label: "Daisies", size: [0.5, 0.35, 0.5], budget: 300, build: (m, r, q) => B.flowerPlant(m, r, { n: Math.round(6 * q), h: 0.32, spread: 0.2, head: 0.1, tile: 8, tones: ["#ffffff", "#fffbe0"], rise: false }) },
  tulip: { label: "Tulips", size: [0.5, 0.4, 0.5], budget: 300, build: (m, r, q) => B.flowerPlant(m, r, { n: Math.round(6 * q), h: 0.38, spread: 0.2, head: 0.1, tile: 14, tones: ["#e8483a", "#ffd23a", "#f4a0c0"], rise: false }) },
  sunflower: { label: "Sunflowers", size: [0.6, 1.4, 0.6], budget: 300, build: (m, r, q) => B.flowerPlant(m, r, { n: Math.round(4 * q), h: 1.3, spread: 0.22, head: 0.3, tile: 8, tones: ["#ffc61a", "#ffb000"], rise: false }) },
  flower_bed: { label: "Flower bed", size: [1.2, 0.4, 0.5], budget: 500, build: (m, r, q) => B.bed(m, r, q, 0) },
  flower_bed_b: { label: "Flower bed", size: [1.2, 0.4, 0.5], budget: 500, build: (m, r, q) => B.bed(m, r, q, 1) },
  flower_bed_c: { label: "Flower bed", size: [1.2, 0.4, 0.5], budget: 500, build: (m, r, q) => B.bed(m, r, q, 2) },
  // ---- ground
  tuft: { label: "Grass tuft", size: [0.4, 0.3, 0.4], budget: 100, build: (m, r, q) => B.tuft(m, r, q) },
  clover: { label: "Clover", size: [0.6, 0.06, 0.6], budget: 100, build: (m, r, q) => B.clover(m, r, q) },
  groundcover: { label: "Ground cover", size: [0.9, 0.18, 0.9], budget: 200, build: (m, r, q) => B.groundcover(m, r, q) },
  rock: { label: "Rock", size: [0.5, 0.3, 0.45], budget: 200, build: (m, r) => B.rock(m, r, [0.5, 0.3, 0.45], 0) },
  rock_moss: { label: "Mossy rock", size: [0.7, 0.4, 0.6], budget: 200, build: (m, r) => B.rock(m, r, [0.7, 0.4, 0.6], 1) },
  mushroom: { label: "Mushroom", size: [0.14, 0.12, 0.14], budget: 100, build: (m, r) => B.mushroom(m, r) },
  patch: { label: "Bare patch", size: [1.0, 0.02, 0.8], budget: 30, build: (m, r) => B.patch(m, r) },
  litter: { label: "Fallen leaves", size: [0.32, 0.04, 0.32], budget: 30, build: (m, r) => B.litter(m, r) },
} satisfies Record<string, SpeciesDef>;

const SPECIES = { ...GARDEN_SPECIES, ...PLANT_SPECIES } satisfies Record<string, SpeciesDef>;

export type Species = keyof typeof SPECIES;
export const SPECIES_IDS = Object.keys(SPECIES) as Species[];
export const speciesDef = (s: Species): SpeciesDef => SPECIES[s];
export const isSpecies = (s: string): s is Species => s in SPECIES;

/** The atlas tile with a species' own leaves, used by the denser foliage levels (see foliageAtlasTrees.ts). */
const SPRIG: Partial<Record<Species, number>> = {
  oak: TILE.oak, birch: TILE.birch, maple: TILE.maple2, linden: TILE.linden, willow: TILE.willow, poplar: TILE.aspen, cypress: TILE.spruce, cherry: TILE.cherry, apple: TILE.cherry, pine: TILE.pine, olive: TILE.willow,
  shrub: TILE.boxwood, hydrangea: TILE.linden, rose: TILE.cherry, bush_pink: TILE.cherry, bush_yellow: TILE.birch,
};

/** How many times today's lawn detail (blade tufts, flowers, clover, litter) the grass knob (lib/quality.ts) asks for: 0.4 at Eco, 1 at Light, up to 7 at Ultra. */
export const lawnDensity = (grass: number) => Math.min(7, grass <= 0.5 ? Math.max(0.25, grass * 2) : 1 + (grass - 0.5) * 3.5);

const cache = new Map<string, BufferGeometry>();

/** One plant standing somewhere: what the garden layout produces and FoliageInstances draws. */
export type Placement = {
  species: Species;
  variant: number;
  /** 1 = the cheaper geometry for far trees */
  lod?: 0 | 1;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  /** random 0..1 per instance: wind phase, how early its leaves go, stiffness, lean */
  rand: [number, number, number, number];
  /** colour multiplier (1 = as built) */
  tone?: number;
};

/**
 * The geometry of one species variant (cached and shared: never mutate or dispose it). Natural size, base at y = 0, centred in x/z.
 * `lod` 1 is the cheaper version for trees far from the camera. `level` is the foliage density level of the quality tier (0 = the original look,
 * see LEVEL_MULT); far trees never go above level 1.
 */
export function buildVegetation(species: Species, variant = 0, lod: 0 | 1 = 0, level: Level = 0): BufferGeometry {
  const lv = (lod ? Math.min(level, 1) : level) as Level;
  const key = `${species}:${variant % VARIANTS}:${lod}:${lv}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def: SpeciesDef = SPECIES[species];
  const m = new Mesh();
  m.level = lv;
  m.sprig = SPRIG[species];
  def.build(m, rngOf(hashStr(species) + (variant % VARIANTS) * 7919 + 13), lod ? 0.55 : 1, lv);
  const g = m.toGeometry();
  fit(g, def.size);
  cache.set(key, g);
  return g;
}

export const triangleCount = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;

// ---------------------------------------------------------------- seasonal look

/** What the foliage shader needs for a season blend: colours as #rrggbb, scalars 0..1. */
export type FoliageLook = {
  leaf: [string, string, string];
  conifer: [string, string, string];
  grass: [string, string, string];
  flowers: [string, string, string, string];
  litter: [string, string, string];
  bush: string;
  /** the second leaf colour of shrubs on the denser tiers */
  bushAlt: string;
  hedge: string;
  /** share of deciduous canopy in leaf (0 bare .. 1 full) */
  leafy: number;
  /** lawn flowers, shrub blooms */
  bloom: number;
  /** spring blossom on fruit trees */
  blossom: number;
  fruit: number;
  mushrooms: number;
  /** fallen-leaf carpet share (a few in spring and summer, thick in autumn) */
  litterShare: number;
  snow: number;
  /** how thick the lawn's grass tufts stand: 0.55 thin after winter .. 1 */
  growth: number;
};

const LEAF: Record<Season, [string, string, string]> = {
  spring: ["#8fd05c", "#a8dc6a", "#6cbd4a"],
  summer: ["#3d8f34", "#4fa23e", "#2f7a30"],
  autumn: ["#d9902b", "#c4521f", "#e6b73a"],
  winter: ["#5a4a40", "#4a3f38", "#6a5a50"],
};
const CONIFER: Record<Season, [string, string, string]> = {
  spring: ["#3a7a4a", "#2f6c42", "#468456"],
  summer: ["#2c6244", "#235639", "#35704f"],
  autumn: ["#2a5a3c", "#215036", "#316546"],
  winter: ["#26503c", "#1c4430", "#2e5c44"],
};
/** The second leaf colour of shrubs (denser tiers only): shrubs are not one flat hue, in autumn some of their leaves turn rust. */
const BUSH_ALT: Record<Season, string> = { spring: "#9cd05a", summer: "#4f9a3a", autumn: "#cf6a28", winter: "#5f7f5e" };
const mixList = <T extends string[]>(a: T, b: T, t: number) => a.map((c, i) => mixHex(c, b[i], t)) as T;

/** The foliage look of `season` cross-faded `mix` of the way to the next season; `snow` is how much of winter lies as snow (see seasonPalette). */
export function foliageLook(season: Season, mix: number, snow = 1): FoliageLook {
  const p = seasonPalette(season, mix, snow);
  const nx = nextSeason(season);
  const w = (s: Season) => (s === season ? 1 - mix : 0) + (s === nx ? mix : 0);
  return {
    leaf: mixList(LEAF[season], LEAF[nx], mix),
    conifer: mixList(CONIFER[season], CONIFER[nx], mix),
    grass: p.grass,
    flowers: p.flowers,
    litter: p.leaf,
    bush: p.bush,
    bushAlt: mixHex(BUSH_ALT[season], BUSH_ALT[nx], mix),
    hedge: p.hedge,
    leafy: p.leafy,
    bloom: p.bloom,
    blossom: w("spring"),
    fruit: 0.55 * w("summer") + w("autumn"),
    mushrooms: p.mushrooms,
    litterShare: 0.03 + 0.97 * p.mushrooms,
    snow: p.snow,
    growth: 1,
  };
}

/**
 * The foliage look of a day of the year (see lib/seasonYear.ts), by foliage level (levelOfFoliage): level 0 (Eco, Light) changes tints only, the
 * canopy is in leaf or bare; level 1 (Balanced) thins and fills the canopy leaf by leaf; level 2 and up (Detailed, Ultra) add blossom for the few
 * weeks it is out and the leaves piling up on the ground. The lower levels keep the four-step garden's blossom and leaf litter.
 */
export function foliageLookAt(y: YearLook, level: Level): FoliageLook {
  const look = foliageLook(y.palette.season, y.palette.mix, y.snow);
  const leaf = mixList(LEAF[y.leaf.season], LEAF[y.leaf.next], y.leaf.mix);
  const detailed = level >= 2;
  // fallen leaves start the colour of the tree's and go brown with age; snow buries most of them
  const litter = mixList(LEAF.autumn, LEAF.winter, y.pileAge);
  return {
    ...look,
    leaf,
    leafy: level >= 1 ? y.leafy : y.leafy >= 0.5 ? 1 : 0,
    blossom: detailed ? y.blossom : look.blossom,
    litter: detailed ? litter : look.litter,
    litterShare: detailed ? 0.03 + 0.97 * y.pile * (1 - 0.8 * y.snow) : look.litterShare,
    growth: level >= 1 ? y.growth : 1,
  };
}
