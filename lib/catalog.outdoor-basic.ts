import type { Def } from "./catalog";
import { b, cy, sp, turned, taperedLeg, cushion, pillow, seam, WOOD, STONE, STEEL, CHROME, BLACK_METAL, PLASTIC, RUBBER, CERAMIC } from "./partsKit.ts";
import { CREAM, LEAF1, LEAF2, LEAF3, WHITE, DARK, OAK, LEAFM, SOILM, GLASSM, ALU, ring, cz, pipe } from "./catalog.outdoor-kit.ts";

// The original outdoor basics (garden shed ... rain barrel), moved out of catalog.ts and given the realism fields. The ids and sizes are unchanged.
const METAL = "#b8bcc2", ORANGE = "#b8742c", BRICK = "#8c4a3e", BARK = "#6b4a35", PI2 = Math.PI / 2;
const piece = (label: string, w: number, d: number, h: number, parts: Def["parts"], extra: Partial<Pick<Def, "light">> = {}): Def => ({ label, brand: "Generic", cat: "Outdoor", w, d, h, parts, ...extra });

const gardenShed = piece("Garden shed", 2.4, 1.8, 2.2, [
  b(0, 1.0, 0, 2.2, 2.0, 1.6, LEAF3, { ...WOOD, m: true }),
  b(0, 0.03, 0, 2.3, 0.06, 1.7, "#6a6d72", { ...STONE, bevel: 0.01 }),
  b(0, 2.1, 0, 2.4, 0.2, 1.8, "#3a3d42", { tex: "rubber", rough: 0.9, bevel: 0.012 }),
  b(0, 2.2 - 0.02, 0.0, 1.0, 0.04, 1.8, "#4a4d52", { tex: "rubber", rough: 0.9, bevel: 0.006 }),
  ...[-1.09, 1.09].flatMap((x) => [-0.79, 0.79].map((z) => b(x, 1.0, z, 0.06, 2.0, 0.06, CREAM, { tex: "paint", rough: 0.6, bevel: 0.008 }))),
  b(-0.4, 0.9, 0.803, 0.78, 1.78, 0.01, CREAM, { tex: "paint", rough: 0.6, bevel: 0.004 }),
  b(-0.4, 0.9, 0.81, 0.7, 1.7, 0.02, BARK, { ...WOOD, bevel: 0.006 }),
  b(-0.4, 0.9, 0.822, 0.015, 1.6, 0.01, "#4a3a2e", { ...WOOD, bevel: 0 }),
  b(-0.15, 0.9, 0.83, 0.04, 0.12, 0.02, METAL, { ...STEEL, bevel: 0.008 }),
  b(0.6, 1.3, 0.803, 0.6, 0.6, 0.01, CREAM, { tex: "paint", rough: 0.6, bevel: 0.004 }),
  b(0.6, 1.3, 0.812, 0.5, 0.5, 0.01, "#8fb0c8", GLASSM),
  b(0.6, 1.3, 0.822, 0.02, 0.5, 0.01, CREAM, { tex: "paint", rough: 0.6, bevel: 0 }),
  b(0.6, 1.3, 0.822, 0.5, 0.02, 0.01, CREAM, { tex: "paint", rough: 0.6, bevel: 0 }),
  b(0.6, 0.98, 0.85, 0.6, 0.1, 0.08, BARK, { ...WOOD, bevel: 0.008 }),
  sp(0.45, 1.06, 0.85, 0.1, LEAF2, LEAFM),
  sp(0.62, 1.07, 0.85, 0.1, LEAF1, LEAFM),
  sp(0.77, 1.06, 0.85, 0.1, "#c84b4b", LEAFM),
  b(-0.95, 0.22, 0.84, 0.24, 0.3, 0.1, BARK, { ...WOOD, bevel: 0.01 }),
  ...[-1, 1].flatMap((s) => Array.from({ length: 8 }, (_, i) => seam(s * 1.102, 1.0, -0.7 + i * 0.2, 0.004, 1.96, 0.006, "#24401f"))), // board joints on the side walls
  ...[0.4, 1.6].map((y) => b(-0.7, y, 0.832, 0.1, 0.03, 0.008, DARK, { ...BLACK_METAL, bevel: 0, detail: 2 })), // door hinges
  b(0.6, 1.3 - 0.305, 0.84, 0.64, 0.03, 0.05, CREAM, { tex: "paint", rough: 0.6, bevel: 0.006, detail: 1 }), // window sill
  b(0, 2.205, 0.9, 2.44, 0.03, 0.04, "#2a2c30", { ...ALU, bevel: 0.006, detail: 1 }), // roof drip edge
]);

const patioTable = piece("Patio table", 1.0, 1.0, 0.74, [
  turned(0, 0.64, 0, [[0.47, 0], [0.5, 0.01], [0.5, 0.03], [0.47, 0.04]], DARK, { ...BLACK_METAL, m: true }),
  cy(0, 0.62, 0, 0.92, 0.03, "#2a2c30", BLACK_METAL),
  b(0, 0.685, 0, 0.9, 0.006, 0.04, "#2a2c30", { ...BLACK_METAL, bevel: 0 }),
  b(0, 0.685, 0, 0.04, 0.006, 0.9, "#2a2c30", { ...BLACK_METAL, bevel: 0 }),
  turned(0, 0.03, 0, [[0.05, 0], [0.04, 0.02], [0.04, 0.58], [0.05, 0.6]], DARK, BLACK_METAL),
  turned(0, 0, 0, [[0.2, 0], [0.25, 0.005], [0.25, 0.015], [0.12, 0.03]], DARK, BLACK_METAL),
  cy(0, 0.04, 0, 0.2, 0.04, DARK, BLACK_METAL),
  turned(0, 0.68, 0, [[0.04, 0], [0.06, 0.012], [0.045, 0.03], [0.05, 0.06]], "#e8e0d0", CERAMIC),
  cy(0, 0.735, 0, 0.1, 0.01, "#ffcf8a", { rough: 0.5 }),
  turned(0.28, 0.6875, 0.1, [[0.05, 0], [0.08, 0.01], [0.09, 0.015]], WHITE, CERAMIC),
  turned(-0.3, 0.67, -0.1, [[0.025, 0], [0.035, 0.04]], "#4a6b8a", CERAMIC),
  ...[0, 1, 2, 3].map((i) => pipe([0, 0.6, 0], [0.4 * Math.cos(i * PI2), 0.61, 0.4 * Math.sin(i * PI2)], 0.02, DARK, { ...BLACK_METAL, detail: 1 })), // spokes under the top
  cy(0, 0.69, 0, 0.12, 0.004, "#cfc8b8", { ...CERAMIC, detail: 1 }), // candle dish
]);

const patioChair = piece("Patio chair", 0.5, 0.5, 0.88, [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.205, sz * 0.205, 0.43, 0.04, 0.028, DARK, BLACK_METAL))),
  ...[-0.15, 0, 0.15].map((z) => b(0, 0.45, z, 0.45, 0.04, 0.12, ORANGE, { ...WOOD, bevel: 0.008, m: true })),
  ...[0.6, 0.7, 0.8].map((y) => b(0, y, -0.205, 0.45, 0.07, 0.04, ORANGE, { ...WOOD, bevel: 0.01, m: true })),
  b(-0.2, 0.65, -0.205, 0.04, 0.46, 0.04, DARK, { ...BLACK_METAL, bevel: 0.01 }),
  b(0.2, 0.65, -0.205, 0.04, 0.46, 0.04, DARK, { ...BLACK_METAL, bevel: 0.01 }),
  b(-0.23, 0.62, 0.0, 0.04, 0.04, 0.4, DARK, { ...BLACK_METAL, bevel: 0.015 }),
  b(0.23, 0.62, 0.0, 0.04, 0.04, 0.4, DARK, { ...BLACK_METAL, bevel: 0.015 }),
  cushion(0, 0.49, 0.02, 0.4, 0.04, 0.34, CREAM, { bevel: 0.016 }),
  sp(-0.2, 0.86, -0.205, 0.045, DARK, BLACK_METAL),
  sp(0.2, 0.86, -0.205, 0.045, DARK, BLACK_METAL),
  b(0, 0.41, 0, 0.4, 0.03, 0.4, DARK, { ...BLACK_METAL, detail: 1 }), // seat frame
  ...[-0.08, 0.1].map((z) => seam(0, 0.5115, z, 0.38, 0.002, 0.005, "#c9b895")), // piping
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.205, 0.008, sz * 0.205, 0.03, 0.016, "#1c1d20", { ...RUBBER, detail: 1 }))), // leg caps
]);

const bench = piece("Garden bench", 1.5, 0.5, 0.88, [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.67, sz * 0.195, 0.43, 0.06, 0.04, DARK, BLACK_METAL))),
  ...[-0.14, 0.02, 0.18].map((z) => b(0, 0.45, z, 1.5, 0.05, 0.14, OAK, { ...WOOD, bevel: 0.01, m: true })),
  ...[0.58, 0.7, 0.82].map((y) => b(0, y, -0.21, 1.5, 0.1, 0.04, OAK, { ...WOOD, bevel: 0.01, m: true })),
  b(-0.72, 0.6, -0.21, 0.06, 0.55, 0.06, DARK, { ...BLACK_METAL, bevel: 0.012 }),
  b(0.72, 0.6, -0.21, 0.06, 0.55, 0.06, DARK, { ...BLACK_METAL, bevel: 0.012 }),
  b(-0.72, 0.62, 0.0, 0.06, 0.04, 0.4, DARK, { ...BLACK_METAL, bevel: 0.015 }),
  b(0.72, 0.62, 0.0, 0.06, 0.04, 0.4, DARK, { ...BLACK_METAL, bevel: 0.015 }),
  cushion(-0.5, 0.5, 0.02, 0.4, 0.04, 0.3, "#b8742c", { bevel: 0.016 }),
  pillow(0.1, 0.545, -0.15, 0.4, 0.1, 0.06, "#cdbfa6"),
  ...[-1, 1].map((s) => b(s * 0.72, 0.65, 0.0, 0.07, 0.025, 0.44, DARK, { ...BLACK_METAL, bevel: 0.01, detail: 1 })), // arm caps
  b(0, 0.41, 0.02, 1.34, 0.03, 0.34, DARK, { ...BLACK_METAL, detail: 1 }), // seat frame
  ...[-1, 1].flatMap((s) => [0.62, 0.78].map((y) => sp(s * 0.72, y, -0.185, 0.02, METAL, { ...CHROME, detail: 2 }))), // bolts
  seam(-0.5, 0.5215, 0.02, 0.38, 0.002, 0.005, "#8a5a22"),
]);

const FENCE_WOOD = { ...WOOD, bevel: 0.004 };
const fence = piece("Fence", 1.8, 0.09, 1.1, [
  b(-0.86, 0.55, 0, 0.08, 1.1, 0.08, BARK, { ...WOOD, bevel: 0.008 }),
  b(0.86, 0.55, 0, 0.08, 1.1, 0.08, BARK, { ...WOOD, bevel: 0.008 }),
  b(0, 0.3, -0.02, 1.8, 0.06, 0.04, BARK, FENCE_WOOD),
  b(0, 0.8, -0.02, 1.8, 0.06, 0.04, BARK, FENCE_WOOD),
  ...[-0.7, -0.5, -0.3, -0.1, 0.1, 0.3, 0.5, 0.7].flatMap((x, i) => [
    b(x, 0.5 - (i % 3) * 0.02, 0.03, 0.15, 1.0 - (i % 3) * 0.04, 0.03, i % 2 ? "#9a7048" : "#8a6240", { ...FENCE_WOOD, m: true }),
    b(x, 1.0 - (i % 3) * 0.04 - 0.02 + 0.0, 0.03, 0.17, 0.04, 0.03, "#b08a5a", FENCE_WOOD),
  ]),
  ...[-0.86, 0.86].map((x) => b(x, 1.115, 0, 0.1, 0.03, 0.1, BARK, { ...WOOD, bevel: 0.01, detail: 1 })), // post caps
  ...[-0.7, -0.5, -0.3, -0.1, 0.1, 0.3, 0.5, 0.7].map((x) => sp(x, 0.3, 0.047, 0.012, METAL, { ...STEEL, detail: 2 })), // nail heads
]);

const planter = piece("Planter", 0.8, 0.46, 0.7, [
  b(0, 0.2, 0, 0.78, 0.4, 0.4, BRICK, { ...STONE, rough: 0.9, bevel: 0.01, m: true }),
  b(0, 0.395, 0, 0.8, 0.03, 0.44, "#a65a4a", { ...STONE, rough: 0.8, bevel: 0.008, m: true }),
  b(0, 0.405, 0, 0.7, 0.02, 0.34, "#4a3a2e", SOILM),
  b(0, 0.04, 0.2, 0.7, 0.02, 0.01, "#6e382f", { ...STONE, bevel: 0.002 }),
  sp(-0.2, 0.5, 0, 0.36, LEAF1, LEAFM),
  sp(0.2, 0.5, 0, 0.36, LEAF2, LEAFM),
  sp(0, 0.52, 0, 0.36, LEAF1, LEAFM),
  sp(-0.05, 0.58, 0.02, 0.2, LEAF2, LEAFM),
  sp(0.28, 0.6, 0.05, 0.1, "#d9a02c", LEAFM),
  sp(-0.3, 0.6, -0.03, 0.1, "#c84b4b", LEAFM),
  sp(0.1, 0.62, -0.05, 0.1, "#e8d8f0", LEAFM),
  ...[0.1, 0.2, 0.3, 0.37].map((y) => seam(0, y, 0.2005, 0.78, 0.004, 0.003, "#6e382f")), // brick courses
  ...[-1, 1].map((s) => seam(s * 0.3905, 0.2, 0, 0.003, 0.36, 0.4, "#6e382f")),
  sp(0.12, 0.64, 0.08, 0.06, "#d9a02c", { ...LEAFM, detail: 2 }), sp(-0.16, 0.63, 0.06, 0.06, "#e8d8f0", { ...LEAFM, detail: 2 }), sp(0.32, 0.55, -0.06, 0.05, "#c84b4b", { ...LEAFM, detail: 2 }),
]);

const birdBath = piece("Bird bath", 0.5, 0.5, 0.8, [
  turned(0, 0, 0, [[0.12, 0], [0.16, 0.015], [0.16, 0.04], [0.1, 0.06]], "#9aa0a6", STONE),
  turned(0, 0.06, 0, [[0.07, 0], [0.04, 0.06], [0.06, 0.19], [0.035, 0.3], [0.05, 0.38]], METAL, STONE),
  turned(0, 0.47, 0, [[0.05, 0], [0.1, 0.03], [0.1, 0.06]], "#9aa0a6", STONE),
  turned(0, 0.55, 0, [[0.1, 0], [0.18, 0.03], [0.24, 0.07], [0.25, 0.1]], METAL, STONE),
  cy(0, 0.655, 0, 0.44, 0.02, "#7fb2c8", { rough: 0.05, metal: 0.1 }),
  sp(0.05, 0.72, 0.03, 0.1, "#b5774a", { tex: "fabric", rough: 0.9 }),
  b(0.1, 0.72, 0.03, 0.05, 0.04, 0.03, ORANGE, { ...PLASTIC, bevel: 0.004 }),
  b(-0.15, 0.7, -0.1, 0.1, 0.006, 0.07, ORANGE, { ...LEAFM, bevel: 0.002, r: [0, 0.5, 0] }),
  b(-0.02, 0.71, 0.03, 0.06, 0.02, 0.03, "#8a5a3a", { tex: "fabric", rough: 0.9, bevel: 0.008, detail: 1, r: [0, 0, 0.4] }), // tail
  sp(0.085, 0.745, 0.05, 0.012, DARK, { ...PLASTIC, detail: 2 }), // eye
  cy(0.0, 0.667, 0.0, 0.3, 0.002, "#b9dcea", { rough: 0.02, detail: 1 }), // ripple
]);

const outdoorLantern = piece("Garden lantern", 0.25, 0.25, 0.6, [
  turned(0, 0, 0, [[0.09, 0], [0.1, 0.01], [0.1, 0.025], [0.06, 0.04]], DARK, BLACK_METAL),
  turned(0, 0.04, 0, [[0.03, 0], [0.02, 0.05], [0.02, 0.2], [0.03, 0.26]], DARK, BLACK_METAL),
  b(0, 0.32, 0, 0.18, 0.03, 0.18, DARK, { ...BLACK_METAL, bevel: 0.006 }),
  b(0, 0.44, 0, 0.14, 0.2, 0.14, "#ffcf8a", { glow: true }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.075, 0.44, sz * 0.075, 0.02, 0.22, 0.02, DARK, { ...BLACK_METAL, bevel: 0.004 }))),
  b(0, 0.57, 0, 0.2, 0.03, 0.2, DARK, { ...BLACK_METAL, bevel: 0.008 }),
  b(0, 0.585, 0, 0.1, 0.03, 0.1, DARK, { ...BLACK_METAL, bevel: 0.006 }),
  ...[0.36, 0.52].map((y) => b(0, y, 0, 0.16, 0.012, 0.16, DARK, { ...BLACK_METAL, bevel: 0.002, detail: 1 })), // cage rings
  b(0, 0.545, 0, 0.17, 0.02, 0.17, DARK, { ...BLACK_METAL, bevel: 0.004, detail: 1 }), // eaves trim
], { light: { y: 0.5, color: "#ffcf8a" } });

const steppingStones = piece("Stepping stones", 1.6, 0.5, 0.05, [
  ...([[-0.62, 0.04, 0.34, "#8d9299"], [-0.32, -0.06, 0.3, "#9aa0a6"], [0.0, 0.06, 0.36, "#8d9299"], [0.34, -0.04, 0.32, "#9aa0a6"], [0.64, 0.05, 0.3, "#8d9299"]] as const)
    .map(([x, z, dia, c]) => turned(x, 0, z, [[dia * 0.46, 0], [dia / 2, 0.008], [dia / 2, 0.032], [dia * 0.46, 0.04]], c, STONE)),
  b(-0.62, 0.042, 0.08, 0.1, 0.008, 0.08, LEAF2, { ...LEAFM, bevel: 0 }),
  b(0.0, 0.042, 0.02, 0.08, 0.008, 0.08, LEAF1, { ...LEAFM, bevel: 0 }),
  b(0.34, 0.042, -0.02, 0.1, 0.008, 0.06, ORANGE, { ...LEAFM, bevel: 0 }),
  ...[[-0.7, 0.0], [0.05, 0.12], [0.42, -0.1], [-0.3, -0.05]].map(([x, z]) => sp(x, 0.046, z, 0.025, "#7d8288", { ...STONE, detail: 1 })), // chips
]);

const wheelbarrow = (() => {
  const BLUE = "#3a5f7a", pan = { tex: "metal", metal: 0.4, rough: 0.5 } as const;
  return piece("Wheelbarrow", 0.6, 1.3, 0.6, [
    b(0, 0.34, 0.05, 0.5, 0.04, 0.65, BLUE, { ...pan, bevel: 0.012 }),
    b(-0.26, 0.42, 0.05, 0.04, 0.2, 0.65, BLUE, { ...pan, bevel: 0.01, r: [0, 0, -0.2] }),
    b(0.26, 0.42, 0.05, 0.04, 0.2, 0.65, BLUE, { ...pan, bevel: 0.01, r: [0, 0, 0.2] }),
    b(0, 0.42, 0.37, 0.5, 0.2, 0.04, BLUE, { ...pan, bevel: 0.01 }),
    b(0, 0.42, -0.27, 0.5, 0.2, 0.04, BLUE, { ...pan, bevel: 0.01 }),
    b(0, 0.47, 0.05, 0.42, 0.1, 0.55, "#4a3a2e", SOILM),
    sp(-0.1, 0.5, 0.0, 0.2, LEAF2, LEAFM),
    sp(0.12, 0.5, 0.15, 0.16, ORANGE, LEAFM),
    turned(0, 0.12, 0.5, [[0.12, 0], [0.15, 0.012], [0.15, 0.048], [0.12, 0.06]], DARK, { ...RUBBER, r: [0, 0, PI2] }),
    b(-0.2, 0.22, 0.5, 0.02, 0.02, 0.1, METAL, { ...STEEL, bevel: 0.004 }),
    b(-0.22, 0.4, -0.35, 0.04, 0.04, 0.6, "#9a7048", { ...WOOD, bevel: 0.016 }),
    b(0.22, 0.4, -0.35, 0.04, 0.04, 0.6, "#9a7048", { ...WOOD, bevel: 0.016 }),
    b(-0.2, 0.2, -0.3, 0.04, 0.4, 0.04, "#6a6d72", { ...STEEL, bevel: 0.01 }),
    b(0.2, 0.2, -0.3, 0.04, 0.4, 0.04, "#6a6d72", { ...STEEL, bevel: 0.01 }),
    cy(0, 0.15, 0.5, 0.07, 0.08, METAL, { ...CHROME, detail: 1, r: [0, 0, PI2] }), // hub
    ...[-1, 1].map((s) => b(s * 0.1, 0.25, 0.46, 0.012, 0.25, 0.012, "#6a6d72", { ...STEEL, detail: 1, r: [0.25, 0, 0] })), // fork
    b(0, 0.51, 0.37, 0.5, 0.03, 0.05, BLUE, { ...pan, bevel: 0.01, detail: 1 }), // rolled rim
    ...[-0.18, 0.18].map((x) => sp(x, 0.42, 0.395, 0.015, METAL, { ...CHROME, detail: 2 })), // rivets
  ]);
})();

const rainBarrel = piece("Rain barrel", 0.5, 0.5, 0.8, [
  turned(0, 0.02, 0, [[0.215, 0], [0.238, 0.12], [0.245, 0.38], [0.238, 0.64], [0.215, 0.76]], BARK, WOOD),
  cy(0, 0.15, 0, 0.5, 0.04, DARK, BLACK_METAL),
  cy(0, 0.4, 0, 0.5, 0.04, DARK, BLACK_METAL),
  cy(0, 0.65, 0, 0.5, 0.04, DARK, BLACK_METAL),
  cy(0, 0.785, 0, 0.44, 0.03, "#4a3a2e", WOOD),
  cy(0, 0.8 - 0.005, 0, 0.3, 0.01, "#3a5f7a", { rough: 0.05, metal: 0.1 }),
  cz(0, 0.22, 0.23, 0.04, 0.06, METAL, CHROME),
  b(0, 0.2, 0.0, 0.0 + 0.04, 0.04, 0.04, BARK, WOOD),
  ...ring(8, 0.243, (x, z, a) => b(x, 0.4, z, 0.006, 0.7, 0.012, "#4a3322", { ...WOOD, bevel: 0, detail: 1, r: [0, -a, 0] }), PI2 / 4), // stave joints
  b(0, 0.26, 0.255, 0.05, 0.012, 0.012, METAL, { ...CHROME, detail: 2 }), // tap handle
]);

export const OUTDOOR_BASIC: Record<string, Def> = {
  garden_shed: gardenShed, patio_table: patioTable, patio_chair: patioChair, bench, fence, planter, bird_bath: birdBath, outdoor_lantern: outdoorLantern,
  stepping_stones: steppingStones, wheelbarrow, rain_barrel: rainBarrel,
};
