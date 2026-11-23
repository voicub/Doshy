import type { Def, Part } from "./catalog";
import type { Species } from "./vegetation.ts";

/**
 * Organic plants for the catalog. A plant is ONE `foliage` part: the procedural mesh of a species (lib/vegetation.ts) stretched to the
 * part's box, recoloured by the item's finish, following the season, snow and wind like the garden's own plants.
 * `vegPart` is the helper every catalog file uses to put such a plant into a def. Ids start with "veg_".
 */
const TOP_COLOUR: Partial<Record<Species, string>> = {
  spruce: "#2f6247", fir: "#2f6247", pine: "#3a6e48", cypress: "#2f5f44", palm: "#5a9a4a", olive: "#7a9a6a", birch: "#7aa55a", maple: "#5f9a3a",
  cherry: "#6aa04a", apple: "#5a9a3a", hydrangea: "#8aa8f0", rose: "#d0505e", lavender: "#8a64c8", daisy: "#f4f4e8", tulip: "#e8483a", sunflower: "#f2b21a",
  flower_bed: "#c9684a", flower_bed_b: "#c9684a", flower_bed_c: "#c9684a", rock: "#8a8c8e", rock_moss: "#7a8a68", bamboo: "#8aa24a", reed: "#8a9a4a", clover: "#5a9a3a",
};
const GREEN = "#4f8a3a";

/** The plant `species` as a part standing on the floor of a w x h x d box (metres). `seed` picks the variant (0..3); finish tints the foliage. */
export const vegPart = (species: Species, w: number, h: number, d = w, seed = 0): Part => ({ p: [0, h / 2, 0], s: [w, h, d], c: TOP_COLOUR[species] ?? GREEN, veg: { species, seed }, m: true });
const plant = (label: string, species: Species, w: number, h: number, d = w, seed = 0): Def => ({ label, brand: "Generic", cat: "Outdoor", w, d, h, parts: [vegPart(species, w, h, d, seed)], tags: "plant garden tree shrub flower organic" });

export const VEGETATION: Record<string, Def> = {
  veg_maple: plant("Maple tree 4.2 m", "maple", 2.6, 4.2),
  veg_linden: plant("Linden tree 4.6 m", "linden", 2.3, 4.6),
  veg_willow: plant("Weeping willow 4.6 m", "willow", 3.4, 4.6),
  veg_poplar: plant("Poplar 5.4 m", "poplar", 1.3, 5.4),
  veg_cypress: plant("Cypress 4.2 m", "cypress", 1.0, 4.2),
  veg_cherry: plant("Cherry tree, blossom 3.6 m", "cherry", 2.8, 3.6),
  veg_spruce: plant("Spruce 4.8 m", "spruce", 2.2, 4.8),
  veg_fir: plant("Fir 4.0 m", "fir", 1.8, 4.0),
  veg_olive: plant("Olive tree 2.8 m", "olive", 2.6, 2.8),
  veg_hydrangea: plant("Hydrangea 1.0 m", "hydrangea", 1.0, 0.85, 0.95),
  veg_rose: plant("Rose bush 0.9 m", "rose", 0.8, 0.9),
  veg_lavender: plant("Lavender 0.6 m", "lavender", 0.7, 0.6),
  veg_hedge_short: plant("Clipped hedge 1.2 m", "hedge", 1.2, 0.8, 0.6),
  veg_grass_tall: plant("Ornamental grass 1.0 m", "grass_tall", 0.9, 1.0),
  veg_reed: plant("Reeds 1.6 m", "reed", 0.7, 1.6),
  veg_fern: plant("Fern", "fern", 0.8, 0.5),
  veg_bamboo: plant("Bamboo clump 3.6 m", "bamboo", 1.2, 3.6),
  veg_daisies: plant("Daisies", "daisy", 0.5, 0.35),
  veg_tulips: plant("Tulips", "tulip", 0.5, 0.4),
  veg_sunflowers: plant("Sunflowers 1.4 m", "sunflower", 0.6, 1.4),
  veg_bed_lilac: plant("Cottage flower bed 1.2 x 0.5 m", "flower_bed_b", 1.2, 0.4, 0.5),
  veg_bed_sun: plant("Sunny flower bed 1.2 x 0.5 m", "flower_bed_c", 1.2, 0.4, 0.5),
  veg_groundcover: plant("Ground cover", "groundcover", 0.9, 0.18),
  veg_clover: plant("Clover patch", "clover", 0.6, 0.06),
  veg_rock: plant("Garden stone", "rock", 0.5, 0.3, 0.45),
  veg_rock_moss: plant("Mossy boulder", "rock_moss", 0.7, 0.4, 0.6),
};
