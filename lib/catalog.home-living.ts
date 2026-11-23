import type { Def, Part } from "./catalog";
import { b, BLACK_METAL, bowlProfile, CERAMIC, CHROME, cushion, cy, FAB, handleBar, LEATHER, MATT, PLASTIC, pillow, RUBBER, seam, sp, STEEL, STONE, taperedLeg, turned, vaseProfile, WOOD, GLOSS, drawerFront } from "./partsKit.ts";

const PI2 = Math.PI / 2;

const BLACK = "#1f2125";
const KNOB = "#cfc8b4";

// ---- IKEA KALLAX 3 columns x 4 rows (photo: bottom row doors, 2nd row two half-drawers per cube, top two rows open) ----
const KW = 1.12, KD = 0.39, KT = 0.03, KH = 1.47;
const KOAK = "#cbae82";
const kInner = (KW - 4 * KT) / 3;
const kRowH = (KH - 5 * KT) / 4;
const kRowY = (r: number) => KT + r * (kRowH + KT) + kRowH / 2;
const kColX = (c: number) => -KW / 2 + KT + c * (kInner + KT) + kInner / 2;
const kallaxParts: Part[] = [
  b(0, KH / 2, -KD / 2 + 0.005, KW, KH, 0.01, "#b89a70", { ...WOOD, bevel: 0 }),
  b(-KW / 2 + KT / 2, KH / 2, 0, KT, KH, KD, KOAK, { ...WOOD, m: true, bevel: 0.006 }),
  b(KW / 2 - KT / 2, KH / 2, 0, KT, KH, KD, KOAK, { ...WOOD, m: true, bevel: 0.006 }),
  ...[0, 1, 2, 3, 4].map((i) => b(0, KT / 2 + i * (kRowH + KT), 0, KW, KT, KD, KOAK, { ...WOOD, m: true, bevel: 0.006 })),
];
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 2; c++) {
    kallaxParts.push(b(-KW / 2 + KT + (c + 1) * kInner + (c + 0.5) * KT, kRowY(r), 0, KT, kRowH, KD, KOAK, { ...WOOD, m: true, bevel: 0.005 }));
  }
}
for (let c = 0; c < 3; c++) {
  const x = kColX(c);
  kallaxParts.push(b(x, kRowY(0), 0.175, kInner - 0.01, kRowH - 0.01, 0.02, KOAK, { ...WOOD, m: true, bevel: 0.005 }), sp(x, kRowY(0) + 0.07, 0.185, 0.02, KNOB, CHROME));
  const dh = (kRowH - 0.014) / 2;
  for (const dy of [-1, 1]) {
    const y = kRowY(1) + (dy * (dh + 0.004)) / 2;
    kallaxParts.push(b(x, y, 0.175, kInner - 0.01, dh, 0.02, KOAK, { ...WOOD, m: true, bevel: 0.005 }), sp(x, y, 0.185, 0.02, KNOB, CHROME));
  }
}
// a few things in the open cubes (detail): books, a vase, a basket
const bookCols = ["#8a3b36", "#2f4a63", "#d8cfb8", "#4f6b4a", "#c49a45", "#444952"];
bookCols.forEach((c, i) => kallaxParts.push(b(kColX(0) - 0.13 + i * 0.026, kRowY(2) - kRowH / 2 + 0.115, 0.03, 0.022, 0.2 + (i % 3) * 0.02, 0.19, c, { ...MATT, bevel: 0.002, detail: 2 })));
kallaxParts.push(turned(kColX(2), kRowY(3) - kRowH / 2, 0, vaseProfile(0.05, 0.22), "#e8e2d4", { ...CERAMIC, detail: 1 }));
kallaxParts.push(cy(kColX(1), kRowY(2) - kRowH / 2 + 0.1, 0.0, 0.26, 0.2, "#a58b64", { ...WOOD, rough: 0.9, detail: 1 }));

const FABC = "#4a4d52";
const FABC2 = "#424549";
const PILLOW = "#55585e";
const WOODD = "#c8964f";
const SBOARD = "#c0904a";
const GREY_BOX = "#8e9196";

// ---- IKEA KALLSÖ (solid pine, grey stain; the hall bench with shoe storage and the hat rack) ----
// One builder per real piece, so the exact kinds and the multi-unit hall pieces below share every part. Measures from the IKEA drawings.
const K_PINE = "#cba86d";
const K_PINE_SLAT = "#c0a068";
const K_GREY = "#8c8e8f";
const K_BLACK = "#26282b";
const K_PAD = "#7aa070";
const kPine = { ...WOOD, m: true as const };
const kStain = { ...WOOD, rough: 0.7 }; // grey stain leaves the grain visible

/**
 * KALLSÖ bench with shoe storage, `w` wide (80 cm) and 38 cm deep, centred at x. `k` squeezes the height (56 cm at 1): the hall bench needs the seat under 0.54 m
 * so the bounds saved plans were placed with stay put (lib/catalogBounds.golden.json).
 * Each side is an A of two crossing legs (the depth is the A's span); two slatted shelves run between the legs, slats along the length.
 */
function kallsoBench(x: number, w: number, k = 1): Part[] {
  const D = 0.38, T = 0.03, top = 0.56 * k, legH = top - T, spread = 0.19, tilt = Math.atan(spread / legH), legLen = Math.hypot(spread, legH);
  const legs = [-1, 1].flatMap((sx) => [-1, 1].map((s) => b(x + sx * (w / 2 - 0.06), legH / 2, -s * (D / 2 - 0.03 - spread / 2), 0.04, legLen, 0.055, K_GREY, { ...kStain, r: [s * tilt, 0, 0] })));
  // shelf: front and back board stand proud of the slats; `t` = top of the shelf
  const shelf = (t: number): Part[] => [
    ...[-1, 1].map((s) => b(x, t - 0.02, s * 0.14, w - 0.04, 0.04, 0.02, K_PINE, { ...kPine, bevel: 0.004 })),
    ...[-0.09, -0.03, 0.03, 0.09].map((z) => b(x, t - 0.025, z, w - 0.06, 0.02, 0.04, K_PINE_SLAT, { ...kPine, bevel: 0.002 })),
  ];
  return [
    b(x, top - T / 2, 0, w, T, D, K_PINE, { ...kPine, bevel: 0.006 }),
    ...[-1, 1].map((s) => b(x, top - T - 0.03, s * (D / 2 - 0.045), w - 0.08, 0.06, 0.02, K_PINE, { ...kPine, bevel: 0.004 })),
    ...legs,
    ...shelf(0.12 * k),
    ...shelf(0.31 * k),
    // the gusset where the legs cross under the top
    ...[-1, 1].map((sx) => b(x + sx * (w / 2 - 0.06), top - T - 0.025, 0, 0.04, 0.05, 0.05, K_GREY, { ...kStain, detail: 1 })),
  ];
}

/** The screws through the legs: small enough to leave out of the multi-unit pieces. */
const kallsoBenchScrews = (x: number, w: number): Part[] =>
  [-1, 1].flatMap((sx) => [-1, 1].map((s) => sp(x + sx * (w / 2 - 0.04), 0.3, -s * 0.053, 0.012, "#c8c8c8", { ...STEEL, detail: 2 })));

/**
 * KALLSÖ hat rack, `w` wide (80 cm), 32 cm deep and 24 cm tall: a pine shelf on a grey back panel with two grey brackets, a pine rail hanging 7 cm below the shelf
 * on two black brackets and three black double hooks. `top` = height of the shelf's top face, `zBack` = the wall plane.
 */
function kallsoRack(x: number, w: number, top: number, zBack: number): Part[] {
  const D = 0.32, T = 0.025, panelH = 0.215, panelT = 0.018, panelW = w - 0.06;
  const under = top - T;
  const zRail = zBack + 0.26;
  const bracket = (sx: number): Part[] => [
    b(x + sx * (panelW / 2 - 0.03), under - 0.095, zBack + panelT + 0.06, 0.018, 0.19, 0.12, K_GREY, { ...kStain, bevel: 0.002 }),
    b(x + sx * (panelW / 2 - 0.03), under - 0.045, zBack + panelT + 0.15, 0.018, 0.09, 0.12, K_GREY, { ...kStain, bevel: 0.002 }),
  ];
  const hook = (hx: number): Part[] => [
    cy(hx, under - 0.15, zBack + panelT + 0.006, 0.04, 0.012, K_BLACK, { ...BLACK_METAL, r: [PI2, 0, 0] }),
    b(hx, under - 0.15, zBack + panelT + 0.03, 0.012, 0.012, 0.05, K_BLACK, { ...BLACK_METAL }),
    sp(hx, under - 0.135, zBack + panelT + 0.052, 0.022, K_BLACK, { ...BLACK_METAL, detail: 2 }),
  ];
  return [
    b(x, top - T / 2, zBack + D / 2, w, T, D, K_PINE, { ...kPine, bevel: 0.006 }),
    b(x, under - panelH / 2, zBack + panelT / 2, panelW, panelH, panelT, K_GREY, { ...kStain, bevel: 0.002 }),
    ...bracket(-1),
    ...bracket(1),
    cy(x, under - 0.07, zRail, 0.025, panelW - 0.02, "#d9ac66", { ...WOOD, r: [0, 0, PI2] }),
    ...[-1, 1].map((sx) => b(x + sx * (panelW / 2 - 0.005), under - 0.035, zRail, 0.012, 0.07, 0.03, K_BLACK, { ...BLACK_METAL })),
    ...[-1, 0, 1].flatMap((i) => hook(x + i * w * 0.35)),
  ];
}

// shaggy-rug pile: rows of tufts across the rug (detail 1)
const tufts = Array.from({ length: 6 }, (_, i) => b(0, 0.037, -0.9 + i * 0.36, 1.44, 0.012, 0.03, i % 2 ? "#1a1b1e" : "#2e3034", { ...FAB, m: true, bevel: 0.005, detail: 1 }));

// tilted shoe-drawer handle: a small bar at the top lip of a drawer rotated by `tilt` about x
const tilt = 0.15;
const drawerLip = (y: number): Part => b(0, y + 0.17 * Math.cos(tilt) - 0.012, 0.05 + 0.17 * Math.sin(tilt) + 0.025, 0.16, 0.014, 0.012, "#b8bcc2", { ...STEEL, bevel: 0.003, r: [tilt, 0, 0], detail: 2 });

export const HOME_LIVING: Record<string, Def> = {
  lv_friheten_corner: {
    label: "FRIHETEN corner sofa bed", brand: "IKEA", cat: "Living", w: 2.3, d: 1.51, h: 0.85,
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 1.05, sz * 0.7, 0.1, 0.07, 0.045, BLACK, { ...BLACK_METAL }))),
      b(0, 0.24, -0.305, 2.3, 0.28, 0.9, FABC, { ...FAB, m: true, bevel: 0.03 }), // main base
      b(0.755, 0.24, 0.45, 0.79, 0.28, 0.61, FABC, { ...FAB, m: true, bevel: 0.03 }), // chaise base
      b(0, 0.52, -0.68, 2.3, 0.28, 0.15, FABC, { ...FAB, m: true, bevel: 0.04 }), // back rest frame
      b(-1.075, 0.46, -0.305, 0.15, 0.4, 0.9, FABC, { ...FAB, m: true, bevel: 0.05 }), // left arm
      b(1.1, 0.46, -0.305, 0.1, 0.4, 0.9, FABC, { ...FAB, m: true, bevel: 0.04 }), // right arm
      b(1.1, 0.4, 0.45, 0.1, 0.24, 0.61, FABC, { ...FAB, m: true, bevel: 0.035 }), // chaise side
      ...[0, 1, 2].map((i) => cushion(-0.67 + i * 0.67, 0.45, -0.19, 0.65, 0.14, 0.7, FABC2, { m: true })), // seat cushions
      cushion(0.7, 0.45, 0.45, 0.66, 0.14, 0.61, FABC2, { m: true }), // chaise cushion
      ...[-0.68, -0.02, 0.64].map((x) => pillow(x, 0.62, -0.5, 0.62, 0.4, 0.16, PILLOW, { m: true, bevel: 0.07, r: [-0.2, 0, 0] })), // big back cushions
      // scatter pillows and a throw (own colours, not the finish)
      pillow(-0.85, 0.66, -0.36, 0.38, 0.38, 0.12, "#8c8f94", { r: [-0.5, 0.35, 0] }),
      pillow(0.3, 0.66, -0.4, 0.34, 0.34, 0.11, "#b9a68a", { r: [-0.45, -0.3, 0.1] }),
      b(0.72, 0.535, 0.46, 0.5, 0.025, 0.46, "#a78f74", { ...FAB, bevel: 0.012, r: [0, 0.12, 0] }),
      b(0.72, 0.56, 0.4, 0.4, 0.03, 0.3, "#a78f74", { ...FAB, bevel: 0.014, r: [0, 0.12, 0] }),
      // trims (detail 1): piping on the cushion fronts, seams between them and on the back, base skirt gaps
      ...[0, 1, 2].map((i) => seam(-0.67 + i * 0.67, 0.5, 0.162, 0.6, 0.004, 0.006, "#35373b")),
      seam(0.7, 0.5, 0.757, 0.6, 0.004, 0.006, "#35373b"),
      seam(0, 0.35, 0.147, 2.2, 0.006, 0.006, "#2b2d30"),
      seam(0.755, 0.35, 0.757, 0.74, 0.006, 0.006, "#2b2d30"),
      ...[-0.35, 0.31].map((x) => seam(x, 0.62, -0.419, 0.004, 0.3, 0.006, "#35373b", { r: [-0.2, 0, 0] })),
      // armrest stitching (detail 2)
      b(-1.15, 0.5, -0.305, 0.004, 0.006, 0.8, "#33353a", { detail: 2, bevel: 0 }),
      b(1.15, 0.52, -0.305, 0.004, 0.006, 0.8, "#33353a", { detail: 2, bevel: 0 }),
    ],
  },

  lv_kallax_oak_3x4: {
    label: "KALLAX 3x4 shelf, oak effect", brand: "IKEA", cat: "Living", w: KW, d: KD, h: KH,
    parts: kallaxParts,
  },

  // SONHULT nesting tables: two separate pieces (the low one slides under the tall one), each placed on its own
  lv_coffee_table_tall: {
    label: "SONHULT nesting table, tall (wood top)", brand: "IKEA", cat: "Living", w: 0.6, d: 0.6, h: 0.45,
    parts: [
      b(0, 0.43, 0, 0.6, 0.04, 0.6, "#7b5a3f", { ...WOOD, m: true, bevel: 0.01 }),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.26, sz * 0.26, 0.41, 0.032, 0.022, BLACK, { ...BLACK_METAL }))),
      // apron rails under the top (detail 1)
      ...[-1, 1].map((s) => seam(s * 0.26, 0.39, 0, 0.018, 0.03, 0.5, BLACK, { ...BLACK_METAL })),
      ...[-1, 1].map((s) => seam(0, 0.39, s * 0.26, 0.5, 0.03, 0.018, BLACK, { ...BLACK_METAL })),
    ],
  },
  lv_coffee_table_low: {
    label: "SONHULT nesting table, low (black)", brand: "IKEA", cat: "Living", w: 0.8, d: 0.4, h: 0.35,
    parts: [
      b(0, 0.33, 0, 0.8, 0.04, 0.4, "#25272b", { ...MATT, rough: 0.5, bevel: 0.01 }),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.36, sz * 0.16, 0.31, 0.03, 0.02, BLACK, { ...BLACK_METAL }))),
      ...[-1, 1].map((s) => seam(s * 0.36, 0.295, 0, 0.016, 0.026, 0.3, BLACK, { ...BLACK_METAL })),
      ...[-1, 1].map((s) => seam(0, 0.295, s * 0.16, 0.7, 0.026, 0.016, BLACK, { ...BLACK_METAL })),
    ],
  },

  lv_sideboard_oak_black: {
    label: "Oak and black sideboard", brand: "Generic", cat: "Living", w: 1.5, d: 0.4, h: 0.8,
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.7, sz * 0.15, 0.14, 0.045, 0.03, BLACK, { ...WOOD }))),
      b(0, 0.78, 0, 1.5, 0.04, 0.4, WOODD, { ...WOOD, m: true, bevel: 0.008 }),
      b(0, 0.45, 0, 1.5, 0.62, 0.38, BLACK, { ...MATT, bevel: 0.006 }),
      ...[-0.5, 0, 0.5].flatMap((x) => [
        ...drawerFront(x, 0.645, 0.18, 0.474, 0.204, SBOARD, { ...WOOD, handle: "bar-x" }),
        ...drawerFront(x, 0.35, 0.18, 0.474, 0.344, SBOARD, { ...WOOD, handle: "bar-y" }),
      ]),
      // plinth shadow gap and carcass seams (detail 1)
      seam(0, 0.145, 0.185, 1.46, 0.012, 0.004, "#0f1012"),
      ...[-0.25, 0.25].map((x) => seam(x, 0.45, 0.191, 0.006, 0.6, 0.004, "#0f1012")),
    ],
  },

  lv_shoe_cabinet_oak: {
    label: "Oak shoe cabinet with tilting drawers", brand: "IKEA", cat: "Living", w: 0.6, d: 0.25, h: 1.2,
    parts: [
      b(-0.285, 0.6, 0, 0.03, 1.2, 0.25, "#c29b64", { ...WOOD, bevel: 0.006 }),
      b(0.285, 0.6, 0, 0.03, 1.2, 0.25, "#c29b64", { ...WOOD, bevel: 0.006 }),
      b(0, 1.185, 0, 0.6, 0.03, 0.25, "#cba773", { ...WOOD, bevel: 0.008 }),
      b(0, 0.015, 0, 0.6, 0.03, 0.25, "#c29b64", { ...WOOD, bevel: 0.006 }),
      b(0, 0.6, -0.115, 0.54, 1.14, 0.02, "#b48c58", { ...WOOD, bevel: 0 }),
      ...[0.2, 0.58, 0.96].map((y) => b(0, y, 0.05, 0.54, 0.34, 0.02, "#cba773", { ...WOOD, m: true, bevel: 0.006, r: [tilt, 0, 0] })),
      ...[0.2, 0.58, 0.96].map(drawerLip),
      // drawer trays behind the fronts and the dividers between them (detail 1)
      ...[0.2, 0.58, 0.96].map((y) => b(0, y - 0.04, 0, 0.5, 0.2, 0.18, "#a88458", { ...WOOD, detail: 1 })),
      ...[0.39, 0.77].map((y) => seam(0, y, 0.06, 0.54, 0.008, 0.2, "#9c7c52")),
    ],
  },

  // the hall as built: a KALLSÖ bench with three seat pads and shoes, and the grey drawer unit at its end (1.3 m, scaled up to 1.6 m in the owner's plan)
  lv_hall_bench: {
    label: "KALLSÖ bench with shoe storage and grey drawer unit", brand: "IKEA", cat: "Living", w: 1.3, d: 0.4, h: 0.56,
    tags: "kallso kallsö hall entryway bench pine seat pads shoe rack storage",
    parts: [
      ...kallsoBench(-0.25, 0.8, 0.96),
      // the drawer unit: body, one wide pull-out front with its handle
      b(0.4, 0.225, -0.01, 0.5, 0.45, 0.36, GREY_BOX, { ...MATT, bevel: 0.006 }),
      ...drawerFront(0.4, 0.225, 0.17, 0.46, 0.4, "#9a9da2", { ...MATT, handle: "bar-x" }),
      // seat pads laid a little crooked, and a pair of shoes on each shelf
      ...[-0.27, 0, 0.27].map((dx, i) => cushion(-0.25 + dx, 0.5576, 0, 0.25, 0.04, 0.33, K_PAD, { m: true, r: [0.02, 0.04 * (i - 1), 0.015 * (1 - i)] })),
      ...[0.12, 0.31].map((t, i) => b(-0.25 + (i ? 0.2 : -0.2), t * 0.96 + 0.025, 0, 0.1, 0.05, 0.26, "#3a3d42", { ...LEATHER, bevel: 0.02, detail: 2 })),
    ],
  },

  lv_coat_wall: {
    label: "KALLSÖ hat racks, pair, with coats", brand: "IKEA", cat: "Living", w: 1.5, d: 0.35, h: 2.0, wall: true,
    tags: "kallso kallsö hall entryway coat rack hooks rail shelf hat wall",
    parts: [
      ...[-0.38, 0.38].flatMap((x) => kallsoRack(x, 0.74, 2.0, -0.175)),
      // the coats that hang on the rails (what fills the silhouette down to 1.6 m)
      b(-0.3, 1.75, 0.085, 0.4, 0.3, 0.14, "#34402f", { ...FAB, m: true, bevel: 0.04 }),
      b(0.45, 1.75, 0.085, 0.4, 0.3, 0.14, "#2b3a52", { ...FAB, m: true, bevel: 0.04 }),
    ],
  },

  // the real pieces, one each: place as many as the wall and the floor take
  lv_kallso_bench: {
    label: "KALLSÖ bench with shoe storage (grey/pine) 80 x 38 cm", brand: "IKEA", cat: "Living", w: 0.8, d: 0.38, h: 0.56,
    tags: "kallso kallsö hall entryway bench pine grey shoe rack storage seat",
    parts: [...kallsoBench(0, 0.8), ...kallsoBenchScrews(0, 0.8)],
  },

  // a wall piece: h is the height of the shelf's top face (the mounting height), the parts hang below it like the other wall kinds
  lv_kallso_hat_rack: {
    label: "KALLSÖ hat rack (grey/pine) 80 x 32 cm", brand: "IKEA", cat: "Living", w: 0.8, d: 0.32, h: 1.9, wall: true,
    tags: "kallso kallsö hall entryway hat coat rack hooks rail shelf wall",
    parts: kallsoRack(0, 0.8, 1.9, -0.16),
  },

  lv_rug_dark_runner: {
    label: "Dark woven hall runner", brand: "Generic", cat: "Decor", w: 0.75, d: 2.0, h: 0.02,
    parts: [
      b(0, 0.008, 0, 0.75, 0.016, 2.0, "#363a40", { ...FAB, m: true, bevel: 0.01 }),
      b(0, 0.018, -0.95, 0.65, 0.004, 0.03, "#2d3035", { ...FAB, bevel: 0 }),
      b(0, 0.018, 0.95, 0.65, 0.004, 0.03, "#2d3035", { ...FAB, bevel: 0 }),
      b(-0.35, 0.018, 0, 0.03, 0.004, 1.9, "#2d3035", { ...FAB, bevel: 0 }),
      b(0.35, 0.018, 0, 0.03, 0.004, 1.9, "#2d3035", { ...FAB, bevel: 0 }),
      // woven stripes along the length and fringe on the short ends (detail 1)
      ...[-0.1, 0.1].map((x) => b(x, 0.0175, 0, 0.012, 0.003, 1.8, "#41454c", { ...FAB, bevel: 0, detail: 1 })),
      ...[-1, 1].map((s) => b(0, 0.004, s * 1.0, 0.65, 0.006, 0.02, "#4a4e55", { ...FAB, bevel: 0.002, detail: 1 })),
    ],
  },
  lv_doormat_black: {
    label: "Black door mat", brand: "Generic", cat: "Decor", w: 0.9, d: 0.6, h: 0.02,
    parts: [
      b(0, 0.008, 0, 0.9, 0.016, 0.6, "#1b1c1f", { ...RUBBER, m: true, bevel: 0.006 }),
      b(0, 0.018, 0, 0.8, 0.004, 0.5, "#232427", { ...RUBBER, bevel: 0.002 }),
      // scraper ribs across the mat (detail 1)
      ...Array.from({ length: 6 }, (_, i) => b(0, 0.0215, -0.175 + i * 0.07, 0.76, 0.004, 0.014, "#16171a", { ...RUBBER, bevel: 0.002, detail: 1 })),
    ],
  },
  lv_rug_shaggy_black: {
    label: "Black shaggy living room rug", brand: "Generic", cat: "Decor", w: 1.6, d: 2.3, h: 0.04,
    parts: [
      b(0, 0.015, 0, 1.6, 0.03, 2.3, "#212326", { ...FAB, m: true, bevel: 0.012 }),
      b(0, 0.034, 0, 1.5, 0.012, 2.2, "#2a2c30", { ...FAB, m: true, bevel: 0.006 }),
      ...tufts,
    ],
  },

  lv_mirror_floor_black: {
    label: "Large mirror, thick black frame", brand: "Generic", cat: "Decor", w: 0.65, d: 0.06, h: 2.0, wall: true,
    parts: [
      b(0, 1.25, 0, 0.52, 1.36, 0.01, "#b9c4cb", { tex: "ceramic", rough: 0.04, metal: 0.85, bevel: 0 }),
      b(0, 1.96, 0, 0.65, 0.08, 0.05, BLACK, { ...BLACK_METAL, bevel: 0.012 }),
      b(0, 0.54, 0, 0.65, 0.08, 0.05, BLACK, { ...BLACK_METAL, bevel: 0.012 }),
      b(-0.29, 1.25, 0, 0.07, 1.5, 0.05, BLACK, { ...BLACK_METAL, bevel: 0.012 }),
      b(0.29, 1.25, 0, 0.07, 1.5, 0.05, BLACK, { ...BLACK_METAL, bevel: 0.012 }),
      // inner lip of the frame (detail 1) and a soft reflection streak (detail 2)
      b(0, 1.92, 0.012, 0.52, 0.012, 0.03, "#0e0f11", { ...BLACK_METAL, bevel: 0.003, detail: 1 }),
      b(0, 0.58, 0.012, 0.52, 0.012, 0.03, "#0e0f11", { ...BLACK_METAL, bevel: 0.003, detail: 1 }),
      b(-0.255, 1.25, 0.012, 0.012, 1.36, 0.03, "#0e0f11", { ...BLACK_METAL, bevel: 0.003, detail: 1 }),
      b(0.255, 1.25, 0.012, 0.012, 1.36, 0.03, "#0e0f11", { ...BLACK_METAL, bevel: 0.003, detail: 1 }),
      b(-0.08, 1.35, 0.0055, 0.05, 1.0, 0.002, "#d6dee3", { ...GLOSS, bevel: 0, r: [0, 0, 0.18], detail: 2 }),
    ],
  },
  lv_art_forest_oak: {
    label: "Forest canopy photo, light oak frame", brand: "Generic", cat: "Decor", w: 0.75, d: 0.03, h: 2.25, wall: true,
    parts: [
      b(0, 1.95, 0, 0.75, 0.55, 0.03, "#d8b57a", { ...WOOD, bevel: 0.006 }),
      b(0, 1.95, 0.007, 0.69, 0.49, 0.01, "#17181a", { ...MATT, bevel: 0 }),
      b(0, 1.98, 0.0135, 0.4, 0.3, 0.004, "#8a9096", { ...MATT, bevel: 0 }),
      b(-0.22, 1.93, 0.0135, 0.16, 0.34, 0.004, "#3c4147", { ...MATT, bevel: 0 }),
      b(0.22, 1.97, 0.0135, 0.16, 0.34, 0.004, "#3c4147", { ...MATT, bevel: 0 }),
      b(0, 1.96, 0.0135, 0.3, 0.06, 0.004, "#101113", { ...MATT, bevel: 0 }),
      // frame inner edge and a few more trunks / canopy layers (detail)
      b(0, 1.95, 0.0145, 0.7, 0.5, 0.003, "#b99560", { ...WOOD, bevel: 0, detail: 1 }),
      b(-0.08, 1.96, 0.0155, 0.06, 0.4, 0.003, "#2a2e33", { ...MATT, bevel: 0, detail: 2 }),
      b(0.1, 1.94, 0.0155, 0.04, 0.42, 0.003, "#2a2e33", { ...MATT, bevel: 0, detail: 2 }),
      b(0, 2.06, 0.0155, 0.5, 0.05, 0.003, "#6a7178", { ...MATT, bevel: 0, detail: 2 }),
    ],
  },
  lv_art_daisy_canvas: {
    label: "Daisy dessert canvas", brand: "Generic", cat: "Decor", w: 0.5, d: 0.03, h: 1.8, wall: true,
    parts: [
      b(0, 1.6, 0, 0.5, 0.36, 0.03, "#d9dbdc", { ...FAB, bevel: 0.004 }),
      b(0, 1.57, 0.0125, 0.22, 0.12, 0.004, "#c9755f", { ...MATT, bevel: 0 }),
      b(-0.1, 1.54, 0.0125, 0.1, 0.06, 0.004, "#f2f1ee", { ...MATT, bevel: 0 }),
      b(0.12, 1.54, 0.0125, 0.1, 0.06, 0.004, "#e3c34a", { ...MATT, bevel: 0 }),
      // daisies: yellow centres with petal discs (detail 2) and a thin inner border (detail 1)
      ...[[-0.14, 1.67], [0.1, 1.68], [0.15, 1.62]].flatMap(([x, y]) => [cy(x, y, 0.0165, 0.07, 0.004, "#f4f2ec", { ...MATT, r: [PI2, 0, 0], detail: 2 }), cy(x, y, 0.0185, 0.025, 0.004, "#e2b93b", { ...MATT, r: [PI2, 0, 0], detail: 2 })]),
    ],
  },

  lv_bamboo_rack: {
    label: "Bamboo slatted rack", brand: "Generic", cat: "Decor", w: 0.45, d: 0.12, h: 1.0,
    parts: [
      b(0, 0.97, 0, 0.45, 0.04, 0.03, "#d9b877", { ...WOOD, bevel: 0.008 }),
      b(0, 0.7, 0, 0.45, 0.03, 0.03, "#d9b877", { ...WOOD, bevel: 0.008 }),
      b(0, 0.03, 0, 0.45, 0.04, 0.03, "#d9b877", { ...WOOD, bevel: 0.008 }),
      ...Array.from({ length: 9 }, (_, i) => cy(-0.18 + i * 0.045, 0.5, 0, 0.024, 0.96, "#e0c487", { ...WOOD })),
      b(-0.21, 0.5, 0, 0.03, 0.96, 0.05, "#d9b877", { ...WOOD, bevel: 0.01 }),
      b(0.21, 0.5, 0, 0.03, 0.96, 0.05, "#d9b877", { ...WOOD, bevel: 0.01 }),
      // bamboo nodes on the posts and slats (detail 2), little rubber feet (detail 2)
      ...Array.from({ length: 9 }, (_, i) => cy(-0.18 + i * 0.045, 0.35 + (i % 3) * 0.12, 0, 0.029, 0.008, "#c9a665", { ...WOOD, detail: 2 })),
      ...[-0.21, 0.21].map((x) => cy(x, 0.005, 0, 0.032, 0.01, "#6b5a3a", { ...RUBBER, detail: 2 })),
    ],
  },

  lv_entry_table_marble: {
    label: "Entry table, marble top, black frame", brand: "Generic", cat: "Living", w: 0.42, d: 0.3, h: 0.8,
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.195, 0.4, sz * 0.135, 0.025, 0.8, 0.025, BLACK, { ...BLACK_METAL, bevel: 0.004 }))),
      b(0, 0.785, 0, 0.42, 0.03, 0.3, "#ecebe8", { ...STONE, m: true, bevel: 0.006 }),
      b(0, 0.22, 0, 0.4, 0.025, 0.28, "#ddddd9", { ...STONE, bevel: 0.005 }),
      b(0, 0.5, -0.135, 0.38, 0.5, 0.01, "#2b2d31", { ...BLACK_METAL, bevel: 0.002 }),
      // apron rails and a small bowl on the top (detail)
      seam(0, 0.755, 0.135, 0.37, 0.02, 0.016, BLACK, { ...BLACK_METAL }),
      seam(0, 0.755, -0.135, 0.37, 0.02, 0.016, BLACK, { ...BLACK_METAL }),
      turned(-0.08, 0.8, 0.02, bowlProfile(0.06, 0.04, 5), "#d8cfc0", { ...CERAMIC, detail: 2 }),
      cy(0.12, 0.806, 0.0, 0.07, 0.012, "#c6a15b", { ...CHROME, detail: 2 }),
    ],
  },

  lv_network_cabinet: {
    label: "Wall-mounted network cabinet", brand: "Generic", cat: "Lighting & devices", w: 0.55, d: 0.3, h: 2.3, wall: true,
    light: { y: 2.1, color: "#3f7fd8" }, // the LED strips inside (light.rack_light)
    parts: [
      b(0, 2.1, 0, 0.55, 0.4, 0.3, "#1f2124", { ...BLACK_METAL, bevel: 0.01 }),
      b(0, 2.1, 0.144, 0.42, 0.3, 0.01, "#6b7480", { ...GLOSS, tex: "plastic", bevel: 0.003 }),
      b(-0.2, 2.1, 0.148, 0.01, 0.3, 0.004, "#3f7fd8", { glow: true, bevel: 0 }),
      b(0.2, 2.1, 0.148, 0.01, 0.3, 0.004, "#3f7fd8", { glow: true, bevel: 0 }),
      // door handle and hinges, vent slots, cable glands (detail)
      handleBar(0.17, 2.1, 0.149, 0.1, "y"),
      ...[2.2, 2.0].map((y) => b(-0.215, y, 0.152, 0.02, 0.05, 0.012, "#2c2f33", { ...BLACK_METAL, detail: 2 })),
      seam(0, 2.285, 0.152, 0.24, 0.004, 0.003, "#0b0b0c"),
      seam(0, 2.27, 0.152, 0.24, 0.004, 0.003, "#0b0b0c"),
      cy(0.1, 1.9, 0.0, 0.03, 0.01, "#101113", { ...RUBBER, detail: 2 }),
    ],
  },
  lv_fuse_box: {
    label: "Electrical fuse box", brand: "Generic", cat: "Lighting & devices", w: 0.27, d: 0.08, h: 1.72, wall: true,
    parts: [
      b(0, 1.55, 0, 0.27, 0.34, 0.08, "#e9e8e5", { ...PLASTIC, bevel: 0.008 }),
      b(0, 1.58, 0.036, 0.2, 0.1, 0.008, "#4a3f30", { ...GLOSS, tex: "plastic", bevel: 0.002 }),
      // breaker row seen through the window, door seam, latch, hinges (detail)
      ...[-0.06, 0, 0.06].map((x, i) => b(x, 1.58, 0.042, 0.05, 0.06, 0.008, i === 0 ? "#2b2d31" : "#f0efec", { ...PLASTIC, bevel: 0.002, detail: 2 })),
      seam(0, 1.435, 0.041, 0.25, 0.004, 0.003, "#b9b8b4"),
      b(0.1, 1.5, 0.042, 0.03, 0.012, 0.012, "#8d9299", { ...STEEL, bevel: 0.002, detail: 2 }),
      b(-0.125, 1.68, 0.042, 0.012, 0.04, 0.01, "#8d9299", { ...STEEL, bevel: 0.002, detail: 2 }),
    ],
  },

  lv_ceiling_round_led: {
    label: "Round LED ceiling light", brand: "Generic", cat: "Lighting & devices", w: 0.5, d: 0.5, h: 2.58,
    light: { y: 2.5, color: "#fff3d6" },
    parts: [
      turned(0, 2.53, 0, [[0.25, 0], [0.25, 0.035], [0.235, 0.05]], "#f4f4f2", { ...PLASTIC }),
      cy(0, 2.52, 0, 0.44, 0.02, "#fff6e6", { glow: true }),
      cy(0, 2.532, 0, 0.47, 0.004, "#dcdcd8", { ...PLASTIC, detail: 1 }),
    ],
  },
  lv_ceiling_square_led: {
    label: "Square LED ceiling light", brand: "Generic", cat: "Lighting & devices", w: 0.62, d: 0.62, h: 2.58,
    light: { y: 2.5, color: "#fff3d6" },
    parts: [
      b(0, 2.555, 0, 0.62, 0.05, 0.62, "#f2f1ee", { ...PLASTIC, bevel: 0.012 }),
      b(0, 2.52, 0, 0.52, 0.02, 0.52, "#fff6e6", { glow: true, bevel: 0.004 }),
      b(0, 2.532, 0, 0.56, 0.004, 0.56, "#dcdcd8", { ...PLASTIC, bevel: 0.002, detail: 1 }),
    ],
  },
  lv_ceiling_bar_led: {
    label: "Slim white LED ceiling bar", brand: "Generic", cat: "Lighting & devices", w: 0.5, d: 0.25, h: 2.58,
    light: { y: 2.5, color: "#fff3d6" },
    parts: [
      b(0, 2.56, 0, 0.5, 0.04, 0.08, "#f2f1ee", { ...PLASTIC, bevel: 0.008 }),
      b(0, 2.53, -0.06, 0.4, 0.02, 0.06, "#fff6e6", { glow: true, bevel: 0.004 }),
      b(0, 2.53, 0.06, 0.4, 0.02, 0.06, "#fff6e6", { glow: true, bevel: 0.004 }),
      // end caps and the two side carriers of the strips (detail 1)
      ...[-1, 1].map((s) => b(s * 0.215, 2.53, 0, 0.02, 0.02, 0.18, "#e4e3e0", { ...PLASTIC, bevel: 0.004, detail: 1 })),
      b(0, 2.545, -0.06, 0.4, 0.01, 0.07, "#e4e3e0", { ...PLASTIC, bevel: 0.003, detail: 1 }),
      b(0, 2.545, 0.06, 0.4, 0.01, 0.07, "#e4e3e0", { ...PLASTIC, bevel: 0.003, detail: 1 }),
    ],
  },

  // curtain rule: the sheer and velvet panels keep their order, size and place (partEffects/lib/curtain.ts); rings are appended at the end
  lv_sheer_curtain_door: {
    label: "Sheer curtain with grey velvet side panels", brand: "Generic", cat: "Decor", w: 2.4, d: 0.1, h: 2.4, wall: true,
    parts: [
      b(0, 2.34, 0, 2.4, 0.03, 0.03, "#25272b", { ...BLACK_METAL }),
      sp(-1.17, 2.34, 0, 0.05, "#25272b", { ...BLACK_METAL }),
      sp(1.17, 2.34, 0, 0.05, "#25272b", { ...BLACK_METAL }),
      b(0, 1.2, 0, 1.8, 2.25, 0.01, "#f4f4f2", { tex: "fabric", rough: 0.9, layer: "sheer" }),
      ...[-1, 1].flatMap((s) => [
        b(s * 1.08, 1.2, 0, 0.14, 2.25, 0.06, "#5e5e60", { tex: "fabric", rough: 0.95, layer: "blackout" }),
        b(s * 0.95, 1.2, 0.015, 0.14, 2.25, 0.07, "#6a6a6c", { tex: "fabric", rough: 0.95, layer: "blackout" }),
        b(s * 0.82, 1.2, 0, 0.14, 2.25, 0.06, "#5e5e60", { tex: "fabric", rough: 0.95, layer: "blackout" }),
      ]),
      // curtain rings on the rod (detail 2) and a wall bracket pair (detail 1)
      ...[-1.08, -0.95, -0.82, -0.6, -0.3, 0.3, 0.6, 0.82, 0.95, 1.08].map((x) => cy(x, 2.34, 0, 0.05, 0.012, "#25272b", { ...BLACK_METAL, r: [0, 0, PI2], detail: 2 })),
      ...[-0.6, 0.6].map((x) => b(x, 2.34, -0.03, 0.02, 0.03, 0.04, "#25272b", { ...BLACK_METAL, detail: 1 })),
    ],
  },
};
