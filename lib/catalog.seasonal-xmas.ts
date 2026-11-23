import type { Def, Part } from "./catalog";
import { BROWN, GOLD, GREEN, RED, TRUNK, WARM, WHITE, WIRE, arc, b, bulb, cy, flame, gift, glow, globe, lit, range, rod, sp, star, striped, swag, swagAt, swagBulbs, sz } from "./catalog.seasonal-kit.ts";

// Christmas. A tree is ONE piece: foliage, lights, baubles and topper, with the lights linked to a light or switch.
const GOLDEN = 2.399; // golden angle: scatters bulbs round a tree without visible rows
const BAUBLES = ["#c0392b", "#d4a93c", "#c7ccd1", "#2f5f9a"];

type Tree = { h: number; w: number; col: string; lights: number; baubles?: number; palette?: string[]; frost?: boolean; stand?: string };

/** Stepped fir: stacked discs narrowing to the tip, a spiral of twinkling bulbs, baubles and a glowing star. */
function treeParts(o: Tree): Part[] {
  const { h } = o;
  const w = o.w - 0.1; // foliage a little inside the footprint so bulbs and baubles stay within it
  const topper = Math.min(0.2, Math.max(0.09, 0.075 * h));
  const y0 = Math.min(0.1, h * 0.14);
  const top = h - topper * 0.8;
  const n = Math.max(6, Math.round((top - y0) / 0.13)); // many shallow tiers read as a cone rather than a stack of plates
  const step = (top - y0) / n;
  const th = step * 1.6;
  const tiers = range(n).map((i) => {
    const y = y0 + (i + 0.5) * step;
    return { y, dia: Math.max(0.07, w * (1 - (y - step / 4 - y0) / (top - y0))) };
  });
  const outer = (y: number) => Math.max(0.03, ...tiers.filter((t) => Math.abs(y - t.y) <= th / 2).map((t) => t.dia / 2));
  const at = (u: number, k: number, lift: number): [number, number, number] => {
    const y = y0 + 0.05 + u * (top - y0 - 0.15);
    const a = k * GOLDEN;
    const r = outer(y) + lift;
    return [r * Math.cos(a), y, r * Math.sin(a)];
  };
  const bd = Math.min(0.075, Math.max(0.035, 0.04 * h));
  const bulbSize = Math.min(0.05, 0.026 + 0.01 * h); // big enough to read as lights at the default zoom
  const palette = o.palette ?? BAUBLES;
  return [
    cy(0, 0.03, 0, Math.min(0.42, Math.max(0.14, w * 0.3)), 0.06, o.stand ?? "#7a2f2a"),
    cy(0, h * 0.45, 0, 0.05, h * 0.9, TRUNK),
    ...tiers.flatMap((t) => [
      cy(0, t.y, 0, t.dia, th, o.col, { m: true }),
      ...(o.frost ? [cy(0, t.y + th / 2 + 0.004, 0, t.dia * 0.97, 0.014, "#f4f8fa")] : []),
    ]),
    ...range(o.lights).map((k) => {
      const [x, y, z] = at((k + 0.5) / o.lights, k, 0.012);
      return bulb(x, y, z, bulbSize);
    }),
    ...range(o.baubles ?? 0).map((k) => {
      const [x, y, z] = at((k + 0.5) / (o.baubles ?? 1), k + 0.5, bd * 0.3);
      return sp(x, y, z, bd, palette[k % palette.length]);
    }),
    ...star(0, h - topper * 0.72, 0, topper),
  ];
}

const tree = (label: string, o: Tree, k: number): Def => sz(label, o.w, o.w, o.h, treeParts(o), lit(o.h * 0.55, WARM, k));

const FIR = "#2f6b3a";
const TREES: Record<string, Def> = {
  sz_xm_tree_60: tree("Christmas tree 60 cm tabletop, green", { h: 0.6, w: 0.36, col: FIR, lights: 12, baubles: 5 }, 0.3),
  sz_xm_tree_120: tree("Christmas tree 1.2 m, green", { h: 1.2, w: 0.72, col: FIR, lights: 22, baubles: 9 }, 0.5),
  sz_xm_tree_180: tree("Christmas tree 1.8 m, green", { h: 1.8, w: 1.0, col: FIR, lights: 34, baubles: 15 }, 0.8),
  sz_xm_tree_210: tree("Christmas tree 2.1 m, green", { h: 2.1, w: 1.15, col: FIR, lights: 42, baubles: 19 }, 0.85),
  sz_xm_tree_240: tree("Christmas tree 2.4 m, green", { h: 2.4, w: 1.3, col: FIR, lights: 50, baubles: 24 }, 0.9),
  sz_xm_tree_180_white: tree("Christmas tree 1.8 m, white flocked", { h: 1.8, w: 1.0, col: "#eef2f2", lights: 34, baubles: 14, palette: ["#c7ccd1", "#dfe6ec", "#d4a93c", "#9fb6cf"] }, 0.8),
  sz_xm_tree_180_slim: tree("Christmas tree 1.8 m, slim pencil", { h: 1.8, w: 0.55, col: "#2a6034", lights: 30, baubles: 9 }, 0.7),
  sz_xm_tree_210_frosted: tree("Christmas tree 2.1 m, green frosted", { h: 2.1, w: 1.15, col: "#2c5f45", frost: true, lights: 42, baubles: 16, palette: ["#c7ccd1", "#e8eef2", "#7da6c9", "#d4a93c"] }, 0.85),
  sz_xm_tree_180_pink: tree("Christmas tree 1.8 m, modern pink", { h: 1.8, w: 1.0, col: "#e7a3bf", lights: 34, baubles: 14, palette: ["#f5e6ec", "#d4a93c", "#c96f93", "#ffffff"], stand: "#c7ccd1" }, 0.8),
  sz_xm_tree_180_blue: tree("Christmas tree 1.8 m, modern blue", { h: 1.8, w: 1.0, col: "#5f93c9", lights: 34, baubles: 14, palette: ["#e8eef2", "#c7ccd1", "#2f5f9a", "#ffffff"], stand: "#c7ccd1" }, 0.8),
  sz_xm_tree_210_led: tree("Christmas tree 2.1 m, green with warm LED strands", { h: 2.1, w: 1.15, col: FIR, lights: 110 }, 1),
};

// ---------------------------------------------------------------- tree accessories
const ACCESSORIES: Record<string, Def> = {
  sz_xm_tree_stand: sz("Christmas tree stand, metal", 0.66, 0.66, 0.14, [
    cy(0, 0.04, 0, 0.26, 0.08, "#3a3d42"),
    cy(0, 0.1, 0, 0.1, 0.08, "#8d9299"),
    ...[0, 1, 2].map((i) => {
      const a = (i * Math.PI * 2) / 3;
      return b(0.15 * Math.sin(a), 0.015, 0.15 * Math.cos(a), 0.3, 0.03, 0.05, "#3a3d42", { r: [0, a - Math.PI / 2, 0] });
    }),
  ]),
  sz_xm_tree_skirt: sz("Christmas tree skirt, red felt", 1.1, 1.1, 0.035, [cy(0, 0.012, 0, 1.1, 0.024, WHITE), cy(0, 0.02, 0, 0.98, 0.026, RED, { m: true }), cy(0, 0.034, 0, 0.3, 0.01, "#8f1d24")]),
  sz_xm_topper_star: sz("Tree topper, glowing star", 0.3, 0.08, 0.3, [cy(0, 0.04, 0, 0.05, 0.08, GOLD), ...star(0, 0.16, 0, 0.2)], lit(0.16, "#ffe08a", 0.25)),
  sz_xm_topper_angel: sz("Tree topper, angel with halo", 0.3, 0.12, 0.3, [
    cy(0, 0.08, 0, 0.1, 0.16, "#f4efe6"),
    cy(0, 0.17, 0, 0.1, 0.02, GOLD),
    sp(0, 0.21, 0, 0.065, "#f1d6bb"),
    b(-0.07, 0.15, -0.02, 0.1, 0.14, 0.012, "#fffdf6", { r: [0, 0, 0.5] }),
    b(0.07, 0.15, -0.02, 0.1, 0.14, 0.012, "#fffdf6", { r: [0, 0, -0.5] }),
    glow(cy(0, 0.275, 0, 0.1, 0.01, "#ffe08a")),
  ], lit(0.27, "#ffe08a", 0.25)),
  sz_xm_baubles_bowl: sz("Bowl of Christmas baubles", 0.34, 0.34, 0.2, [
    cy(0, 0.04, 0, 0.3, 0.08, "#d9d2c3"),
    ...range(9).map((i) => {
      const a = (i / 8) * Math.PI * 2;
      return i === 8 ? sp(0, 0.13, 0, 0.1, GOLD) : sp(0.09 * Math.cos(a), 0.1, 0.09 * Math.sin(a), 0.085, BAUBLES[i % 4]);
    }),
    sp(0.03, 0.17, 0.04, 0.08, RED),
  ]),
};

// ---------------------------------------------------------------- garlands (wall)
const pineSwag = (x0: number, x1: number, y: number, sag: number, c: string): Part[] => [
  ...swag(x0, x1, y, 0, sag, 10, 0.09, c, { m: true }),
  ...swag(x0, x1, y - 0.025, 0.035, sag, 10, 0.06, "#3d7a42", { m: true }),
];
const bow = (x: number, y: number, z: number): Part[] => [b(x - 0.045, y, z, 0.07, 0.05, 0.03, RED, { r: [0, 0, 0.4] }), b(x + 0.045, y, z, 0.07, 0.05, 0.03, RED, { r: [0, 0, -0.4] }), sp(x, y, z + 0.005, 0.035, "#8f1d24")];
const berries = (x0: number, x1: number, y: number, sag: number, n: number): Part[] =>
  range(n).map((i) => {
    const [x, yy] = swagAt(x0, x1, y, sag, (i + 0.5) / n);
    return sp(x, yy - 0.035 + (i % 2) * 0.03, 0.07, 0.03, i % 3 ? RED : GOLD);
  });

const GARLANDS: Record<string, Def> = {
  sz_xm_garland_lights: sz("Pine garland with warm lights, 1.8 m", 1.9, 0.16, 2.2, [
    ...pineSwag(-0.85, 0.85, 2.1, 0.3, GREEN),
    ...berries(-0.85, 0.85, 2.1, 0.3, 9),
    ...swagBulbs(-0.85, 0.85, 2.1, 0.075, 0.3, 14, (x, y, z) => bulb(x, y, z, 0.026)),
    ...bow(-0.85, 2.1, 0.05),
    ...bow(0.85, 2.1, 0.05),
  ], { wall: true, ...lit(1.95, WARM, 0.5) }),
  sz_xm_garland: sz("Pine garland with baubles, 1.8 m", 1.9, 0.16, 2.2, [
    ...pineSwag(-0.85, 0.85, 2.1, 0.3, GREEN),
    ...berries(-0.85, 0.85, 2.1, 0.3, 9),
    ...range(7).map((i) => {
      const [x, y] = swagAt(-0.85, 0.85, 2.1, 0.3, (i + 0.5) / 7);
      return sp(x, y - 0.055, 0.075, 0.05, BAUBLES[i % 4]);
    }),
    ...bow(-0.85, 2.1, 0.05),
    ...bow(0.85, 2.1, 0.05),
  ], { wall: true }),
  sz_xm_tinsel: sz("Tinsel garland, gold", 1.8, 0.1, 2.2, [
    ...swag(-0.85, 0.85, 2.1, 0, 0.3, 10, 0.075, "#e2b64a", { m: true }),
    ...swag(-0.85, 0.85, 2.075, 0.02, 0.3, 10, 0.05, "#f3d37a", { m: true }),
    ...swag(-0.85, 0.85, 2.13, -0.015, 0.3, 10, 0.04, "#c99a2e", { m: true }),
  ], { wall: true }),
  sz_xm_stockings: sz("Mantel shelf with three Christmas stockings", 1.4, 0.24, 1.25, [
    b(0, 1.1, 0, 1.4, 0.05, 0.24, "#c9a26b", { m: true }),
    b(0, 1.04, -0.09, 1.3, 0.07, 0.04, "#a9855a", { m: true }),
    ...[-0.42, 0, 0.42].flatMap((x, i) => {
      const body = i === 1 ? GREEN : RED;
      return [
        b(x, 0.93, 0.125, 0.09, 0.26, 0.04, body),
        b(x + 0.03, 0.82, 0.125, 0.15, 0.09, 0.04, body),
        b(x, 1.04, 0.125, 0.105, 0.06, 0.048, WHITE),
        b(x - 0.04, 1.075, 0.125, 0.018, 0.03, 0.01, GOLD),
      ];
    }),
    ...pineSwag(-0.6, 0.6, 1.14, 0.04, GREEN).map((p) => ({ ...p, p: [p.p[0], p.p[1], p.p[2] + 0.02] as Part["p"] })),
    cy(-0.62, 1.2, 0.0, 0.05, 0.1, "#efe6d2"),
    cy(0.62, 1.2, 0.0, 0.05, 0.1, "#efe6d2"),
  ], { wall: true }),
};

// ---------------------------------------------------------------- gifts (six colour sets)
const GIFT_SETS: [string, string, string, string, string][] = [
  ["red", "#b3262e", "#e8c14a", "#2f6b3a", "#f4f3f0"],
  ["green", "#2f6b3a", "#b3262e", "#f4f3f0", "#d4a93c"],
  ["blue", "#2f5f9a", "#c7ccd1", "#e8eef2", "#c7ccd1"],
  ["white", "#f4f3f0", "#d4a93c", "#e8d9c4", "#b3262e"],
  ["purple", "#6b3f8a", "#e8a6c0", "#c9b5dc", "#f4f3f0"],
  ["kraft", "#b58a5a", "#b3262e", "#9c7448", "#2f6b3a"],
];
const GIFTS: Record<string, Def> = Object.fromEntries(
  GIFT_SETS.map(([name, a, rib, c, rib2]) => [
    `sz_xm_gifts_${name}`,
    sz(`Stack of Christmas gifts, ${name}`, 0.72, 0.46, 0.46, [
      ...gift(-0.12, 0.12, 0, 0.34, 0.24, 0.3, a, rib),
      ...gift(0.2, 0.1, 0.06, 0.24, 0.2, 0.26, c, rib2, 0.25),
      ...gift(-0.1, 0.34, -0.01, 0.2, 0.16, 0.2, rib === "#e8c14a" ? "#ffffff" : rib2, a, 0.4),
      ...gift(0.18, 0.28, 0.07, 0.12, 0.1, 0.12, a, rib2, -0.3),
    ]),
  ]),
);

// ---------------------------------------------------------------- door and window lights
const wreath = (withLights: boolean): Part[] => {
  const R = 0.21;
  const yc = 1.65;
  return [
    ...arc(0, yc, R, 18).map(([x, y, a], i) => b(x, y, 0, 0.1, 0.1, 0.07, i % 2 ? "#2c6a38" : GREEN, { r: [0, 0, a + Math.PI / 2], m: true })),
    ...arc(0, yc, R, 9, 0.2).map(([x, y], i) => sp(x, y, 0.045, 0.03, i % 3 ? RED : GOLD)),
    ...(withLights ? arc(0, yc, R + 0.01, 14, 0.1).map(([x, y]) => bulb(x, y, 0.05, 0.026)) : []),
    ...bow(0, yc - R, 0.06),
    b(-0.05, yc - R - 0.06, 0.055, 0.035, 0.1, 0.012, RED, { r: [0, 0, 0.2] }),
    b(0.05, yc - R - 0.06, 0.055, 0.035, 0.1, 0.012, RED, { r: [0, 0, -0.2] }),
  ];
};

const strands = (n: number, span: number, top: number, lens: number[], z: number, wire: string): Part[] =>
  range(n).flatMap((i) => {
    const x = -span / 2 + (i + 0.5) * (span / n);
    const len = lens[i % lens.length];
    const count = Math.floor(len / 0.16);
    return [b(x, top - len / 2, z, 0.004, len, 0.004, wire), ...range(count).map((j) => bulb(x, top - 0.1 - j * 0.16, z, 0.024))];
  });

const LIGHTS: Record<string, Def> = {
  sz_xm_wreath_door: sz("Christmas wreath for the door", 0.5, 0.12, 1.95, wreath(false), { wall: true }),
  sz_xm_wreath_door_lights: sz("Christmas wreath with warm lights", 0.5, 0.12, 1.95, wreath(true), { wall: true, ...lit(1.65, WARM, 0.3) }),
  sz_xm_fairy_window: sz("Fairy-light curtain for a window, 1.6 m", 1.6, 0.06, 2.3, [
    b(0, 2.28, 0, 1.6, 0.02, 0.02, "#9a9a9a"),
    ...strands(9, 1.5, 2.28, [1.0, 1.3, 1.15, 1.45, 0.95], 0, "#bdb6a4"),
  ], { wall: true, ...lit(1.8, WARM, 0.5) }),
  sz_xm_fairy_wall: sz("Fairy-light curtain for a wall, 2.2 m", 2.2, 0.06, 2.4, [
    b(0, 2.38, 0, 2.2, 0.02, 0.02, "#8a6a3f"),
    ...strands(13, 2.1, 2.38, [1.5, 1.9, 1.7, 2.05, 1.6, 1.8], 0, "#b98a52"),
  ], { wall: true, ...lit(1.7, WARM, 0.6) }),
  sz_xm_fairy_ceiling: sz("Fairy-light canopy under the ceiling", 2.2, 2.0, 2.6, [
    ...range(7).flatMap((i) => {
      const x = -1.0 + i * (2 / 6);
      return [b(x, 2.54, 0, 0.004, 0.004, 1.9, "#bdb6a4"), ...range(11).map((j) => bulb(x, 2.52, -0.9 + j * 0.18 + (i % 2) * 0.09, 0.024))];
    }),
    b(0, 2.56, -0.96, 2.1, 0.015, 0.015, "#9a9a9a"),
    b(0, 2.56, 0.96, 2.1, 0.015, 0.015, "#9a9a9a"),
  ], { wall: true, ...lit(2.45, WARM, 0.6) }),
  sz_xm_string_roofline: sz("String lights for the roofline, 6 m", 6, 0.08, 2.9, [
    ...range(6).flatMap((i) => [
      ...swag(-3 + i, -2 + i, 2.85, 0, 0.22, 4, 0.01, WIRE),
      ...swagBulbs(-3 + i, -2 + i, 2.85, 0.02, 0.22, 5, (x, y, z) => globe(x, y, z, 0.055), 0.035, i * 5),
    ]),
  ], { wall: true, ...lit(2.6, WARM, 0.8) }),
  sz_xm_string_balcony: sz("String lights for a balcony railing, 3 m", 3, 0.08, 1.2, [
    ...range(3).flatMap((i) => [
      ...swag(-1.5 + i, -0.5 + i, 1.15, 0, 0.16, 4, 0.01, WIRE),
      ...swagBulbs(-1.5 + i, -0.5 + i, 1.15, 0.02, 0.16, 5, (x, y, z) => globe(x, y, z, 0.05), 0.03, i * 5),
    ]),
  ], { wall: true, ...lit(1.0, WARM, 0.6) }),
  sz_xm_string_tree: sz("Garden tree wrapped in string lights", 1.3, 1.3, 2.45, [
    cy(0, 0.8, 0, 0.26, 1.6, "#5a4636"),
    sp(0, 1.75, 0, 1.3, "#3d7a42", { m: true }),
    ...range(34).map((k) => {
      const th = 0.3 * Math.PI + (k / 34) * 0.6 * Math.PI;
      const a = k * GOLDEN;
      return bulb(0.67 * Math.sin(th) * Math.cos(a), 1.75 + 0.67 * Math.cos(th), 0.67 * Math.sin(th) * Math.sin(a), 0.034);
    }),
    ...range(10).map((k) => bulb(0.15 * Math.cos(k * 1.2), 0.2 + k * 0.12, 0.15 * Math.sin(k * 1.2), 0.03)),
  ], lit(1.7, WARM, 1)),
  sz_xm_icicles: sz("Icicle lights for the eaves, 3 m", 3, 0.06, 2.7, [
    b(0, 2.7, 0, 3, 0.012, 0.012, WIRE),
    ...range(36).map((i) => {
      const len = [0.12, 0.24, 0.17, 0.32, 0.2][i % 5];
      return { ...b(-1.45 + i * 0.0829, 2.7 - len / 2, 0, 0.014, len, 0.014, "#dcecff", { glow: true }), twinkle: 1 };
    }),
  ], { wall: true, ...lit(2.5, "#cfe6ff", 0.7) }),
  sz_xm_candle_arch: sz("LED candle arch for the window sill", 0.62, 0.12, 1.2, [
    b(0, 0.93, 0, 0.6, 0.02, 0.1, "#2a2a2a"),
    ...range(7).flatMap((i) => {
      const x = -0.27 + i * 0.09;
      const hh = 0.1 + 0.12 * Math.sin((Math.PI * i) / 6);
      return [cy(x, 0.94 + hh / 2, 0, 0.024, hh, "#efe6d2"), flame(x, 0.94 + hh + 0.022, 0, 0.018)];
    }),
    b(0, 1.04, 0, 0.5, 0.008, 0.008, "#2a2a2a"),
  ], { wall: true, ...lit(1.1, "#ffc46b", 0.4) }),
};

// ---------------------------------------------------------------- figures and scenes
const ADVENT_COL = [RED, "#f4f3f0", GREEN, GOLD];
const FIGURES: Record<string, Def> = {
  sz_xm_advent: sz("Wooden advent calendar house with 24 doors", 0.42, 0.14, 0.64, [
    b(0, 0.26, 0, 0.4, 0.52, 0.12, "#c9a26b", { m: true }),
    b(-0.11, 0.57, 0, 0.26, 0.02, 0.15, RED, { r: [0, 0, 0.65] }),
    b(0.11, 0.57, 0, 0.26, 0.02, 0.15, RED, { r: [0, 0, -0.65] }),
    ...range(24).map((i) => b(-0.15 + (i % 4) * 0.1, 0.07 + Math.floor(i / 4) * 0.075, 0.065, 0.07, 0.055, 0.01, ADVENT_COL[(i + Math.floor(i / 4)) % 4])),
  ]),
  sz_xm_santa: sz("Santa Claus figure, 1.2 m", 0.8, 0.5, 1.22, [
    b(-0.08, 0.05, 0.03, 0.12, 0.1, 0.2, "#1b1b1d"),
    b(0.08, 0.05, 0.03, 0.12, 0.1, 0.2, "#1b1b1d"),
    b(-0.08, 0.25, 0, 0.12, 0.3, 0.14, RED),
    b(0.08, 0.25, 0, 0.12, 0.3, 0.14, RED),
    cy(0, 0.62, 0, 0.36, 0.44, RED),
    cy(0, 0.41, 0, 0.38, 0.05, WHITE),
    b(0, 0.62, 0.17, 0.05, 0.44, 0.02, WHITE),
    cy(0, 0.5, 0, 0.375, 0.06, "#1b1b1d"),
    b(0, 0.5, 0.19, 0.07, 0.06, 0.012, GOLD),
    b(-0.22, 0.62, 0, 0.08, 0.36, 0.1, RED, { r: [0, 0, 0.25] }),
    b(0.22, 0.62, 0, 0.08, 0.36, 0.1, RED, { r: [0, 0, -0.25] }),
    sp(-0.27, 0.43, 0.02, 0.09, "#1b1b1d"),
    sp(0.27, 0.43, 0.02, 0.09, "#1b1b1d"),
    sp(0, 0.93, 0.02, 0.17, "#f1c9a5"),
    sp(0, 0.86, 0.07, 0.15, WHITE),
    b(0, 0.9, 0.1, 0.14, 0.04, 0.04, WHITE),
    sp(0, 0.93, 0.105, 0.03, "#e79a8d"),
    cy(0, 0.99, 0.02, 0.17, 0.04, WHITE),
    cy(0, 1.06, 0, 0.14, 0.1, RED),
    cy(0, 1.13, -0.02, 0.09, 0.06, RED),
    sp(0.03, 1.18, -0.04, 0.05, WHITE),
    sp(-0.26, 0.14, -0.12, 0.24, "#8a5a3a"),
  ]),
  sz_xm_reindeer: sz("Rudolph reindeer with a glowing red nose", 0.42, 0.9, 1.15, [
    b(0, 0.5, 0, 0.2, 0.24, 0.5, "#8a5a3a"),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz_) => b(sx * 0.06, 0.19, sz_ * 0.19, 0.045, 0.38, 0.045, BROWN))),
    b(0, 0.72, 0.22, 0.1, 0.34, 0.1, "#8a5a3a", { r: [-0.35, 0, 0] }),
    b(0, 0.9, 0.29, 0.12, 0.12, 0.2, "#8a5a3a"),
    b(-0.07, 0.99, 0.25, 0.035, 0.08, 0.02, "#8a5a3a", { r: [0, 0, 0.5] }),
    b(0.07, 0.99, 0.25, 0.035, 0.08, 0.02, "#8a5a3a", { r: [0, 0, -0.5] }),
    glow(sp(0, 0.89, 0.41, 0.055, "#ff3b30")),
    sp(-0.04, 0.93, 0.38, 0.02, "#1b1b1d"),
    sp(0.04, 0.93, 0.38, 0.02, "#1b1b1d"),
    sp(0, 0.55, -0.28, 0.07, WHITE),
    rod([-0.04, 0.95, 0.26], [-0.12, 1.12, 0.24], 0.02, "#6b4a35"),
    rod([-0.1, 1.07, 0.25], [-0.2, 1.1, 0.24], 0.016, "#6b4a35"),
    rod([0.04, 0.95, 0.26], [0.12, 1.12, 0.24], 0.02, "#6b4a35"),
    rod([0.1, 1.07, 0.25], [0.2, 1.1, 0.24], 0.016, "#6b4a35"),
    cy(0, 0.7, 0.2, 0.13, 0.03, RED),
  ], lit(0.89, "#ff3b30", 0.2)),
  sz_xm_snowman: sz("Snowman, 1.25 m", 0.85, 0.5, 1.25, [
    sp(0, 0.25, 0, 0.5, WHITE),
    sp(0, 0.65, 0, 0.36, WHITE),
    sp(0, 0.95, 0, 0.26, WHITE),
    cy(0, 0.83, 0, 0.27, 0.05, RED),
    b(0.1, 0.77, 0.1, 0.05, 0.14, 0.03, RED),
    cy(0, 1.1, 0, 0.3, 0.015, "#1b1b1d"),
    cy(0, 1.17, 0, 0.17, 0.14, "#1b1b1d"),
    b(0, 1.12, 0, 0.175, 0.03, 0.175, RED),
    b(0, 0.96, 0.15, 0.03, 0.03, 0.14, "#e07a20"),
    sp(-0.05, 1.0, 0.11, 0.025, "#1b1b1d"),
    sp(0.05, 1.0, 0.11, 0.025, "#1b1b1d"),
    ...[0.7, 0.62, 0.54].map((y) => sp(0, y, 0.175, 0.03, "#1b1b1d")),
    rod([-0.17, 0.7, 0], [-0.4, 0.88, 0], 0.025, BROWN),
    rod([0.17, 0.7, 0], [0.4, 0.88, 0], 0.025, BROWN),
  ]),
  sz_xm_nativity: sz("Nativity scene with a glowing star", 0.7, 0.34, 0.5, [
    b(0, 0.015, 0, 0.7, 0.03, 0.34, "#8a6a45"),
    ...[-0.2, 0.2].flatMap((x) => [b(x, 0.2, -0.1, 0.03, 0.34, 0.03, BROWN), b(x, 0.2, 0.1, 0.03, 0.34, 0.03, BROWN)]),
    b(-0.12, 0.38, 0, 0.32, 0.015, 0.28, "#b58a5a", { r: [0, 0, 0.35] }),
    b(0.12, 0.38, 0, 0.32, 0.015, 0.28, "#b58a5a", { r: [0, 0, -0.35] }),
    b(0, 0.06, 0.02, 0.14, 0.05, 0.08, "#c9a26b"),
    glow(b(0, 0.1, 0.02, 0.1, 0.02, 0.05, "#ffe9b8")),
    cy(-0.12, 0.12, 0.1, 0.07, 0.18, "#3f6fb5"),
    sp(-0.12, 0.25, 0.1, 0.05, "#f1c9a5"),
    cy(0.12, 0.13, 0.1, 0.07, 0.2, "#8a5a3a"),
    sp(0.12, 0.26, 0.1, 0.05, "#f1c9a5"),
    sp(0.24, 0.07, 0.12, 0.1, WHITE),
    ...star(0, 0.43, 0.0, 0.1),
  ], lit(0.3, "#ffe08a", 0.25)),
  sz_xm_gingerbread: sz("Gingerbread house with lit windows", 0.46, 0.4, 0.44, [
    b(0, 0.12, 0, 0.4, 0.24, 0.34, "#a9672f"),
    b(-0.1, 0.31, 0, 0.27, 0.025, 0.4, "#8a4d22", { r: [0, 0, 0.6] }),
    b(0.1, 0.31, 0, 0.27, 0.025, 0.4, "#8a4d22", { r: [0, 0, -0.6] }),
    b(-0.1, 0.317, 0.2, 0.27, 0.012, 0.012, WHITE, { r: [0, 0, 0.6] }),
    b(0.1, 0.317, 0.2, 0.27, 0.012, 0.012, WHITE, { r: [0, 0, -0.6] }),
    b(0, 0.12, 0.172, 0.08, 0.16, 0.01, "#6b3a18"),
    glow(b(-0.13, 0.15, 0.172, 0.07, 0.07, 0.01, "#ffd27a")),
    glow(b(0.13, 0.15, 0.172, 0.07, 0.07, 0.01, "#ffd27a")),
    ...[-0.16, -0.08, 0, 0.08, 0.16].map((x, i) => sp(x, 0.25, 0.185, 0.03, [RED, GREEN, GOLD, "#d0507a", "#3f6fb5"][i])),
    b(0, 0.245, 0.172, 0.4, 0.012, 0.012, WHITE),
    ...range(6).map((i) => sp(-0.19 + (i % 2) * 0.1 - (i > 3 ? 0.03 : 0), 0.34 - (i % 3) * 0.04, 0.12 - (i % 3) * 0.1, 0.03, [RED, GREEN, WHITE][i % 3])),
  ], lit(0.18, "#ffd27a", 0.25)),
  sz_xm_candy_canes: sz("Giant candy canes, pair", 0.5, 0.12, 0.92, [
    ...[-0.12, 0.12].flatMap((x, k) => {
      const hh = k ? 0.8 : 1.0;
      const stick = Math.round(hh / 0.1) - 2;
      return [
        ...striped(x, 0, 0, 0.05, 0.1, stick, RED, WHITE),
        ...range(5).map((i) => {
          const a = (i / 4) * Math.PI;
          return b(x + 0.065 * (k ? -1 : 1) * (1 - Math.cos(a)), stick * 0.1 + 0.065 * Math.sin(a) + 0.02, 0, 0.05, 0.05, 0.05, i % 2 ? WHITE : RED);
        }),
      ];
    }),
    b(-0.12, 0.18, 0.03, 0.06, 0.03, 0.01, GREEN, { r: [0, 0, 0.5] }),
  ]),
  sz_xm_snow_globe: sz("Snow globe with a lit base", 0.18, 0.18, 0.24, [
    cy(0, 0.035, 0, 0.14, 0.07, "#6b4a35"),
    glow(cy(0, 0.075, 0, 0.145, 0.012, "#fff3d6")),
    sp(0, 0.15, 0, 0.15, "#dcebf4"),
    cy(0, 0.1, 0, 0.012, 0.06, TRUNK),
    cy(0, 0.13, 0, 0.06, 0.04, "#2f6b3a"),
    cy(0, 0.17, 0, 0.04, 0.04, "#2f6b3a"),
    sp(0, 0.2, 0, 0.012, "#ffe08a"),
  ], lit(0.08, "#fff3d6", 0.15)),
  sz_xm_poinsettia: sz("Poinsettia in a gold pot", 0.3, 0.3, 0.26, [
    cy(0, 0.06, 0, 0.14, 0.12, GOLD),
    cy(0, 0.125, 0, 0.12, 0.01, "#4a3426"),
    ...range(6).map((i) => b(0.09 * Math.cos((i * Math.PI) / 3), 0.15, 0.09 * Math.sin((i * Math.PI) / 3), 0.16, 0.012, 0.07, "#2c6a38", { r: [0, -(i * Math.PI) / 3, 0.2] })),
    ...range(8).map((i) => b(0.08 * Math.cos((i * Math.PI) / 4), 0.2, 0.08 * Math.sin((i * Math.PI) / 4), 0.15, 0.012, 0.075, RED, { r: [0, -(i * Math.PI) / 4, 0.25], m: true })),
    ...range(3).map((i) => sp(0.02 * Math.cos(i * 2), 0.225, 0.02 * Math.sin(i * 2), 0.025, "#e8c14a")),
  ]),
  sz_xm_holly: sz("Holly sprig with berries", 0.26, 0.2, 0.06, [
    ...range(6).map((i) => b(0.09 * Math.cos((i * Math.PI) / 3), 0.012 + (i % 2) * 0.006, 0.07 * Math.sin((i * Math.PI) / 3), 0.12, 0.01, 0.06, i % 2 ? "#245a30" : "#2f6b3a", { r: [0, -(i * Math.PI) / 3, 0] })),
    ...range(4).map((i) => sp(0.025 * Math.cos(i * 1.6), 0.035, 0.025 * Math.sin(i * 1.6), 0.035, RED)),
  ]),
  sz_xm_mistletoe_ceiling: sz("Mistletoe with a red ribbon", 0.22, 0.22, 2.6, [
    b(0, 2.56, 0, 0.012, 0.08, 0.012, RED),
    ...bow(0, 2.5, 0).slice(0, 3),
    ...range(7).map((i) => b(0.06 * Math.cos(i * 0.9), 2.4 - 0.02 * (i % 3), 0.06 * Math.sin(i * 0.9), 0.08, 0.012, 0.04, "#6f9a4a", { r: [0, -i * 0.9, 0.5] })),
    ...range(4).map((i) => sp(0.03 * Math.cos(i * 1.7), 2.37, 0.03 * Math.sin(i * 1.7), 0.022, WHITE)),
  ], { wall: true }),
};

// ---------------------------------------------------------------- outdoor
const inflatableSanta: Part[] = [
  cy(0, 0.04, 0, 0.5, 0.08, "#2a2c2f"),
  sp(0, 0.65, 0, 0.95, RED),
  glow(sp(0, 0.6, 0.3, 0.45, WHITE)),
  sp(-0.52, 0.7, 0.05, 0.3, RED),
  sp(0.52, 0.7, 0.05, 0.3, RED),
  sp(-0.55, 0.52, 0.12, 0.2, WHITE),
  sp(0.55, 0.52, 0.12, 0.2, WHITE),
  sp(0, 1.3, 0, 0.5, "#f1c9a5"),
  sp(0, 1.2, 0.12, 0.42, WHITE),
  sp(0, 1.31, 0.24, 0.07, "#e79a8d"),
  sp(-0.09, 1.38, 0.22, 0.05, "#1b1b1d"),
  sp(0.09, 1.38, 0.22, 0.05, "#1b1b1d"),
  cy(0, 1.5, 0, 0.46, 0.1, WHITE),
  cy(0, 1.66, 0, 0.4, 0.26, RED),
  cy(0, 1.82, 0, 0.26, 0.14, RED),
  glow(sp(0.06, 1.93, -0.05, 0.16, WHITE)),
  b(0, 0.55, 0.45, 0.9, 0.08, 0.06, "#1b1b1d"),
  glow(b(0, 0.55, 0.485, 0.14, 0.08, 0.02, GOLD)),
];
const inflatableSnowman: Part[] = [
  cy(0, 0.04, 0, 0.5, 0.08, "#2a2c2f"),
  glow(sp(0, 0.45, 0, 0.8, WHITE)),
  glow(sp(0, 1.05, 0, 0.58, WHITE)),
  glow(sp(0, 1.5, 0, 0.42, WHITE)),
  cy(0, 1.28, 0, 0.5, 0.1, RED),
  cy(0, 1.74, 0, 0.5, 0.03, "#1b1b1d"),
  cy(0, 1.9, 0, 0.3, 0.3, "#1b1b1d"),
  b(0, 1.8, 0, 0.31, 0.05, 0.31, RED),
  b(0, 1.5, 0.22, 0.06, 0.06, 0.26, "#e07a20"),
  sp(-0.09, 1.57, 0.17, 0.05, "#1b1b1d"),
  sp(0.09, 1.57, 0.17, 0.05, "#1b1b1d"),
  ...[1.1, 0.95, 0.8].map((y) => sp(0, y, 0.28, 0.06, "#1b1b1d")),
  rod([-0.28, 1.05, 0], [-0.62, 1.3, 0], 0.04, BROWN),
  rod([0.28, 1.05, 0], [0.62, 1.3, 0], 0.04, BROWN),
];

const reindeerFrame: Part[] = [
  ...[0, 1, 2, 3].map((i) => rod([-0.25 + (i % 2) * 0.5 - (i > 1 ? 0.05 : 0), 0.62, 0], [-0.28 + (i % 2) * 0.58 - (i > 1 ? 0.05 : 0), 0.04, 0], 0.035, "#fff1d0", { glow: true })),
  glow(b(0, 0.74, 0, 0.7, 0.24, 0.06, "#fff1d0")),
  rod([0.3, 0.8, 0], [0.5, 1.05, 0], 0.07, "#fff1d0", { glow: true }),
  glow(b(0.55, 1.1, 0, 0.22, 0.14, 0.06, "#fff1d0")),
  glow(sp(0.68, 1.08, 0, 0.07, "#ff5a4a")),
  rod([0.48, 1.16, 0], [0.42, 1.34, 0], 0.025, "#fff1d0", { glow: true }),
  rod([0.44, 1.28, 0], [0.56, 1.34, 0], 0.02, "#fff1d0", { glow: true }),
  rod([0.52, 1.16, 0], [0.6, 1.32, 0], 0.025, "#fff1d0", { glow: true }),
  rod([-0.35, 0.82, 0], [-0.45, 0.95, 0], 0.04, "#fff1d0", { glow: true }),
];

const outdoorTreeFrame = (): Part[] => {
  const hh = 1.7;
  const at = (y: number) => 0.45 * (1 - (y - 0.05) / (hh - 0.05));
  return [
    ...range(8).map((i) => rod([0, hh, 0], [0.45 * Math.cos((i * Math.PI) / 4), 0.05, 0.45 * Math.sin((i * Math.PI) / 4)], 0.022, "#fff1d0", { glow: true })),
    ...[0.4, 0.85, 1.25].flatMap((y) =>
      range(10).map((i) => {
        const a = (i * Math.PI) / 5;
        const e = ((i + 1) * Math.PI) / 5;
        return rod([at(y) * Math.cos(a), y, at(y) * Math.sin(a)], [at(y) * Math.cos(e), y, at(y) * Math.sin(e)], 0.02, "#fff1d0", { glow: true });
      }),
    ),
    ...star(0, 1.78, 0, 0.2).map((p) => ({ ...p, c: "#ffe08a" })),
  ];
};

const OUTDOOR: Record<string, Def> = {
  sz_xm_inflatable_santa: sz("Inflatable Santa, 1.9 m, lit from inside", 1.35, 1.1, 2.0, inflatableSanta, lit(0.9, "#ffe0b0", 1)),
  sz_xm_inflatable_snowman: sz("Inflatable snowman, 2.1 m, lit from inside", 1.3, 0.9, 2.1, inflatableSnowman, lit(1.0, "#fff1d0", 1)),
  sz_xm_outdoor_reindeer: sz("Light-up reindeer for the garden", 1.25, 0.12, 1.4, reindeerFrame.map((p) => ({ ...p, p: [p.p[0] - 0.125, p.p[1], p.p[2]] as Part["p"] })), lit(0.8, "#fff1d0", 0.7)),
  sz_xm_outdoor_star: sz("Light-up star on a stake", 1.2, 0.3, 1.8, [
    cy(0, 0.4, 0, 0.035, 0.8, "#3a3d42"),
    b(0, 0.02, 0, 0.3, 0.04, 0.04, "#3a3d42"),
    b(0, 0.02, 0, 0.04, 0.04, 0.3, "#3a3d42"),
    ...star(0, 1.2, 0, 0.8, "#fff1d0"),
  ], lit(1.2, "#fff1d0", 0.7)),
  sz_xm_outdoor_tree_lit: sz("Light-up Christmas tree for the garden, 1.8 m", 0.95, 0.95, 1.9, outdoorTreeFrame(), lit(0.9, "#fff1d0", 0.8)),
  sz_xm_star_projector: sz("Star projector lights for the garden", 0.22, 0.22, 0.4, [
    cy(0, 0.015, 0, 0.12, 0.03, "#2a2c2f"),
    cy(0, 0.12, 0, 0.025, 0.24, "#2a2c2f"),
    b(0, 0.3, 0, 0.16, 0.12, 0.14, "#2a2c2f"),
    glow(b(0, 0.31, 0.075, 0.1, 0.07, 0.012, "#cfe6ff")),
    b(0, 0.375, 0, 0.12, 0.02, 0.1, "#3a3d42"),
  ], lit(0.3, "#9fd0ff", 0.4)),
};

export const XMAS: Record<string, Def> = { ...TREES, ...ACCESSORIES, ...GARLANDS, ...GIFTS, ...LIGHTS, ...FIGURES, ...OUTDOOR };
