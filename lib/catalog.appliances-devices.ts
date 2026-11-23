import type { Def, Part } from "./catalog";
import { b, cy, PI2, WHITE, SEAM, STEEL, GRAPHITE, BLACK, GLASS, CHROME } from "./catalog.appliances-parts.ts";
import { turned, taperedLeg, WOOD, FAB, PLASTIC, RUBBER, BLACK_METAL, GLOSS } from "./partsKit.ts";

// Household devices: cleaning robots, speakers, TVs, network gear and thermostats.
const rows = <T,>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));
const FABRIC = "#6e7076";
const DARK = "#26282c";
const SMOKED = "#252c37";

// ---- cleaning ----
const robotVacuum: Def = {
  label: "Robot vacuum", brand: "Generic", cat: "Appliances", w: 0.34, d: 0.34, h: 0.09,
  parts: [
    cy(0, 0.025, 0, 0.33, 0.05, WHITE, { m: true }),
    cy(0, 0.054, 0, 0.34, 0.008, "#7ad1ff", { glow: true }), // LED ring around the rim
    cy(0, 0.067, 0, 0.3, 0.018, GLASS),
    cy(0, 0.083, 0, 0.08, 0.014, GRAPHITE), // lidar turret
    b(-0.06, 0.078, 0.07, 0.03, 0.004, 0.02, GRAPHITE),
    b(0.06, 0.078, 0.07, 0.03, 0.004, 0.02, GRAPHITE),
    ...rows(7, (i) => {
      const a = ((i - 3) * 18 * Math.PI) / 180;
      return b(0.155 * Math.sin(a), 0.03, 0.155 * Math.cos(a), 0.06, 0.04, 0.02, BLACK, { r: [0, a, 0] });
    }),
    cy(-0.1, 0.013, 0.09, 0.012, 0.026, GRAPHITE), // brush hub
    b(-0.1, 0.027, 0.09, 0.06, 0.004, 0.006, BLACK, { spin: { axis: "y", rpm: 150 } }),
    b(-0.1, 0.027, 0.09, 0.006, 0.004, 0.06, BLACK, { spin: { axis: "y", rpm: 150 } }),
    cy(0, 0.0775, -0.07, 0.032, 0.003, "#e6e5e1", { detail: 2 }), // clean button
    ...[-1, 1].map((sx) => cy(sx * 0.115, 0.02, -0.03, 0.045, 0.02, BLACK, { ...RUBBER, detail: 1, r: [0, 0, PI2] })), // drive wheels
    cy(0, 0.0905, 0, 0.03, 0.004, "#2a2c30", { detail: 2 }), // lidar cap
  ],
};

const robotDock: Def = {
  label: "Robot vacuum dock", brand: "Generic", cat: "Appliances", w: 0.4, d: 0.45, h: 0.45,
  parts: [
    b(0, 0.015, 0, 0.38, 0.03, 0.45, WHITE, { m: true }),
    b(0, 0.045, 0.14, 0.28, 0.01, 0.14, GRAPHITE, { r: [0.2, 0, 0] }), // ramp
    b(-0.06, 0.036, -0.015, 0.03, 0.012, 0.01, CHROME),
    b(0.06, 0.036, -0.015, 0.03, 0.012, 0.01, CHROME),
    b(0, 0.225, -0.125, 0.22, 0.45, 0.2, WHITE, { m: true }),
    b(0, 0.445, -0.125, 0.2, 0.01, 0.18, SEAM),
    b(0, 0.24, -0.0235, 0.16, 0.2, 0.006, GLASS), // bag door
    b(0, 0.15, -0.0215, 0.12, 0.004, 0.003, GRAPHITE),
    b(0, 0.38, -0.0225, 0.12, 0.012, 0.006, "#7ad1ff", { glow: true }),
    ...rows(4, (i) => b(0, 0.065 + i * 0.012, -0.0235, 0.12, 0.004, 0.005, SEAM)),
  ],
};

// stick vacuum hanging on its wall bracket
const stickVacuum: Def = {
  label: "Stick vacuum on wall mount", brand: "Generic", cat: "Appliances", w: 0.25, d: 0.3, h: 1.25, wall: true,
  parts: [
    b(0, 0.675, -0.14, 0.1, 0.85, 0.02, GRAPHITE), // wall bracket
    b(0, 0.5, -0.1, 0.05, 0.03, 0.04, BLACK), // tube clip
    cy(0, 0.475, -0.07, 0.03, 0.65, CHROME),
    cy(0, 0.1, -0.06, 0.05, 0.06, GRAPHITE),
    b(0, 0.055, 0.02, 0.22, 0.05, 0.26, "#c8452d", { m: true }), // floor head
    b(0, 0.082, 0.1, 0.2, 0.004, 0.1, GRAPHITE),
    cy(0, 0.84, -0.07, 0.07, 0.08, "#c8452d", { m: true }), // motor
    cy(0, 0.96, -0.07, 0.075, 0.16, "#cfd4d8"), // clear dust bin
    b(0, 1.09, -0.115, 0.07, 0.1, 0.035, GRAPHITE), // battery
    b(0, 1.2, -0.06, 0.035, 0.05, 0.14, GRAPHITE), // grip
    b(0, 1.228, -0.02, 0.01, 0.006, 0.01, "#7ad1ff", { glow: true }),
  ],
};

// ---- speakers / displays ----
const speakerMini: Def = {
  label: "Smart speaker (mini)", brand: "Generic", cat: "Appliances", w: 0.1, d: 0.1, h: 0.085,
  parts: [
    turned(0, 0, 0, [[0.03, 0], [0.047, 0.012], [0.05, 0.03], [0.046, 0.055], [0.03, 0.076]], FABRIC, { ...FAB, m: true }),
    cy(0, 0.004, 0, 0.06, 0.008, BLACK),
    cy(0, 0.08, 0, 0.056, 0.006, "#7ad1ff", { glow: true }),
    cy(0, 0.082, 0, 0.05, 0.004, GRAPHITE),
  ],
};

const grille = (n: number, y0: number, step: number, f: (y: number) => Part): Part[] => rows(n, (i) => f(y0 + i * step));
const speakerSmart: Def = {
  label: "Smart speaker", brand: "Generic", cat: "Appliances", w: 0.12, d: 0.12, h: 0.17,
  parts: [
    b(0, 0.084, 0, 0.12, 0.168, 0.12, BLACK, { ...FAB, m: true, bevel: 0.03 }),
    ...grille(12, 0.025, 0.011, (y) => b(0, y, 0.0605, 0.1, 0.004, 0.002, "#3a3c40")),
    ...grille(6, 0.04, 0.02, (y) => b(0.0605, y, 0, 0.002, 0.004, 0.1, "#3a3c40")),
    ...grille(6, 0.04, 0.02, (y) => b(-0.0605, y, 0, 0.002, 0.004, 0.1, "#3a3c40")),
    b(0, 0.1685, 0.025, 0.09, 0.003, 0.04, DARK),
    cy(0, 0.1695, 0.025, 0.02, 0.002, "#8a8d92"),
    b(0, 0.1695, 0.052, 0.04, 0.002, 0.006, "#7ad1ff", { glow: true }),
  ],
};

const displaySmart: Def = {
  label: "Smart display", brand: "Generic", cat: "Appliances", w: 0.18, d: 0.1, h: 0.14,
  parts: [
    b(0, 0.035, 0.01, 0.15, 0.07, 0.08, FABRIC, { m: true }),
    b(0, 0.088, -0.01, 0.17, 0.1, 0.012, BLACK, { r: [-0.2, 0, 0] }),
    b(0, 0.0893, -0.0036, 0.16, 0.09, 0.003, GLASS, { glow: true, r: [-0.2, 0, 0] }),
  ],
};

// ---- TVs ----
const TV_SIZES: [string, number, number][] = [["32", 0.71, 0.4], ["43", 0.95, 0.54], ["55", 1.22, 0.69], ["65", 1.44, 0.81], ["75", 1.66, 0.93]];
const BLUE = "#7fb2ff";

/** The TV itself: centre y `yc`, bezel centred at z `zc` (0.02 thick). */
const tvParts = (W: number, H: number, yc: number, zc: number): Part[] => [
  b(0, yc, zc, W, H, 0.02, BLACK, { ...PLASTIC, m: true, bevel: 0.006 }), // bezel
  b(0, yc, zc + 0.012, W - 0.02, H - 0.02, 0.008, GLASS, { ...GLOSS, glow: true, bevel: 0.002 }), // screen glass
  b(0, yc, zc - 0.015, W * 0.7, H * 0.7, 0.03, GRAPHITE, { bevel: 0.012 }), // rear shell
  b(0, yc - H / 2 + 0.005, zc + 0.0125, 0.008, 0.004, 0.005, "#7ad1ff", { glow: true }),
  b(0, yc - H / 2 + 0.013, zc + 0.0105, W * 0.06, 0.003, 0.002, "#9aa0a6", { detail: 2, bevel: 0 }), // brand mark
];

const tvWall = ([, W, H]: [string, number, number]): Def => ({
  label: "", brand: "Generic", cat: "Appliances", w: W, d: 0.06, h: Math.round((1.3 + H / 2) * 1000) / 1000, wall: true,
  light: { y: 1.3, color: BLUE },
  parts: [
    ...tvParts(W, H, 1.3, 0.01),
    b(0, 1.3, -0.0225, 0.2, 0.15, 0.015, GRAPHITE),
    b(0, 1.3, -0.0275, 0.32, 0.22, 0.005, "#2a2c30", { ...BLACK_METAL, detail: 1 }), // wall plate
    ...[-1, 1].map((sx) => b(sx * 0.09, 1.3, -0.0225, 0.02, 0.16, 0.012, "#3a3d42", { ...BLACK_METAL, detail: 1 })), // arms
    ...[-1, 1].map((sx) => b(sx * 0.14, 1.3, -0.0245, 0.012, 0.012, 0.004, STEEL, { detail: 2 })), // screws
  ],
});

// low media console, two doored bays with an open middle bay
const console_ = (w: number): Part[] => {
  const bay = w / 3;
  const wd = { ...WOOD, m: true as const };
  const inset = "#4a3c35";
  return [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * (w / 2 - 0.05), sz * 0.15, 0.08, 0.04, 0.026, BLACK, BLACK_METAL))),
    ...[-1, 1].map((sx) => b(sx * (w / 2 - 0.015), 0.265, 0, 0.03, 0.37, 0.38, "#3b2f2a", wd)),
    b(0, 0.435, 0, w, 0.03, 0.38, "#3b2f2a", { ...wd, bevel: 0.008 }),
    b(0, 0.095, 0, w - 0.06, 0.03, 0.38, "#3b2f2a", { ...wd, bevel: 0.004 }),
    b(0, 0.265, -0.18, w - 0.06, 0.34, 0.02, "#1a1614", { ...WOOD, bevel: 0 }),
    ...[-1, 1].map((sx) => b(sx * (bay / 2), 0.265, 0, 0.02, 0.34, 0.36, "#3b2f2a", wd)),
    b(0, 0.27, 0, bay - 0.03, 0.015, 0.34, "#3b2f2a", wd), // shelf in the open bay
    ...[-1, 1].flatMap((sx) => [
      b(sx * bay, 0.265, 0.19, bay - 0.03, 0.31, 0.016, "#3b2f2a", { ...wd, bevel: 0.005 }),
      b(sx * bay, 0.265, 0.1985, 0.002, 0.3, 0.003, "#1a1614"), // hairline seam
      b(sx * (bay / 2 + 0.04), 0.265, 0.2, 0.008, 0.09, 0.004, BLACK),
      b(sx * bay, 0.265, 0.2, bay - 0.1, 0.22, 0.004, inset, { ...WOOD, detail: 1, bevel: 0.002 }), // shaker panel
    ]),
    b(0, 0.432, 0.1925, 0.12, 0.008, 0.004, "#0a0a0c"), // IR slot
    b(0, 0.3, 0, 0.26, 0.04, 0.2, "#26282c", { detail: 1, bevel: 0.008 }), // set-top box on the open shelf
    b(0.09, 0.3, 0.1, 0.012, 0.004, 0.004, "#8a8d92", { detail: 2 }),
  ];
};

const tvStand = ([, W, H]: [string, number, number]): Def => {
  const w = Math.round(Math.max(0.9, W + 0.2) * 100) / 100;
  const yc = 0.48 + H / 2;
  return {
    label: "", brand: "Generic", cat: "Appliances", w, d: 0.4, h: Math.round((0.48 + H) * 1000) / 1000,
    light: { y: yc, color: BLUE },
    parts: [
      ...console_(w),
      b(0, 0.455, -0.03, 0.32, 0.01, 0.2, BLACK, { ...BLACK_METAL, bevel: 0.004 }), // foot plate
      turned(0, 0.46, -0.04, [[0.035, 0], [0.02, 0.01], [0.018, 0.022]], BLACK, BLACK_METAL), // neck
      ...tvParts(W, H, yc, -0.03),
    ],
  };
};

const tvDefs: Record<string, Def> = Object.fromEntries(
  TV_SIZES.flatMap((s) => [
    [`ap_tv_${s[0]}_wall`, { ...tvWall(s), label: `TV ${s[0]}" on the wall` }],
    [`ap_tv_${s[0]}_stand`, { ...tvStand(s), label: `TV ${s[0]}" on a low stand` }],
  ]),
);

const soundbar: Def = {
  label: "Soundbar", brand: "Generic", cat: "Appliances", w: 0.95, d: 0.1, h: 0.07,
  parts: [
    b(-0.4, 0.005, 0, 0.04, 0.01, 0.06, BLACK),
    b(0.4, 0.005, 0, 0.04, 0.01, 0.06, BLACK),
    b(0, 0.0385, 0, 0.95, 0.057, 0.09, BLACK, { ...PLASTIC, m: true, bevel: 0.02 }),
    b(0, 0.0385, 0.0455, 0.93, 0.045, 0.003, DARK, { ...FAB, bevel: 0.004 }),
    ...grille(6, 0.02, 0.0075, (y) => b(0, y, 0.0472, 0.9, 0.0015, 0.002, "#3a3c40")),
    b(0.43, 0.0385, 0.0475, 0.008, 0.008, 0.004, "#7ad1ff", { glow: true }),
    b(0, 0.0685, 0, 0.95, 0.003, 0.03, DARK),
    ...rows(4, (i) => b(0.31 + i * 0.04, 0.0693, 0, 0.012, 0.002, 0.012, "#8a8d92")),
  ],
};

// ---- consoles ----
const consoleGame: Def = {
  label: "Game console (tower)", brand: "Generic", cat: "Appliances", w: 0.11, d: 0.26, h: 0.39,
  parts: [
    b(0, 0.015, 0, 0.11, 0.03, 0.26, BLACK),
    ...[-1, 1].map((sx) => b(sx * 0.0425, 0.2075, 0, 0.025, 0.355, 0.26, WHITE, { m: true })),
    b(0, 0.205, 0, 0.06, 0.35, 0.25, GRAPHITE),
    ...[-1, 1].map((sx) => b(sx * 0.03, 0.2, 0.1305, 0.003, 0.3, 0.003, "#7ad1ff", { glow: true })),
    b(0, 0.37, 0.1255, 0.04, 0.006, 0.004, "#0a0a0c"),
    b(0, 0.1, 0.1255, 0.05, 0.004, 0.004, "#0a0a0c"),
    b(0, 0.3855, 0, 0.04, 0.003, 0.2, "#0a0a0c"),
  ],
};

const consoleBox: Def = {
  label: "Game console (box)", brand: "Generic", cat: "Appliances", w: 0.15, d: 0.15, h: 0.3,
  parts: [
    b(0, 0.1515, 0, 0.15, 0.289, 0.15, BLACK, { m: true }),
    ...[-1, 1].flatMap((sx) => [sx * 0.05].flatMap((x) => [-1, 1].map((sz) => cy(x, 0.0035, sz * 0.05, 0.02, 0.007, GRAPHITE)))),
    cy(0, 0.2975, 0, 0.13, 0.003, "#050506"),
    ...rows(7, (i) => {
      const z = (i - 3) * 0.015;
      return b(0, 0.2988, z, 2 * Math.sqrt(0.055 ** 2 - z ** 2) * 0.9, 0.002, 0.005, "#2a2c30");
    }),
    cy(0, 0.25, 0.0765, 0.012, 0.003, "#7ad1ff", { glow: true, r: [PI2, 0, 0] }),
    ...[-1, 1].flatMap((sx) => rows(10, (i) => b(sx * 0.0755, 0.06 + i * 0.018, 0, 0.003, 0.003, 0.1, "#2a2c30"))),
  ],
};

// ---- network ----
const router: Def = {
  label: "Wi-Fi router", brand: "Generic", cat: "Appliances", w: 0.22, d: 0.16, h: 0.2,
  parts: [
    b(0, 0.025, 0, 0.22, 0.05, 0.16, WHITE, { m: true }),
    ...[-1, 1].flatMap((sx) => [
      cy(sx * 0.075, 0.125, -0.05, 0.016, 0.15, WHITE, { m: true, r: [0, 0, -sx * 0.2] }),
      cy(sx * 0.075, 0.052, -0.05, 0.026, 0.006, GRAPHITE),
    ]),
    ...rows(8, (i) => b(-0.07 + i * 0.02, 0.0502, 0.02, 0.004, 0.002, 0.06, "#b9b8b4")),
    ...rows(4, (i) => b(-0.045 + i * 0.03, 0.022, 0.0815, 0.008, 0.008, 0.003, "#7ad1ff", { glow: true })),
    b(0, 0.02, -0.0805, 0.14, 0.02, 0.004, DARK),
    ...rows(4, (i) => b(-0.045 + i * 0.03, 0.02, -0.0828, 0.014, 0.01, 0.002, "#6b6e73")),
  ],
};

const meshNode: Def = {
  label: "Wi-Fi mesh node", brand: "Generic", cat: "Appliances", w: 0.1, d: 0.1, h: 0.16,
  parts: [
    cy(0, 0.008, 0, 0.09, 0.016, GRAPHITE),
    turned(0, 0.016, 0, [[0.045, 0], [0.05, 0.02], [0.05, 0.12], [0.044, 0.14]], WHITE, { ...PLASTIC, m: true }),
    cy(0, 0.158, 0, 0.1, 0.004, "#7ad1ff", { glow: true }),
    cy(0, 0.1575, 0, 0.084, 0.004, WHITE, { m: true }),
    ...rows(3, (i) => b(0, 0.1 + i * 0.02, 0.0495, 0.03, 0.003, 0.003, DARK)),
  ],
};

const nas: Def = {
  label: "Network storage (NAS)", brand: "Generic", cat: "Appliances", w: 0.17, d: 0.22, h: 0.2,
  parts: [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.065, 0.0075, sz * 0.085, 0.02, 0.015, BLACK))),
    b(0, 0.1075, 0, 0.17, 0.185, 0.22, GRAPHITE, { m: true }),
    ...rows(4, (i) => {
      const x = -0.057 + i * 0.038;
      return b(x, 0.12, 0.1105, 0.03, 0.11, 0.003, "#2a2c30");
    }),
    ...rows(4, (i) => b(-0.057 + i * 0.038, 0.05, 0.1115, 0.006, 0.004, 0.002, "#7ad1ff", { glow: true })),
    cy(0.065, 0.03, 0.1125, 0.012, 0.003, "#7ad1ff", { glow: true, r: [PI2, 0, 0] }),
    ...rows(6, (i) => b(-0.05 + i * 0.02, 0.1995, -0.02, 0.003, 0.002, 0.1, BLACK)),
    ...[-1, 1].flatMap((sx) => rows(5, (i) => b(sx * 0.0855, 0.07 + i * 0.02, -0.03, 0.003, 0.004, 0.1, BLACK))),
  ],
};

// ---- misc devices ----
const printer3d: Def = {
  label: "3D printer (enclosed)", brand: "Generic", cat: "Appliances", w: 0.39, d: 0.4, h: 0.46,
  parts: [
    b(0, 0.03, -0.005, 0.39, 0.06, 0.39, BLACK, { m: true }),
    b(0, 0.35, 0, 0.39, 0.02, 0.4, BLACK, { m: true }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.1875, 0.2, sz * 0.1875, 0.015, 0.28, 0.015, BLACK))),
    b(0, 0.2, 0.19, 0.36, 0.27, 0.006, SMOKED),
    b(0.15, 0.2, 0.1955, 0.01, 0.06, 0.005, BLACK),
    ...[-1, 1].map((sx) => b(sx * 0.1925, 0.2, 0, 0.006, 0.27, 0.36, SMOKED)),
    b(0, 0.2, -0.1925, 0.36, 0.27, 0.006, BLACK),
    b(0, 0.335, 0, 0.34, 0.004, 0.34, WHITE, { glow: true }),
    b(0, 0.1, 0, 0.22, 0.008, 0.22, GRAPHITE),
    b(0, 0.075, 0, 0.05, 0.04, 0.06, GRAPHITE),
    b(0, 0.27, 0, 0.34, 0.014, 0.014, STEEL),
    b(0, 0.25, 0, 0.05, 0.045, 0.04, GRAPHITE),
    ...[-1, 1].map((sx) => b(sx * 0.165, 0.2, -0.16, 0.008, 0.27, 0.008, STEEL)),
    cy(0, 0.41, -0.12, 0.09, 0.05, "#e8761f", { r: [0, 0, PI2] }), // filament spool
    ...[-1, 1].map((sx) => cy(sx * 0.027, 0.41, -0.12, 0.1, 0.004, "#e0e0e0", { r: [0, 0, PI2] })),
    b(0.1, 0.03, 0.195, 0.08, 0.045, 0.01, GRAPHITE),
    b(0.1, 0.03, 0.1975, 0.07, 0.035, 0.006, GLASS, { glow: true }),
  ],
};

const plugStrip: Def = {
  label: "Smart plug strip", brand: "Generic", cat: "Appliances", w: 0.45, d: 0.06, h: 0.04,
  parts: [
    b(-0.03, 0.018, 0, 0.39, 0.036, 0.06, WHITE, { m: true }),
    ...rows(5, (i) => {
      const x = -0.12 + i * 0.06;
      return b(x, 0.0375, 0.01, 0.055, 0.003, 0.035, BLACK);
    }),
    ...rows(5, (i) => [-1, 1].map((s) => b(-0.12 + i * 0.06 + s * 0.012, 0.039, 0.01, 0.006, 0.002, 0.012, "#6b6e73"))).flat(),
    ...rows(5, (i) => b(-0.12 + i * 0.06, 0.037, -0.02, 0.008, 0.002, 0.008, "#7ad1ff", { glow: true })),
    b(-0.19, 0.038, -0.015, 0.025, 0.004, 0.02, "#7ad1ff", { glow: true }),
    cy(0.195, 0.018, 0, 0.012, 0.06, BLACK, { r: [0, 0, PI2] }),
  ],
};

const chime: Def = {
  label: "Plug-in chime", brand: "Generic", cat: "Appliances", w: 0.08, d: 0.05, h: 0.4,
  parts: [
    b(0, 0.35, 0, 0.08, 0.1, 0.05, WHITE, { m: true }),
    ...[-1, 1].map((sx) => b(sx * 0.012, 0.35, -0.027, 0.006, 0.02, 0.004, CHROME)),
    ...rows(4, (i) => b(0, 0.31 + i * 0.015, 0.0255, 0.05, 0.004, 0.003, "#b5b4b0")),
    b(0, 0.385, 0.0255, 0.008, 0.008, 0.003, "#7ad1ff", { glow: true }),
  ],
};

// ---- thermostats (hand height, wall mounted) ----
const THERMO: Pick<Def, "brand" | "cat" | "h" | "wall"> = { brand: "Generic", cat: "Climate", h: 1.58, wall: true };
const thermostatRound: Def = {
  ...THERMO, label: "Round thermostat", w: 0.09, d: 0.03,
  parts: [
    cy(0, 1.5, -0.012, 0.09, 0.006, WHITE, { m: true, r: [PI2, 0, 0] }),
    cy(0, 1.5, 0, 0.09, 0.02, STEEL, { m: true, r: [PI2, 0, 0] }),
    cy(0, 1.5, 0.011, 0.07, 0.004, "#7ad1ff", { glow: true, r: [PI2, 0, 0] }),
  ],
};
const thermostatSquare: Def = {
  ...THERMO, label: "Smart thermostat", w: 0.1, d: 0.03,
  parts: [
    b(0, 1.5, -0.001, 0.1, 0.1, 0.026, WHITE, { m: true }),
    b(0, 1.52, 0.0125, 0.076, 0.046, 0.002, GLASS),
    b(0, 1.52, 0.0135, 0.066, 0.036, 0.002, "#7ad1ff", { glow: true }),
    ...rows(3, (i) => b(-0.025 + i * 0.025, 1.465, 0.0125, 0.016, 0.012, 0.004, STEEL)),
  ],
};
const thermostatDial: Def = {
  ...THERMO, label: "Dial thermostat", w: 0.09, d: 0.045,
  parts: [
    b(0, 1.5, -0.0075, 0.09, 0.1, 0.03, WHITE, { m: true }),
    cy(0, 1.5, 0.009, 0.07, 0.004, SEAM, { r: [PI2, 0, 0] }),
    cy(0, 1.5, 0.0145, 0.056, 0.014, CHROME, { r: [PI2, 0, 0] }),
    b(0, 1.52, 0.0218, 0.004, 0.014, 0.002, BLACK),
    b(0.03, 1.54, 0.0085, 0.008, 0.008, 0.002, "#7ad1ff", { glow: true }),
  ],
};

export const APPLIANCES_DEVICES: Record<string, Def> = {
  ap_robot_vacuum: robotVacuum,
  ap_robot_dock: robotDock,
  ap_stick_vacuum_wall: stickVacuum,
  ap_speaker_mini: speakerMini,
  ap_speaker_smart: speakerSmart,
  ap_display_smart: displaySmart,
  ...tvDefs,
  ap_soundbar: soundbar,
  ap_console_game: consoleGame,
  ap_console_box: consoleBox,
  ap_router: router,
  ap_router_mesh: meshNode,
  ap_nas: nas,
  ap_printer_3d: printer3d,
  ap_plug_strip: plugStrip,
  ap_doorbell_chime: chime,
  ap_thermostat_round: thermostatRound,
  ap_thermostat_square: thermostatSquare,
  ap_thermostat_dial: thermostatDial,
};
