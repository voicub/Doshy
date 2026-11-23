/**
 * Names of the houseplant / artificial-plant tiles of the leaf atlas (indices 32..63 of the 8 x 8 grid, see TILE in lib/vegBuilder.ts).
 * Painted by components/scene/foliageAtlasPlants.ts (+ foliageAtlasPlants2.ts), used by the builders in lib/vegPlants*.ts. Pure data.
 * In every tile the base of a card is at the bottom; the shapes are grey, the vertex colour of the plant gives the green.
 */
export const PLANT_TILE = {
  /** big violin-shaped leaf with pale veins */
  fiddle: 32,
  /** heart leaf with splits and holes */
  monstera: 33,
  /** glossy oval leaf with a midrib (rubber plant, ficus) */
  ficus: 34,
  /** sword blade with cross banding and a light edge */
  snake: 35,
  /** pinnate leaflets on a rachis (ZZ plant) */
  zz: 36,
  /** long arching pinnate palm frond (areca, kentia) */
  frond: 37,
  /** stiff spiky blade (yucca, dracaena, agave) */
  yucca: 38,
  /** heart leaf with pale variegation patches (pothos, philodendron) */
  heart: 39,
  /** oval leaf with feathered stripes */
  calathea: 40,
  /** thick toothed spike */
  aloe: 41,
  /** fat round succulent leaf */
  fat: 42,
  /** top view of a succulent rosette */
  rosette: 43,
  /** prickly-pear pad with spine dots */
  pad: 44,
  /** orchid flower spray */
  orchid: 45,
  /** serrated oval herb leaf */
  basil: 46,
  /** rosemary sprig of needle leaves */
  rosemary: 47,
  /** eucalyptus stem with round coin leaves */
  eucalyptus: 48,
  /** pampas plume */
  pampas: 49,
  /** cluster of tiny glossy leaves (boxwood) */
  boxwood: 50,
  /** cloud pad of small leaves (bonsai) */
  bonsai: 51,
  /** fine fern frond */
  fern: 52,
  /** artificial leaf with printed veins */
  fake: 53,
  /** rounded, veined, toothed leaf (mint) */
  mint: 54,
  /** round coin leaf on a petiole (pilea) */
  pilea: 55,
  /** arching striped blade (spider plant) */
  spider: 56,
  /** fan of fingers (lady palm) */
  fan: 57,
  /** lavender flower spike */
  lavender: 58,
  /** trailing vine with small heart leaves */
  vine: 59,
  /** dried grass / wheat stem */
  dry: 60,
  /** small artificial blooms */
  blooms: 61,
  /** moss carpet */
  moss: 62,
  /** cactus spine tuft */
  spines: 63,
} as const;
