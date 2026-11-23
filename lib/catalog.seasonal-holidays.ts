import type { Def, Part } from "./catalog";
import { GOLD, GREEN, RED, SILVER, WHITE, WIRE, arc, b, bulb, cx, cy, flame, glow, globe, lit, range, rod, sp, star, sz, swag, swagAt } from "./catalog.seasonal-kit.ts";

// Halloween, Easter (western and Orthodox), Valentine, New Year, Thanksgiving, Diwali, Eid, Hanukkah, Lunar New Year, Martisor, birthday and flags.
// The id's second part says which holiday window `params.seasonal` follows (see holidayOfKind in lib/catalog.seasonal.ts).
const BONE = "#ece7da";
const ORANGE = "#e8761c";
const BLACK = "#1b1b1d";
const GOLDEN = 2.399;

// ---------------------------------------------------------------- Halloween
const pumpkin = (x: number, z: number, dia: number, col: string): Part[] => [
  sp(x, dia / 2, z, dia, col, { m: true }),
  cy(x, dia / 2, z, dia * 0.94, dia * 0.72, col, { m: true }),
  cy(x, dia * 1.04, z, dia * 0.14, dia * 0.2, "#4a5a2a"),
];
const carve = (x: number, y: number, z: number, sx: number, sy: number, r = 0): Part => ({ ...b(x, y, z, sx, sy, 0.03, "#ffb03c", { glow: true, r: [0, 0, r] }), twinkle: 2 });

const HALLOWEEN: Record<string, Def> = {
  sz_hw_pumpkin_carved: sz("Carved pumpkin with a glowing face", 0.4, 0.4, 0.46, [
    ...pumpkin(0, 0, 0.4, ORANGE),
    carve(-0.09, 0.25, 0.172, 0.06, 0.06, Math.PI / 4),
    carve(0.09, 0.25, 0.172, 0.06, 0.06, Math.PI / 4),
    carve(0, 0.19, 0.176, 0.04, 0.04, Math.PI / 4),
    ...range(5).map((i) => carve(-0.08 + i * 0.04, 0.12 + (i % 2) * 0.03, 0.17, 0.035, 0.035)),
  ], lit(0.2, "#ff9a3c", 0.5)),
  sz_hw_pumpkins: sz("Three pumpkins, orange, white and green", 0.82, 0.5, 0.46, [
    ...pumpkin(-0.22, 0.02, 0.4, ORANGE),
    ...pumpkin(0.17, 0.08, 0.3, "#efe9dc"),
    ...pumpkin(0.04, -0.12, 0.2, "#7a9a55"),
  ]),
  sz_hw_skeleton: sz("Standing skeleton, life size", 0.6, 0.3, 1.72, [
    sp(0, 1.58, 0, 0.17, BONE),
    b(0, 1.47, 0.02, 0.11, 0.06, 0.11, BONE),
    b(-0.04, 1.6, 0.14, 0.04, 0.04, 0.02, BLACK),
    b(0.04, 1.6, 0.14, 0.04, 0.04, 0.02, BLACK),
    b(0, 1.53, 0.155, 0.015, 0.025, 0.01, BLACK),
    b(0, 1.42, 0, 0.04, 0.1, 0.04, BONE),
    b(0, 1.1, 0, 0.04, 0.6, 0.04, BONE),
    ...range(5).map((i) => b(0, 1.36 - i * 0.065, 0.02, 0.28 - i * 0.025, 0.022, 0.14, BONE)),
    b(0, 0.84, 0, 0.24, 0.1, 0.12, BONE),
    ...[-1, 1].flatMap((s) => [
      rod([s * 0.14, 1.38, 0], [s * 0.21, 1.12, 0], 0.035, BONE),
      rod([s * 0.21, 1.12, 0], [s * 0.2, 0.9, 0.06], 0.03, BONE),
      rod([s * 0.07, 0.8, 0], [s * 0.08, 0.45, 0.02], 0.04, BONE),
      rod([s * 0.08, 0.45, 0.02], [s * 0.08, 0.06, 0], 0.035, BONE),
      b(s * 0.08, 0.025, 0.05, 0.07, 0.05, 0.14, BONE),
    ]),
  ]),
  sz_hw_ghost: sz("Floating ghost that lights up", 0.8, 0.5, 1.1, [
    glow(cy(0, 0.42, 0, 0.42, 0.72, "#f3f6f4")),
    glow(sp(0, 0.8, 0, 0.44, "#f3f6f4")),
    ...range(8).map((i) => glow(sp(0.19 * Math.cos((i * Math.PI) / 4), 0.07, 0.19 * Math.sin((i * Math.PI) / 4), 0.12, "#f3f6f4"))),
    glow(b(-0.27, 0.58, 0.05, 0.2, 0.09, 0.08, "#f3f6f4", { r: [0, 0, 0.5] })),
    glow(b(0.27, 0.58, 0.05, 0.2, 0.09, 0.08, "#f3f6f4", { r: [0, 0, -0.5] })),
    sp(-0.08, 0.85, 0.2, 0.08, BLACK),
    sp(0.08, 0.85, 0.2, 0.08, BLACK),
    sp(0, 0.73, 0.21, 0.07, BLACK),
  ], lit(0.6, "#c9ffd9", 0.4)),
  sz_hw_cobweb: sz("Cobweb for a corner", 0.95, 0.03, 2.58, [
    ...range(6).map((i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 2 / 5;
      return rod([-0.46, 2.56, 0], [-0.46 + 0.9 * Math.cos(a), 2.56 + 0.9 * Math.sin(a), 0], 0.006, "#e4e4e0");
    }),
    ...[0.25, 0.5, 0.75].flatMap((r) =>
      range(5).map((i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 2 / 5;
        const e = -Math.PI / 2 + ((i + 1) * Math.PI) / 2 / 5;
        const mid = r * 0.92;
        const am = (a + e) / 2;
        return rod([-0.46 + r * Math.cos(a), 2.56 + r * Math.sin(a), 0], [-0.46 + mid * Math.cos(am), 2.56 + mid * Math.sin(am), 0], 0.005, "#e4e4e0");
      }),
    ),
    rod([-0.2, 2.1, 0], [-0.2, 1.98, 0], 0.003, "#e4e4e0"),
    sp(-0.2, 1.95, 0, 0.05, BLACK),
  ], { wall: true }),
  sz_hw_bats: sz("Black bats flying up the wall", 1.3, 0.03, 2.4, [
    ...[[-0.5, 1.9, 1], [-0.1, 2.2, 0.8], [0.3, 1.8, 1.1], [0.55, 2.15, 0.7], [-0.3, 1.55, 0.7]].flatMap(([x, y, k]) => [
      sp(x, y, 0, 0.06 * k, BLACK),
      b(x - 0.08 * k, y + 0.015, 0, 0.14 * k, 0.04 * k, 0.012, BLACK, { r: [0, 0, 0.35] }),
      b(x + 0.08 * k, y + 0.015, 0, 0.14 * k, 0.04 * k, 0.012, BLACK, { r: [0, 0, -0.35] }),
    ]),
  ], { wall: true }),
  sz_hw_candy_bowl: sz("Halloween candy bowl", 0.34, 0.34, 0.2, [
    cy(0, 0.05, 0, 0.3, 0.1, "#3a2a4a"),
    cy(0, 0.1, 0, 0.26, 0.012, ORANGE),
    ...range(12).map((i) => sp(0.08 * Math.cos(i * GOLDEN) * Math.sqrt(i / 12) * 1.6, 0.115 + (i % 3) * 0.03, 0.08 * Math.sin(i * GOLDEN) * Math.sqrt(i / 12) * 1.6, 0.05, [ORANGE, "#6b3f8a", "#e8c14a", "#2f9a6a"][i % 4])),
  ]),
  sz_hw_witch_hat: sz("Witch hat", 0.42, 0.42, 0.46, [
    cy(0, 0.012, 0, 0.42, 0.024, BLACK, { m: true }),
    cy(0, 0.085, 0, 0.27, 0.13, BLACK, { m: true }),
    cy(0, 0.19, 0, 0.2, 0.1, BLACK, { m: true }),
    cy(0.01, 0.28, 0, 0.14, 0.1, BLACK, { m: true }),
    cy(0.03, 0.37, 0, 0.08, 0.1, BLACK, { m: true }),
    cy(0.05, 0.43, 0, 0.04, 0.06, BLACK, { m: true }),
    cy(0, 0.065, 0, 0.275, 0.04, "#6b3f8a"),
    b(0, 0.065, 0.137, 0.06, 0.05, 0.012, GOLD),
  ]),
};

// ---------------------------------------------------------------- Easter (western and Orthodox)
const EGG = ["#f5b7c8", "#bfe3f0", "#f6e39a", "#c7e8b0", "#d9c2ee"];
const eggs = (n: number, r: number, y: number, pal: string[], dia = 0.07): Part[] => range(n).map((i) => sp(r * Math.cos(i * GOLDEN) * Math.sqrt((i + 1) / n), y + (i % 3) * 0.02, r * Math.sin(i * GOLDEN) * Math.sqrt((i + 1) / n), dia, pal[i % pal.length]));

const EASTER: Record<string, Def> = {
  sz_ea_basket_eggs: sz("Easter basket with coloured eggs", 0.36, 0.36, 0.34, [
    cy(0, 0.07, 0, 0.32, 0.14, "#b58a5a"),
    cy(0, 0.1, 0, 0.325, 0.02, "#9c7448"),
    cy(0, 0.145, 0, 0.29, 0.02, "#6fae4a"),
    ...eggs(8, 0.1, 0.18, EGG),
    ...arc(0, 0.14, 0.15, 9, 0, Math.PI).map(([x, y]) => b(x, y, 0, 0.03, 0.03, 0.03, "#9c7448")),
  ]),
  sz_ea_bunny: sz("Easter bunny, 60 cm", 0.32, 0.4, 0.7, [
    sp(0, 0.17, 0, 0.3, WHITE, { m: true }),
    sp(0, 0.38, 0.1, 0.2, WHITE, { m: true }),
    b(-0.05, 0.56, 0.1, 0.055, 0.24, 0.03, WHITE, { m: true, r: [0, 0, 0.1] }),
    b(0.05, 0.56, 0.1, 0.055, 0.24, 0.03, WHITE, { m: true, r: [0, 0, -0.1] }),
    b(-0.05, 0.56, 0.118, 0.025, 0.18, 0.01, "#f1a9b8", { r: [0, 0, 0.1] }),
    b(0.05, 0.56, 0.118, 0.025, 0.18, 0.01, "#f1a9b8", { r: [0, 0, -0.1] }),
    sp(0, 0.37, 0.2, 0.03, "#f1a9b8"),
    sp(-0.04, 0.41, 0.19, 0.02, BLACK),
    sp(0.04, 0.41, 0.19, 0.02, BLACK),
    sp(0, 0.13, -0.16, 0.09, WHITE),
    sp(-0.09, 0.04, 0.1, 0.08, WHITE, { m: true }),
    sp(0.09, 0.04, 0.1, 0.08, WHITE, { m: true }),
    b(0, 0.24, 0.12, 0.2, 0.03, 0.03, "#7fb6e8"),
  ]),
  sz_ea_egg_tree: sz("Easter egg tree with hanging eggs", 0.46, 0.46, 0.85, [
    cy(0, 0.1, 0, 0.14, 0.2, "#f4f3f0"),
    ...range(6).flatMap((i) => {
      const a = i * 1.05;
      const tip: [number, number, number] = [0.19 * Math.cos(a), 0.55 + (i % 3) * 0.14, 0.19 * Math.sin(a)];
      return [rod([0, 0.18, 0], tip, 0.014, "#6b4a35"), sp(tip[0], tip[1] - 0.06, tip[2], 0.055, EGG[i % 5]), rod([tip[0], tip[1], tip[2]], [tip[0], tip[1] - 0.04, tip[2]], 0.004, "#bdb6a4")];
    }),
    rod([0, 0.18, 0], [0, 0.8, 0], 0.016, "#6b4a35"),
    sp(0, 0.78, 0, 0.06, EGG[0]),
  ]),
  sz_ea_red_eggs_bowl: sz("Bowl of red Easter eggs (Orthodox)", 0.34, 0.34, 0.16, [
    cy(0, 0.04, 0, 0.3, 0.08, "#f4f3f0"),
    ...eggs(10, 0.09, 0.1, ["#b3262e", "#b3262e", "#c2303a", "#a01f27"], 0.075),
    sp(0.02, 0.14, 0.03, 0.07, "#f4f3f0"),
  ]),
  sz_ea_pasca: sz("Pasca, the Easter cheese bread", 0.34, 0.34, 0.1, [
    cy(0, 0.04, 0, 0.32, 0.08, "#c98a4a"),
    cy(0, 0.082, 0, 0.22, 0.012, "#f4e6bf"),
    b(0, 0.092, 0, 0.2, 0.012, 0.03, "#c98a4a"),
    b(0, 0.092, 0, 0.03, 0.012, 0.2, "#c98a4a"),
    ...range(12).map((i) => sp(0.155 * Math.cos((i * Math.PI) / 6), 0.085, 0.155 * Math.sin((i * Math.PI) / 6), 0.03, "#a9672f")),
    sp(0, 0.1, 0, 0.05, "#b3262e"),
  ]),
};

// ---------------------------------------------------------------- Valentine, New Year, Martisor
const heartPt = (t: number): [number, number] => [(16 * Math.sin(t) ** 3) * 0.028, 1.6 + (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 0.028];
const flags = (x0: number, x1: number, y: number, sag: number, n: number, cols: string[]): Part[] =>
  range(n).map((i) => {
    const [x, yy] = swagAt(x0, x1, y, sag, (i + 0.5) / n);
    return b(x, yy - 0.075, 0, 0.13, 0.13, 0.008, cols[i % cols.length], { r: [0, 0, Math.PI / 4] });
  });
const burst = (n: number, r: number, y: number): Part[] =>
  range(n).flatMap((i) => {
    const dy = 1 - (2 * (i + 0.5)) / n;
    const rr = Math.sqrt(1 - dy * dy);
    const tip: [number, number, number] = [r * rr * Math.cos(i * GOLDEN), y + r * dy, r * rr * Math.sin(i * GOLDEN)];
    return [{ ...rod([0, y, 0], tip, 0.006, "#d4a93c", { glow: true }) }, globe(tip[0], tip[1], tip[2], 0.03, "#ffe9a0", 1)];
  });

const FESTIVE: Record<string, Def> = {
  sz_vd_heart_lights: sz("Heart-shaped fairy lights for the wall", 0.95, 0.04, 2.05, range(26).map((i) => {
    const [x, y] = heartPt((i / 26) * Math.PI * 2);
    return bulb(x, y, 0, 0.035, "#f0b8c4");
  }), { wall: true, ...lit(1.65, "#ff4d6d", 0.5) }),
  sz_vd_roses: sz("Vase of red roses", 0.3, 0.3, 0.62, [
    cy(0, 0.15, 0, 0.12, 0.3, "#cfe6f2"),
    ...range(7).flatMap((i) => {
      const a = i * GOLDEN;
      const tip: [number, number, number] = [0.09 * Math.cos(a) * Math.sqrt(i / 7 + 0.2), 0.52 + (i % 3) * 0.03, 0.09 * Math.sin(a) * Math.sqrt(i / 7 + 0.2)];
      return [rod([0, 0.22, 0], tip, 0.012, "#3f6b3a"), sp(tip[0], tip[1] + 0.03, tip[2], 0.075, "#b3162e", { m: true }), b(tip[0], tip[1] - 0.05, tip[2], 0.07, 0.01, 0.035, "#3f6b3a", { r: [0, -a, 0.3] })];
    }),
  ]),
  sz_ny_balloons: sz("New Year balloon bunch, gold, silver and black", 0.72, 0.5, 1.6, [
    cy(0, 0.02, 0, 0.08, 0.04, GOLD),
    ...[[-0.15, 1.35, GOLD], [0.1, 1.45, SILVER], [0, 1.2, BLACK], [0.2, 1.22, GOLD], [-0.2, 1.15, SILVER]].flatMap(([x, y, c], i) => [
      sp(x as number, y as number, ((i % 2) - 0.5) * 0.12, 0.28, c as string),
      rod([0, 0.04, 0], [x as number, (y as number) - 0.14, ((i % 2) - 0.5) * 0.12], 0.004, "#8d9299"),
    ]),
  ]),
  sz_ny_banner: sz("Party bunting, gold and silver", 2.4, 0.03, 2.5, [
    ...swag(-1.15, 1.15, 2.45, 0, 0.18, 10, 0.008, WIRE),
    ...flags(-1.15, 1.15, 2.45, 0.18, 11, [GOLD, SILVER, BLACK]),
  ], { wall: true }),
  sz_ny_sparkler_lamp: sz("Sparkler burst lamp", 0.5, 0.5, 0.66, [
    cy(0, 0.03, 0, 0.18, 0.06, "#2a2c2f"),
    cy(0, 0.2, 0, 0.02, 0.28, "#2a2c2f"),
    ...burst(16, 0.22, 0.44),
  ], lit(0.44, "#ffd27a", 0.4)),
  sz_mt_martisor: sz("Martisor red and white cord with a snowdrop", 0.3, 0.06, 1.75, [
    b(0, 1.7, 0, 0.03, 0.03, 0.03, GOLD),
    ...range(14).flatMap((i) => [b(-0.012, 1.66 - i * 0.025, 0, 0.018, 0.024, 0.018, i % 2 ? RED : WHITE), b(0.012, 1.66 - i * 0.025, 0, 0.018, 0.024, 0.018, i % 2 ? WHITE : RED)]),
    ...[-0.06, -0.02, 0.02, 0.06].map((x, i) => b(x, 1.22, 0, 0.012, 0.12, 0.012, i % 2 ? RED : WHITE)),
    sp(0, 1.3, 0, 0.05, RED),
    ...range(5).map((i) => sp(0.05 * Math.cos((i * Math.PI * 2) / 5), 1.36 + 0.05 * Math.sin((i * Math.PI * 2) / 5), 0.012, 0.045, WHITE)),
    sp(0, 1.36, 0.02, 0.03, "#e8c14a"),
    b(0, 1.28, -0.005, 0.01, 0.08, 0.01, GREEN),
  ], { wall: true }),
};

// ---------------------------------------------------------------- Thanksgiving, Diwali, Eid, Hanukkah, Lunar New Year
const FEATHERS = ["#b8521c", "#d9822b", "#e8b04a", "#8a3a1c", "#c96a22"];
const BASKET = "#b58a5a";
const horn: Part[] = [
  cx(0.12, 0.13, 0, 0.26, 0.2, BASKET),
  cx(-0.02, 0.14, 0, 0.2, 0.12, "#a9805a"),
  cx(-0.12, 0.17, 0, 0.15, 0.1, BASKET),
  cx(-0.21, 0.22, 0, 0.1, 0.1, "#a9805a"),
  sp(-0.27, 0.27, 0, 0.07, BASKET),
];
const THANKS: Record<string, Def> = {
  sz_th_turkey: sz("Thanksgiving turkey centrepiece", 0.52, 0.45, 0.52, [
    sp(0, 0.14, 0.02, 0.22, "#8a5a3a"),
    sp(0, 0.27, 0.12, 0.1, "#8a5a3a"),
    b(0, 0.26, 0.18, 0.03, 0.03, 0.04, "#e8b04a"),
    sp(0, 0.22, 0.17, 0.035, RED),
    ...range(7).map((i) => {
      const a = -1 + (i * 2) / 6;
      return b(0.15 * Math.sin(a), 0.22 + 0.15 * Math.cos(a), -0.08, 0.07, 0.24, 0.015, FEATHERS[i % 5], { r: [0, 0, -a] });
    }),
    b(-0.04, 0.02, 0.05, 0.03, 0.04, 0.06, "#e8b04a"),
    b(0.04, 0.02, 0.05, 0.03, 0.04, 0.06, "#e8b04a"),
  ]),
  sz_th_cornucopia: sz("Cornucopia with fruit and gourds", 0.8, 0.36, 0.36, [
    ...horn,
    ...[[0.27, 0.06, 0.04, ORANGE, 0.1], [0.34, 0.05, -0.05, RED, 0.09], [0.24, 0.05, -0.1, "#6fae4a", 0.09], [0.31, 0.04, 0.12, "#6b3f8a", 0.08], [0.2, 0.2, 0.0, "#d9b33a", 0.09]].map(([x, y, z, c, d]) => sp(x as number, y as number, z as number, d as number, c as string)),
  ]),
  sz_dw_diyas: sz("Diwali diyas, five clay lamps", 0.62, 0.16, 0.09, range(5).flatMap((i) => [cy(-0.24 + i * 0.12, 0.016, 0, 0.09, 0.032, "#a9552a"), cy(-0.24 + i * 0.12, 0.034, 0, 0.065, 0.006, "#7a3a1a"), flame(-0.24 + i * 0.12, 0.05, 0, 0.022)]), lit(0.08, "#ffb347", 0.35)),
  sz_dw_rangoli: sz("Rangoli floor pattern", 1.0, 1.0, 0.02, [
    cy(0, 0.004, 0, 1.0, 0.008, "#e8a63c"),
    cy(0, 0.008, 0, 0.82, 0.008, "#d9285a"),
    cy(0, 0.011, 0, 0.66, 0.008, WHITE),
    cy(0, 0.014, 0, 0.5, 0.008, "#2f9a6a"),
    cy(0, 0.017, 0, 0.34, 0.008, ORANGE),
    cy(0, 0.02, 0, 0.16, 0.008, "#f6d35a"),
    ...range(8).map((i) => b(0.39 * Math.cos((i * Math.PI) / 4), 0.022, 0.39 * Math.sin((i * Math.PI) / 4), 0.12, 0.004, 0.06, ["#d9285a", "#6b3f8a", "#2f5f9a", "#e8761c"][i % 4], { r: [0, -(i * Math.PI) / 4, 0] })),
  ]),
  sz_dw_lanterns_ceiling: sz("Diwali paper lanterns, hanging", 1.0, 0.3, 2.6, [
    ...[[-0.32, 2.05, "#e8761c"], [0, 1.85, "#d9285a"], [0.32, 2.15, "#f6b73a"]].flatMap(([x, y, c]) => [
      b(x as number, ((y as number) + 0.015 + 2.6) / 2, 0, 0.006, 2.6 - (y as number) - 0.015, 0.006, "#8d6a45"),
      cy(x as number, y as number, 0, 0.12, 0.02, GOLD),
      glow(cy(x as number, (y as number) - 0.12, 0, 0.24, 0.22, c as string)),
      cy(x as number, (y as number) - 0.24, 0, 0.12, 0.02, GOLD),
      b(x as number, (y as number) - 0.33, 0, 0.012, 0.16, 0.012, c as string),
    ]),
  ], { wall: true, ...lit(1.9, "#ffb347", 0.6) }),
  sz_eid_fanous: sz("Ramadan fanous lantern", 0.26, 0.26, 0.64, [
    cy(0, 0.02, 0, 0.24, 0.04, GOLD),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((s2) => b(sx * 0.085, 0.27, s2 * 0.085, 0.025, 0.4, 0.025, GOLD))),
    glow(b(0, 0.27, 0, 0.14, 0.34, 0.14, "#ff9a3c")),
    cy(0, 0.49, 0, 0.24, 0.03, GOLD),
    cy(0, 0.53, 0, 0.17, 0.05, GOLD),
    cy(0, 0.575, 0, 0.1, 0.04, GOLD),
    sp(0, 0.61, 0, 0.05, GOLD),
  ], lit(0.27, "#ff9a3c", 0.4)),
  sz_eid_crescent_lights: sz("Crescent and star lights for the wall", 0.9, 0.04, 2.3, [
    ...arc(0, 1.8, 0.36, 22, Math.PI / 3, (4 * Math.PI) / 3).map(([x, y]) => bulb(x, y, 0, 0.032, "#f4e6bf")),
    ...arc(0.13, 1.8, 0.29, 14, (7 * Math.PI) / 12, (5 * Math.PI) / 6).map(([x, y]) => bulb(x, y, 0, 0.032, "#f4e6bf")),
    ...star(0.3, 1.8, 0, 0.14),
  ], { wall: true, ...lit(1.8, "#ffe9a0", 0.5) }),
  sz_hk_menorah: sz("Hanukkah menorah with nine lights", 0.5, 0.1, 0.44, [
    b(0, 0.02, 0, 0.3, 0.04, 0.1, GOLD, { m: true }),
    cy(0, 0.1, 0, 0.03, 0.16, GOLD, { m: true }),
    b(0, 0.19, 0, 0.46, 0.016, 0.02, GOLD, { m: true }),
    ...[-4, -3, -2, -1, 0, 1, 2, 3, 4].flatMap((i) => {
      const x = i * 0.052;
      const tall = i === 0;
      const cup = tall ? 0.3 : 0.235; // height of the cup the candle stands in
      const hh = tall ? 0.09 : 0.075;
      return [
        tall ? b(0, 0.245, 0, 0.014, 0.11, 0.014, GOLD, { m: true }) : b(x, 0.2125, 0, 0.012, 0.045, 0.012, GOLD, { m: true }),
        cy(x, cup, 0, 0.034, 0.014, GOLD, { m: true }),
        cy(x, cup + 0.007 + hh / 2, 0, 0.02, hh, i % 2 ? "#4a7ab8" : WHITE),
        flame(x, cup + 0.007 + hh + 0.018, 0, 0.018),
      ];
    }),
  ], lit(0.36, "#ffc46b", 0.35)),
  sz_lny_lanterns_ceiling: sz("Red lanterns for Lunar New Year, hanging", 1.0, 0.3, 2.6, [
    ...[[-0.32, 2.1], [0, 1.9], [0.32, 2.2]].flatMap(([x, y]) => [
      b(x, (y + 0.015 + 2.6) / 2, 0, 0.006, 2.6 - y - 0.015, 0.006, "#8d6a45"),
      cy(x, y, 0, 0.1, 0.03, GOLD),
      glow(cy(x, y - 0.14, 0, 0.3, 0.24, "#d9262c")),
      cy(x, y - 0.27, 0, 0.1, 0.03, GOLD),
      ...range(5).map((i) => b(x + (i - 2) * 0.014, y - 0.43, 0, 0.008, 0.24, 0.008, "#e8c14a")),
    ]),
  ], { wall: true, ...lit(1.9, "#ff3b2a", 0.6) }),
};

// ---------------------------------------------------------------- birthday and flags
const BALLOONS = ["#e8465a", "#3f8fd9", "#f6c23a", "#4cb872", "#a75fd0"];
const RAINBOW = ["#e40303", "#ff8c00", "#ffed00", "#008026", "#004dff", "#750787"];
const candle = (x: number, z: number, c: string): Part[] => [cy(x, 0.27, z, 0.013, 0.06, c), flame(x, 0.31, z, 0.014)];
const stripes = (cols: string[], x: number, w: number, y0: number, h: number, vertical = false): Part[] =>
  cols.map((c, i) => (vertical ? b(x + i * (w / cols.length) + w / cols.length / 2, y0, 0, w / cols.length, h, 0.015, c) : b(x, y0 - i * (h / cols.length) - h / cols.length / 2, 0, w, h / cols.length, 0.015, c)));

const PARTY: Record<string, Def> = {
  sz_bday_balloons: sz("Birthday balloon bunch", 0.72, 0.5, 1.6, [
    cy(0, 0.02, 0, 0.08, 0.04, "#3a3d42"),
    ...BALLOONS.flatMap((c, i) => {
      const x = [-0.2, -0.08, 0.06, 0.2, 0][i];
      const y = [1.2, 1.42, 1.3, 1.18, 1.1][i];
      const z = ((i % 2) - 0.5) * 0.12;
      return [sp(x, y, z, 0.28, c), rod([0, 0.04, 0], [x, y - 0.14, z], 0.004, "#8d9299")];
    }),
  ]),
  sz_bday_banner: sz("Birthday bunting, rainbow", 2.4, 0.03, 2.5, [...swag(-1.15, 1.15, 2.45, 0, 0.18, 10, 0.008, WIRE), ...flags(-1.15, 1.15, 2.45, 0.18, 11, BALLOONS)], { wall: true }),
  sz_bday_cake: sz("Birthday cake with lit candles", 0.36, 0.36, 0.36, [
    cy(0, 0.01, 0, 0.36, 0.02, WHITE),
    cy(0, 0.07, 0, 0.28, 0.1, "#f4d9e6", { m: true }),
    cy(0, 0.125, 0, 0.285, 0.02, WHITE),
    cy(0, 0.17, 0, 0.2, 0.09, "#f9e8a8", { m: true }),
    cy(0, 0.22, 0, 0.205, 0.02, WHITE),
    ...range(8).map((i) => sp(0.1 * Math.cos((i * Math.PI) / 4), 0.14, 0.1 * Math.sin((i * Math.PI) / 4), 0.035, RED)),
    ...[[-0.06, 0, "#e8465a"], [0.06, 0, "#3f8fd9"], [0, 0.06, "#f6c23a"], [0, -0.06, "#4cb872"], [0, 0, "#a75fd0"]].flatMap(([x, z, c]) => candle(x as number, z as number, c as string)),
  ], lit(0.3, "#ffc46b", 0.3)),
  sz_pride_flag: sz("Pride rainbow flag, 1 m", 1.0, 0.04, 1.95, [b(0, 1.9, 0, 1.04, 0.025, 0.03, "#8a6a45"), ...stripes(RAINBOW, 0, 1.0, 1.88, 0.67)], { wall: true }),
  sz_flag_pole: sz("Flag pole, 5 m, with Romanian tricolour", 1.4, 0.3, 5.1, [
    cy(-0.55, 0.05, 0, 0.3, 0.1, "#8d9299"),
    cy(-0.55, 2.55, 0, 0.07, 5, "#d9dde1"),
    sp(-0.55, 5.05, 0, 0.11, GOLD),
    b(-0.55, 4.9, 0.0, 0.03, 0.03, 0.03, "#8d9299"),
    ...stripes(["#002b7f", "#fcd116", "#ce1126"], -0.51, 1.2, 4.5, 0.8, true),
  ]),
};

export const HOLIDAYS: Record<string, Def> = { ...HALLOWEEN, ...EASTER, ...FESTIVE, ...THANKS, ...PARTY };
