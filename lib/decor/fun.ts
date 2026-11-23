import type { Def, Part } from "../catalog.ts";
import { BLACK, BRASS, DARKWOOD, LEAF1, LEAF2, LEAF3, PI, PI2, TERRA, WOOD, b, cy, dims, discZ, piece, sp } from "./kit.ts";
import * as K from "../partsKit.ts";

const IVORY = "#f4f1e8";
const BLUE = "#4a9ad9";
const YELLOW = "#d9a02c";
const RED = "#d3563a";
const GREEN = "#5b9a5e";
const PLAY = [BLUE, YELLOW, RED, GREEN];
const BR: K.Opt = { tex: "metal", metal: 1, rough: 0.28 }; // polished brass
const PIANO: K.Opt = { ...K.LACQUER, rough: 0.18 }; // black piano lacquer
const LEAFY: K.Opt = { tex: "paint", rough: 0.9, bevel: 0 };

// ---------- music ----------
const keys = (x0: number, x1: number, y: number, z: number, n: number, len: number): Part[] => {
  const step = (x1 - x0) / n;
  return [
    b((x0 + x1) / 2, y, z, x1 - x0, 0.02, len, IVORY, { ...K.PLASTIC, rough: 0.3, bevel: 0.002 }),
    ...Array.from({ length: n }, (_, i) => ([0, 1, 3, 4, 5].includes(i % 7) ? b(x0 + step * (i + 1), y + 0.02, z - len * 0.18, step * 0.55, 0.022, len * 0.6, BLACK, { ...K.PLASTIC, rough: 0.25, bevel: 0.002 }) : null)).filter((p): p is Part => p !== null),
    // gaps between the white keys
    ...Array.from({ length: n - 1 }, (_, i) => b(x0 + step * (i + 1), y + 0.0105, z + len * 0.2, 0.002, 0.002, len * 0.6, "#9a968c", { ...K.PLASTIC, bevel: 0, detail: 1 })),
  ];
};
const upright = (): Def =>
  piece("Living", `Upright piano ${dims(1.5, 0.6)}`, 1.5, 0.6, 1.25, [
    b(0, 0.64, -0.06, 1.5, 1.1, 0.48, "#1a1b1e", { ...PIANO, bevel: 0.01, m: true }),
    b(0, 0.15, 0.2, 1.4, 0.3, 0.12, "#1a1b1e", { ...PIANO, bevel: 0.008, m: true }),
    b(0, 0.75, 0.2, 1.5, 0.05, 0.2, "#1a1b1e", { ...PIANO, bevel: 0.008, m: true }),
    ...keys(-0.6, 0.6, 0.79, 0.2, 21, 0.16),
    b(0, 0.82, 0.19, 1.3, 0.05, 0.04, "#1a1b1e", { ...PIANO, bevel: 0.004 }),
    b(0, 1.0, 0.18, 1.2, 0.26, 0.012, "#e8e0d0", { ...K.MATT, bevel: 0.002, r: [-0.15, 0, 0] }),
    b(0, 1.2, 0.0, 1.5, 0.05, 0.56, "#1a1b1e", { ...PIANO, bevel: 0.01, m: true }),
    ...[-1, 1].map((s) => b(s * 0.72, 0.1, 0.0, 0.06, 0.2, 0.5, "#1a1b1e", { ...PIANO, bevel: 0.008, m: true })),
    ...[-0.1, 0.0, 0.1].map((x) => b(x, 0.03, 0.29, 0.06, 0.02, 0.05, BRASS, { ...BR, bevel: 0.005 })),
    // panels, brass hinges and candle sconces
    b(0, 0.53, 0.183, 1.25, 0.32, 0.006, "#1a1b1e", { ...PIANO, bevel: 0.002, m: true, detail: 1 }),
    b(0, 1.1, 0.172, 1.3, 0.16, 0.006, "#1a1b1e", { ...PIANO, bevel: 0.002, m: true, detail: 1 }),
    b(0, 1.145, 0.0, 1.46, 0.04, 0.52, "#1a1b1e", { ...PIANO, bevel: 0.006, m: true, detail: 1 }),
    ...[-1, 1].map((s) => b(s * 0.55, 0.9, 0.185, 0.04, 0.14, 0.014, BRASS, { ...BR, bevel: 0.003, detail: 2 })),
    ...[-1, 1].map((s) => b(s * 0.62, 1.16, 0.27, 0.025, 0.008, 0.02, BRASS, { ...BR, bevel: 0.002, detail: 2 })),
  ]);
const digitalPiano = (): Def =>
  piece("Living", `Digital piano with stand ${dims(1.4, 0.35)}`, 1.4, 0.35, 1.02, [
    b(0, 0.77, 0.0, 1.4, 0.08, 0.3, "#26282b", { ...K.PLASTIC, bevel: 0.008 }),
    ...keys(-0.65, 0.65, 0.82, 0.03, 21, 0.2),
    b(-0.52, 0.86, -0.1, 0.16, 0.012, 0.06, "#4ad7ff", { glow: true }),
    ...[-1, 1].map((s) => b(s * 0.6, 0.38, 0, 0.05, 0.74, 0.28, "#26282b", { ...K.BLACK_METAL, bevel: 0.006 })),
    b(0, 0.35, -0.12, 1.15, 0.08, 0.04, "#26282b", { ...K.BLACK_METAL, bevel: 0.006 }),
    b(0, 0.06, 0.0, 0.5, 0.03, 0.3, "#26282b", { ...K.BLACK_METAL, bevel: 0.006 }),
    b(0, 0.92, -0.12, 0.6, 0.18, 0.01, "#e8e0d0", { ...K.MATT, bevel: 0.002, r: [-0.2, 0, 0] }),
    // panel buttons and sliders, pedal bar
    ...[0, 1, 2, 3, 4, 5].map((i) => cy(-0.3 + i * 0.06, 0.813, -0.1, 0.022, 0.008, i % 3 ? "#8d9299" : "#d9d9d9", { ...K.PLASTIC, bevel: 0.001, detail: 2 })),
    b(0, 0.058, 0.1, 0.3, 0.012, 0.02, BRASS, { ...BR, bevel: 0.003, detail: 1 }),
  ]);
const grand = (): Def => {
  const r = 0.75;
  return piece("Living", `Grand piano ${dims(1.5, 1.85)}`, 1.5, 1.85, 1.1, [
    b(0, 0.8, 0.375, 1.5, 0.14, 1.1, "#1a1b1e", { ...PIANO, bevel: 0.01, m: true }),
    cy(0, 0.8, -0.175, 2 * r, 0.14, "#1a1b1e", { ...PIANO, bevel: 0.01, m: true }),
    b(0, 0.9, 0.375, 1.46, 0.02, 1.06, "#26282b", { ...PIANO, bevel: 0.004 }),
    cy(0, 0.9, -0.175, 2 * r - 0.04, 0.02, "#26282b", { ...PIANO, bevel: 0.004 }),
    b(-0.25, 0.97, -0.25, 0.9, 0.012, 1.0, "#1a1b1e", { ...PIANO, bevel: 0.004, r: [0, 0, 0.3] }),
    b(0, 0.73, 0.82, 1.2, 0.05, 0.2, "#1a1b1e", { ...PIANO, bevel: 0.006, m: true }),
    ...keys(-0.6, 0.6, 0.77, 0.78, 21, 0.16),
    b(0, 0.9, 0.7, 0.7, 0.2, 0.012, "#e8e0d0", { ...K.MATT, bevel: 0.002, r: [-0.2, 0, 0] }),
    ...[[-0.62, 0.7], [0.62, 0.7], [0, -0.75]].map(([x, z]) => K.taperedLeg(x, z, 0.72, 0.09, 0.05, "#1a1b1e", { ...PIANO, m: true })),
    ...[-0.12, 0, 0.12].map((x) => b(x, 0.03, 0.86, 0.05, 0.02, 0.06, BRASS, { ...BR, bevel: 0.005 })),
    // pedal lyre, brass casters and the lid prop
    ...[-0.1, 0.1].map((x) => b(x, 0.38, 0.86, 0.022, 0.7, 0.04, "#1a1b1e", { ...PIANO, bevel: 0.004, detail: 1 })),
    b(0, 0.7, 0.86, 0.26, 0.03, 0.05, "#1a1b1e", { ...PIANO, bevel: 0.006, detail: 1 }),
    ...[[-0.62, 0.7], [0.62, 0.7], [0, -0.75]].map(([x, z]) => cy(x, 0.02, z, 0.06, 0.04, BRASS, { ...BR, detail: 2 })),
    b(0.35, 1.0, -0.1, 0.012, 0.18, 0.012, BRASS, { ...BR, bevel: 0.002, detail: 2 }),
  ]);
};
const pianoStool = (): Def =>
  piece("Living", `Piano stool ${dims(0.5, 0.32)}`, 0.5, 0.32, 0.52, [
    K.cushion(0, 0.47, 0, 0.5, 0.1, 0.32, "#26282b", { ...K.LEATHER, m: true }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => K.taperedLeg(sx * 0.21, sz * 0.12, 0.42, 0.04, 0.028, "#1a1b1e", PIANO))),
    b(0, 0.15, 0, 0.4, 0.02, 0.02, "#1a1b1e", { ...PIANO, bevel: 0.004 }),
    ...[-1, 1].map((s) => K.seam(0, 0.495, s * 0.14, 0.44, 0.004, 0.004, "#3a3d42", { tex: "leather" })),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => K.knob(sx * 0.1, 0.52, sz * 0.05, 0.02, "#26282b", { ...K.LEATHER, detail: 2 }))),
    b(0, 0.41, 0, 0.46, 0.03, 0.28, "#1a1b1e", { ...PIANO, bevel: 0.006, detail: 1 }),
  ]);
const guitar = (): Def => {
  const tilt: [number, number, number] = [-0.14, 0, 0];
  const bodyWood = { ...K.WOOD, bevel: 0.01, m: true as const };
  return piece("Living", "Acoustic guitar on a stand", 0.45, 0.4, 1.0, [
    ...[-1, 1].map((s) => b(s * 0.15, 0.03, 0.0, 0.025, 0.025, 0.36, BLACK, { ...K.BLACK_METAL, bevel: 0.004, r: [0, s * -0.4, 0] })),
    b(0, 0.03, -0.12, 0.34, 0.025, 0.025, BLACK, { ...K.BLACK_METAL, bevel: 0.004 }),
    b(0, 0.5, -0.07, 0.025, 0.95, 0.025, BLACK, { ...K.BLACK_METAL, bevel: 0.004, r: [-0.14, 0, 0] }),
    b(0, 0.3, 0.0, 0.05, 0.03, 0.2, BLACK, { ...K.RUBBER, bevel: 0.004, r: [0, 0, 0] }),
    discZ(0, 0.3, 0.02, 0.36, 0.09, "#c98a4a", { ...bodyWood, r: [PI2 - 0.14, 0, 0] }),
    discZ(0, 0.52, 0.0, 0.27, 0.09, "#c98a4a", { ...bodyWood, r: [PI2 - 0.14, 0, 0] }),
    discZ(0, 0.41, 0.01, 0.22, 0.09, "#c98a4a", { ...bodyWood, r: [PI2 - 0.14, 0, 0] }),
    discZ(0, 0.43, 0.07, 0.09, 0.012, BLACK, { ...K.RUBBER, r: [PI2 - 0.14, 0, 0] }),
    b(0, 0.24, 0.06, 0.1, 0.014, 0.02, DARKWOOD, { ...K.WOOD, bevel: 0.003, r: tilt }),
    b(0, 0.8, 0.0, 0.045, 0.45, 0.02, DARKWOOD, { ...K.WOOD, bevel: 0.004, r: tilt }),
    b(0, 1.0 - 0.05, -0.03, 0.07, 0.12, 0.02, DARKWOOD, { ...K.WOOD, bevel: 0.005, r: tilt }),
    // rosette, strings, tuning pegs, pick-guard
    discZ(0, 0.43, 0.0755, 0.11, 0.004, "#3a2a1c", { ...K.WOOD, detail: 1, r: [PI2 - 0.14, 0, 0] }),
    ...[-0.01, 0, 0.01].map((x) => b(x, 0.62, 0.008, 0.002, 0.8, 0.002, "#d8d8d8", { ...K.STEEL, bevel: 0, detail: 2, r: tilt })),
    ...[-1, 1].flatMap((s) => [0, 1].map((i) => sp(s * 0.037, 0.95 + i * 0.03 - 0.02, -0.025, 0.012, "#d8d8d8", { ...K.CHROME, detail: 2 }))),
    ...[0.6, 0.66, 0.72, 0.78, 0.84].map((y) => b(0, y, 0.012, 0.045, 0.003, 0.003, "#d8d8d8", { ...K.STEEL, bevel: 0, detail: 2, r: tilt })),
  ]);
};

// ---------- kids ----------
const playMat = (): Def =>
  piece("Decor", `Play mat, foam tiles ${dims(1.2, 1.2)}`, 1.2, 1.2, 0.03, [
    ...Array.from({ length: 16 }, (_, i) => b(-0.45 + (i % 4) * 0.3, 0.012, -0.45 + Math.floor(i / 4) * 0.3, 0.29, 0.024, 0.29, PLAY[(i + Math.floor(i / 4)) % 4], { ...K.FOAM, bevel: 0.004, ...(i === 0 ? { m: true as const } : {}) })),
    // interlocking tab on the edge of each outer tile
    ...Array.from({ length: 4 }, (_, i) => b(-0.45 + i * 0.3, 0.012, 0.6 - 0.002, 0.06, 0.02, 0.02, "#f4f1ea", { ...K.FOAM, bevel: 0.003, detail: 1 })),
  ]);
const tent = (): Def => {
  const lean = 0.42;
  const h = 1.15;
  const L = h / Math.cos(lean);
  const half = 0.45;
  const mid = half / 2 - 0.02;
  const panel = (axis: "x" | "z", s: 1 | -1, c: string): Part =>
    axis === "z"
      ? b(0, h / 2, s * mid, 0.75, L, 0.012, c, { ...K.FAB, bevel: 0.002, ...(s > 0 ? { m: true as const } : {}), r: [-s * lean, 0, 0] })
      : b(s * mid, h / 2, 0, 0.012, L, 0.75, c, { ...K.FAB, bevel: 0.002, r: [0, 0, s * lean] });
  return piece("Decor", `Kids play tent ${dims(0.9, 0.9)}`, 0.9, 0.9, 1.2, [
    panel("z", -1, "#e8e0d0"), panel("z", 1, "#d9a02c"), panel("x", -1, "#e8e0d0"), panel("x", 1, "#4a9ad9"),
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => cy(x * 0.2, h * 0.5, z * 0.2, 0.02, h, WOOD, { ...K.WOOD, r: [z * -0.3, 0, x * 0.3] })),
    b(0, 0.02, 0, 0.8, 0.02, 0.8, "#f4f1ea", { ...K.FAB, bevel: 0.004 }),
    sp(0, h + 0.03, 0, 0.05, RED, K.PLASTIC),
    // play rug, pennant string and tie-backs
    cy(0, 0.035, 0, 0.5, 0.008, YELLOW, { ...K.FAB, bevel: 0.002, detail: 1 }),
    ...[-0.2, 0, 0.2].map((x, i) => sp(x, 0.9 - Math.abs(x) * 0.3, 0.17 + Math.abs(x) * 0.1, 0.035, PLAY[i % 4], { ...K.FAB, detail: 2 })),
  ]);
};
const toyBox = (): Def =>
  piece("Decor", `Toy box ${dims(0.7, 0.4)}`, 0.7, 0.4, 0.5, [
    b(0, 0.2, 0, 0.7, 0.4, 0.4, BLUE, { ...K.LACQUER, bevel: 0.01, m: true }),
    b(0, 0.405, -0.06, 0.7, 0.025, 0.24, "#e8e0d0", { ...K.LACQUER, bevel: 0.006 }),
    ...[-0.2, 0.0, 0.2].map((x, i) => sp(x, 0.45, 0.04, 0.12, PLAY[(i + 1) % 4], K.PLASTIC)),
    b(0.25, 0.46, -0.04, 0.1, 0.1, 0.1, YELLOW, { ...K.WOOD, bevel: 0.008 }),
    b(0, 0.15, 0.202, 0.3, 0.12, 0.008, "#f4f1ea", { ...K.LACQUER, bevel: 0.003 }),
    // plank grooves, side handles and bumper feet
    ...[0.1, 0.2, 0.3].map((y) => K.seam(0, y, 0.2, 0.68, 0.004, 0.004, "#2f6ea5", K.LACQUER)),
    ...[-1, 1].map((s) => b(s * 0.356, 0.3, 0, 0.014, 0.03, 0.12, "#e8e0d0", { ...K.PLASTIC, bevel: 0.005, detail: 2 })),
    ...[-1, 1].map((sx) => b(sx * 0.3, 0.008, 0.15, 0.05, 0.016, 0.05, "#1c1d20", { ...K.RUBBER, detail: 1 })),
  ]);
const kidsTable = (): Def =>
  piece("Decor", `Kids table with two chairs ${dims(0.7, 0.9)}`, 0.7, 0.9, 0.5, [
    b(0, 0.46, 0, 0.6, 0.03, 0.6, "#f4f1ea", { ...K.LACQUER, bevel: 0.008, m: true }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => K.taperedLeg(sx * 0.26, sz * 0.26, 0.44, 0.04, 0.03, BLUE, K.LACQUER))),
    ...[-1, 1].flatMap((s) => [
      b(0, 0.26, s * 0.32, 0.26, 0.03, 0.2, s > 0 ? YELLOW : RED, { ...K.LACQUER, bevel: 0.01 }),
      b(0, 0.4, s * 0.43, 0.26, 0.2, 0.02, s > 0 ? YELLOW : RED, { ...K.LACQUER, bevel: 0.01 }),
      ...[-1, 1].map((x) => K.taperedLeg(x * 0.1, s * 0.32, 0.24, 0.028, 0.02, WOOD, K.WOOD)),
    ]),
    // aprons under the top, back slat cut-outs
    ...[-1, 1].flatMap((s) => [
      b(0, 0.425, s * 0.26, 0.5, 0.03, 0.015, BLUE, { ...K.LACQUER, bevel: 0.003, detail: 1 }),
      b(s * 0.26, 0.425, 0, 0.015, 0.03, 0.5, BLUE, { ...K.LACQUER, bevel: 0.003, detail: 1 }),
      b(0, 0.4, s * 0.43, 0.14, 0.05, 0.024, "#f4f1ea", { ...K.LACQUER, bevel: 0.004, detail: 1 }),
    ]),
  ]);
const blocks = (): Def =>
  piece("Decor", "Toy blocks, tower", 0.3, 0.3, 0.38, [
    ...[[0, 0, 0, BLUE], [0.1, 0, 0.01, RED], [-0.1, 0, 0, YELLOW], [0.05, 0.1, 0.0, GREEN], [-0.05, 0.1, 0.0, BLUE], [0, 0.2, 0, RED]].map(([x, y, z, c]) =>
      b(x as number, (y as number) + 0.05, z as number, 0.1, 0.1, 0.1, c as string, { ...K.WOOD, rough: 0.6, bevel: 0.008 })),
    b(0, 0.33, 0, 0.1, 0.06, 0.1, YELLOW, { ...K.WOOD, rough: 0.6, bevel: 0.01, r: [0, 0.5, 0] }),
    b(0.12, 0.015, 0.1, 0.08, 0.03, 0.08, GREEN, { ...K.WOOD, rough: 0.6, bevel: 0.006, r: [0, 0.4, 0] }),
    // painted marks on three fronts
    ...[[0.1, 0, 0.01], [-0.1, 0, 0], [0.05, 0.1, 0.0]].map(([x, y, z]) => b(x, y + 0.05, z + 0.052, 0.04, 0.04, 0.004, "#f4f1ea", { ...K.MATT, bevel: 0, detail: 2 })),
  ]);
const kidsShelf = (): Def =>
  piece("Bedroom", `Kids toy shelf ${dims(0.8, 0.3)}`, 0.8, 0.3, 0.75, [
    ...[-1, 1].map((s) => b(s * 0.39, 0.375, 0, 0.022, 0.75, 0.3, "#f4f1ea", { ...K.LACQUER, bevel: 0.004, m: true })),
    b(0, 0.011, 0, 0.8, 0.022, 0.3, "#f4f1ea", { ...K.LACQUER, bevel: 0.004, m: true }),
    b(0, 0.739, 0, 0.8, 0.022, 0.3, "#f4f1ea", { ...K.LACQUER, bevel: 0.004, m: true }),
    b(0, 0.38, 0, 0.78, 0.022, 0.3, "#f4f1ea", { ...K.LACQUER, bevel: 0.004, m: true }),
    ...[0, 1, 2].map((i) => b(-0.25 + i * 0.25, 0.16, 0.02, 0.22, 0.26, 0.24, PLAY[i], { ...K.FAB, bevel: 0.015 })),
    ...[0, 1, 2].map((i) => b(-0.25 + i * 0.25, 0.3, 0.14, 0.2, 0.01, 0.01, "#f4f1ea", { ...K.LACQUER, bevel: 0.002 })),
    b(0, 0.375, -0.14, 0.76, 0.74, 0.008, "#d6cfc4", { ...K.MATT, bevel: 0 }),
    ...[0, 1].map((i) => sp(-0.2 + i * 0.35, 0.5, 0, 0.18, i ? TERRA : "#d98a9a", K.FAB)),
    b(0.25, 0.54, 0, 0.12, 0.2, 0.1, BLUE, { ...K.PLASTIC, bevel: 0.01 }),
    // plush ears, bin labels and handles
    ...[0, 1].flatMap((i) => [-1, 1].map((s) => sp(-0.2 + i * 0.35 + s * 0.06, 0.58, 0, 0.06, i ? TERRA : "#d98a9a", { ...K.FAB, detail: 1 }))),
    ...[0, 1, 2].map((i) => K.handleBar(-0.25 + i * 0.25, 0.2, 0.14, 0.08, "x", "#f4f1ea", { ...K.PLASTIC })),
    b(0, 0.75 - 0.011, 0.15, 0.8, 0.006, 0.004, "#d6cfc4", { ...K.MATT, bevel: 0, detail: 1 }),
  ]);

// ---------- pets ----------
const petBed = (label: string, dia: number, c: string): Def =>
  piece("Decor", label, dia, dia, 0.18, [
    cy(0, 0.03, 0, dia * 0.9, 0.06, "#d6cfc4", { ...K.FAB, bevel: 0.02, m: true }),
    ...Array.from({ length: 12 }, (_, i) => {
      const a = (i * 2 * PI) / 12;
      return sp(Math.sin(a) * dia * 0.38, 0.09, Math.cos(a) * dia * 0.38, dia * 0.22, c, { ...K.FAB, m: true });
    }),
    cy(0, 0.075, 0, dia * 0.55, 0.03, "#efe9dc", { ...K.FAB, bevel: 0.012 }),
    // stuffing between the bolster lobes and stitched ring
    ...Array.from({ length: 12 }, (_, i) => {
      const a = ((i + 0.5) * 2 * PI) / 12;
      return sp(Math.sin(a) * dia * 0.4, 0.085, Math.cos(a) * dia * 0.4, dia * 0.18, c, { ...K.FAB, m: true, detail: 1 });
    }),
    cy(0, 0.092, 0, dia * 0.5, 0.004, "#d6cfc4", { ...K.FAB, bevel: 0, detail: 2 }),
  ]);
const dogBed = (): Def =>
  piece("Decor", `Dog bed with bolster ${dims(0.9, 0.6)}`, 0.9, 0.6, 0.2, [
    b(0, 0.04, 0, 0.9, 0.08, 0.6, "#8d9299", { ...K.FAB, bevel: 0.02, m: true }),
    b(0, 0.1, 0.0, 0.7, 0.05, 0.42, "#c8c2b8", { ...K.FAB, bevel: 0.02 }),
    b(0, 0.12, -0.24, 0.9, 0.16, 0.12, "#8d9299", { ...K.FAB, bevel: 0.05, m: true }),
    ...[-1, 1].map((s) => b(s * 0.39, 0.12, 0.0, 0.12, 0.16, 0.5, "#8d9299", { ...K.FAB, bevel: 0.05, m: true })),
    b(0.1, 0.15, 0.08, 0.1, 0.03, 0.1, "#d3563a", { ...K.RUBBER, bevel: 0.012 }),
    // piping around the base, stitched quilting and a bone toy
    b(0, 0.08, 0.298, 0.88, 0.008, 0.008, "#7a7f86", { ...K.FAB, bevel: 0, m: true, detail: 1 }),
    ...[-0.2, 0, 0.2].map((x) => b(x, 0.126, 0.0, 0.004, 0.004, 0.42, "#b0aa9e", { ...K.FAB, bevel: 0, detail: 2 })),
    ...[-1, 1].map((s) => sp(0.1 + s * 0.05, 0.15, 0.08, 0.03, "#d3563a", { ...K.RUBBER, detail: 2 })),
  ]);
const catTree = (label: string, h: number): Def => {
  const k = h / 1.5;
  const w = 0.5 * Math.max(0.8, k);
  const SISAL: K.Opt = { ...K.FAB, rough: 1, bevel: 0 };
  const post = (y0: number, y1: number, x: number, z: number): Part => cy(x, (y0 + y1) / 2, z, 0.09, y1 - y0, "#c9a46b", SISAL);
  const wraps = (y0: number, y1: number, x: number, z: number): Part[] =>
    Array.from({ length: Math.floor((y1 - y0) / 0.15) }, (_, i) => cy(x, y0 + 0.07 + i * 0.15, z, 0.096, 0.008, "#a9854f", { ...SISAL, detail: 1 }));
  const plat = (y: number, ww: number, th = 0.04): Part => b(0, y, 0, ww, th, ww, "#8d9299", { ...K.FAB, bevel: 0.012, m: true });
  return piece("Decor", label, w, w, h, [
    b(0, 0.03, 0, w, 0.06, w, "#8d9299", { ...K.FAB, bevel: 0.012, m: true }),
    post(0.06, 0.5 * k, -0.1 * k, -0.1 * k),
    plat(0.5 * k, w * 0.9),
    post(0.5 * k, 0.95 * k, 0.12 * k, 0.1 * k),
    b(0.06 * k, 0.4 * k, 0.12 * k, 0.28 * k, 0.28 * k, 0.28 * k, "#d6cfc4", { ...K.FAB, bevel: 0.025 }),
    cy(0.06 * k, 0.4 * k, 0.12 * k + 0.141 * k, 0.12 * k, 0.01, BLACK, { ...K.FAB, r: [PI2, 0, 0] }),
    b(0.0, 0.98 * k, 0.0, w * 0.85, 0.04, w * 0.85, "#8d9299", { ...K.FAB, bevel: 0.012, m: true }),
    post(0.98 * k, 1.4 * k, -0.1 * k, -0.1 * k),
    b(0, h - 0.02, 0, w * 0.75, 0.04, w * 0.75, "#8d9299", { ...K.FAB, bevel: 0.012, m: true }),
    sp(0.12 * k, 0.9 * k, 0.12 * k, 0.07, TERRA, { ...K.FAB, bevel: 0 }),
    // rope wraps, pole to the hanging toy, plush rim on the top perch
    ...wraps(0.06, 0.5 * k, -0.1 * k, -0.1 * k), ...wraps(0.5 * k, 0.95 * k, 0.12 * k, 0.1 * k), ...wraps(0.98 * k, 1.4 * k, -0.1 * k, -0.1 * k),
    cy(0.12 * k, 0.945 * k, 0.1 * k, 0.012, 0.09 * k, "#3a3d42", { ...K.RUBBER, detail: 1 }),
    b(0, h - 0.0, 0, w * 0.75, 0.012, w * 0.75, "#a9a9a9", { ...K.FAB, bevel: 0.006, m: true, detail: 1 }),
  ]);
};

// ---------- aquarium ----------
const fish = (x: number, y: number, z: number, c: string, dir: 1 | -1 = 1): Part[] => [
  b(x, y, z, 0.06, 0.035, 0.02, c, { ...K.PLASTIC, rough: 0.25, bevel: 0.008 }),
  b(x - dir * 0.04, y, z, 0.03, 0.04, 0.008, c, { ...K.PLASTIC, bevel: 0.002, r: [0, 0, 0.0] }),
  sp(x + dir * 0.02, y + 0.005, z + 0.011, 0.008, BLACK, K.PLASTIC),
];
const aquarium = (w: number, d: number, tankH: number): Def => {
  const standH = 0.72;
  const top = standH + tankH;
  const ty = standH + tankH / 2 + 0.03;
  return piece("Decor", `Aquarium with cabinet ${dims(w, d)}`, w, d, top + 0.12, [
    b(0, standH / 2 - 0.02, 0, w, standH - 0.04, d, "#3a3d42", { ...K.LACQUER, bevel: 0.006, m: true }),
    b(0, standH - 0.02, 0, w + 0.02, 0.04, d + 0.02, BLACK, { ...K.PLASTIC, bevel: 0.006 }),
    b(0, standH + 0.03, 0, w - 0.04, 0.05, d - 0.04, "#d9c9a8", { ...K.STONE, rough: 1, bevel: 0.004 }),
    b(0, ty, -d / 2 + 0.03, w - 0.04, tankH, 0.01, "#1d5f82", { ...K.MATT, bevel: 0 }),
    ...[-1, 1].flatMap((s) => [b(s * (w / 2 - 0.02), ty, 0, 0.012, tankH, d - 0.04, "#2c7aa0", { ...K.MATT, bevel: 0 })]),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * (w / 2 - 0.02), ty, sz * (d / 2 - 0.02), 0.025, tankH, 0.025, BLACK, { ...K.PLASTIC, bevel: 0.004 }))),
    ...[-1, 1].map((s) => b(0, standH + 0.06, s * (d / 2 - 0.02), w - 0.04, 0.02, 0.025, BLACK, { ...K.PLASTIC, bevel: 0.004 })),
    ...[-1, 1].map((s) => b(0, top + 0.04, s * (d / 2 - 0.02), w - 0.04, 0.02, 0.025, BLACK, { ...K.PLASTIC, bevel: 0.004 })),
    b(0, top + 0.05, 0, w, 0.06, d, "#26282b", { ...K.PLASTIC, bevel: 0.008 }),
    b(0, top + 0.015, 0.0, w - 0.1, 0.012, d - 0.1, "#d8f1ff", { glow: true }),
    ...[[-0.3, 0.45], [0.25, 0.6], [-0.05, 0.3]].flatMap(([f, hh], i) => [
      b(f * w * 0.8, standH + 0.1 + (hh as number) * 0.12, -d * 0.22, 0.015, (hh as number) * 0.25, 0.01, i % 2 ? LEAF1 : LEAF3, { ...LEAFY, r: [0, 0, (i - 1) * 0.2] }),
      sp(f * w * 0.8, standH + 0.12 + (hh as number) * 0.25, -d * 0.22, 0.07, LEAF2, LEAFY),
    ]),
    ...fish(-w * 0.2, standH + tankH * 0.5, 0.0, "#f28a2e"),
    ...fish(w * 0.15, standH + tankH * 0.7, -d * 0.1, "#f2c14e", -1),
    ...fish(w * 0.3, standH + tankH * 0.4, d * 0.1, "#4ad7ff"),
    sp(-w * 0.35, standH + tankH * 0.55, -d * 0.2, 0.02, "#e6f1f6", { ...K.PLASTIC, rough: 0.05 }),
    sp(-w * 0.35, standH + tankH * 0.75, -d * 0.2, 0.03, "#e6f1f6", { ...K.PLASTIC, rough: 0.05 }),
    b(w * 0.1, standH + 0.1, d * 0.05, 0.08, 0.06, 0.07, "#6b6e72", { ...K.STONE, bevel: 0.015 }),
    // cabinet doors with knobs, gravel stones, rocks and an air hose
    ...[-1, 1].flatMap((s) => K.drawerFront(s * (w / 4), standH / 2 - 0.02, d / 2 - 0.014, w / 2 - 0.02, standH - 0.12, "#3a3d42", { ...K.LACQUER, m: true, thick: 0.012, handle: "knob", handleColor: "#b8bcc2", detail: 1 })),
    ...[-0.3, -0.1, 0.12, 0.3].map((f, i) => sp(f * w, standH + 0.06, d * 0.12 - i * 0.04, 0.02, "#b8a889", { ...K.STONE, detail: 2 })),
    b(w * 0.18, standH + 0.095, d * 0.05, 0.05, 0.04, 0.05, "#8a8d91", { ...K.STONE, bevel: 0.012, detail: 1 }),
    cy(w / 2 - 0.05, ty, -d * 0.2, 0.01, tankH, "#cfd8dc", { ...K.PLASTIC, rough: 0.1, detail: 1 }),
  ], { light: { y: top, color: "#bfe8ff", k: 0.5 } });
};

export const FUN: Record<string, Def> = {
  dc_piano_upright: upright(),
  dc_piano_digital: digitalPiano(),
  dc_piano_grand: grand(),
  dc_piano_stool: pianoStool(),
  dc_guitar_stand: guitar(),
  dc_kids_playmat: playMat(),
  dc_kids_tent: tent(),
  dc_kids_toybox: toyBox(),
  dc_kids_table_set: kidsTable(),
  dc_kids_blocks: blocks(),
  dc_kids_shelf: kidsShelf(),
  dc_pet_bed_round_60: petBed(`Pet bed, round ${dims(0.6, 0.6)}`, 0.6, "#c1784a"),
  dc_pet_bed_round_80: petBed(`Pet bed, round, large ${dims(0.8, 0.8)}`, 0.8, "#8a9a8c"),
  dc_pet_bed_dog: dogBed(),
  dc_cat_tree_150: catTree("Cat tree 1.5 m", 1.5),
  dc_cat_tree_90: catTree("Cat tree, small 90 cm", 0.9),
  dc_aquarium_60: aquarium(0.6, 0.3, 0.4),
  dc_aquarium_100: aquarium(1.0, 0.4, 0.5),
  dc_aquarium_150: aquarium(1.5, 0.5, 0.6),
};
