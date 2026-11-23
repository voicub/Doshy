import type { Def, Part } from "../catalog";
import { b, cy, sp, cz, rod, el, ring, range, plantAt, gd, gable, swung, turning, PI, WATER, COPING, TERRA, SOIL, RED, GOLD, CORTEN, WOOD, OAK, DARK, STEEL, WHITE, LEAF1, LEAF2, LEAF3, CREAM } from "./kit.ts";
import { FEATURES2 } from "./features2.ts";

const STN = "#b9b4a8", STN2 = "#9a968b", BRONZE = "#9a7a3a", LIGHTW = "#8fd8f0", ANTH = "#4a4d52";

/** a stone bowl with a water surface: x, z, y of the bowl centre, diameter */
const bowl = (x: number, y: number, z: number, d: number, h = 0.1): Part[] => [
  cy(x, y, z, d, h, STN, { m: true }), cy(x, y + h / 2 - 0.005, z, d - 0.1, 0.02, WATER),
  cy(x, y - h / 2 + 0.005, z, d * 0.55, 0.05, STN2),
];

// ---------- water ----------
const cascade = gd("Cascade water feature 1.0 m", 1.0, 1.0, 1.4, [
  ...bowl(0, 0.1, 0, 1.0, 0.2), cy(0, 0.44, 0, 0.2, 0.52, STN, { m: true }),
  ...bowl(0, 0.76, 0, 0.7, 0.12), cy(0, 0.97, 0, 0.14, 0.3, STN, { m: true }),
  ...bowl(0, 1.15, 0, 0.46, 0.1), sp(0, 1.33, 0, 0.1, STN2), cy(0, 1.3, 0, 0.035, 0.18, LIGHTW),
  ...[0, 1.6, 3.2, 4.8].map((a) => cy(0.34 * Math.cos(a), 0.6, 0.34 * Math.sin(a), 0.02, 0.2, WATER)),
  ...[0, 2, 4].map((a) => cy(0.2 * Math.cos(a), 0.95, 0.2 * Math.sin(a), 0.015, 0.12, WATER)),
], { tags: "outdoor fountain tiered stone bowls waterfall pond" });

const spillPots = gd("Spilling pots water feature 0.9 m", 0.96, 0.96, 1.1, [
  cy(0, 0.11, 0, 0.9, 0.22, TERRA, { m: true }), cy(0, 0.215, 0, 0.78, 0.02, WATER), cy(0, 0.24, 0, 0.92, 0.04, TERRA, { m: true }),
  b(0, 0.55, -0.32, 0.07, 1.0, 0.07, DARK), b(0.0, 1.05, -0.32, 0.14, 0.04, 0.14, DARK),
  b(-0.2, 0.85, -0.32, 0.4, 0.03, 0.03, DARK),
  cy(-0.2, 0.85, -0.2, 0.3, 0.4, TERRA, { m: true, r: [0, 0, -2.0] }), cy(0.25, 0.45, -0.2, 0.3, 0.4, TERRA, { m: true, r: [0, 0, -2.0] }),
  rod([-0.02, 0.77, -0.2], [0.18, 0.5, -0.2], 0.04, WATER), rod([0.43, 0.37, -0.2], [0.42, 0.23, -0.2], 0.04, WATER),
  b(0.2, 0.3, -0.32, 0.03, 0.5, 0.03, DARK),
  ...[[0.3, 0.1], [-0.25, 0.2], [0.05, 0.3]].map(([x, z]) => sp(x, 0.27, z, 0.12, STN2)),
], { tags: "outdoor fountain terracotta pots pouring water" });

const birdBath = gd("Bird bath 0.5 m", 0.5, 0.5, 0.85, [
  cy(0, 0.03, 0, 0.3, 0.06, STN, { m: true }), cy(0, 0.33, 0, 0.12, 0.54, STN, { m: true }), cy(0, 0.2, 0, 0.18, 0.06, STN2),
  cy(0, 0.64, 0, 0.5, 0.08, STN, { m: true }), cy(0, 0.7, 0, 0.5, 0.04, STN), cy(0, 0.7, 0, 0.42, 0.045, WATER),
  sp(0.1, 0.76, 0.02, 0.07, "#9a6a3c"), sp(0.14, 0.8, 0.02, 0.045, "#9a6a3c"), b(0.18, 0.8, 0.02, 0.03, 0.01, 0.01, GOLD), b(0.06, 0.74, 0.02, 0.05, 0.02, 0.01, "#6a4a2c"),
], { tags: "outdoor birdbath pedestal wildlife" });

const solarFountain = gd("Solar floating fountain 0.5 m", 0.5, 0.5, 0.42, [
  cy(0, 0.02, 0, 0.5, 0.04, LIGHTW, { m: true }), cy(0, 0.05, 0, 0.4, 0.03, "#bfeaf6"), cy(0, 0.08, 0, 0.16, 0.03, DARK),
  b(0, 0.11, 0.17, 0.14, 0.02, 0.1, "#1f2f4a", { r: [-0.4, 0, 0] }),
  cy(0, 0.2, 0, 0.04, 0.24, LIGHTW), cy(0, 0.33, 0, 0.07, 0.03, LIGHTW),
  ...ring(8, 0.13, (x, z) => [sp(x, 0.3, z, 0.025, LIGHTW), sp(x * 1.6, 0.18, z * 1.6, 0.022, LIGHTW), sp(x * 1.95, 0.07, z * 1.95, 0.02, LIGHTW)]),
  ...ring(6, 0.065, (x, z) => sp(x, 0.4, z, 0.03, WHITE)),
], { tags: "outdoor pond floating solar jet spray fountain" });

const pond = (() => {
  const A = 0.9, B = 0.62;
  return gd("Garden pond 2.0 x 1.4 m", 2.0, 1.8, 0.55, [
    el(0, 0.05, 0, 1.76, 0.1, 1.24, WATER),
    ...range(18).map((i) => {
      const t = (i / 18) * PI * 2, tx = -A * Math.sin(t), tz = B * Math.cos(t);
      return b(A * Math.cos(t), 0.06, B * Math.sin(t), 0.28, 0.12, 0.2, i % 2 ? STN : COPING, { m: true, r: [0, -Math.atan2(tz, tx), 0] });
    }),
    ...[[-0.35, 0.15, 0.22], [0.25, -0.12, 0.26], [0.45, 0.25, 0.18], [-0.1, -0.3, 0.2]].map(([x, z, d]) => cy(x, 0.105, z, d, 0.01, LEAF2)),
    sp(-0.35, 0.13, 0.15, 0.07, "#f4b6cf"), sp(0.25, 0.13, -0.12, 0.08, WHITE),
    plantAt("reed", 0.4, 0.5, 0.3, -0.6, -0.3, 1, 0.05), plantAt("reed", 0.35, 0.45, 0.3, 0.7, -0.2, 3, 0.05),
    plantAt("grass_tall", 0.3, 0.3, 0.25, 0.6, 0.35, 2, 0.1),
  ], { tags: "outdoor water garden lily koi wildlife" });
})();

// ---------- statues and ornaments ----------
const ladyStatue = gd("Classical lady statue on plinth 1.8 m", 0.5, 0.5, 1.8, [
  b(0, 0.05, 0, 0.5, 0.1, 0.5, STN2), b(0, 0.45, 0, 0.36, 0.7, 0.36, STN, { m: true }), b(0, 0.85, 0, 0.44, 0.1, 0.44, STN2),
  cy(0, 1.03, 0, 0.32, 0.26, CREAM, { m: true }), cy(0, 1.28, 0, 0.26, 0.26, CREAM, { m: true }), cy(0, 1.5, 0, 0.2, 0.2, CREAM, { m: true }),
  b(0, 1.58, 0, 0.3, 0.06, 0.14, CREAM, { m: true }), sp(0, 1.72, 0, 0.15, CREAM, { m: true }), sp(0, 1.77, -0.04, 0.12, CREAM, { m: true }),
  b(-0.13, 1.5, 0.03, 0.05, 0.3, 0.06, CREAM, { m: true }), b(0.13, 1.45, 0.08, 0.05, 0.22, 0.06, CREAM, { m: true, r: [-0.7, 0, 0] }),
  cy(0.1, 1.33, 0.2, 0.12, 0.13, STN2),
], { tags: "outdoor sculpture marble figure ornament" });

const buddha = gd("Garden Buddha on stone 0.5 m", 0.5, 0.5, 0.75, [
  el(0, 0.1, 0, 0.5, 0.2, 0.4, STN2), el(0, 0.27, 0.02, 0.42, 0.14, 0.3, STN, { m: true }),
  el(0, 0.45, 0, 0.26, 0.3, 0.2, STN, { m: true }), sp(0, 0.65, 0.01, 0.15, STN, { m: true }), sp(0, 0.74, 0.01, 0.05, STN, { m: true }),
  el(0, 0.32, 0.1, 0.16, 0.06, 0.1, STN2), b(-0.12, 0.45, 0.03, 0.05, 0.22, 0.06, STN, { m: true }), b(0.12, 0.45, 0.03, 0.05, 0.22, 0.06, STN, { m: true }),
  ...[-1, 1].map((s) => sp(s * 0.085, 0.65, 0.01, 0.04, STN)),
], { tags: "outdoor zen statue figure meditation" });

const lion = gd("Stone lion statue 0.5 m", 0.4, 0.64, 0.52, [
  b(0, 0.06, 0, 0.4, 0.12, 0.5, STN2), el(0, 0.24, -0.06, 0.2, 0.24, 0.32, STN, { m: true }), el(0, 0.2, -0.17, 0.3, 0.2, 0.2, STN, { m: true }),
  ...[-1, 1].flatMap((s) => [b(s * 0.07, 0.22, 0.14, 0.07, 0.22, 0.07, STN, { m: true }), b(s * 0.07, 0.16, 0.2, 0.08, 0.04, 0.1, STN2)]),
  el(0, 0.36, 0.08, 0.3, 0.3, 0.2, STN2), sp(0, 0.34, 0.15, 0.17, STN, { m: true }), el(0, 0.3, 0.24, 0.08, 0.06, 0.06, STN2),
  ...[-1, 1].map((s) => sp(s * 0.07, 0.42, 0.14, 0.04, STN2)), rod([0, 0.15, -0.22], [0.12, 0.28, -0.3], 0.03, STN),
], { tags: "outdoor sculpture animal guardian" });

const hare = gd("Stone hare statue 0.5 m", 0.3, 0.6, 0.62, [
  b(0, 0.03, 0, 0.3, 0.06, 0.5, STN2), el(0, 0.2, -0.06, 0.18, 0.24, 0.32, STN, { m: true }), el(0, 0.16, -0.2, 0.2, 0.18, 0.12, STN, { m: true }),
  sp(0, 0.38, 0.08, 0.15, STN, { m: true }), el(0, 0.36, 0.17, 0.08, 0.07, 0.08, STN2),
  ...[-1, 1].map((s) => b(s * 0.03, 0.5, 0.0, 0.03, 0.22, 0.04, STN, { m: true, r: [-0.4, 0, 0] })), b(0, 0.1, 0.14, 0.12, 0.04, 0.1, STN2),
  ...[-1, 1].map((s) => b(s * 0.05, 0.2, 0.1, 0.04, 0.2, 0.05, STN, { m: true })), sp(0, 0.18, -0.26, 0.07, WHITE),
], { tags: "outdoor sculpture animal rabbit bunny" });

const gnome = gd("Garden gnome 0.45 m", 0.28, 0.28, 0.45, [
  ...[-1, 1].map((s) => b(s * 0.05, 0.03, 0.03, 0.07, 0.06, 0.12, "#3a2f28")),
  cy(0, 0.15, 0, 0.2, 0.2, "#3f6fb0", { m: true }), el(0, 0.24, 0.07, 0.16, 0.12, 0.09, "#f2f1ee"), b(0, 0.17, 0.1, 0.2, 0.03, 0.02, "#5a3d28"),
  ...[-1, 1].map((s) => b(s * 0.11, 0.17, 0.02, 0.04, 0.13, 0.06, "#3f6fb0", { m: true })),
  sp(0, 0.29, 0, 0.14, "#f0c9a6"), sp(0, 0.3, 0.07, 0.035, "#e59a8a"),
  cy(0, 0.36, 0, 0.16, 0.04, RED, { m: true }), cy(0, 0.39, 0, 0.12, 0.05, RED, { m: true }), cy(0, 0.43, 0, 0.06, 0.05, RED, { m: true }),
], { tags: "outdoor ornament dwarf figure fun" });

const sundial = gd("Sundial on pedestal 1.0 m", 0.5, 0.5, 1.0, [
  b(0, 0.04, 0, 0.5, 0.08, 0.5, STN2), cy(0, 0.45, 0, 0.26, 0.7, STN, { m: true }), cy(0, 0.8, 0, 0.36, 0.06, STN2),
  cy(0, 0.87, 0, 0.5, 0.05, BRONZE), cy(0, 0.9, 0, 0.44, 0.01, "#b89450"),
  ...ring(12, 0.2, (x, z, a) => b(x, 0.91, z, 0.03, 0.006, 0.014, DARK, { r: [0, -a, 0] })),
  rod([0, 0.9, 0.14], [0, 0.99, -0.1], 0.025, BRONZE), b(0, 0.93, 0.02, 0.01, 0.06, 0.2, BRONZE),
], { tags: "outdoor garden clock sun time ornament" });

const scarecrow = (() => {
  const P = 1.45, arm = (p: Part) => swung(p, P, 4, 10, "z");
  return gd("Scarecrow 1.9 m", 1.0, 0.5, 1.9, [
    b(0, 0.95, 0, 0.06, 1.9, 0.06, WOOD), b(0, 0.02, 0, 0.5, 0.04, 0.3, WOOD),
    b(0, 1.28, 0, 0.34, 0.5, 0.2, RED, { m: true }), b(0, 1.0, 0, 0.3, 0.2, 0.16, "#3f5f8a"), b(-0.08, 0.7, 0, 0.1, 0.36, 0.1, "#3f5f8a"), b(0.08, 0.7, 0, 0.1, 0.36, 0.1, "#3f5f8a"),
    arm(b(0, P, 0, 0.95, 0.05, 0.05, WOOD)),
    ...[-1, 1].flatMap((s) => [arm(b(s * 0.28, P, 0, 0.4, 0.14, 0.14, RED, { m: true })), arm(b(s * 0.48, P - 0.03, 0, 0.08, 0.14, 0.1, "#e8c870")), arm(b(s * 0.5, P - 0.06, 0, 0.06, 0.1, 0.06, "#d6b05a"))]),
    ...[-1, 1].map((s) => b(s * 0.09, 0.5, 0.01, 0.08, 0.08, 0.08, "#d6b05a")),
    sp(0, 1.66, 0, 0.22, "#d9c08a"), b(0, 1.57, 0.1, 0.1, 0.02, 0.02, DARK), ...[-1, 1].map((s) => b(s * 0.05, 1.68, 0.1, 0.03, 0.03, 0.02, DARK)),
    cy(0, 1.78, 0, 0.42, 0.03, "#6a4a2c", { m: true }), cy(0, 1.84, 0, 0.22, 0.1, "#6a4a2c", { m: true }), b(0, 1.82, 0, 0.22, 0.02, 0.22, RED),
    ...[-1, 1].map((s) => b(s * 0.14, 1.52, 0, 0.1, 0.05, 0.05, "#e8c870")),
  ], { wind: true, tags: "outdoor farm vegetable patch figure straw" });
})();

const windmill = (() => {
  const Y = 1.4, Z = 0.4, rpm = 6, sail = (p: Part) => turning(p, rpm, "z");
  return gd("Decorative windmill 1.2 m", 1.2, 1.0, 2.0, [
    b(0, 0.05, 0, 0.84, 0.1, 0.74, STN2), b(0, 0.45, 0, 0.7, 0.7, 0.6, CREAM, { m: true }), b(0, 1.1, 0, 0.56, 0.6, 0.5, CREAM, { m: true }),
    ...gable(0.66, 0.6, 1.38, 0.3, "#7a4a38"), b(0, 0.35, 0.305, 0.22, 0.6, 0.02, WOOD), b(0, 0.82, 0.305, 0.5, 0.03, 0.03, WOOD),
    ...[-1, 1].map((s) => b(s * 0.2, 0.9, 0.31, 0.12, 0.16, 0.02, "#8fb0c8")), b(0, 1.15, 0.255, 0.14, 0.18, 0.02, "#8fb0c8"),
    cz(0, Y, 0.3, 0.12, 0.2, DARK), sp(0, Y, Z + 0.03, 0.12, DARK),
    sail(b(0, Y, Z - 0.01, 1.1, 0.18, 0.01, CREAM)), sail(b(0, Y, Z - 0.01, 0.18, 1.1, 0.01, CREAM)),
    sail(b(0, Y, Z + 0.01, 1.1, 0.04, 0.025, WOOD)), sail(b(0, Y, Z + 0.01, 0.04, 1.1, 0.025, WOOD)),
  ], { wind: true, tags: "outdoor dutch ornament sails turning" });
})();

const pinwheel = (() => {
  const Y = 0.8, sail = (p: Part) => turning(p, 25, "z");
  return gd("Garden pinwheel 0.4 m", 0.4, 0.2, 1.0, [
    b(0, 0.38, 0, 0.02, 0.76, 0.02, WOOD), b(0, 0.01, 0, 0.1, 0.02, 0.1, WOOD),
    sail(b(0, Y, 0.03, 0.38, 0.12, 0.008, RED)), sail(b(0, Y, 0.035, 0.12, 0.38, 0.008, "#3f8ac8")),
    sail(b(0, Y, 0.03, 0.2, 0.2, 0.006, GOLD, { r: [0, 0, PI / 4] })),
    sp(0, Y, 0.06, 0.06, WHITE),
  ], { wind: true, tags: "outdoor spinner windmill toy ornament stake" });
})();

const chimes = (() => {
  const P = 1.9, X = 0.1, sw = (p: Part) => swung(p, P, 9, 16, "x");
  return gd("Wind chimes on shepherd's crook 2.0 m", 0.4, 0.4, 2.0, [
    b(-0.15, 0.95, 0, 0.03, 1.9, 0.03, ANTH), b(-0.15, 0.02, 0, 0.1, 0.04, 0.1, ANTH), b(0, 1.95, 0, 0.34, 0.025, 0.025, ANTH),
    b(0.17, 1.92, 0, 0.025, 0.07, 0.025, ANTH), sp(-0.15, 1.97, 0, 0.05, ANTH),
    b(X, 1.88, 0, 0.012, 0.04, 0.012, STEEL),
    sw(cy(X, 1.75, 0, 0.14, 0.025, WOOD, { m: true })), sw(b(X, 1.82, 0, 0.008, 0.14, 0.008, STEEL)),
    ...ring(5, 0.05, (x, z, _a, i) => { const L = [0.5, 0.4, 0.6, 0.35, 0.45][i]; return sw(cy(X + x, 1.74 - L / 2, z, 0.022, L, STEEL)); }),
    sw(cy(X, 1.5, 0, 0.03, 0.05, WOOD)), sw(b(X, 1.6, 0, 0.006, 0.24, 0.006, STEEL)), sw(b(X, 1.36, 0, 0.07, 0.1, 0.01, GOLD)),
  ], { wind: true, tags: "outdoor chime hanging sound metal tubes" });
})();

const hangingBaskets = (() => {
  const P = 1.85, sw = (p: Part) => swung(p, P, 6, 12, "x");
  const basket = (s: number, seed: number): Part[] => [
    sw(sp(s * 0.3, 1.56, 0, 0.28, "#6a5a3a")), sw(b(s * 0.3, 1.44, 0, 0.14, 0.02, 0.14, "#4a3a2a")),
    sw(rod([s * 0.3, 1.7, 0.0], [s * 0.3, P, 0], 0.012, DARK)), sw(plantAt("flower_bed_b", 0.3, 0.22, 0.28, s * 0.3, 0, seed, 1.62)),
    sw(sp(s * 0.3 + 0.06, 1.62, 0.12, 0.05, RED)), sw(sp(s * 0.3 - 0.07, 1.5, 0.13, 0.045, GOLD)),
  ];
  return gd("Hanging baskets on double crook 2.0 m", 0.9, 0.4, 2.0, [
    b(0, 0.95, 0, 0.03, 1.9, 0.03, ANTH), b(0, 0.02, 0, 0.14, 0.04, 0.14, ANTH), b(0, 1.88, 0, 0.62, 0.025, 0.025, ANTH),
    ...[-1, 1].flatMap((s) => [b(s * 0.3, 1.86, 0, 0.025, 0.06, 0.025, ANTH), rod([0, 1.4, 0], [s * 0.14, 1.52, 0], 0.02, ANTH), sp(s * 0.31, 1.89, 0, 0.04, ANTH)]),
    ...basket(-1, 1), ...basket(1, 4),
  ], { wind: true, tags: "outdoor flowers pots hanging plants pole" });
})();

// ---------- planters ----------
const squarePlanter = gd("Square planter with shrub 0.6 m", 0.6, 0.6, 1.0, [
  b(0, 0.26, 0, 0.56, 0.5, 0.56, ANTH, { m: true }), b(0, 0.5, 0, 0.6, 0.04, 0.6, ANTH, { m: true }), b(0, 0.51, 0, 0.5, 0.03, 0.5, SOIL),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.23, 0.01, sz * 0.23, 0.08, 0.02, 0.08, DARK))),
  plantAt("shrub", 0.5, 0.45, 0.5, 0, 0, 2, 0.5),
], { tags: "outdoor pot plant box modern cube" });

const tallPlanter = gd("Tall round planter 0.4 x 0.9 m", 0.4, 0.4, 1.5, [
  cy(0, 0.45, 0, 0.38, 0.9, ANTH, { m: true }), cy(0, 0.88, 0, 0.4, 0.06, ANTH, { m: true }), cy(0, 0.9, 0, 0.32, 0.02, SOIL),
  cy(0, 0.04, 0, 0.3, 0.08, DARK), plantAt("grass_tall", 0.4, 0.6, 0.4, 0, 0, 1, 0.9),
], { tags: "outdoor pot plant tall cylinder grass" });

const cortenPlanter = gd("Corten steel planter 1.5 m", 1.5, 0.4, 1.05, [
  b(0, 0.27, 0.19, 1.5, 0.5, 0.02, CORTEN, { m: true }), b(0, 0.27, -0.19, 1.5, 0.5, 0.02, CORTEN, { m: true }),
  ...[-1, 1].map((s) => b(s * 0.74, 0.27, 0, 0.02, 0.5, 0.36, CORTEN, { m: true })), b(0, 0.04, 0, 1.46, 0.02, 0.36, CORTEN),
  b(0, 0.5, 0, 1.5, 0.03, 0.4, "#a0603a", { m: true }), b(0, 0.47, 0, 1.44, 0.02, 0.32, SOIL),
  ...[-1, 1].map((s) => b(s * 0.65, 0.01, 0, 0.08, 0.02, 0.3, DARK)),
  plantAt("grass_tall", 0.5, 0.55, 0.3, -0.45, 0, 2, 0.48), plantAt("lavender", 0.45, 0.4, 0.3, 0.1, 0, 1, 0.48), plantAt("lavender", 0.45, 0.4, 0.3, 0.5, 0, 3, 0.48),
], { tags: "outdoor rusty steel trough long modern raised" });

const steppedCubes = (() => {
  const cube = (x: number, w: number, h: number, c: string): Part[] => [
    b(x, h / 2, 0, w, h, w, c, { m: true }), b(x, h + 0.01, 0, w - 0.08, 0.02, w - 0.08, SOIL),
    sp(x, h + 0.07, 0, w * 0.6, LEAF2), sp(x - w * 0.18, h + 0.11, 0.03, w * 0.34, LEAF1), sp(x + w * 0.18, h + 0.09, -0.03, w * 0.34, LEAF3),
    sp(x + 0.06, h + 0.16, 0.08, 0.06, RED), sp(x - 0.08, h + 0.15, -0.06, 0.06, "#f4b6cf"),
  ];
  return gd("Stepped cube planters, set of 3", 1.8, 0.6, 1.06, [...cube(-0.6, 0.4, 0.4, STN), ...cube(0, 0.5, 0.6, STN2), ...cube(0.6, 0.6, 0.8, ANTH)],
    { tags: "outdoor pot plant concrete modern cubes trio" });
})();

const potTower = gd("Tiered pot tower 1.1 m", 0.5, 0.5, 1.15, [
  ...[[0.5, 0.22, 0.11], [0.42, 0.22, 0.33], [0.34, 0.22, 0.55], [0.26, 0.22, 0.77]].flatMap(([d, h, y]) => [cy(0, y, 0, d, h, TERRA, { m: true }), cy(0, y + h / 2, 0, d + 0.03, 0.03, TERRA, { m: true }), cy(0, y + h / 2 + 0.005, 0, d - 0.06, 0.02, SOIL)]),
  ...ring(6, 0.22, (x, z, _a, i) => sp(x, 0.26, z, 0.1, i % 2 ? RED : LEAF2)), ...ring(5, 0.17, (x, z, _a, i) => sp(x, 0.48, z, 0.09, i % 2 ? GOLD : LEAF1)), ...ring(4, 0.12, (x, z, _a, i) => sp(x, 0.7, z, 0.08, i % 2 ? "#f4b6cf" : LEAF3)),
  plantAt("flower_bed_b", 0.3, 0.25, 0.3, 0, 0, 2, 0.89),
], { tags: "outdoor strawberry stacked pots herb tower" });

const halfBarrel = gd("Half barrel planter 0.6 m", 0.6, 0.6, 0.7, [
  cy(0, 0.2, 0, 0.58, 0.4, WOOD, { m: true }), ...[0.07, 0.2, 0.33].map((y) => cy(0, y, 0, 0.6, 0.025, DARK)), cy(0, 0.4, 0, 0.5, 0.02, SOIL),
  ...ring(14, 0.28, (x, z, a) => b(x, 0.2, z, 0.01, 0.39, 0.05, OAK, { m: true, r: [0, -a, 0] })), plantAt("flower_bed_b", 0.5, 0.3, 0.5, 0, 0, 1, 0.4),
], { tags: "outdoor wooden tub whisky barrel pot flowers" });

const urn = gd("Terracotta urn 0.6 x 0.9 m", 0.6, 0.6, 0.9, [
  cy(0, 0.05, 0, 0.26, 0.1, TERRA, { m: true }), cy(0, 0.12, 0, 0.18, 0.06, TERRA, { m: true }), sp(0, 0.33, 0, 0.5, TERRA, { m: true }),
  cy(0, 0.6, 0, 0.25, 0.08, TERRA, { m: true }), cy(0, 0.66, 0, 0.5, 0.06, TERRA, { m: true }), cy(0, 0.68, 0, 0.42, 0.03, SOIL),
  ...[-1, 1].flatMap((s) => [sp(s * 0.26, 0.45, 0, 0.1, TERRA, { m: true }), sp(s * 0.24, 0.56, 0, 0.07, TERRA, { m: true })]),
  cy(0, 0.33, 0, 0.51, 0.03, "#c47b55"), plantAt("fern", 0.5, 0.2, 0.5, 0, 0, 1, 0.69),
], { tags: "outdoor classic pot vase jar plant large" });

const windowBox = gd("Hanging window box 1.0 m", 1.0, 0.25, 1.4, [
  b(0, 1.0, 0, 1.0, 0.18, 0.2, WOOD, { m: true }), b(0, 1.09, 0, 0.92, 0.02, 0.16, SOIL), b(0, 1.0, 0.1, 1.0, 0.03, 0.01, OAK, { m: true }),
  ...[-1, 1].flatMap((s) => [b(s * 0.4, 0.86, -0.02, 0.03, 0.1, 0.2, DARK), b(s * 0.4, 0.9, -0.11, 0.03, 0.2, 0.02, DARK)]),
  plantAt("flower_bed_c", 0.92, 0.3, 0.16, 0, 0, 2, 1.1),
  ...[-0.3, 0, 0.3].map((x) => sp(x, 1.0, 0.115, 0.05, LEAF2)),
], { wall: true, tags: "outdoor balcony railing flower trough sill" });

export const FEATURES: Record<string, Def> = {
  gd_cascade_bowls: cascade, gd_spill_pots_fountain: spillPots, gd_bird_bath: birdBath, gd_solar_float_fountain: solarFountain, gd_garden_pond: pond,
  gd_statue_lady: ladyStatue, gd_statue_buddha: buddha, gd_statue_lion: lion, gd_statue_hare: hare, gd_gnome: gnome, gd_sundial: sundial,
  gd_scarecrow: scarecrow, gd_windmill_deco: windmill, gd_pinwheel_stake: pinwheel, gd_wind_chimes_crook: chimes, gd_hanging_baskets_crook: hangingBaskets,
  gd_planter_square_shrub: squarePlanter, gd_planter_tall_round: tallPlanter, gd_planter_corten: cortenPlanter, gd_planter_stepped_cubes: steppedCubes,
  gd_pot_tower: potTower, gd_half_barrel: halfBarrel, gd_urn_terracotta: urn, gd_window_box_hanging: windowBox,
  ...FEATURES2,
};
