import type { Def, Part } from "../catalog.ts";
import type { V3 } from "../mathUtil.ts";
import { BLACK, BOOKC, BRASS, CREAM, DARKWOOD, DGREY, GLASS, LEAF2, METAL, OAK, PI, TERRA, WALNUT, WHITE, WOOD, b, books, cy, dims, discZ, piece, sp, strut } from "./kit.ts";
import * as K from "../partsKit.ts";

const BR: K.Opt = { tex: "metal", metal: 1, rough: 0.28 }; // polished brass
const WAX: K.Opt = { tex: "paint", rough: 0.5, bevel: 0 };
const LEAFY: K.Opt = { tex: "paint", rough: 0.9 }; // foliage and dried arrangements
const BOOK: K.Opt = { tex: "leather", rough: 0.7, bevel: 0.002 }; // cloth-bound covers

const FLAME = "#ffb45a";
/** Lift a part by dy (stems standing in a vase are built from the floor, then raised to the vase mouth). */
const up = (dy: number, p: Part): Part => ({ ...p, p: [p.p[0], p.p[1] + dy, p.p[2]] as V3 });

// ---------- vases, candles, books ----------
const vaseFloor = (): Def =>
  piece("Decor", "Tall floor vase with dry branches", 0.4, 0.4, 1.45, [
    K.turned(0, 0, 0, [[0.09, 0], [0.12, 0.04], [0.14, 0.2], [0.12, 0.38], [0.07, 0.5], [0.06, 0.6], [0.08, 0.69]], "#d6cfc4", { ...K.CERAMIC, m: true }),
    ...[[-0.12, 0.05, 0.5], [0.12, -0.04, 0.6], [0.0, 0.1, 0.65], [-0.05, -0.12, 0.55], [0.14, 0.1, 0.45]].map(([tx, tz, h]) => up(0.69, strut(0, 0, tx, tz, h * 1.1, 0.012, "#6b4a35", { ...K.WOOD, bevel: 0 }))),
    ...[[-0.08, 0.1, 0.4], [0.07, -0.08, 0.5], [0.1, 0.0, 0.35]].map(([tx, tz, h]) => up(0.69, strut(0, 0, tx, tz, h * 1.1, 0.007, "#6b4a35", { ...K.WOOD, bevel: 0, detail: 1 }))),
    cy(0, 0.3, 0, 0.285, 0.012, "#b8ada0", { ...K.CERAMIC, detail: 1 }),
  ]);
const vaseFlowers = (): Def =>
  piece("Decor", "Vase with flowers", 0.22, 0.22, 0.5, [
    K.turned(0, 0, 0, [[0.04, 0], [0.058, 0.02], [0.06, 0.16], [0.045, 0.2], [0.05, 0.22]], GLASS, { tex: "ceramic", rough: 0.05 }),
    ...[[-0.04, 0.02, 0.2, "#e66f9a"], [0.05, -0.02, 0.26, "#f2c14e"], [0.0, 0.05, 0.22, "#f4f1ea"], [0.03, 0.04, 0.17, "#e66f9a"]].flatMap(([x, z, h, c]) => [
      up(0.2, strut(0, 0, x as number, z as number, h as number, 0.006, LEAF2, LEAFY)),
      sp(x as number, 0.2 + (h as number) + 0.02, z as number, 0.08, c as string, { ...K.FAB, bevel: 0 }),
      sp(x as number, 0.2 + (h as number) + 0.025, z as number, 0.025, "#f2c14e", { ...K.FAB, detail: 2 }),
    ]),
    ...[[-0.03, 0.01, 0.4], [0.03, 0.0, -0.4]].map(([x, z, a]) => b(x, 0.3, z, 0.05, 0.004, 0.02, LEAF2, { ...LEAFY, bevel: 0, detail: 1, r: [0, 0, a] })),
  ]);
const vaseSet = (): Def =>
  piece("Decor", "Vase set, three ceramics", 0.42, 0.16, 0.36, [
    K.turned(-0.14, 0, 0, K.vaseProfile(0.06, 0.3), "#d6cfc4", { ...K.CERAMIC, m: true }),
    K.turned(0, 0, 0, [[0.05, 0], [0.09, 0.03], [0.1, 0.1], [0.08, 0.16], [0.035, 0.2], [0.035, 0.26]], TERRA, { ...K.CERAMIC, rough: 0.7, m: true }),
    K.turned(0.15, 0, 0, K.vaseProfile(0.055, 0.18, 0.5), "#4a6b8a", { ...K.CERAMIC, m: true }),
    cy(0, 0.1, 0, 0.2, 0.008, "#8a4a2e", { ...K.CERAMIC, rough: 0.7, detail: 1 }),
  ]);
const candles = (): Def =>
  piece("Decor", "Candles, set of three", 0.3, 0.14, 0.22, [
    b(0, 0.008, 0, 0.3, 0.016, 0.14, WOOD, { ...K.WOOD, bevel: 0.004, m: true }),
    ...[[-0.09, 0.2, 0.06], [0.0, 0.14, 0.07], [0.1, 0.1, 0.06]].flatMap(([x, h, d], i) => [
      K.turned(x, 0.016, 0, [[d / 2, 0], [d / 2 - 0.002, h * 0.9], [d / 2 - 0.006, h]], i === 1 ? CREAM : "#e8e0d0", WAX),
      sp(x, 0.016 + h + 0.018, 0, 0.026, FLAME, { glow: true }),
      cy(x, 0.016 + h + 0.004, 0, 0.004, 0.012, BLACK, { tex: "rubber", bevel: 0, detail: 2 }),
    ]),
  ], { light: { y: 0.15, color: FLAME, k: 0.3 } });
const lantern = (): Def =>
  piece("Decor", "Floor lantern with candle", 0.3, 0.3, 0.55, [
    K.turned(0, 0, 0, [[0.15, 0], [0.15, 0.012], [0.13, 0.03]], BLACK, K.BLACK_METAL),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.13, 0.28, sz * 0.13, 0.02, 0.5, 0.02, BLACK, { ...K.BLACK_METAL, bevel: 0.004 }))),
    cy(0, 0.53, 0, 0.3, 0.03, BLACK, K.BLACK_METAL),
    sp(0, 0.55, 0, 0.06, BLACK, K.BLACK_METAL),
    K.turned(0, 0.03, 0, [[0.05, 0], [0.05, 0.19]], "#e8e0d0", WAX),
    sp(0, 0.29, 0, 0.05, FLAME, { glow: true }),
    ...[-1, 1].map((s) => b(0, 0.28, s * 0.13, 0.22, 0.46, 0.006, "#d9e6ee", { tex: "ceramic", rough: 0.05, bevel: 0 })),
    ...[0.1, 0.28, 0.46].flatMap((y) => [-1, 1].map((s) => b(0, y, s * 0.13, 0.24, 0.012, 0.012, BLACK, { ...K.BLACK_METAL, bevel: 0.002, detail: 1 }))),
    ...[-1, 1].map((s) => b(s * 0.13, 0.28, 0, 0.012, 0.012, 0.24, BLACK, { ...K.BLACK_METAL, bevel: 0.002, detail: 1 })),
  ], { light: { y: 0.3, color: FLAME, k: 0.4 } });
const candelabra = (): Def =>
  piece("Decor", "Brass candelabra", 0.36, 0.1, 0.44, [
    K.turned(0, 0, 0, [[0.06, 0], [0.06, 0.01], [0.035, 0.022], [0.015, 0.03]], BRASS, BR),
    K.turned(0, 0.03, 0, [[0.02, 0], [0.012, 0.04], [0.022, 0.1], [0.012, 0.18], [0.014, 0.23]], BRASS, BR),
    b(0, 0.26, 0, 0.32, 0.02, 0.02, BRASS, { ...BR, bevel: 0.006 }),
    ...[-0.16, 0, 0.16].flatMap((x) => [
      K.turned(x, 0.28, 0, [[0.012, 0], [0.018, 0.012], [0.015, 0.04]], BRASS, BR),
      K.turned(x, 0.3, 0, [[0.012, 0], [0.012, 0.15]], CREAM, WAX),
      sp(x, 0.415, 0, 0.022, FLAME, { glow: true }),
    ]),
    sp(0, 0.2, 0, 0.04, BRASS, { ...BR, detail: 1 }),
  ], { light: { y: 0.35, color: FLAME, k: 0.3 } });
const bookStack = (label: string, n: number, w: number): Def => {
  let y = 0;
  const pages: Part[] = [];
  const parts = Array.from({ length: n }, (_, i) => {
    const h = 0.03 + (i % 3) * 0.008;
    const x = ((i * 5) % 3 - 1) * 0.012;
    const z = ((i * 7) % 3 - 1) * 0.01;
    const bw = w - (i % 2) * 0.04;
    const p = b(x, y + h / 2, z, bw, h, w * 0.72, BOOKC[i % BOOKC.length], BOOK);
    pages.push(b(x, y + h / 2, z + w * 0.36 - 0.004, bw - 0.02, h - 0.008, 0.012, "#efe9dc", { ...K.MATT, bevel: 0, detail: 1 }));
    y += h;
    return p;
  });
  return piece("Decor", label, w, w * 0.75, y + 0.06, [...parts, K.turned(0.0, y, 0, [[0.028, 0], [0.035, 0.02], [0.035, 0.055], [0.03, 0.06]], TERRA, { ...K.CERAMIC, rough: 0.7 }), ...pages]);
};

// ---------- clocks ----------
const clockWall = (): Def => {
  const y = 2.0;
  return piece("Decor", "Wall clock, round 40 cm", 0.4, 0.05, y + 0.22, [
    discZ(0, y, 0, 0.4, 0.03, BLACK, K.BLACK_METAL),
    discZ(0, y, 0.012, 0.36, 0.015, WHITE, { ...K.MATT, bevel: 0 }),
    ...[0, 1, 2, 3].map((i) => b(Math.sin((i * PI) / 2) * 0.155, y + Math.cos((i * PI) / 2) * 0.155, 0.022, i % 2 ? 0.03 : 0.012, i % 2 ? 0.012 : 0.03, 0.006, BLACK, { ...K.BLACK_METAL, bevel: 0 })),
    b(0.0, y + 0.06, 0.026, 0.012, 0.12, 0.006, BLACK, { ...K.BLACK_METAL, bevel: 0.002, r: [0, 0, -0.2] }),
    b(0.05, y + 0.02, 0.03, 0.01, 0.15, 0.006, BLACK, { ...K.BLACK_METAL, bevel: 0.002, r: [0, 0, -1.2] }),
    discZ(0, y, 0.033, 0.025, 0.006, "#b8683f", K.PLASTIC),
    ...Array.from({ length: 12 }, (_, i) => i).filter((i) => i % 3).map((i) => b(Math.sin((i * PI) / 6) * 0.16, y + Math.cos((i * PI) / 6) * 0.16, 0.022, 0.008, 0.016, 0.004, BLACK, { ...K.BLACK_METAL, bevel: 0, detail: 1, r: [0, 0, -(i * PI) / 6] })),
    discZ(0, y, 0.0, 0.38, 0.032, BLACK, { ...K.BLACK_METAL, detail: 1 }),
    b(0, y - 0.1, 0.034, 0.004, 0.06, 0.003, "#b8683f", { ...K.PLASTIC, bevel: 0, detail: 2, r: [0, 0, 0.5] }),
  ], { wall: true });
};
const grandfather = (): Def =>
  piece("Decor", "Grandfather clock", 0.5, 0.28, 2.0, [
    b(0, 0.08, 0, 0.5, 0.16, 0.28, WALNUT, { ...K.WOOD, bevel: 0.008, m: true }),
    b(0, 0.95, 0, 0.38, 1.6, 0.24, WALNUT, { ...K.WOOD, bevel: 0.006, m: true }),
    b(0, 0.6, 0.125, 0.22, 0.8, 0.012, "#2a1a10", { ...K.WOOD, bevel: 0.004 }),
    cy(0, 0.55, 0.124, 0.12, 0.012, BRASS, { ...BR, r: [PI / 2, 0, 0] }),
    b(0, 1.78, 0, 0.46, 0.3, 0.26, WALNUT, { ...K.WOOD, bevel: 0.01, m: true }),
    discZ(0, 1.78, 0.13, 0.26, 0.012, CREAM, { ...K.MATT, bevel: 0 }),
    b(0, 1.78, 0.14, 0.006, 0.1, 0.006, BLACK, { ...K.BLACK_METAL, bevel: 0 }),
    b(0.03, 1.77, 0.14, 0.006, 0.07, 0.006, BLACK, { ...K.BLACK_METAL, bevel: 0, r: [0, 0, -1.2] }),
    b(0, 1.96, 0, 0.5, 0.06, 0.28, WALNUT, { ...K.WOOD, bevel: 0.01, m: true }),
    // mouldings, pendulum rod and hour marks
    b(0, 0.175, 0, 0.44, 0.02, 0.26, WALNUT, { ...K.WOOD, bevel: 0.006, m: true, detail: 1 }),
    b(0, 1.625, 0, 0.42, 0.03, 0.26, WALNUT, { ...K.WOOD, bevel: 0.008, m: true, detail: 1 }),
    b(0, 1.92, 0, 0.48, 0.03, 0.27, WALNUT, { ...K.WOOD, bevel: 0.008, m: true, detail: 1 }),
    ...[-1, 1].map((s) => b(s * 0.11, 0.6, 0.134, 0.012, 0.82, 0.006, WALNUT, { ...K.WOOD, bevel: 0.002, m: true, detail: 1 })),
    b(0, 0.8, 0.13, 0.006, 0.4, 0.004, BRASS, { ...BR, bevel: 0, detail: 1 }),
    ...[0, 1, 2, 3].map((i) => b(Math.sin((i * PI) / 2) * 0.11, 1.78 + Math.cos((i * PI) / 2) * 0.11, 0.139, 0.012, 0.012, 0.004, BLACK, { ...K.BLACK_METAL, bevel: 0, detail: 2 })),
  ]);

// ---------- textiles ----------
const cushionSet = (): Def =>
  piece("Decor", "Sofa cushions, set of three", 1.3, 0.3, 0.46, [
    b(-0.42, 0.22, 0, 0.42, 0.42, 0.13, "#c1784a", { ...K.FAB, bevel: 0.05, m: true, r: [-0.3, 0, 0.05] }),
    b(0, 0.22, 0.02, 0.42, 0.42, 0.13, "#d6cfc4", { ...K.FAB, bevel: 0.05, r: [-0.3, 0, 0] }),
    b(0.42, 0.21, 0, 0.4, 0.4, 0.13, "#4a6b8a", { ...K.FAB, bevel: 0.05, r: [-0.3, 0, -0.05] }),
    b(0, 0.24, 0.07, 0.3, 0.18, 0.1, "#d9a02c", { ...K.FAB, bevel: 0.04, r: [-0.1, 0, 0.1] }),
    ...[-0.42, 0, 0.42].map((x, i) => b(x, 0.215, i === 1 ? 0.075 : 0.055, 0.34, 0.006, 0.006, i === 1 ? "#b8ada0" : "#f4f1ea", { ...K.FAB, bevel: 0, detail: 1, r: [-0.3, 0, 0] })),
    ...[-0.42, 0, 0.42].map((x, i) => sp(x, 0.2 + (i === 1 ? 0.005 : 0), 0.08 + (i === 1 ? 0.02 : 0), 0.025, "#f4f1ea", { ...K.FAB, detail: 2 })),
  ]);
const throwBlanket = (): Def =>
  piece("Decor", "Throw blanket, folded", 0.5, 0.8, 0.12, [
    b(0, 0.02, 0, 0.5, 0.04, 0.8, "#c19a6b", { ...K.FAB, bevel: 0.012, m: true }),
    b(0, 0.06, 0.02, 0.46, 0.04, 0.7, "#c9a46b", { ...K.FAB, bevel: 0.015, m: true }),
    b(0, 0.09, 0.0, 0.42, 0.02, 0.6, "#b8895a", { ...K.FAB, bevel: 0.008, m: true }),
    ...Array.from({ length: 8 }, (_, i) => b(-0.2 + i * 0.057, 0.005, 0.405, 0.012, 0.01, 0.03, CREAM, { ...K.FAB, bevel: 0 })),
    ...[-0.2, 0.2].map((z) => b(0, 0.1015, z, 0.4, 0.002, 0.012, "#e8e0d0", { ...K.FAB, bevel: 0, detail: 1 })),
  ]);
const floorCushion = (label: string, w: number, n: number): Def =>
  piece("Decor", label, w, w, 0.12 * n + 0.02, Array.from({ length: n }, (_, i) => {
    const x = ((i % 2) * 2 - 1) * 0.02 * i;
    const z = ((i % 2) * 2 - 1) * 0.015 * i;
    const ww = w - i * 0.06;
    return [
      K.cushion(x, 0.07 + i * 0.12, z, ww, 0.12, ww, ["#c1784a", "#8a9a8c", "#d9a02c"][i % 3], i === 0 ? { m: true } : undefined),
      sp(x, 0.13 + i * 0.12, z, 0.035, DGREY, K.FAB),
      b(x, 0.07 + i * 0.12, z + ww / 2, ww - 0.1, 0.004, 0.004, "#f4f1ea", { ...K.FAB, bevel: 0, detail: 1 }),
      b(x + ww / 2, 0.07 + i * 0.12, z, 0.004, 0.004, ww - 0.1, "#f4f1ea", { ...K.FAB, bevel: 0, detail: 1 }),
    ];
  }).flat());
const tvDecor = (): Def =>
  piece("Decor", "TV console decor set", 1.2, 0.3, 0.5, [
    b(-0.15, 0.04, 0.02, 0.7, 0.07, 0.1, BLACK, { ...K.PLASTIC, bevel: 0.012 }),
    b(-0.15, 0.06, 0.075, 0.5, 0.008, 0.004, "#4ad7ff", { glow: true }),
    ...books(0.28, 0.0, 0.0, 4, 0.2, 0.18, 0.045).map((p) => ({ ...BOOK, ...p })),
    K.turned(0.5, 0, 0, K.vaseProfile(0.06, 0.3), "#d6cfc4", { ...K.CERAMIC, m: true }),
    sp(0.5, 0.36, 0.0, 0.2, LEAF2, LEAFY),
    K.turned(-0.52, 0, 0.04, [[0.04, 0], [0.06, 0.12]], TERRA, { ...K.CERAMIC, rough: 0.7 }),
    sp(-0.52, 0.17, 0.04, 0.12, LEAF2, LEAFY),
    b(0.12, 0.185, 0.0, 0.18, 0.025, 0.14, BOOKC[3], BOOK),
    sp(0.12, 0.22, 0.0, 0.05, BRASS, BR),
    b(-0.15, 0.001, 0.02, 0.62, 0.002, 0.08, BLACK, { ...K.RUBBER, detail: 1 }),
    ...[-1, 1].map((s) => cy(-0.15 + s * 0.3, 0.075, 0.075, 0.008, 0.004, "#4ad7ff", { ...K.PLASTIC, bevel: 0, detail: 2, r: [PI / 2, 0, 0] })),
  ]);

// ---------- fireplaces and stove ----------
const fireplace = (): Def =>
  piece("Living", `Fireplace with mantel ${dims(1.5, 0.4)}`, 1.5, 0.4, 1.3, [
    b(0, 0.025, 0.0, 1.5, 0.05, 0.4, "#8d9299", { ...K.STONE, bevel: 0.006 }),
    ...[-1, 1].map((s) => b(s * 0.57, 0.62, -0.02, 0.2, 1.1, 0.3, WHITE, { ...K.MATT, bevel: 0.006, m: true })),
    b(0, 1.0, -0.02, 0.94, 0.18, 0.3, WHITE, { ...K.MATT, bevel: 0.006, m: true }),
    b(0, 1.2, 0.0, 1.5, 0.07, 0.38, WHITE, { ...K.MATT, bevel: 0.01, m: true }),
    b(0, 0.5, -0.1, 0.9, 0.76, 0.1, "#1a1b1e", { ...K.STONE, bevel: 0.002 }),
    b(0, 0.12, 0.0, 0.9, 0.1, 0.24, "#2a2b2f", { ...K.STONE, bevel: 0.004 }),
    ...[-0.2, 0, 0.2].map((x, i) => cy(x, 0.22, 0.0, 0.1, 0.34, i === 1 ? "#6b4a35" : "#5a3a2a", { ...K.WOOD, bevel: 0.01, r: [0, 0, PI / 2 + i * 0.1] })),
    b(0, 0.3, -0.02, 0.6, 0.3, 0.08, FLAME, { glow: true }),
    b(0, 0.17, 0.0, 0.7, 0.04, 0.12, "#ff7a2a", { glow: true }),
    // cove under the mantel, pillar bases and raised panels, fire grate
    b(0, 1.14, 0.0, 1.4, 0.04, 0.34, WHITE, { ...K.MATT, bevel: 0.006, m: true, detail: 1 }),
    ...[-1, 1].flatMap((s) => [
      b(s * 0.57, 0.07, -0.02, 0.24, 0.1, 0.34, WHITE, { ...K.MATT, bevel: 0.006, m: true, detail: 1 }),
      b(s * 0.57, 0.62, 0.133, 0.12, 0.85, 0.004, WHITE, { ...K.MATT, bevel: 0.001, m: true, detail: 1 }),
    ]),
    ...[-0.3, 0, 0.3].map((x) => b(x, 0.2, 0.13, 0.012, 0.16, 0.012, BLACK, { ...K.BLACK_METAL, bevel: 0.002, detail: 2 })),
    b(0, 0.27, 0.13, 0.7, 0.012, 0.012, BLACK, { ...K.BLACK_METAL, bevel: 0.002, detail: 2 }),
  ], { light: { y: 0.3, color: "#ff8a3a", k: 0.8 } });
const fireplaceStone = (): Def => {
  const stones = Array.from({ length: 4 }, (_, r) => Array.from({ length: 6 }, (_, c) => b(-0.75 + 0.13 + c * 0.25 + (r % 2) * 0.1, 1.5 + r * 0.25 + 0.0, 0.0, 0.23, 0.22, 0.04, ["#9a9188", "#a8a096", "#8a8279"][(r + c) % 3], { ...K.STONE, bevel: 0.01 }))).flat();
  return piece("Living", `Fireplace with stone chimney breast ${dims(1.8, 0.5)}`, 1.8, 0.5, 2.5, [
    b(0, 0.04, 0.0, 1.8, 0.08, 0.5, "#8d9299", { ...K.STONE, bevel: 0.006 }),
    ...[-1, 1].map((s) => b(s * 0.65, 0.7, -0.1, 0.5, 1.2, 0.3, "#9a9188", { ...K.STONE, bevel: 0.01 })),
    b(0, 1.0, -0.1, 0.8, 0.4, 0.3, "#9a9188", { ...K.STONE, bevel: 0.01 }),
    b(0, 0.5, -0.2, 0.8, 0.8, 0.1, "#1a1b1e", { ...K.STONE, bevel: 0.002 }),
    b(0, 1.32, 0.05, 1.8, 0.08, 0.38, DARKWOOD, { ...K.WOOD, bevel: 0.01 }),
    b(0, 1.52, -0.18, 1.7, 0.4, 0.12, "#a8a096", { ...K.STONE, bevel: 0.01 }),
    b(0, 2.2, -0.2, 1.7, 0.6, 0.1, "#9a9188", { ...K.STONE, bevel: 0.01 }),
    ...stones.map((p) => ({ ...p, p: [p.p[0], p.p[1] + 0.2, -0.2] as V3 })).filter((p) => p.p[1] > 1.7 && p.p[1] < 2.45),
    b(0, 0.3, -0.12, 0.6, 0.3, 0.08, FLAME, { glow: true }),
    ...[-0.2, 0.2].map((x) => cy(x, 0.2, -0.02, 0.1, 0.4, "#6b4a35", { ...K.WOOD, bevel: 0.01, r: [0, 0, PI / 2] })),
    // corbels under the mantel, stone sill and grate
    ...[-1, 1].map((s) => b(s * 0.78, 1.24, 0.1, 0.1, 0.12, 0.24, DARKWOOD, { ...K.WOOD, bevel: 0.008, detail: 1 })),
    b(0, 0.1, 0.1, 1.2, 0.04, 0.3, "#8d9299", { ...K.STONE, bevel: 0.006, detail: 1 }),
    ...[-0.25, 0, 0.25].map((x) => b(x, 0.18, 0.12, 0.012, 0.18, 0.012, BLACK, { ...K.BLACK_METAL, bevel: 0.002, detail: 2 })),
  ], { light: { y: 0.3, color: "#ff8a3a", k: 0.8 } });
};
const woodStove = (): Def =>
  piece("Living", `Wood-burning stove ${dims(0.5, 0.45)}`, 0.5, 0.45, 2.3, [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.2, 0.08, sz * 0.17, 0.04, 0.16, 0.04, BLACK, K.BLACK_METAL))),
    b(0, 0.45, 0, 0.5, 0.58, 0.45, "#26272b", { ...K.BLACK_METAL, bevel: 0.01 }),
    b(0, 0.78, 0, 0.54, 0.04, 0.49, "#1a1b1e", { ...K.BLACK_METAL, bevel: 0.008 }),
    b(0, 0.47, 0.226, 0.34, 0.34, 0.012, "#ff7a2a", { glow: true }),
    b(0, 0.47, 0.232, 0.38, 0.38, 0.008, BLACK, { ...K.BLACK_METAL, bevel: 0.004 }),
    b(0, 0.47, 0.236, 0.32, 0.32, 0.004, FLAME, { glow: true }),
    b(0.14, 0.12, 0.231, 0.08, 0.012, 0.008, METAL, K.STEEL),
    cy(0, 1.55, -0.1, 0.14, 1.5, "#1a1b1e", { ...K.BLACK_METAL, rough: 0.6 }),
    cy(0, 0.86, -0.1, 0.17, 0.03, "#1a1b1e", { ...K.BLACK_METAL, detail: 1 }),
    b(0.19, 0.47, 0.245, 0.012, 0.16, 0.012, METAL, { ...K.STEEL, bevel: 0.003, detail: 2 }),
    ...[-0.12, 0, 0.12].map((x) => b(x, 0.2, 0.226, 0.07, 0.006, 0.004, "#0e0e10", { ...K.BLACK_METAL, bevel: 0, detail: 1 })),
  ], { light: { y: 0.45, color: "#ff8a3a", k: 0.6 } });

// ---------- room dividers ----------
const folding = (): Def => {
  const n = 4;
  const dx = 0.33;
  const dz = 0.2;
  return piece("Decor", `Folding screen, 4 panels ${dims(1.4, 0.3)}`, 1.4, 0.3, 1.7, Array.from({ length: n }, (_, i) => {
    const x0 = -dx * 2 + i * dx;
    const z0 = ((i % 2) * 2 - 1) * dz / 2;
    const z1 = (((i + 1) % 2) * 2 - 1) * dz / 2;
    const ang = -Math.atan2(z1 - z0, dx);
    const len = Math.hypot(dx, z1 - z0);
    const at = [x0 + dx / 2, (z0 + z1) / 2] as const;
    const rail = (y: number, h: number, d = 0.03): Part => b(at[0], y, at[1], len - 0.02, h, d, DARKWOOD, { ...K.WOOD, bevel: 0.004, r: [0, ang, 0], detail: 1 });
    return [
      b(at[0], 0.86, at[1], len, 1.66, 0.025, i % 2 ? "#d9cbb0" : "#cbbfa8", { ...K.FAB, bevel: 0.004, m: true, r: [0, ang, 0] }),
      b(at[0], 0.86, at[1], len - 0.06, 0.04, 0.03, DARKWOOD, { ...K.WOOD, bevel: 0.004, r: [0, ang, 0] }),
      rail(0.06, 0.06), rail(1.64, 0.05),
    ];
  }).flat());
};
const slatDivider = (): Def =>
  piece("Decor", `Slatted room divider ${dims(1.2, 0.12)}`, 1.2, 0.12, 1.8, [
    b(0, 0.04, 0, 1.2, 0.08, 0.12, OAK, { ...K.WOOD, bevel: 0.008, m: true }),
    b(0, 1.77, 0, 1.2, 0.05, 0.12, OAK, { ...K.WOOD, bevel: 0.008, m: true }),
    ...Array.from({ length: 13 }, (_, i) => b(-0.54 + i * 0.09, 0.9, 0, 0.04, 1.72, 0.05, OAK, { ...K.WOOD, bevel: 0.008, m: true })),
    ...Array.from({ length: 13 }, (_, i) => b(-0.54 + i * 0.09, 0.9, 0.028, 0.012, 1.7, 0.006, OAK, { ...K.WOOD, bevel: 0.002, m: true, detail: 1 })),
    ...[0.35, 0.9, 1.45].map((y) => b(0, y, -0.03, 1.1, 0.012, 0.012, DARKWOOD, { ...K.WOOD, bevel: 0.002, detail: 1 })),
  ]);
const cubeDivider = (): Def => {
  const cols = 4;
  const rows = 3;

  return piece("Living", `Cube shelf divider ${dims(1.4, 0.35)}`, 1.4, 0.35, 1.5, [
    ...Array.from({ length: cols + 1 }, (_, i) => b(-0.7 + 0.011 + (i * (1.4 - 0.022)) / cols, 0.75, 0, 0.022, 1.5, 0.35, WHITE, { ...K.LACQUER, bevel: 0.004, m: true })),
    ...Array.from({ length: rows + 1 }, (_, j) => b(0, 0.011 + (j * (1.5 - 0.022)) / rows, 0, 1.4, 0.022, 0.35, WHITE, { ...K.LACQUER, bevel: 0.004, m: true })),
    ...books(-0.66, 0.022, 0, 6, 0.28, 0.3, 0.04).map((p) => ({ ...BOOK, ...p })),
    b(0.18, 0.2, 0, 0.3, 0.3, 0.28, TERRA, { ...K.FAB, bevel: 0.025 }),
    K.turned(0.35, 0.61, 0, K.vaseProfile(0.07, 0.2, 0.5), CREAM, K.CERAMIC), sp(0.35, 0.88, 0, 0.18, LEAF2, LEAFY),
    b(-0.35, 0.72, 0, 0.28, 0.3, 0.28, "#4a6b8a", { ...K.FAB, bevel: 0.025 }),
    ...books(0.0, 1.1, 0, 5, 0.28, 0.28, 0.04).map((p) => ({ ...BOOK, ...p })),
    b(0.52, 1.25, 0, 0.28, 0.28, 0.28, "#8a9a8c", { ...K.FAB, bevel: 0.025 }),
    // thin back panel and basket handles
    b(0, 0.75, -0.165, 1.38, 1.48, 0.012, WHITE, { ...K.MATT, bevel: 0, m: true, detail: 1 }),
    ...[[0.18, 0.2], [-0.35, 0.72], [0.52, 1.25]].map(([x, y]) => b(x, y + 0.08, 0.145, 0.1, 0.012, 0.012, "#c9b79a", { ...K.FAB, bevel: 0.004, detail: 2 })),
  ]);
};

export const HOME: Record<string, Def> = {
  dc_vase_floor: vaseFloor(),
  dc_vase_flowers: vaseFlowers(),
  dc_vase_set: vaseSet(),
  dc_candles_3: candles(),
  dc_lantern_floor: lantern(),
  dc_candelabra: candelabra(),
  dc_books_stack_small: bookStack("Stack of books, small", 4, 0.22),
  dc_books_stack_large: bookStack("Stack of coffee-table books", 6, 0.34),
  dc_clock_wall: clockWall(),
  dc_clock_grandfather: grandfather(),
  dc_cushions_sofa_3: cushionSet(),
  dc_throw_blanket: throwBlanket(),
  dc_floor_cushion_60: floorCushion(`Floor cushion ${dims(0.6, 0.6)}`, 0.6, 1),
  dc_floor_cushions_stack: floorCushion(`Floor cushions, stack of three ${dims(0.7, 0.7)}`, 0.7, 3),
  dc_tv_decor_set: tvDecor(),
  dc_fireplace_mantel: fireplace(),
  dc_fireplace_stone: fireplaceStone(),
  dc_stove_woodburner: woodStove(),
  dc_divider_folding: folding(),
  dc_divider_slat: slatDivider(),
  dc_divider_cubes: cubeDivider(),
};
