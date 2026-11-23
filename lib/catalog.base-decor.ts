// Lighting & devices + Decor base kinds, columns, railing, echo dot (moved out of catalog.ts and upgraded with the realism fields; see `Part`).
import { bookRow, DARK, finish, LEAF2, LEAF3, OAK, PI2 } from "./catalog.base-kit.ts";
import { fejkaPlant } from "./decor/plants.ts";
import { b, BLACK_METAL, bowlProfile, CERAMIC, CHROME, cy, FAB, GLOSS, PLASTIC, RUBBER, seam, sp, STEEL, STONE, turned, vaseProfile, WOOD } from "./partsKit.ts";

const DIFFUSER = { tex: "plastic", rough: 0.6 } as const;
const BRASS = "#c6a15b";

export const BASE_DECOR = finish({
  // ---------- Lighting & devices ----------
  ceiling_light: {
    label: "Ceiling light", brand: "Generic", cat: "Lighting & devices", w: 0.4, d: 0.4, h: 2.6,
    light: { y: 2.5, color: "#ffd9a0" },
    parts: [
      turned(0, 2.56, 0, [[0.07, 0], [0.07, 0.025], [0.05, 0.04]], "#cfd2d6", { ...STEEL }),
      cy(0, 2.52, 0, 0.03, 0.08, "#cfd2d6", { ...STEEL }),
      turned(0, 2.425, 0, [[0.17, 0], [0.2, 0.02], [0.2, 0.07], [0.18, 0.07]], "#e8e0d0", { ...PLASTIC }),
      cy(0, 2.5, 0, 0.36, 0.05, "#fff3dc", { glow: true, ...DIFFUSER }),
      cy(0, 2.43, 0, 0.3, 0.02, "#fff3dc", { glow: true, ...DIFFUSER }),
      cy(0, 2.485, 0, 0.42 - 0.02, 0.01, "#cfd2d6", { ...STEEL }),
      // rim trim, canopy screws, inner reflector ring
      turned(0, 2.5, 0, [[0.2, 0], [0.2, 0.012], [0.185, 0.012]], "#d8d2c4", { ...PLASTIC, detail: 1 }),
      ...[-1, 1].map((s) => cy(s * 0.05, 2.5585, 0, 0.012, 0.004, "#8d9299", { ...CHROME, detail: 2 })),
      cy(0, 2.41, 0, 0.12, 0.006, "#ffe9c0", { ...DIFFUSER, detail: 1 }),
    ],
  },
  hektar_floor: {
    label: "HEKTAR floor lamp", brand: "IKEA", cat: "Lighting & devices", w: 0.4, d: 0.4, h: 1.8,
    light: { y: 1.55, color: "#ffd9a0" },
    parts: [
      turned(0, 0, 0, [[0.16, 0], [0.16, 0.012], [0.11, 0.025], [0.05, 0.03]], DARK, { ...BLACK_METAL }),
      cy(0, 0.045, 0, 0.1, 0.03, DARK, { ...BLACK_METAL }),
      turned(0, 0.05, 0, [[0.022, 0], [0.018, 0.75], [0.02, 1.5]], DARK, { ...BLACK_METAL }),
      cy(0, 1.62, 0, 0.36, 0.3, "#f6e3b8", { glow: true, tex: "fabric", rough: 0.9 }),
      cy(0, 1.47, 0, 0.38, 0.02, DARK, { ...BLACK_METAL }),
      cy(0, 1.77, 0, 0.38, 0.02, DARK, { ...BLACK_METAL }),
      cy(0, 1.79, 0, 0.1, 0.02, DARK, { ...BLACK_METAL }),
      b(0.12, 0.05, 0.1, 0.02, 0.02, 0.2, DARK, { ...RUBBER, bevel: 0.006 }),
      b(0.14, 0.4, 0.04, 0.03, 0.04, 0.02, "#222428", { ...PLASTIC, bevel: 0.006 }),
      // spokes, socket, cord, switch bead
      ...[0, 1, 2].map((i) => b(0, 1.62, 0, 0.012, 0.3, 0.012, DARK, { ...BLACK_METAL, detail: 1, bevel: 0, r: [0, (i * Math.PI) / 3, 0] })),
      cy(0, 1.5, 0, 0.05, 0.05, "#e8e0d0", { ...CERAMIC, detail: 1 }),
      b(0.13, 0.22, 0.07, 0.01, 0.01, 0.26, "#17181a", { detail: 2, bevel: 0, r: [0.5, 0, 0] }),
      sp(0.14, 0.4, 0.04, 0.018, "#c6a15b", { ...CHROME, detail: 2 }),
    ],
  },
  floor_lamp: {
    label: "Floor lamp", brand: "Generic", cat: "Lighting & devices", w: 0.35, d: 0.35, h: 1.6,
    light: { y: 1.45, color: "#fff1d0" },
    parts: [
      turned(0, 0, 0, [[0.15, 0], [0.15, 0.01], [0.1, 0.025], [0.03, 0.03]], "#2a2c30", { ...BLACK_METAL }),
      turned(0, 0.03, 0, [[0.016, 0], [0.014, 0.7], [0.016, 1.39]], "#2a2c30", { ...BLACK_METAL }),
      cy(0, 1.45, 0, 0.34, 0.3, "#fff1d0", { glow: true, tex: "fabric", rough: 0.9 }),
      cy(0, 1.3, 0, 0.34, 0.02, "#2a2c30", { ...BLACK_METAL }),
      cy(0, 1.59, 0, 0.1, 0.02, "#2a2c30", { ...BLACK_METAL }),
      b(0.1, 0.04, 0.08, 0.02, 0.02, 0.16, "#2a2c30", { ...RUBBER, bevel: 0.006 }),
      // finial, brass collar, pull chain, cord
      sp(0, 1.615, 0, 0.03, BRASS, { ...STEEL, detail: 1 }),
      cy(0, 0.06, 0, 0.04, 0.03, BRASS, { ...STEEL, detail: 1 }),
      cy(0.05, 1.27, 0.03, 0.004, 0.05, BRASS, { detail: 2 }),
      b(0.1, 0.02, 0.15, 0.012, 0.008, 0.2, "#17181a", { detail: 2, bevel: 0 }),
    ],
  },
  fado: {
    label: "FADO table lamp", brand: "IKEA", cat: "Lighting & devices", w: 0.25, d: 0.25, h: 0.28,
    light: { y: 0.15, color: "#fff0d0" },
    parts: [
      turned(0, 0, 0, [[0.07, 0], [0.07, 0.012], [0.05, 0.022]], "#e8e6e0", { ...CERAMIC }),
      turned(0, 0.02, 0, [[0.03, 0], [0.034, 0.02], [0.02, 0.04]], "#e8e6e0", { ...CERAMIC }),
      sp(0, 0.14, 0, 0.23, "#fff6e4", { glow: true, tex: "plastic", rough: 0.5 }),
      b(0.08, 0.005, 0.07, 0.015, 0.01, 0.1, "#e8e6e0", { ...PLASTIC, bevel: 0.003 }),
      // socket ring, cord, switch
      turned(0, 0.035, 0, [[0.022, 0], [0.03, 0.008], [0.026, 0.012]], "#d8d6d0", { ...CERAMIC, detail: 1 }),
      b(0.04, 0.004, 0.02, 0.01, 0.006, 0.1, "#17181a", { detail: 2, bevel: 0, r: [0, -0.7, 0] }),
      sp(0.02, 0.04, 0.03, 0.012, "#c6a15b", { ...CHROME, detail: 2 }),
    ],
  },
  ac: {
    label: "A/C unit", brand: "Generic", cat: "Lighting & devices", w: 0.9, d: 0.27, h: 2.4,
    parts: [
      b(0, 2.25, 0, 0.9, 0.3, 0.25, "#f2f3f4", { ...PLASTIC, m: true, bevel: 0.03 }),
      b(0, 2.12, 0.09, 0.8, 0.04, 0.08, "#d5d8db", { ...PLASTIC, bevel: 0.008, r: [0.3, 0, 0] }),
      b(0, 2.19, 0.125, 0.8, 0.01, 0.01, "#9aa0a6", { ...PLASTIC, bevel: 0 }),
      b(0, 2.2, 0.12, 0.8, 0.01, 0.01, "#9aa0a6", { ...PLASTIC, bevel: 0 }),
      b(0.35, 2.3, 0.126, 0.04, 0.02, 0.01, "#4aa3ff", { bevel: 0 }),
      b(0.28, 2.3, 0.126, 0.02, 0.02, 0.01, "#6ee7a8", { bevel: 0 }),
      b(0, 2.38, 0, 0.88, 0.02, 0.24, "#e4e6e8", { ...PLASTIC, bevel: 0.006 }),
      b(0, 2.28, 0.126, 0.82, 0.14, 0.003, "#e8eaec", { ...GLOSS, bevel: 0 }),
      b(0, 2.12, 0.1, 0.7, 0.012, 0.02, "#9aa0a6", { ...PLASTIC, bevel: 0.004, spin: { axis: "x", rpm: 90 } }), // louvre flap
      // filter slats, side seams, wall bracket
      ...[-0.3, -0.15, 0, 0.15, 0.3].map((x) => seam(x, 2.3, 0.128, 0.004, 0.12, 0.003, "#cfd2d6")),
      seam(0, 2.17, 0.126, 0.82, 0.004, 0.004, "#cfd2d6"),
      b(0, 2.33, 0.126, 0.5, 0.015, 0.003, "#b8bcc2", { ...STEEL, detail: 2, bevel: 0 }),
    ],
  },
  marker: {
    label: "Sensor marker", brand: "Generic", cat: "Lighting & devices", w: 0.2, d: 0.2, h: 0.2,
    light: { y: 0.1, color: "#6ee7a8" },
    parts: [cy(0, 0.015, 0, 0.18, 0.03, DARK, { ...PLASTIC }), b(0, 0.11, 0, 0.2, 0.18, 0.2, "#6ee7a8", { glow: true, ...DIFFUSER, bevel: 0.03 })],
  },
  echo_dot: {
    label: "Amazon Echo Dot", brand: "Generic", cat: "Lighting & devices", w: 0.1, d: 0.1, h: 0.09,
    light: { y: 0.06, color: "#2f9bff" },
    parts: [
      turned(0, 0, 0, [[0.04, 0], [0.05, 0.012], [0.05, 0.062], [0.046, 0.07]], "#3d4044", { tex: "fabric", rough: 0.95 }), // fabric puck
      cy(0, 0.074, 0, 0.1, 0.008, "#2f9bff", { glow: true, ...GLOSS }), // light ring
      cy(0, 0.084, 0, 0.082, 0.012, "#17181a", { ...PLASTIC }), // top plate
      // action buttons + mic hole on the top plate
      ...[-0.02, 0.02].map((x) => cy(x, 0.0905, 0.0, 0.012, 0.003, "#2a2c30", { ...RUBBER, detail: 2 })),
      cy(0, 0.0905, 0.025, 0.006, 0.003, "#6a6d72", { detail: 2 }),
    ],
  },
  // ---------- Decor ----------
  plant: fejkaPlant(),
  rug: {
    label: "Rug 2x1.4", brand: "Generic", cat: "Decor", w: 2.0, d: 1.4, h: 0.02,
    parts: [
      b(0, 0.006, 0, 2.0, 0.012, 1.4, "#b9b2a6", { ...FAB, m: true, bevel: 0.005 }),
      b(0, 0.0135, 0, 1.8, 0.003, 1.2, "#cfc9be", { ...FAB, bevel: 0.0012 }),
      b(0, 0.0155, 0, 1.6, 0.003, 1.0, "#b9b2a6", { ...FAB, m: true, bevel: 0.0012 }),
      b(0, 0.0175, 0, 1.4, 0.003, 0.8, "#cfc9be", { ...FAB, bevel: 0.0012 }),
      b(0, 0.0165, -0.53, 1.8, 0.003, 0.03, "#8d9299", { ...FAB, bevel: 0.001 }),
      b(0, 0.0165, 0.53, 1.8, 0.003, 0.03, "#8d9299", { ...FAB, bevel: 0.001 }),
      ...[-0.8, -0.4, 0, 0.4, 0.8].map((x) => b(x, 0.0185, 0, 0.12, 0.003, 0.8, "#a39b8f", { ...FAB, bevel: 0.001 })),
      ...[-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].flatMap((x) => [b(x, 0.005, -0.7 + 0.005, 0.04, 0.01, 0.01, "#e8e0d0", { ...FAB, bevel: 0.002 }), b(x, 0.005, 0.695, 0.04, 0.01, 0.01, "#e8e0d0", { ...FAB, bevel: 0.002 })]),
      // border piping and corner tufts
      seam(0, 0.0125, 0.0, 1.96, 0.002, 1.36, "#a39b8f"),
      ...[-0.99, 0.99].map((x) => seam(x, 0.0125, 0, 0.01, 0.004, 1.38, "#8d9299")),
      ...[-0.69, 0.69].map((z) => seam(0, 0.0125, z, 1.98, 0.004, 0.01, "#8d9299")),
    ],
  },
  custom: {
    label: "Custom box", brand: "Generic", cat: "Decor", w: 1, d: 1, h: 1,
    parts: [b(0, 0.5, 0, 1, 1, 1, "#c9a26b", { ...WOOD, m: true, bevel: 0.012 })],
  },
  curtain: {
    wall: true, label: "Curtain", brand: "Generic", cat: "Decor", w: 1.4, d: 0.1, h: 2.4,
    parts: [
      b(0, 2.34, 0, 1.4, 0.03, 0.03, DARK, { ...BLACK_METAL, bevel: 0.006 }),
      sp(-0.67, 2.34, 0, 0.06, DARK, { ...BLACK_METAL }),
      sp(0.67, 2.34, 0, 0.06, DARK, { ...BLACK_METAL }),
      ...[-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6].map((x, i) => b(x, 1.15, i % 2 ? 0.02 : -0.02, 0.2, 2.2, 0.05, "#cdbfa6", { m: true, tex: "fabric", layer: "sheer" })),
      b(0, 2.26, 0, 1.36, 0.1, 0.07, "#b9ad96", { m: true, tex: "fabric" }),
      b(-0.6, 0.9, 0.03, 0.12, 0.03, 0.04, "#8c4a3e", { tex: "fabric" }),
      b(0.6, 0.9, 0.03, 0.12, 0.03, 0.04, "#8c4a3e", { tex: "fabric" }),
      // appended (part indices above drive the cloth rig): round rod, rings, end caps
      cy(0, 2.34, 0, 0.04, 1.36, DARK, { ...BLACK_METAL, r: [0, 0, PI2] }),
      ...[-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6].map((x) => cy(x, 2.34, 0, 0.052, 0.012, BRASS, { ...STEEL, detail: 1, r: [0, 0, PI2] })),
    ],
  },
  wall_art: {
    wall: true, label: "Wall pictures", brand: "Generic", cat: "Decor", w: 1.0, d: 0.05, h: 1.85,
    parts: [
      b(-0.25, 1.5, 0, 0.45, 0.55, 0.03, "#3b2f2a", { ...WOOD, bevel: 0.008 }),
      b(-0.25, 1.5, 0.008, 0.39, 0.49, 0.03, "#e8e0d0", { tex: "paint", rough: 0.9, bevel: 0 }),
      b(-0.25, 1.44, 0.02, 0.33, 0.2, 0.01, "#4a6b8a", { tex: "paint", rough: 0.8, bevel: 0 }),
      b(-0.25, 1.58, 0.02, 0.33, 0.16, 0.01, "#d9a02c", { tex: "paint", rough: 0.8, bevel: 0 }),
      b(0.28, 1.66, 0, 0.32, 0.32, 0.03, "#c9a26b", { ...WOOD, bevel: 0.008 }),
      b(0.28, 1.66, 0.008, 0.26, 0.26, 0.03, "#e8e0d0", { tex: "paint", rough: 0.9, bevel: 0 }),
      cy(0.28, 1.66, 0.02, 0.16, 0.01, "#b7503c", { tex: "paint", rough: 0.8, r: [PI2, 0, 0] }),
      b(0.28, 1.28, 0, 0.32, 0.28, 0.03, "#3b2f2a", { ...WOOD, bevel: 0.008 }),
      b(0.28, 1.28, 0.008, 0.26, 0.22, 0.03, "#5b7a5e", { tex: "paint", rough: 0.8, bevel: 0 }),
      b(0.28, 1.24, 0.02, 0.2, 0.08, 0.01, LEAF3, { tex: "paint", rough: 0.8, bevel: 0 }),
      // glazing reflections, inner frame lips, hangers
      b(-0.25, 1.5, 0.037, 0.39, 0.49, 0.002, "#f2f6f8", { ...GLOSS, detail: 1, bevel: 0 }),
      b(0.28, 1.66, 0.037, 0.26, 0.26, 0.002, "#f2f6f8", { ...GLOSS, detail: 1, bevel: 0 }),
      b(0.28, 1.28, 0.037, 0.26, 0.22, 0.002, "#f2f6f8", { ...GLOSS, detail: 1, bevel: 0 }),
      seam(-0.25, 1.74, 0.018, 0.4, 0.008, 0.006, "#2a211d"),
      seam(0.28, 1.815, 0.018, 0.28, 0.008, 0.006, "#a6824f"),
      ...[[-0.25, 1.77], [0.28, 1.83], [0.28, 1.44]].map(([x, y]) => cy(x, y, -0.016, 0.012, 0.01, BRASS, { ...STEEL, detail: 2, r: [PI2, 0, 0] })),
    ],
  },
  wall_shelf: {
    wall: true, label: "Wall shelf", brand: "Generic", cat: "Decor", w: 0.8, d: 0.22, h: 1.75,
    parts: [
      b(0, 1.4, 0, 0.8, 0.03, 0.22, OAK, { ...WOOD, m: true, bevel: 0.008 }),
      b(-0.3, 1.36, -0.05, 0.03, 0.06, 0.1, DARK, { ...BLACK_METAL, bevel: 0.006 }),
      b(0.3, 1.36, -0.05, 0.03, 0.06, 0.1, DARK, { ...BLACK_METAL, bevel: 0.006 }),
      ...bookRow(-0.36, 1.415, 0.0, 5, 0.16, 0.2, 0.04),
      turned(0.15, 1.415, 0, vaseProfile(0.05, 0.12), "#e8e0d0", { ...CERAMIC }),
      sp(0.15, 1.58, 0.0, 0.14, LEAF2),
      turned(0.3, 1.415, 0.02, bowlProfile(0.04, 0.05, 4), "#b8742c", { ...CERAMIC }),
      // bracket arms, screws, front edge
      ...[-0.3, 0.3].map((x) => b(x, 1.33, -0.1, 0.03, 0.12, 0.012, DARK, { ...BLACK_METAL, detail: 1, bevel: 0.004 })),
      ...[-0.3, 0.3].flatMap((x) => [1.3, 1.36].map((y) => cy(x, y, -0.106, 0.01, 0.006, "#b8bcc2", { ...CHROME, detail: 2, r: [PI2, 0, 0] }))),
      seam(0, 1.4, 0.112, 0.78, 0.004, 0.004, "#a6824f"),
    ],
  },
  mirror: {
    wall: true, label: "Mirror", brand: "Generic", cat: "Decor", w: 0.5, d: 0.05, h: 1.6,
    parts: [
      b(0, 0.03, 0, 0.5, 0.06, 0.04, OAK, { ...WOOD, m: true, bevel: 0.01 }),
      b(0, 1.57, 0, 0.5, 0.06, 0.04, OAK, { ...WOOD, m: true, bevel: 0.01 }),
      b(-0.22, 0.8, 0, 0.06, 1.48, 0.04, OAK, { ...WOOD, m: true, bevel: 0.01 }),
      b(0.22, 0.8, 0, 0.06, 1.48, 0.04, OAK, { ...WOOD, m: true, bevel: 0.01 }),
      b(0, 0.8, 0, 0.38, 1.48, 0.02, "#b9cfd9", { tex: "metal", metal: 1, rough: 0.04, bevel: 0 }),
      b(-0.08, 1.1, 0.012, 0.04, 0.7, 0.005, "#e6f1f6", { ...GLOSS, bevel: 0, r: [0, 0, 0.15] }),
      b(0.04, 0.5, 0.012, 0.02, 0.4, 0.005, "#e6f1f6", { ...GLOSS, bevel: 0, r: [0, 0, 0.15] }),
      // inner bevel lip, back board, hanger
      b(0, 0.8, 0.003, 0.4, 1.5, 0.004, "#8a6a40", { ...WOOD, detail: 1, bevel: 0 }),
      b(0, 0.8, -0.016, 0.44, 1.52, 0.008, "#6b4a35", { ...WOOD, detail: 1, bevel: 0 }),
      cy(0, 1.5, -0.024, 0.02, 0.008, BRASS, { ...STEEL, detail: 2, r: [PI2, 0, 0] }),
    ],
  },
  door_mat: {
    label: "Door mat", brand: "Generic", cat: "Decor", w: 0.8, d: 0.5, h: 0.03,
    parts: [
      b(0, 0.0125, 0, 0.8, 0.025, 0.5, "#6b4a35", { ...FAB, m: true, bevel: 0.008 }),
      b(0, 0.027, 0, 0.7, 0.004, 0.4, "#8a6a45", { ...FAB, bevel: 0.002 }),
      ...[-0.2, 0, 0.2].map((z) => b(0, 0.0275, z * 0.8, 0.6, 0.004, 0.04, "#4a3a2e", { ...FAB, bevel: 0.002 })),
      // rubber backing, bristle edge
      b(0, 0.002, 0, 0.78, 0.004, 0.48, "#17181a", { ...RUBBER, detail: 1, bevel: 0.002 }),
      ...[-0.34, 0.34].map((x) => seam(x, 0.0285, 0, 0.012, 0.002, 0.36, "#4a3a2e", { detail: 2 })),
    ],
  },
  column: {
    label: "Structural column", brand: "Generic", cat: "Decor", w: 0.55, d: 0.55, h: 2.58, solid: true, pillar: true,
    parts: [
      b(0, 1.27, 0, 0.55, 2.54, 0.55, "#9a9ea3", { tex: "stone", rough: 0.85, bevel: 0.006 }),
      b(0, 2.56, 0, 0.57, 0.04, 0.57, "#aeb2b7", { ...STONE, rough: 0.8, bevel: 0.008 }),
      b(0, 0.03, 0, 0.57, 0.06, 0.57, "#aeb2b7", { ...STONE, rough: 0.8, bevel: 0.008, detail: 1 }),
      seam(0, 1.27, 0.276, 0.004, 2.4, 0.004, "#8a8e93"),
      seam(0, 2.5, 0.28, 0.56, 0.02, 0.01, "#9a9ea3"),
    ],
  },
  column_round: {
    label: "Round column", brand: "Generic", cat: "Decor", w: 0.4, d: 0.4, h: 2.58, solid: true, pillar: true,
    parts: [
      cy(0, 1.27, 0, 0.4, 2.54, "#9a9ea3", { tex: "stone", rough: 0.85 }),
      cy(0, 2.56, 0, 0.42, 0.04, "#aeb2b7", { ...STONE, rough: 0.8 }),
      turned(0, 0, 0, [[0.215, 0], [0.215, 0.04], [0.2, 0.06]], "#aeb2b7", { ...STONE, rough: 0.8, detail: 1 }),
      cy(0, 2.5, 0, 0.43, 0.02, "#9a9ea3", { ...STONE, rough: 0.8, detail: 1 }),
    ],
  },
  balcony_railing: {
    label: "Balcony railing", brand: "Generic", cat: "Outdoor", w: 1.0, d: 0.06, h: 1.1, solid: true,
    parts: [
      b(0, 1.085, 0, 1.0, 0.03, 0.05, "#3a3d42", { ...BLACK_METAL, m: true, bevel: 0.012 }), // flat handrail
      b(0, 0.25, 0, 1.0, 0.03, 0.03, "#3a3d42", { ...BLACK_METAL, m: true, bevel: 0.008 }), // lower rail
      b(0, 0.01, 0, 1.0, 0.02, 0.06, "#3a3d42", { ...BLACK_METAL, bevel: 0.005 }), // base plate
      ...Array.from({ length: 8 }, (_, i) => cy(-0.385 + i * 0.11, 0.57, 0, 0.02, 1.0, "#3a3d42", { ...BLACK_METAL })),
      ...[-0.48, 0.48].map((x) => cy(x, 0.55, 0, 0.04, 1.1, "#3a3d42", { ...BLACK_METAL })),
      // post caps, base bolts, rail joint
      ...[-0.48, 0.48].map((x) => sp(x, 1.1, 0, 0.05, "#3a3d42", { ...BLACK_METAL, detail: 1 })),
      ...[-0.4, 0.4].map((x) => cy(x, 0.025, 0, 0.016, 0.008, "#8d9299", { ...CHROME, detail: 2 })),
      b(0, 1.066, 0, 1.0, 0.006, 0.03, "#2a2c30", { ...BLACK_METAL, detail: 1, bevel: 0 }),
    ],
  },
});
