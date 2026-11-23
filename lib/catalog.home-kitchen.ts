import type { Def, Part } from "./catalog";
import { trailingIvy } from "./decor/plants.ts";
import { b, cy, sp, seam, turned, taperedLeg, MATT, WOOD, FAB, PLASTIC, CERAMIC, STONE, RUBBER, STEEL as BRUSHED, CHROME, BLACK_METAL, GLOSS } from "./partsKit.ts";

// The real kitchen / dining area: matte graphite fronts, white marble-look worktop, black arc handles,
// stainless fridge, cement-tile splashback, oak dining set. Front is +z for every unit.
const BASEC = "#44464b"; // base cabinet fronts
const WALLC = "#4c4e53"; // wall cabinet fronts
const TALLC = "#54565b"; // tall cabinet fronts
const PLINTH = "#e6e4df"; // white plinth / feet
const WT = "#f1f0ed"; // marble-look worktop
const BLK = "#17181a";
const STEEL = "#b9bcc0";
const STEEL_D = "#8e9298";
const OAK = "#c9a26b";
const TAUPE = "#6a665f";
const PI2 = Math.PI / 2;
const GAP = "#1e1f22"; // dark door gap / seam

// carcass + white plinth + 3 cm worktop. Fronts end at z=+0.29, handles at +0.30.
const baseShell = (w: number): Part[] => [
  b(0, 0.05, -0.03, w - 0.04, 0.1, 0.5, PLINTH, { ...MATT, bevel: 0.004 }),
  b(0, 0.495, -0.015, w, 0.79, 0.57, BASEC, { ...MATT, bevel: 0.006, m: true }),
  b(0, 0.905, 0, w, 0.03, 0.6, WT, { ...STONE, bevel: 0.006 }),
  seam(0, 0.884, 0.287, w - 0.02, 0.006, 0.004, GAP), // shadow line under the worktop
  seam(0, 0.102, 0.255, w - 0.05, 0.004, 0.004, GAP), // plinth / carcass gap
];
// door/drawer front with a black arc handle on its top edge
const front = (x: number, y: number, w: number, h: number): Part[] => [
  b(x, y, 0.28, w - 0.01, h - 0.01, 0.02, BASEC, { ...MATT, bevel: 0.006, m: true }),
  b(x, y + h / 2 - 0.045, 0.29, Math.min(0.16, w * 0.6), 0.012, 0.02, BLK, { ...BLACK_METAL, bevel: 0.004 }),
];

const MAG = ["#d94a3a", "#3d7fc4", "#e0b43a", "#4f9a5b", "#b5543a", "#e8e0d0", "#7a5a9a", "#2e8f9a", "#d97a2a", "#c23b5e"];
const magnets: Part[] = [
  [-0.2, 1.74], [-0.08, 1.77], [0.06, 1.72], [0.2, 1.76], [-0.14, 1.62], [0.0, 1.6],
  [0.14, 1.64], [-0.22, 1.5], [0.22, 1.55], [-0.1, 1.42], [0.08, 1.45], [0.22, 1.4],
  [-0.2, 1.3], [0.2, 1.22], [-0.18, 0.84], [0.1, 0.8], [0.22, 0.9],
].map(([x, y], i) => b(x, y, 0.32, 0.05 + (i % 3) * 0.01, 0.04 + (i % 2) * 0.01, 0.01, MAG[i % MAG.length], { tex: "plastic", rough: 0.4, bevel: 0.002 }));

// cement-tile splashback palette (grey / white with dark motifs)
const TILE_BG = ["#d6d4cf", "#a9a8a4", "#e4e2dd", "#bdbbb6"];
const TILE_MOTIF = ["#5f5e5b", "#eceae5", "#7a7976", "#4a4947"];

export const HOME_KITCHEN: Record<string, Def> = {
  kt_base_dark: {
    label: "Graphite base cabinet", brand: "Generic", cat: "Kitchen & dining", w: 0.6, d: 0.6, h: 0.92,
    parts: [
      ...baseShell(0.6), ...front(0, 0.48, 0.6, 0.76),
      b(-0.285, 0.74, 0.272, 0.01, 0.05, 0.012, STEEL_D, { ...BRUSHED, detail: 2 }), // hinges
      b(-0.285, 0.22, 0.272, 0.01, 0.05, 0.012, STEEL_D, { ...BRUSHED, detail: 2 }),
    ],
  },
  kt_base_drawers: {
    label: "Graphite 3-drawer base cabinet", brand: "Generic", cat: "Kitchen & dining", w: 0.45, d: 0.6, h: 0.92,
    parts: [
      ...baseShell(0.45), ...front(0, 0.76, 0.45, 0.24), ...front(0, 0.52, 0.45, 0.24), ...front(0, 0.27, 0.45, 0.26),
      ...[0.76, 0.52, 0.27].flatMap((y) => [b(-0.2, y + 0.01, 0.2, 0.012, 0.012, 0.012, STEEL_D, { ...BRUSHED, detail: 2 }), b(0.2, y + 0.01, 0.2, 0.012, 0.012, 0.012, STEEL_D, { ...BRUSHED, detail: 2 })]), // runner pins
    ],
  },
  kt_base_corner_filler: {
    label: "Graphite filler panel", brand: "Generic", cat: "Kitchen & dining", w: 0.15, d: 0.6, h: 0.92,
    parts: [...baseShell(0.15), b(0, 0.495, 0.28, 0.14, 0.77, 0.02, BASEC, { ...MATT, bevel: 0.006, m: true })],
  },
  kt_hob_oven: {
    label: "Hob with built-in oven", brand: "Generic", cat: "Kitchen & dining", w: 0.6, d: 0.6, h: 0.93,
    parts: [
      b(0, 0.05, -0.03, 0.56, 0.1, 0.5, PLINTH, { ...MATT, bevel: 0.004 }),
      b(0, 0.495, -0.015, 0.6, 0.79, 0.57, BASEC, { ...MATT, bevel: 0.006, m: true }),
      b(0, 0.905, 0, 0.6, 0.03, 0.6, WT, { ...STONE, bevel: 0.006 }),
      b(0, 0.923, 0, 0.58, 0.006, 0.5, BLK, { ...GLOSS, tex: "ceramic", bevel: 0.002 }), // black glass hob
      ...[[-0.14, -0.1, 0.13], [0.14, -0.1, 0.17], [-0.14, 0.12, 0.17], [0.14, 0.12, 0.13]].flatMap(([x, z, d]) => [
        cy(x, 0.927, z, d, 0.002, "#3d3f44", { ...BLACK_METAL }), // burner plate
        cy(x, 0.929, z, d * 0.8, 0.004, "#1b1c1e", { ...BLACK_METAL, detail: 1 }), // flame ring
        cy(x, 0.9295, z, d * 0.5, 0.007, "#4a4d52", { ...BRUSHED, detail: 1 }), // burner cap
      ]),
      b(0, 0.13, 0.28, 0.59, 0.2, 0.02, BASEC, { ...MATT, bevel: 0.006, m: true }), // drawer under the oven
      b(0, 0.215, 0.29, 0.16, 0.012, 0.02, BLK, { ...BLACK_METAL, bevel: 0.004 }),
      b(0, 0.5, 0.28, 0.58, 0.55, 0.02, "#0c0d0f", { ...GLOSS, bevel: 0.006 }), // oven glass door
      b(0, 0.8, 0.28, 0.58, 0.1, 0.02, "#2b2d30", { ...PLASTIC, bevel: 0.004 }), // control strip
      b(0, 0.51, 0.292, 0.46, 0.36, 0.004, "#1d242b", { ...GLOSS, bevel: 0 }), // window
      b(0, 0.74, 0.296, 0.5, 0.016, 0.016, STEEL, { ...BRUSHED, bevel: 0.006 }), // handle bar
      b(0.18, 0.815, 0.292, 0.1, 0.03, 0.004, "#5fc2ff", { glow: true, bevel: 0.001 }), // display
      cy(-0.18, 0.815, 0.292, 0.035, 0.015, STEEL_D, { ...BRUSHED, r: [PI2, 0, 0] }),
      ...[-0.1, -0.02, 0.06].map((x) => cy(x, 0.815, 0.292, 0.03, 0.015, "#6a6e74", { ...CHROME, r: [PI2, 0, 0], detail: 2 })), // knobs
      b(-0.22, 0.74, 0.289, 0.014, 0.014, 0.012, STEEL_D, { ...BRUSHED, detail: 2 }), // handle standoffs
      b(0.22, 0.74, 0.289, 0.014, 0.014, 0.012, STEEL_D, { ...BRUSHED, detail: 2 }),
      b(0.1, 0.56, 0.2945, 0.03, 0.26, 0.001, "#34434f", { ...GLOSS, bevel: 0, detail: 2 }), // window reflection
      seam(0, 0.231, 0.291, 0.58, 0.004, 0.004, GAP), // gap above the drawer
      seam(0, 0.233, 0.291, 0.58, 0.004, 0.004, GAP),
    ],
  },
  kt_sink_unit: {
    label: "Sink unit with black tap and dish rack", brand: "Generic", cat: "Kitchen & dining", w: 0.8, d: 0.6, h: 1.15,
    parts: [
      ...baseShell(0.8),
      ...front(-0.2, 0.76, 0.4, 0.24), ...front(-0.2, 0.4, 0.4, 0.48), // left: drawer + big drawer
      ...front(0.2, 0.48, 0.4, 0.76), // right: door
      b(0.2, 0.84, 0.292, 0.4, 0.012, 0.012, BLK, { ...BLACK_METAL, bevel: 0.003 }), // towel rail on the door
      b(0.02, 0.84, 0.285, 0.012, 0.012, 0.03, BLK, BLACK_METAL),
      b(0.38, 0.84, 0.285, 0.012, 0.012, 0.03, BLK, BLACK_METAL),
      b(0.14, 0.922, 0.03, 0.4, 0.004, 0.4, "#101113", { ...STONE, bevel: 0.012 }), // black granite sink
      b(0.14, 0.924, 0.03, 0.34, 0.002, 0.32, "#1c1d20", { ...STONE, rough: 0.2, bevel: 0.02 }), // bowl
      cy(0.14, 0.9255, 0.05, 0.05, 0.002, "#8e9298", { ...CHROME, detail: 1 }), // drain
      cy(0.14, 0.9265, 0.05, 0.018, 0.002, "#2a2b2e", { ...BLACK_METAL, detail: 2 }),
      cy(0.0, 1.0, -0.2, 0.03, 0.2, BLK, BLACK_METAL), // gooseneck tap
      sp(0.0, 1.1, -0.2, 0.03, BLK, BLACK_METAL),
      cy(0.06, 1.1, -0.2, 0.024, 0.12, BLK, { ...BLACK_METAL, r: [0, 0, PI2] }), // curved spout: arm, elbow, drop
      cy(0.1, 1.09, -0.2, 0.024, 0.04, BLK, { ...BLACK_METAL, r: [0, 0, -0.7] }),
      sp(0.12, 1.1, -0.2, 0.026, BLK, BLACK_METAL),
      cy(0.12, 1.06, -0.2, 0.024, 0.08, BLK, BLACK_METAL),
      cy(0.12, 1.015, -0.2, 0.03, 0.01, "#2a2b2e", { ...BLACK_METAL, detail: 1 }), // aerator
      cy(-0.04, 0.95, -0.2, 0.012, 0.05, BLK, { ...BLACK_METAL, r: [0, 0, 1.2], detail: 2 }), // lever
      // black wire dish rack with cutlery holder
      b(-0.24, 0.93, 0.0, 0.3, 0.02, 0.34, "#26272a", { ...BLACK_METAL, bevel: 0.004 }),
      ...[-0.12, -0.04, 0.04, 0.12].map((z) => b(-0.24, 0.99, z, 0.3, 0.1, 0.006, "#26272a", { ...BLACK_METAL, bevel: 0.002 })),
      b(-0.39, 0.99, 0, 0.01, 0.1, 0.34, "#26272a", { ...BLACK_METAL, bevel: 0.002 }),
      b(-0.09, 0.99, 0, 0.01, 0.1, 0.34, "#26272a", { ...BLACK_METAL, bevel: 0.002 }),
      turned(-0.3, 0.95, 0.05, [[0.04, 0], [0.05, 0.1]], BLK, { ...BLACK_METAL }), // cutlery holder
      ...[-0.325, -0.3, -0.275].map((x) => cy(x, 1.0, 0.05, 0.012, 0.09, STEEL, { ...BRUSHED, detail: 2 })), // cutlery
    ],
  },
  kt_wall_unit: {
    label: "Graphite wall cabinet", brand: "Generic", cat: "Kitchen & dining", w: 0.6, d: 0.35, h: 2.1, wall: true,
    parts: [
      b(0, 1.75, -0.015, 0.6, 0.7, 0.32, WALLC, { ...MATT, bevel: 0.006, m: true }),
      b(0, 1.75, 0.16, 0.59, 0.69, 0.02, WALLC, { ...MATT, bevel: 0.006, m: true }),
      b(0, 1.44, 0.165, 0.16, 0.012, 0.02, BLK, { ...BLACK_METAL, bevel: 0.004 }), // handle on the bottom edge
      seam(0, 1.402, 0.0, 0.6, 0.006, 0.32, GAP), // underside shadow
      b(-0.285, 1.7, 0.152, 0.01, 0.05, 0.012, STEEL_D, { ...BRUSHED, detail: 2 }), // hinges
      b(-0.285, 1.45, 0.152, 0.01, 0.05, 0.012, STEEL_D, { ...BRUSHED, detail: 2 }),
    ],
  },
  kt_wall_unit_hood: {
    label: "Graphite wall cabinet with extractor hood", brand: "Generic", cat: "Kitchen & dining", w: 0.6, d: 0.35, h: 2.1, wall: true,
    parts: [
      b(0, 1.76, -0.015, 0.6, 0.68, 0.32, WALLC, { ...MATT, bevel: 0.006, m: true }),
      b(0, 1.76, 0.16, 0.59, 0.67, 0.02, WALLC, { ...MATT, bevel: 0.006, m: true }),
      b(0, 1.445, 0.165, 0.16, 0.012, 0.02, BLK, { ...BLACK_METAL, bevel: 0.004 }),
      b(0, 1.36, -0.02, 0.58, 0.07, 0.3, BLK, { ...BLACK_METAL, bevel: 0.01 }), // slim black extractor
      b(0, 1.335, 0.14, 0.58, 0.015, 0.06, "#2a2b2e", { ...BLACK_METAL, bevel: 0.004 }),
      ...[-0.15, 0, 0.15].map((x) => seam(x, 1.3245, -0.02, 0.004, 0.002, 0.26, "#0b0b0c")), // filter slots
      ...[-0.15, 0.15].map((x) => sp(x, 1.323, 0.04, 0.03, "#fff3d0", { rough: 0.1, detail: 2 })), // lamps
    ],
  },
  kt_tall_dark: {
    label: "Tall graphite pantry cabinet", brand: "Generic", cat: "Kitchen & dining", w: 0.6, d: 0.6, h: 2.1,
    parts: [
      b(0, 0.05, -0.03, 0.56, 0.1, 0.5, PLINTH, { ...MATT, bevel: 0.004 }),
      b(0, 1.06, -0.015, 0.6, 2.0, 0.57, TALLC, { ...MATT, bevel: 0.006, m: true }),
      b(0, 0.69, 0.28, 0.59, 1.16, 0.02, TALLC, { ...MATT, bevel: 0.006, m: true }), // lower door (0.11-1.27)
      b(0, 1.69, 0.28, 0.59, 0.82, 0.02, TALLC, { ...MATT, bevel: 0.006, m: true }), // upper door
      b(-0.2, 1.31, 0.29, 0.14, 0.012, 0.02, BLK, { ...BLACK_METAL, bevel: 0.004 }), // two short bars at the split
      b(-0.2, 1.23, 0.29, 0.14, 0.012, 0.02, BLK, { ...BLACK_METAL, bevel: 0.004 }),
      seam(0, 1.275, 0.291, 0.58, 0.006, 0.004, GAP), // door gap
      seam(0, 0.102, 0.255, 0.55, 0.004, 0.004, GAP),
      ...[0.2, 0.69, 1.2, 1.5, 1.95].map((y) => b(0.285, y, 0.272, 0.01, 0.05, 0.012, STEEL_D, { ...BRUSHED, detail: 2 })), // hinges
    ],
  },
  kt_fridge_steel: {
    label: "Stainless fridge-freezer with magnets", brand: "Generic", cat: "Kitchen & dining", w: 0.6, d: 0.65, h: 1.85,
    parts: [
      b(0, 0.925, -0.015, 0.6, 1.85, 0.62, "#2a2c30", { ...BRUSHED, bevel: 0.02 }),
      b(0, 0.33, 0.31, 0.6, 0.64, 0.02, STEEL, { ...BRUSHED, bevel: 0.01 }), // freezer drawer
      b(0, 1.25, 0.31, 0.6, 1.18, 0.02, "#c4c7cb", { ...BRUSHED, bevel: 0.01 }), // fridge door
      b(0, 0.655, 0.31, 0.6, 0.012, 0.02, "#2a2c30", { ...BLACK_METAL, bevel: 0 }),
      cy(-0.26, 1.35, 0.321, 0.016, 0.5, "#d4d7db", { ...CHROME, rough: 0.2 }), // vertical bar handle (sink side)
      cy(0, 0.58, 0.321, 0.016, 0.4, "#d4d7db", { ...CHROME, rough: 0.2, r: [0, 0, PI2] }), // freezer pull
      b(0.05, 1.0, 0.318, 0.14, 0.2, 0.005, "#15171a", { ...PLASTIC, bevel: 0.008 }), // water dispenser alcove
      b(0.05, 0.97, 0.322, 0.04, 0.03, 0.004, "#7a8088", { ...PLASTIC, bevel: 0.002 }),
      b(0.12, 1.34, 0.322, 0.22, 0.17, 0.005, "#f6f6f4", { tex: "paint", rough: 0.3, bevel: 0.003 }), // planner board
      ...magnets,
      ...[1.13, 1.57].map((y) => b(-0.26, y, 0.3175, 0.012, 0.012, 0.01, "#9a9ea4", { ...CHROME, detail: 2 })), // handle posts
      ...[-0.18, 0.18].map((x) => b(x, 0.58, 0.3175, 0.012, 0.012, 0.01, "#9a9ea4", { ...CHROME, detail: 2 })),
      seam(0, 0.66, 0.321, 0.6, 0.004, 0.004, GAP), // door gap
      seam(-0.298, 1.25, 0.318, 0.004, 1.16, 0.006, GAP), // gasket edge
      seam(0.298, 1.25, 0.318, 0.004, 1.16, 0.006, GAP),
      b(0.29, 1.8, 0.318, 0.012, 0.06, 0.01, STEEL_D, { ...BRUSHED, detail: 2 }), // hinges
      b(0.29, 0.75, 0.318, 0.012, 0.06, 0.01, STEEL_D, { ...BRUSHED, detail: 2 }),
      b(0, 1.835, 0.321, 0.5, 0.004, 0.004, "#8e9298", { ...BRUSHED, detail: 1, bevel: 0 }), // top door trim
    ],
  },
  kt_boiler: {
    label: "Wall gas boiler", brand: "Generic", cat: "Kitchen & dining", w: 0.4, d: 0.28, h: 2.2, wall: true,
    parts: [
      b(0, 1.8, -0.01, 0.4, 0.72, 0.26, "#f4f4f2", { ...PLASTIC, rough: 0.35, bevel: 0.02 }),
      b(0, 1.47, 0.123, 0.3, 0.05, 0.006, "#2c3a44", { ...GLOSS, bevel: 0.004 }),
      b(-0.05, 1.47, 0.128, 0.07, 0.025, 0.004, "#7fd1ff", { glow: true, bevel: 0.001 }),
      b(-0.08, 1.8, 0.123, 0.08, 0.12, 0.004, "#b9402e", { tex: "paint", bevel: 0 }), // red sticker
      b(0.08, 1.85, 0.123, 0.08, 0.12, 0.004, "#dfe6ec", { tex: "paint", bevel: 0 }),
      cy(0.0, 2.18, 0, 0.1, 0.03, "#d8d8d4", { ...PLASTIC }), // flue
      cy(-0.08, 1.4, 0.0, 0.02, 0.1, "#d9b92a", { ...PLASTIC }), // gas pipe
      cy(0.0, 1.4, 0.0, 0.025, 0.1, "#c9ccd0", { ...BRUSHED }),
      cy(0.08, 1.4, 0.0, 0.025, 0.1, "#b8bcc2", { ...BRUSHED }),
      cy(0, 2.12, 0, 0.07, 0.12, "#e4e4e0", { ...PLASTIC, detail: 1 }), // flue pipe up to the ceiling
      seam(0, 1.52, 0.125, 0.36, 0.004, 0.004, "#c9ccd0"), // panel line
      cy(0.14, 1.47, 0.13, 0.04, 0.012, "#2c3a44", { ...PLASTIC, r: [PI2, 0, 0], detail: 2 }), // dial
      cy(0.14, 1.47, 0.137, 0.02, 0.006, "#cfd2d6", { ...CHROME, r: [PI2, 0, 0], detail: 2 }),
      ...[-0.08, 0, 0.08].map((x) => cy(x, 1.46, 0, 0.032, 0.012, "#9a9ea4", { ...BRUSHED, detail: 2 })), // nuts
      cy(-0.14, 1.47, 0.13, 0.035, 0.01, "#dfe6ec", { ...PLASTIC, r: [PI2, 0, 0], detail: 2 }), // pressure gauge
    ],
  },
  kt_backsplash: {
    label: "Cement-tile splashback", brand: "Generic", cat: "Kitchen & dining", w: 1.8, d: 0.04, h: 1.45, wall: true,
    parts: [
      b(0, 1.2, -0.005, 1.8, 0.5, 0.02, "#e4e2de", { ...CERAMIC, bevel: 0 }),
      ...Array.from({ length: 12 }, (_, i) => {
        const x = -0.75 + (i % 6) * 0.3;
        const y = 1.07 + Math.floor(i / 6) * 0.26;
        const k = (i * 5 + Math.floor(i / 6) * 3) % 4;
        return [
          b(x, y, 0.01, 0.29, 0.24, 0.01, TILE_BG[k], { ...CERAMIC, bevel: 0.003 }),
          b(x, y, 0.013, 0.12, 0.12, 0.004, TILE_MOTIF[k], { ...CERAMIC, bevel: 0, r: [0, 0, Math.PI / 4] }),
          b(x, y, 0.016, 0.05, 0.05, 0.004, TILE_BG[(k + 2) % 4], { ...CERAMIC, bevel: 0, r: [0, 0, Math.PI / 4] }),
        ];
      }).flat(),
      ...[-0.6, -0.3, 0, 0.3, 0.6].map((x) => seam(x, 1.2, 0.0095, 0.012, 0.5, 0.004, "#c9c7c2")), // grout columns
      seam(0, 0.953, 0.012, 1.8, 0.008, 0.006, "#dcdad6"), // silicone bead on the worktop
      seam(0, 1.2, 0.0095, 1.8, 0.012, 0.004, "#c9c7c2"), // grout row
    ],
  },
  kt_dining_table_oak: {
    label: "Oak dining table, black steel frame", brand: "Generic", cat: "Kitchen & dining", w: 1.2, d: 0.7, h: 0.76,
    parts: [
      b(0, 0.745, 0, 1.2, 0.03, 0.7, OAK, { ...WOOD, bevel: 0.007, m: true }),
      ...[-1, 1].flatMap((s) => [
        b(s * 0.5, 0.015, 0, 0.04, 0.03, 0.64, BLK, { ...BLACK_METAL, bevel: 0.006 }), // floor runner
        b(s * 0.5, 0.36, -0.3, 0.04, 0.7, 0.04, BLK, { ...BLACK_METAL, bevel: 0.006 }),
        b(s * 0.5, 0.36, 0.3, 0.04, 0.7, 0.04, BLK, { ...BLACK_METAL, bevel: 0.006 }),
        b(s * 0.5, 0.715, 0, 0.04, 0.03, 0.64, BLK, { ...BLACK_METAL, bevel: 0.006 }), // top rail
        b(s * 0.5, 0.685, -0.3, 0.04, 0.03, 0.04, BLK, { ...BLACK_METAL, bevel: 0.006, detail: 1 }), // corner gussets
        b(s * 0.5, 0.685, 0.3, 0.04, 0.03, 0.04, BLK, { ...BLACK_METAL, bevel: 0.006, detail: 1 }),
        ...[-0.3, 0.3].map((z) => cy(s * 0.5, 0.0035, z, 0.034, 0.007, "#2a2a2c", { ...RUBBER, detail: 2 })), // glides
      ]),
      b(0, 0.715, 0, 0.96, 0.03, 0.03, BLK, { ...BLACK_METAL, bevel: 0.005 }),
      b(0, 0.725, 0, 1.16, 0.012, 0.66, OAK, { ...WOOD, bevel: 0.004, m: true, detail: 1 }), // underside chamfer step
      ...[-0.4, 0.4].map((x) => b(x, 0.7, 0, 0.012, 0.03, 0.03, BLK, { ...BLACK_METAL, detail: 2 })), // bolt blocks
    ],
  },
  kt_dining_chair_dark: {
    label: "Graphite quilted dining chair", brand: "Generic", cat: "Kitchen & dining", w: 0.46, d: 0.5, h: 0.86,
    parts: [
      b(0, 0.46, 0.0, 0.44, 0.05, 0.42, "#3c4045", { ...FAB, bevel: 0.022, m: true }),
      b(0, 0.655, -0.2, 0.42, 0.4, 0.05, "#3c4045", { ...FAB, bevel: 0.022, m: true, r: [-0.12, 0, 0] }),
      b(0, 0.5, 0.0, 0.34, 0.03, 0.34, "#33373b", { ...FAB, bevel: 0.01, m: true }),
      b(-0.1, 0.665, -0.172, 0.012, 0.32, 0.006, "#2c2f33", { ...FAB, bevel: 0, r: [-0.12, 0, 0.5] }), // quilting seams
      b(0.1, 0.665, -0.172, 0.012, 0.32, 0.006, "#2c2f33", { ...FAB, bevel: 0, r: [-0.12, 0, -0.5] }),
      ...[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => taperedLeg(sx * 0.16, sz * 0.16, 0.44, 0.034, 0.022, OAK, { ...WOOD, r: [-sz * 0.14, 0, sx * 0.14] })),
      ),
      b(0, 0.34, 0, 0.3, 0.018, 0.016, OAK, { ...WOOD, bevel: 0.004, detail: 1 }), // side stretchers
      b(0, 0.3, 0.15, 0.3, 0.018, 0.016, OAK, { ...WOOD, bevel: 0.004, detail: 1 }),
      b(0, 0.485, 0.0, 0.446, 0.012, 0.426, "#2c2f33", { ...FAB, bevel: 0.004, detail: 1 }), // seat piping
      b(0, 0.82, -0.226, 0.4, 0.03, 0.03, "#3c4045", { ...FAB, bevel: 0.012, r: [-0.12, 0, 0], detail: 1 }), // back top roll
      ...[[-0.0, 0.7], [-0.2, 0.79], [0.2, 0.79], [-0.2, 0.61], [0.2, 0.61], [0, 0.52]].map(([x, y]) => sp(x * 0.5, y, -0.19, 0.016, "#2c2f33", { ...FAB, detail: 2, r: [-0.12, 0, 0] })), // quilt buttons
    ],
  },
  kt_microwave: {
    label: "Black microwave", brand: "Generic", cat: "Kitchen & dining", w: 0.46, d: 0.36, h: 0.28,
    parts: [
      b(0, 0.14, 0, 0.46, 0.28, 0.36, BLK, { ...PLASTIC, rough: 0.3, bevel: 0.01 }),
      b(-0.07, 0.14, 0.176, 0.3, 0.22, 0.006, "#23292e", { ...GLOSS, bevel: 0.004 }), // glass door
      b(-0.07, 0.14, 0.179, 0.26, 0.18, 0.002, "#14181b", { ...GLOSS, bevel: 0 }),
      b(0.16, 0.14, 0.178, 0.1, 0.22, 0.004, "#2a2b2e", { ...PLASTIC, bevel: 0.003 }), // control panel
      cy(0.16, 0.12, 0.173, 0.06, 0.012, "#4a4c50", { ...PLASTIC, r: [PI2, 0, 0] }), // dial
      b(0.16, 0.22, 0.177, 0.06, 0.025, 0.002, "#7fd1ff", { rough: 0.2, bevel: 0 }),
      b(0.1, 0.14, 0.18, 0.012, 0.18, 0.008, "#8e9298", { ...BRUSHED, bevel: 0.003, detail: 2 }), // door pull
      ...[-0.1, 0.02].map((x) => b(0.16 + x * 0.3, 0.07, 0.18, 0.018, 0.01, 0.004, "#5a5c60", { ...PLASTIC, bevel: 0.002, detail: 2 })), // buttons
      ...[-0.08, 0, 0.08].map((x) => seam(x, 0.2795, -0.05, 0.003, 0.002, 0.14, "#0b0b0c")), // vent slots
    ],
  },
  kt_air_fryer: {
    label: "Grey air fryer", brand: "Generic", cat: "Kitchen & dining", w: 0.3, d: 0.38, h: 0.33,
    parts: [
      b(0, 0.17, -0.02, 0.28, 0.32, 0.3, "#5b6067", { ...PLASTIC, rough: 0.35, bevel: 0.04 }),
      b(0, 0.31, 0.0, 0.28, 0.04, 0.3, BLK, { ...PLASTIC, rough: 0.3, bevel: 0.015 }), // black top with screen
      b(0, 0.31, 0.151, 0.1, 0.03, 0.004, "#9fd8ff", { rough: 0.2, bevel: 0.001 }),
      b(0, 0.12, 0.17, 0.26, 0.2, 0.04, "#6a7078", { ...PLASTIC, bevel: 0.02 }), // basket front
      b(0, 0.16, 0.17, 0.05, 0.1, 0.03, "#9ca1a8", { ...PLASTIC, bevel: 0.012 }), // handle
      seam(0, 0.225, 0.19, 0.26, 0.004, 0.004, "#2a2d31"), // basket gap
      ...[-0.06, 0, 0.06].map((x) => seam(x, 0.332, -0.08, 0.012, 0.002, 0.1, "#0b0b0c")), // top vents
      ...[-0.1, 0.1].map((x) => cy(x, 0.31, 0.12, 0.03, 0.006, "#2a2b2e", { ...PLASTIC, detail: 2 })), // buttons
    ],
  },
  kt_kettle: {
    label: "White kettle", brand: "Generic", cat: "Kitchen & dining", w: 0.2, d: 0.18, h: 0.25,
    parts: [
      cy(0, 0.01, 0, 0.16, 0.02, "#2a2b2e", { ...PLASTIC }),
      turned(0, 0.02, 0, [[0.072, 0], [0.078, 0.03], [0.077, 0.1], [0.068, 0.16], [0.055, 0.205]], "#f1efe9", { ...CERAMIC, rough: 0.3 }), // body
      turned(0, 0.225, 0, [[0.05, 0], [0.05, 0.01], [0.03, 0.02]], "#d8d6d0", { ...PLASTIC }), // lid
      b(0.085, 0.13, 0, 0.018, 0.2, 0.03, "#e3e1da", { ...PLASTIC, bevel: 0.007 }),
      b(0.075, 0.22, 0, 0.04, 0.016, 0.03, "#e3e1da", { ...PLASTIC, bevel: 0.006, detail: 1 }), // handle arms
      b(0.075, 0.045, 0, 0.04, 0.016, 0.03, "#e3e1da", { ...PLASTIC, bevel: 0.006, detail: 1 }),
      sp(0, 0.245, 0, 0.02, "#2a2b2e", { ...PLASTIC, detail: 1 }), // lid knob
      cy(-0.085, 0.12, 0, 0.024, 0.05, "#f1efe9", { ...CERAMIC, r: [0, 0, 0.9], detail: 1 }), // spout
      b(0.03, 0.2, 0.07, 0.018, 0.008, 0.002, "#3d7fc4", { rough: 0.2, bevel: 0, detail: 2 }), // power light
    ],
  },
  kt_plant_trailing: trailingIvy(),
  kt_rug_shag_black: {
    label: "Black shaggy rug", brand: "Generic", cat: "Decor", w: 2.0, d: 1.4, h: 0.03,
    parts: [
      b(0, 0.013, 0, 2.0, 0.026, 1.4, "#17171a", { ...FAB, bevel: 0.01 }),
      ...[[-0.7, -0.4], [-0.3, 0.15], [0.15, -0.4], [0.6, 0.1], [-0.65, 0.45], [0.3, 0.5], [0.8, -0.45], [-0.05, -0.05], [0.75, 0.5]].map(([x, z], i) =>
        b(x, 0.028, z, 0.24 + (i % 3) * 0.05, 0.004, 0.16 + (i % 2) * 0.06, i % 2 ? "#2a2a2e" : "#222226", { ...FAB, bevel: 0.002 }),
      ),
      ...[[-0.85, 0.1], [-0.45, -0.1], [0.4, -0.15], [0.05, 0.35], [-0.2, -0.5], [0.55, -0.55], [-0.5, 0.55], [0.9, 0.0]].map(([x, z], i) =>
        b(x, 0.0275, z, 0.2 + (i % 3) * 0.04, 0.003, 0.14 + (i % 2) * 0.05, i % 2 ? "#202024" : "#2d2d31", { ...FAB, bevel: 0.002, detail: 1 }),
      ),
      b(0, 0.0275, -0.67, 1.94, 0.003, 0.04, "#101012", { ...FAB, bevel: 0.001, detail: 1 }), // border strips
      b(0, 0.0275, 0.67, 1.94, 0.003, 0.04, "#101012", { ...FAB, bevel: 0.001, detail: 1 }),
      b(-0.97, 0.0275, 0, 0.04, 0.003, 1.3, "#101012", { ...FAB, bevel: 0.001, detail: 1 }),
      b(0.97, 0.0275, 0, 0.04, 0.003, 1.3, "#101012", { ...FAB, bevel: 0.001, detail: 1 }),
    ],
  },
  kt_ceiling_led_panel: {
    label: "Square LED ceiling light", brand: "Generic", cat: "Lighting & devices", w: 0.55, d: 0.55, h: 2.6, wall: true,
    light: { y: 2.5, color: "#fff6e8" },
    parts: [
      b(0, 2.58, 0, 0.5, 0.03, 0.5, "#fffaf0", { glow: true, rough: 0.4, bevel: 0.004 }),
      b(0, 2.56, 0, 0.34, 0.03, 0.34, "#fffdf6", { glow: true, rough: 0.4, bevel: 0.004, r: [0, Math.PI / 4, 0] }),
      b(0, 2.58, -0.265, 0.55, 0.04, 0.02, "#ecebe8", { ...PLASTIC, rough: 0.4, bevel: 0.004 }), // white frame
      b(0, 2.58, 0.265, 0.55, 0.04, 0.02, "#ecebe8", { ...PLASTIC, rough: 0.4, bevel: 0.004 }),
      b(-0.265, 2.58, 0, 0.02, 0.04, 0.51, "#ecebe8", { ...PLASTIC, rough: 0.4, bevel: 0.004 }),
      b(0.265, 2.58, 0, 0.02, 0.04, 0.51, "#ecebe8", { ...PLASTIC, rough: 0.4, bevel: 0.004 }),
      b(0, 2.598, 0, 0.5, 0.004, 0.5, "#dcdad6", { ...PLASTIC, detail: 1 }), // back plate
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.255, 2.563, sz * 0.255, 0.012, 0.006, "#b8bcc2", { ...CHROME, detail: 2 }))), // corner screws
    ],
  },
  kt_ceiling_light_small: {
    label: "Small angular ceiling light", brand: "Generic", cat: "Lighting & devices", w: 0.32, d: 0.18, h: 2.6, wall: true,
    light: { y: 2.5, color: "#fff6e8" },
    parts: [
      b(0, 2.58, 0, 0.3, 0.03, 0.14, "#fffaf0", { glow: true, rough: 0.4, bevel: 0.004 }),
      b(0, 2.56, 0.0, 0.32, 0.02, 0.02, "#ecebe8", { ...PLASTIC, rough: 0.4, bevel: 0.003 }),
      b(0, 2.595, -0.07, 0.3, 0.01, 0.04, "#ecebe8", { ...PLASTIC, rough: 0.4, bevel: 0.003 }),
      b(0, 2.545, 0.07, 0.3, 0.02, 0.02, "#ecebe8", { ...PLASTIC, rough: 0.4, bevel: 0.003 }),
      b(0, 2.597, 0.0, 0.3, 0.004, 0.14, "#dcdad6", { ...PLASTIC, detail: 1 }), // mounting plate
      ...[-0.13, 0.13].map((x) => cy(x, 2.585, 0, 0.012, 0.01, "#b8bcc2", { ...CHROME, detail: 2 })), // screws
    ],
  },
  kt_patio_door_sheer: {
    label: "Sheer curtain with taupe velvet side panels", brand: "Generic", cat: "Decor", w: 2.4, d: 0.12, h: 2.4, wall: true,
    parts: [
      b(0, 1.2, -0.03, 2.0, 2.3, 0.01, "#f4f4f2", { ...FAB, bevel: 0, layer: "sheer" }),
      cy(0, 2.37, -0.04, 0.025, 2.4, BLK, { ...BLACK_METAL, r: [0, 0, PI2] }),
      sp(-1.175, 2.37, -0.035, 0.05, BLK, BLACK_METAL),
      sp(1.175, 2.37, -0.035, 0.05, BLK, BLACK_METAL),
      ...[-1, 1].flatMap((s) => [
        b(s * 0.97, 1.17, 0.01, 0.08, 2.3, 0.1, TAUPE, { ...FAB, bevel: 0, layer: "blackout" }),
        b(s * 1.05, 1.17, 0.02, 0.08, 2.3, 0.08, "#5f5b55", { ...FAB, bevel: 0, layer: "blackout" }),
        b(s * 1.12, 1.17, 0.0, 0.07, 2.3, 0.1, "#726e66", { ...FAB, bevel: 0, layer: "blackout" }),
        b(s * 1.175, 1.17, 0.02, 0.04, 2.3, 0.08, "#5f5b55", { ...FAB, bevel: 0, layer: "blackout" }),
      ]),
      // appended rod details (cloth/pleat indices above stay put)
      ...[-1, 1].flatMap((s) => [
        b(s * 0.6, 2.37, -0.05, 0.02, 0.02, 0.03, BLK, { ...BLACK_METAL, detail: 1 }), // wall brackets
        cy(s * 1.2, 2.37, -0.035, 0.035, 0.03, BLK, { ...BLACK_METAL, r: [0, 0, PI2], detail: 1 }), // finial collars
        ...[0.97, 1.05, 1.12].map((x) => cy(s * x, 2.37, -0.04, 0.045, 0.012, "#2a2b2e", { ...BLACK_METAL, r: [0, 0, PI2], detail: 2 })), // rings
      ]),
    ],
  },
};
