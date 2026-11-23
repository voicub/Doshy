import { BASE_DECOR } from "./catalog.base-decor.ts";
import { BASE_DINING } from "./catalog.base-dining.ts";
import { BASE_LIVING } from "./catalog.base-living.ts";
import { ANIMALS } from "./catalog.animals.ts";
import { APPLIANCES } from "./catalog.appliances.ts";
import { GARDEN } from "./catalog.garden.ts";
import { CARS } from "./catalog.cars.ts";
import { DECOR } from "./catalog.decor.ts";
import { ENERGY } from "./catalog.energy.ts";
import { GARAGE } from "./catalog.garage.ts";
import { HOME_BATH } from "./catalog.home-bath.ts";
import { HOME_BEDROOM } from "./catalog.home-bedroom.ts";
import { HOME_KITCHEN } from "./catalog.home-kitchen.ts";
import { HOME_LIVING } from "./catalog.home-living.ts";
import { HOME_OFFICE } from "./catalog.home-office.ts";
import { PLANTS_V2 } from "./catalog.plants.ts";
import { OUTDOOR } from "./catalog.outdoor.ts";
import { OUTDOOR_BASIC } from "./catalog.outdoor-basic.ts";
import { SECURITY } from "./catalog.security.ts";
import { SEASONAL } from "./catalog.seasonal.ts";
import { SENSORS } from "./catalog.sensors.ts";
import { STAIRS } from "./catalog.stairs.ts";
import { VEGETATION, vegPart } from "./catalog.vegetation.ts";
import type { CarSpec } from "./cars.ts";
import type { CritterSpec } from "./critters.ts";
import type { Species } from "./vegetation.ts";
// Furniture is built from boxes/cylinders/spheres so no model files are needed.
// Part coords are metres, local to the footprint centre; y is the part's centre height above the floor.
// Back of furniture is -z, front is +z. `m` parts are recoloured by the user's finish choice.
export const CATEGORIES = ["Living", "Bedroom", "Kitchen & dining", "Bathroom", "Office", "Appliances", "Climate", "Lighting & devices", "Sensors", "Decor", "Seasonal", "Stairs", "Garage & EV", "Energy", "Security", "Outdoor", "Garden", "Animals"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Part = {
  p: [number, number, number];
  s: [number, number, number]; // box: x,y,z. cyl: diameter=s[0], height=s[1]. sph: diameter=s[0]
  c: string;
  shape?: "box" | "cyl" | "sph" | "lathe";
  veg?: { species: Species; seed?: number }; // a procedural plant (lib/vegetation.ts) instead of a solid: its mesh is stretched to the box `s` standing on y = p[1] - s[1] / 2; `seed` picks the variant (0..3); `c` is only the top-down colour; `m` tints its leaves by the item's finish
  m?: true;
  glow?: true;
  glass?: true; // see-through reflective glass (tempered railing panels, picture windows): drawn transparent, casts no shadow
  r?: [number, number, number];
  spin?: { axis: "x" | "y" | "z"; rpm: number; swing?: number; pivot?: number }; // turns about its own centre while the item's linked entity is active (fans, washer drum). With `swing` (degrees) it oscillates +-swing at rpm cycles/min instead of turning (AC louvre flap). `pivot` = height (m, item coords) of the hinge the part hangs from instead of its own centre (swing seats, hanging baskets, chimes)
  twinkle?: number; // glow part that shimmers while lit (fairy lights, candle flames): 1 = gentle fairy-light pace, 2 = quick candle flicker. Steady under prefers-reduced-motion
  // ---- realism (all optional; a part without them looks exactly as before) -------------------------------------------------------------------
  /** Edge rounding radius in metres for a box (a cushion 0.05, a table top 0.008). Default: automatic, a small share of the part's thinnest side, only when the quality tier has bevels. 0 = keep sharp edges (glass, tiny parts). */
  bevel?: number;
  /** Material class: picks the procedural texture, roughness and sheen (lib/materialsPbr.ts): grain for wood, weave for fabric, pores for leather, brushed metal, matt plastic, glazed ceramic, stone, plaster paint, rubber, foam. Default: guessed from the colour. */
  tex?: "wood" | "fabric" | "leather" | "metal" | "plastic" | "ceramic" | "stone" | "paint" | "rubber" | "foam";
  /** Roughness 0..1 and metalness 0..1 overrides. */
  rough?: number;
  metal?: number;
  /** shape "lathe": a solid of revolution about the part's vertical axis (lamp shades, vases, bowls, bottles, pots, table legs): [radius, height] pairs in metres from the base (y = 0) upwards; `s` = [diameter of the widest point, height, same diameter] only sets the footprint, the profile is used as given and scaled to `s`. */
  lathe?: [number, number][];
  /** Detail level this part belongs to: 1 = trims and mouldings, 2 = small details (stitching, handles, buttons, knobs). Shown only when the quality tier's `detail` knob (lib/quality.ts) is at least this; absent = always shown. Keep every part that defines the silhouette and footprint WITHOUT this flag. */
  detail?: 1 | 2;
  /** Window curtains only: which cloth layer this part is. "sheer" = the light see-through curtain (net, voile), "blackout" = the heavy sun-blocking one (velvet, dark pleats). Each layer opens and closes by its own Home Assistant entity (lib/curtain.ts). A curtain part without it is hardware (rod, rings, tie-backs) and never moves. */
  layer?: "sheer" | "blackout";
};
export type Def = {
  label: string;
  brand: "IKEA" | "JYSK" | "Generic" | (string & {}); // maker (cars: Mitsubishi, Skoda ...)
  cat: Category;
  w: number;
  d: number;
  h: number;
  parts: Part[];
  light?: { y: number; color: string; k?: number /* intensity scale (default 1) for fixtures that share a spot, e.g. the three heads of one lamp */ };
  wall?: true; // mounted on a wall above the cut-away height: hidden when walls are lowered
  family?: string; // modular system whose pieces snap together in the editor (e.g. "eket")
  solid?: true; // part of the building (column, plumbing riser, partition furniture): other items cannot overlap it
  pillar?: true; // a structural pillar (column, plumbing riser): edited in Plan mode like a wall, hidden from the furniture catalog and not selectable in Furniture mode. Implies `solid`
  legacy?: true; // still loads and draws (saved plans keep their pieces) but is no longer offered in the furniture catalog: the 178 named car models, replaced by one car per chassis
  /** A staircase: "up" climbs to the level above and cuts a hole in its floor, "down" goes to the level below through its own floor (the basement stair), "step" is a few steps outdoors or at a door (no hole). The item is as tall as the storey it spans (lib/voids.ts stairRise). */
  stair?: "up" | "down" | "step";
  model?: { id: string; missing?: true }; // a piece the user imported as a 3D model (id = lib/modelStore blob); `missing` marks a stand-in box for a custom piece this device does not have
  car?: CarSpec; // a car: drawn as procedural bodywork (components/scene/CarMesh.tsx) instead of `parts`, which are then only a coarse stand-in
  tags?: string; // extra words the catalog search matches (cars: body style, fuel)
  wind?: true; // its `spin` parts are driven by the weather (live wind) instead of the linked entity: windmills, spinners, hanging swings and chimes
  critter?: CritterSpec; // a living animal (lib/critters.ts): `parts` is its standing pose, drawn instead as bones that breathe, wag, peck and (when the user lets it) wander (components/scene/Critter.tsx)
};

type Opt = { m?: true; glow?: true; r?: [number, number, number]; shape?: Part["shape"]; spin?: Part["spin"] };
const b = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, o?: Opt): Part => ({
  p: [x, y, z],
  s: [sx, sy, sz],
  c,
  ...o,
});
const LEAF2 = "#4d7d3d";
const ORANGE = "#b8742c";
const BRICK = "#8c4a3e";

const BASE: Record<string, Def> = {
  // ---------- Outdoor ----------
  tree_round: {
    label: "Round tree", brand: "Generic", cat: "Outdoor", w: 1.8, d: 1.8, h: 3.2,
    parts: [
      vegPart("apple", 1.8, 3.2, 1.8, 0),
    ],
  },
  tree_conifer: {
    label: "Conifer tree", brand: "Generic", cat: "Outdoor", w: 1.0, d: 1.0, h: 3.5,
    parts: [
      vegPart("spruce", 1.0, 3.5, 1.0, 1),
    ],
  },
  bush: {
    label: "Bush", brand: "Generic", cat: "Outdoor", w: 0.9, d: 0.9, h: 0.8,
    parts: [
      vegPart("shrub", 0.9, 0.8, 0.9, 0),
    ],
  },
  hedge: {
    label: "Hedge", brand: "Generic", cat: "Outdoor", w: 2.0, d: 0.6, h: 1.2,
    parts: [
      vegPart("hedge_long", 2.0, 1.2, 0.6, 0),
    ],
  },
  flower_bed: {
    label: "Flower bed", brand: "Generic", cat: "Outdoor", w: 1.6, d: 0.8, h: 0.38,
    parts: [
      b(0, 0.1, -0.375, 1.6, 0.2, 0.05, BRICK),
      b(0, 0.1, 0.375, 1.6, 0.2, 0.05, BRICK),
      b(-0.775, 0.1, 0, 0.05, 0.2, 0.7, BRICK),
      b(0.775, 0.1, 0, 0.05, 0.2, 0.7, BRICK),
      vegPart("flower_bed", 1.5, 0.38, 0.7, 0),
    ],
  },
  paving: {
    label: "Brick paving 2x2", brand: "Generic", cat: "Outdoor", w: 2.0, d: 2.0, h: 0.04,
    parts: [
      b(0, 0.0175, 0, 2.0, 0.035, 2.0, BRICK, { m: true }),
      ...[-0.75, -0.25, 0.25, 0.75].map((z) => b(0, 0.0375, z, 2.0, 0.005, 0.025, "#6e382f")),
      ...[-0.5, 0, 0.5].flatMap((z, i) => [-0.5, 0.5].map((x) => b(x + (i % 2 ? 0.25 : -0.25), 0.0375, z, 0.025, 0.005, 0.5, "#6e382f"))),
      b(-0.6, 0.0375, -0.3, 0.14, 0.005, 0.09, ORANGE, { r: [0, 0.6, 0] }),
      b(0.5, 0.0375, 0.6, 0.12, 0.005, 0.09, "#a65a2a", { r: [0, -0.4, 0] }),
      b(0.1, 0.0375, -0.7, 0.12, 0.005, 0.09, "#c9892c", { r: [0, 1.0, 0] }),
      b(-0.2, 0.0375, 0.8, 0.12, 0.005, 0.08, ORANGE, { r: [0, 0.2, 0] }),
      b(0.8, 0.0375, -0.2, 0.1, 0.005, 0.08, "#8a5a2a", { r: [0, 0.8, 0] }),
    ],
  },
  lawn_patch: {
    label: "Lawn patch 3x3", brand: "Generic", cat: "Outdoor", w: 3.0, d: 3.0, h: 0.04,
    parts: [
      b(0, 0.0175, 0, 3.0, 0.035, 3.0, LEAF2, { m: true }),
      b(-1.0, 0.0375, 0, 1.0, 0.005, 3.0, "#568a45"),
      b(0, 0.0375, 0, 1.0, 0.005, 3.0, "#45742f"),
      b(1.0, 0.0375, 0, 1.0, 0.005, 3.0, "#568a45"),
      b(-0.7, 0.0375, -0.9, 0.05, 0.005, 0.05, "#e8e0d0"),
      b(0.6, 0.0375, 0.5, 0.05, 0.005, 0.05, "#e8e0d0"),
      b(-0.3, 0.0375, 1.0, 0.05, 0.005, 0.05, "#d9a02c"),
      b(1.1, 0.0375, -0.6, 0.05, 0.005, 0.05, "#e8e0d0"),
      b(0.9, 0.0375, 1.2, 0.12, 0.005, 0.09, ORANGE, { r: [0, 0.6, 0] }),
      b(-1.1, 0.0375, 0.4, 0.12, 0.005, 0.09, "#a65a2a", { r: [0, 0.2, 0] }),
    ],
  },
  ...OUTDOOR_BASIC,
  leaf_pile: {
    label: "Leaf pile", brand: "Generic", cat: "Outdoor", w: 0.8, d: 0.8, h: 0.12,
    parts: [
      b(0, 0.04, 0, 0.6, 0.08, 0.55, ORANGE, { shape: "sph" }),
      b(0.15, 0.06, 0.1, 0.4, 0.1, 0.35, "#a65a2a", { shape: "sph" }),
      b(-0.15, 0.05, -0.1, 0.4, 0.09, 0.35, "#c9892c", { shape: "sph" }),
      b(0.0, 0.08, 0.0, 0.25, 0.08, 0.22, "#8a5a2a", { shape: "sph" }),
      b(0.28, 0.025, -0.25, 0.22, 0.04, 0.18, "#c9892c", { shape: "sph" }),
      b(-0.3, 0.025, 0.28, 0.2, 0.04, 0.16, "#a65a2a", { shape: "sph" }),
      b(0.3, 0.025, 0.3, 0.16, 0.03, 0.14, ORANGE, { shape: "sph" }),
    ],
  },
  grass_tuft: {
    label: "Grass tuft", brand: "Generic", cat: "Outdoor", w: 0.4, d: 0.4, h: 0.3,
    parts: [
      vegPart("tuft", 0.4, 0.3, 0.4, 0),
    ],
  },
};

export const CATALOG: Record<string, Def> = { ...BASE, ...BASE_LIVING, ...BASE_DINING, ...BASE_DECOR, ...HOME_OFFICE, ...HOME_LIVING, ...HOME_KITCHEN, ...HOME_BATH, ...HOME_BEDROOM, ...APPLIANCES, ...DECOR, ...PLANTS_V2, ...SEASONAL, ...STAIRS, ...GARAGE, ...CARS, ...ENERGY, ...SECURITY, ...SENSORS, ...OUTDOOR, ...VEGETATION, ...GARDEN, ...ANIMALS };
export const KINDS = Object.keys(CATALOG);
/** Is this kind a structural pillar (a column or the plumbing riser)? Pillars belong to the Plan mode: see `Def.pillar`. */
export const isPillar = (kind: string) => !!CATALOG[kind]?.pillar;

export const FINISHES: { name: string; c: string }[] = [
  { name: "White", c: "#f2f1ee" },
  { name: "Oak", c: "#c9a26b" },
  { name: "Birch", c: "#e0c79a" },
  { name: "Black-brown", c: "#3b2f2a" },
  { name: "Grey", c: "#8d9299" },
  { name: "Anthracite", c: "#3a3d42" },
  { name: "Walnut", c: "#6b4a35" },
  { name: "Beige", c: "#cdbfa6" },
  { name: "Blue", c: "#4a6b8a" },
  { name: "Green", c: "#5b7a5e" },
];
