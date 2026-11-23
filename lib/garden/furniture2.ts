import type { Def, Part } from "../catalog";
import { b, cy, sp } from "../partsKit.ts";
import { cx, cz, rod, el, ring, range, gd, lit, flame, swung, gable, mono, plantAt, STEEL, DARK, GREY, OAK, WOOD, WHITE, BLACK, STONE, TERRA, GOLD, SAND, TEAK, GLASS, WATER, ROOFC, FELT, BRICK, DECK } from "./kit.ts";

// Garden furniture, part 2: curtain shelters, heaters and fire, benches, kitchen, ovens, hot tubs, stores and sheds.
const FIRE = "#ff9a4a", LEAF = "#4d7d3d", CHAR = "#5b5f66", CURT = "#efe8d8";

/** Curtain panels between x0 and x1 at depth z, hanging from `top` to `bottom`: pleat strips that sway together about the rail. */
const drape = (x0: number, x1: number, z: number, top: number, bottom: number): Part[] => {
  const n = Math.max(2, Math.round((x1 - x0) / 0.4)), w = (x1 - x0) / n;
  return range(n).map((i) => swung(b(x0 + (i + 0.5) * w, (top + bottom) / 2, z + (i % 2 ? 0.03 : -0.03), w * 0.98, top - bottom, 0.02, CURT, { tex: "fabric", rough: 0.95 }), top, 4, 10));
};
/** stepped triangle filling a gable end at depth z */
const gend = (w: number, y0: number, rise: number, z: number, c: string, n = 3, t = 0.03): Part[] => {
  const hs = (w - 0.06) / 2;
  return range(n).map((k) => b(0, y0 + ((k + 0.5) * rise) / n, z, 2 * hs * (1 - (k + 0.5) / n), rise / n, t, c, { m: true }));
};
/** vertical stave on a round barrel (centre x offset ox) at angle a, radius R, tangent width tw: the box faces outward */
const stave = (R: number, y: number, h: number, a: number, tw: number, c: string, ox = 0): Part =>
  b(ox + R * Math.cos(a), y, R * Math.sin(a), tw, h, 0.02, c, { r: [0, Math.atan2(-Math.cos(a), -Math.sin(a)), 0] });

// ---------- shelters with curtains ----------
const pergolaCurtains = gd("Pergola with curtains 3 x 3 m", 3.0, 3.0, 2.6, [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 1.43, 1.2, sz * 1.43, 0.14, 2.4, 0.14, WHITE, { m: true }))),
  ...[-1, 1].map((s) => b(0, 2.45, s * 1.43, 3.0, 0.14, 0.1, WHITE, { m: true })), ...[-1, 1].map((s) => b(s * 1.43, 2.45, 0, 0.1, 0.14, 2.8, WHITE, { m: true })),
  ...range(8).map((i) => b(-1.4 + i * 0.4, 2.54, 0, 0.06, 0.06, 3.0, WHITE, { m: true })),
  ...[-1, 1].map((s) => cx(0, 2.37, s * 1.31, 0.03, 2.7, STEEL)),
  ...[-1, 1].flatMap((sz) => [...drape(-1.36, -0.05, sz * 1.31, 2.35, 0.08), ...drape(0.05, 1.36, sz * 1.31, 2.35, 0.08)]),
], { wind: true, tags: "outdoor patio shade shelter canopy drapes slatted roof" });

const gazeboCurtains = gd("Gazebo with curtains and roof 3 x 3 m", 3.0, 3.0, 3.05, [
  b(0, 0.04, 0, 2.9, 0.08, 2.9, DECK),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 1.3, 1.2, sz * 1.3, 0.14, 2.24, 0.14, WHITE))),
  ...[-1, 1].map((s) => b(0, 2.3, s * 1.3, 2.74, 0.12, 0.1, WHITE)), ...[-1, 1].map((s) => b(s * 1.3, 2.3, 0, 0.1, 0.12, 2.74, WHITE)),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => rod([sx * 1.3, 2.05, sz * 1.1], [sx * 1.1, 2.3, sz * 1.3], 0.04, WHITE))),
  ...[3.0, 2.4, 1.8, 1.2, 0.6].map((s, i) => b(0, 2.42 + i * 0.1, 0, s, 0.1, s, ROOFC, { m: true })),
  ...[-1, 1].map((s) => b(0, 2.38, s * 1.47, 3.0, 0.14, 0.04, ROOFC, { m: true })), ...[-1, 1].map((s) => b(s * 1.47, 2.38, 0, 0.04, 0.14, 3.0, ROOFC, { m: true })),
  cy(0, 2.94, 0, 0.06, 0.12, GOLD), sp(0, 2.99, 0, 0.08, GOLD),
  ...[-1, 1].flatMap((sz) => [...drape(-1.2, -0.05, sz * 1.2, 2.22, 0.1), ...drape(0.05, 1.2, sz * 1.2, 2.22, 0.1)]),
], { wind: true, tags: "outdoor patio shade shelter pavilion hip roof drapes" });

// ---------- heat and fire ----------
const patioHeater = gd("Patio heater, mushroom style 2.2 m", 0.8, 0.8, 2.2, [
  cy(0, 0.03, 0, 0.5, 0.06, DARK), cy(0, 0.35, 0, 0.22, 0.6, STEEL), cy(0, 1.12, 0, 0.07, 1.6, STEEL), b(0.07, 0.85, 0, 0.05, 0.12, 0.08, BLACK),
  cy(0, 1.86, 0, 0.14, 0.08, DARK),
  cy(0, 1.92, 0, 0.34, 0.06, FIRE, { glow: true }), ...ring(10, 0.17, (x, z) => b(x, 1.89, z, 0.04, 0.05, 0.04, FIRE, { glow: true })),
  el(0, 2.05, 0, 0.8, 0.3, 0.8, STEEL), cy(0, 2.2, 0, 0.1, 0.03, DARK),
  ...[-1, 1].map((s) => cy(s * 0.2, 0.06, 0.2, 0.1, 0.05, BLACK)),
], { ...lit(1.78, FIRE, 0.5), tags: "outdoor patio warm gas electric heat warmer terrace lamp" });

const fireTable = gd("Gas fire table 0.9 m", 0.9, 0.9, 0.95, [
  b(0, 0.32, 0, 0.84, 0.64, 0.84, CHAR, { m: true }), b(0, 0.67, 0, 0.9, 0.06, 0.9, STONE),
  b(0, 0.705, 0, 0.6, 0.01, 0.6, BLACK),
  ...range(14).map((i) => sp(-0.24 + (i % 4) * 0.16 + (i % 2) * 0.03, 0.73, -0.22 + Math.floor(i / 4) * 0.15, 0.08, i % 3 ? "#3a3c40" : "#55575c")),
  ...[[0, 0], [-0.14, -0.08], [0.15, 0.06], [0.05, -0.17], [-0.1, 0.15]].map(([x, z]) => flame(x, 0.8, z, 0.07)),
  ...[-1, 1].map((s) => b(0, 0.83, s * 0.33, 0.66, 0.22, 0.012, GLASS)), ...[-1, 1].map((s) => b(s * 0.33, 0.83, 0, 0.012, 0.22, 0.66, GLASS)),
  b(0.36, 0.45, 0.43, 0.06, 0.06, 0.02, BLACK),
], { ...lit(0.85, FIRE, 0.4), tags: "outdoor patio flame fireplace pit table warm gas lava stones" });

// ---------- benches ----------
const benchWood = gd("Wooden garden bench 1.5 m", 1.5, 0.6, 0.92, [
  ...range(5).map((i) => b(0, 0.45, -0.15 + i * 0.1, 1.5, 0.03, 0.08, TEAK, { tex: "wood", rough: 0.55, bevel: 0.008, m: true })),
  ...[0, 1, 2].map((i) => b(0, 0.62 + i * 0.12, -0.2 - i * 0.02, 1.4, 0.09, 0.025, TEAK, { tex: "wood", rough: 0.55, bevel: 0.008, m: true, r: [-0.2, 0, 0] })),
  ...[-1, 1].flatMap((s) => [
    b(s * 0.68, 0.22, 0.2, 0.06, 0.44, 0.06, DARK, { tex: "metal", metal: 0.85, rough: 0.45 }), rod([s * 0.68, 0.0, -0.2], [s * 0.68, 0.9, -0.26], 0.06, DARK),
    b(s * 0.68, 0.66, 0.0, 0.06, 0.04, 0.5, TEAK, { tex: "wood", rough: 0.55, bevel: 0.008, m: true }), b(s * 0.68, 0.55, 0.2, 0.04, 0.2, 0.04, DARK, { tex: "metal", metal: 0.85, rough: 0.45 }),
  ]),
  b(0, 0.39, -0.1, 1.4, 0.05, 0.04, DARK, { tex: "metal", metal: 0.85, rough: 0.45 }), b(0, 0.39, 0.2, 1.4, 0.05, 0.04, DARK, { tex: "metal", metal: 0.85, rough: 0.45 }),
], { tags: "outdoor patio seat park teak timber" });

const benchStone = gd("Stone garden bench 1.4 m", 1.4, 0.45, 0.62, [
  b(0, 0.43, 0, 1.4, 0.1, 0.45, STONE, { m: true }),
  ...[-1, 1].map((s) => b(s * 0.5, 0.19, 0, 0.3, 0.38, 0.4, GREY)), b(0, 0.34, 0, 0.7, 0.08, 0.36, GREY),
  ...[-1, 1].map((s) => sp(s * 0.62, 0.55, 0, 0.14, GREY)),
  b(0, 0.485, 0, 0.9, 0.03, 0.34, SAND),
  el(-0.55, 0.49, 0.1, 0.22, 0.04, 0.12, "#5a7a40"), el(0.1, 0.49, -0.12, 0.16, 0.03, 0.1, "#5a7a40"), el(0.6, 0.2, 0.15, 0.18, 0.1, 0.04, "#5a7a40"),
], { tags: "outdoor patio seat park granite concrete" });

// ---------- kitchen and ovens ----------
const kitchenIsland = (() => {
  const door = (x: number, w: number) => [b(x, 0.5, 0.17, w, 0.72, 0.02, CHAR, { m: true }), b(x + w / 2 - 0.05, 0.55, 0.19, 0.02, 0.14, 0.02, STEEL)];
  return gd("Outdoor kitchen island 2.4 x 0.9 m", 2.4, 1.4, 1.4, [
    b(0, 0.05, -0.25, 2.3, 0.1, 0.76, DARK), b(0, 0.5, -0.25, 2.4, 0.8, 0.8, CHAR, { m: true }),
    ...door(-1.0, 0.38), ...door(-0.6, 0.38), ...door(-0.2, 0.38),
    b(0.2, 0.74, 0.17, 0.38, 0.2, 0.02, CHAR, { m: true }), b(0.2, 0.37, 0.17, 0.38, 0.5, 0.02, CHAR, { m: true }),
    b(0.62, 0.5, 0.17, 0.38, 0.72, 0.02, STEEL), b(1.02, 0.5, 0.17, 0.38, 0.72, 0.02, STEEL),
    b(0.74, 0.5, 0.19, 0.02, 0.5, 0.02, BLACK), b(0.9, 0.5, 0.19, 0.02, 0.5, 0.02, BLACK),
    b(0, 0.93, -0.2, 2.4, 0.06, 0.9, DARK),
    b(-0.8, 1.02, -0.2, 0.7, 0.12, 0.55, STEEL), b(-0.8, 1.09, -0.2, 0.64, 0.01, 0.48, BLACK),
    ...[-1.0, -0.87, -0.73, -0.6].map((x) => cz(x, 1.01, 0.09, 0.04, 0.03, BLACK)),
    b(-0.8, 1.22, -0.52, 0.7, 0.3, 0.04, STEEL, { r: [-0.5, 0, 0] }), b(-0.8, 1.3, -0.47, 0.5, 0.03, 0.03, BLACK),
    b(0, 0.962, -0.2, 0.5, 0.012, 0.4, "#2a2d31"),
    cy(0, 1.1, -0.42, 0.03, 0.3, STEEL), rod([0, 1.25, -0.42], [0, 1.22, -0.28], 0.03, STEEL),
    ...[0.45, 0.95].flatMap((x) => [cy(x, 0.67, 0.5, 0.34, 0.04, TEAK, { m: true }), cy(x, 0.33, 0.5, 0.04, 0.66, DARK), cy(x, 0.015, 0.5, 0.3, 0.03, DARK), cy(x, 0.28, 0.5, 0.26, 0.015, DARK)]),
  ], { tags: "outdoor patio bbq barbecue grill sink fridge counter bar cooking cook" });
})();

const pizzaOven = gd("Pizza oven on stand 1.0 x 0.9 m", 1.0, 0.9, 1.9, [
  b(0, 0.44, 0, 0.94, 0.84, 0.84, BRICK, { m: true }), b(0, 0.45, 0.43, 0.6, 0.56, 0.02, "#1d1b19"),
  ...[-0.14, 0.14].map((x) => cz(x, 0.15, 0.435, 0.2, 0.04, "#8a5a32")), cz(0, 0.3, 0.435, 0.2, 0.04, "#a06a3c"),
  b(0, 0.87, 0, 1.0, 0.06, 0.9, STONE),
  el(0, 1.2, 0, 0.8, 0.72, 0.8, BRICK, { m: true }),
  b(0, 1.08, 0.33, 0.42, 0.34, 0.1, STONE), b(0, 1.06, 0.385, 0.3, 0.24, 0.05, BLACK), b(0, 1.04, 0.4, 0.22, 0.14, 0.04, FIRE, { glow: true }),
  cy(0, 1.65, 0.2, 0.14, 0.5, STEEL), cy(0, 1.9, 0.2, 0.2, 0.04, DARK),
  b(0.38, 0.95, 0.3, 0.02, 0.04, 0.3, BLACK),
], { ...lit(1.05, FIRE, 0.35), tags: "outdoor patio wood fired brick oven pizza bake stone" });

const smoker = gd("Barrel smoker barbecue on wheels 1.8 m", 1.8, 0.8, 1.7, [
  b(-0.66, 0.7, 0, 0.44, 0.44, 0.44, DARK), b(-0.66, 0.94, 0, 0.5, 0.04, 0.5, BLACK), b(-0.66, 0.7, 0.23, 0.2, 0.2, 0.02, STEEL),
  cx(0.12, 0.85, 0, 0.5, 1.0, DARK), cx(-0.1, 0.85, 0, 0.52, 0.03, BLACK), cx(0.4, 0.85, 0, 0.52, 0.03, BLACK),
  b(0.12, 1.1, 0.0, 0.8, 0.03, 0.06, BLACK), b(-0.1, 1.15, 0.28, 0.03, 0.1, 0.03, STEEL), b(0.34, 1.15, 0.28, 0.03, 0.1, 0.03, STEEL), b(0.12, 1.2, 0.28, 0.5, 0.03, 0.03, STEEL),
  cy(0.12, 1.15, 0, 0.03, 0.05, STEEL),
  cy(0.62, 1.4, 0, 0.1, 0.5, STEEL), cy(0.62, 1.66, 0, 0.16, 0.03, BLACK),
  b(-0.3, 0.42, 0, 0.5, 0.03, 0.06, STEEL),
  ...[-0.4, 0.6].flatMap((x) => [-1, 1].map((s) => b(x, 0.3, s * 0.2, 0.04, 0.6, 0.04, DARK))),
  b(0.1, 0.55, 0.0, 1.0, 0.04, 0.5, DARK),
  cz(0.62, 0.1, 0.33, 0.2, 0.04, BLACK), cz(0.62, 0.1, -0.33, 0.2, 0.04, BLACK), cz(0.62, 0.1, 0, 0.04, 0.68, STEEL),
  b(0.1, 0.9, 0.34, 0.7, 0.03, 0.14, DARK),
], { tags: "outdoor patio bbq barbecue offset smoker charcoal meat grill" });

const barCart = (() => {
  const bottle = (x: number, y: number, z: number, c: string): Part[] => [cy(x, y + 0.11, z, 0.065, 0.22, c), cy(x, y + 0.27, z, 0.028, 0.1, c)];
  return gd("Bar cart 0.9 m", 0.9, 0.5, 1.15, [
    ...[-1, 1].flatMap((sz) => [b(-0.4, 0.5, sz * 0.2, 0.03, 1.0, 0.03, GOLD), b(0.4, 0.43, sz * 0.2, 0.03, 0.86, 0.03, GOLD)]),
    b(0, 0.8, 0, 0.88, 0.03, 0.46, TEAK, { m: true }), b(0, 0.3, 0, 0.88, 0.03, 0.46, TEAK, { m: true }),
    ...[-1, 1].map((s) => b(0, 0.9, s * 0.2, 0.86, 0.015, 0.015, GOLD)), b(0.4, 0.88, 0, 0.015, 0.015, 0.4, GOLD), b(-0.4, 1.0, 0, 0.03, 0.03, 0.43, GOLD),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cz(sx * 0.4, 0.05, sz * 0.23, 0.1, 0.03, BLACK))),
    ...[[-0.3, "#2f6b3a"], [-0.2, "#8a4a2a"], [-0.1, "#c8a22c"], [0.0, "#3a5f8a"]].flatMap(([x, c]) => bottle(+x, 0.815, -0.12, String(c))),
    ...[0.15, 0.25, 0.33].map((x, i) => cy(x, 0.87, 0.1 + (i % 2) * 0.05, 0.06, 0.1, GLASS)),
    cy(0.25, 0.9, -0.1, 0.14, 0.16, STEEL), sp(0.25, 0.98, -0.1, 0.07, WHITE),
    ...bottle(-0.25, 0.315, -0.1, "#7a3a5a"), ...bottle(-0.1, 0.315, 0.05, "#2f6b3a"), b(0.2, 0.37, 0.0, 0.3, 0.12, 0.3, SAND),
  ], { tags: "outdoor patio drinks trolley cocktail bottles glasses drinks cart party" });
})();

// ---------- hot tubs ----------
const hotTubSquare = gd("Square hot tub 2.0 m with steps", 2.0, 2.5, 1.0, [
  b(0, 0.42, -0.25, 2.0, 0.84, 2.0, TEAK, { m: true }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.97, 0.42, -0.25 + sz * 0.97, 0.07, 0.84, 0.07, DARK))),
  ...[-1, 1].map((s) => b(0, 0.88, -0.25 + s * 0.925, 2.0, 0.06, 0.15, WHITE)), ...[-1, 1].map((s) => b(s * 0.925, 0.88, -0.25, 0.15, 0.06, 1.7, WHITE)),
  b(0, 0.87, -0.25, 1.7, 0.02, 1.7, WATER), b(0.3, 0.7, -0.25, 1.1, 0.02, 1.4, "#2f8fbf"),
  b(-0.5, 0.95, -0.25, 0.9, 0.08, 1.7, "#3d4147"), b(-0.5, 0.96, -0.25, 0.04, 0.1, 1.7, BLACK), b(-0.5, 1.0, 0.45, 0.3, 0.02, 0.03, STEEL),
  ...[-1, 1].map((s) => b(0.8, 0.84, -0.25 + s * 0.6, 0.3, 0.06, 0.2, WHITE)),
  b(0.7, 0.55, 0.76, 0.34, 0.16, 0.02, BLACK), sp(0.65, 0.55, 0.78, 0.04, STEEL), sp(0.77, 0.55, 0.78, 0.04, STEEL),
  ...range(4).map((i) => sp(-0.6 + i * 0.4, 0.45, 0.76, 0.06, STEEL)),
  b(0, 0.3, 0.875, 1.0, 0.6, 0.25, DECK, { m: true }), b(0, 0.15, 1.125, 1.0, 0.3, 0.25, DECK, { m: true }),
  b(0, 0.605, 0.875, 1.02, 0.02, 0.27, WOOD), b(0, 0.305, 1.125, 1.02, 0.02, 0.27, WOOD),
], { tags: "outdoor patio spa jacuzzi bath whirlpool bubble relax pool" });

const hotTubBarrel = (() => {
  const X = -0.3;
  return gd("Wooden barrel hot tub 1.8 m with stove", 2.5, 1.8, 1.95, [
    cy(X, 0.5, 0, 1.8, 1.0, TEAK, { m: true }),
    ...ring(16, 0, (_x, _z, a) => stave(0.905, 0.5, 0.96, a, 0.1, "#7a5a36", X)),
    ...[0.15, 0.5, 0.85].map((y) => cy(X, y, 0, 1.83, 0.04, STEEL)),
    cy(X, 1.0, 0, 1.84, 0.06, OAK), cy(X, 1.035, 0, 1.5, 0.02, WATER),
    cy(0.95, 0.4, 0, 0.38, 0.8, "#3c3f45"), cy(0.95, 0.82, 0, 0.42, 0.04, BLACK), b(0.95, 0.3, 0.19, 0.16, 0.2, 0.02, BLACK), b(0.95, 0.3, 0.205, 0.1, 0.04, 0.01, FIRE),
    b(0.77, 0.25, 0, 0.2, 0.05, 0.05, STEEL), b(0.77, 0.7, 0, 0.2, 0.05, 0.05, STEEL),
    cy(0.95, 1.37, 0, 0.12, 1.1, STEEL), cy(0.95, 1.93, 0, 0.2, 0.03, DARK),
  ], { tags: "outdoor patio spa wood fired tub soak bath round relax" });
})();

// ---------- stores and sheds ----------
const logStore = (() => {
  const tones = ["#8a6038", "#a47a4c", "#6e4a2a"];
  const logs = range(8).flatMap((r) => range(r % 2 ? 8 : 9).map((i) => cz((r % 2 ? -0.525 : -0.6) + i * 0.15, 0.22 + r * 0.13, 0, 0.13, 0.5, tones[(i + r) % 3])));
  return gd("Log store with roof 1.5 m", 1.5, 0.6, 1.55, [
    b(0, 0.06, 0, 1.5, 0.06, 0.6, WOOD), ...[-1, 0, 1].map((k) => b(k * 0.6, 0.02, 0, 0.1, 0.04, 0.6, WOOD)),
    ...[-1, 1].flatMap((s) => [b(s * 0.72, 0.8, -0.27, 0.06, 1.5, 0.06, WOOD, { m: true }), b(s * 0.72, 0.7, 0.27, 0.06, 1.34, 0.06, WOOD, { m: true })]),
    ...range(7).map((i) => b(0, 0.2 + i * 0.2, -0.29, 1.4, 0.18, 0.02, WOOD, { m: true })),
    ...[-1, 1].map((s) => b(s * 0.72, 0.9, 0, 0.04, 0.05, 0.54, WOOD, { m: true })),
    mono(1.5, 0.6, 1.35, 0.15, ROOFC, { m: true }),
    ...logs,
  ], { tags: "outdoor firewood wood stack storage timber shelter logs" });
})();

const leanTo = (() => {
  const sideBoards = (x: number) => range(4).map((i) => {
    const z = -0.2625 + i * 0.175, h = 1.75 + (0.25 * (0.4 - z)) / 0.8;
    return b(x, h / 2, z, 0.04, h, 0.173, OAK, { m: true });
  });
  const leaf = (x: number): Part[] => [b(x, 0.85, 0.33, 0.84, 1.66, 0.04, OAK, { m: true }), rod([x - 0.34, 0.2, 0.36], [x + 0.34, 1.5, 0.36], 0.05, WOOD), sp(x + (x < 0 ? 0.35 : -0.35), 0.9, 0.38, 0.05, STEEL)];
  return gd("Lean-to tool shed 1.8 x 0.8 m", 1.8, 0.8, 2.05, [
    ...range(9).map((i) => b(-0.8 + i * 0.2, 1.0, -0.37, 0.195, 2.0, 0.04, OAK, { m: true })),
    ...sideBoards(-0.88), ...sideBoards(0.88),
    ...leaf(-0.43), ...leaf(0.43), b(0, 1.7, 0.33, 1.8, 0.1, 0.04, OAK, { m: true }),
    ...[-0.82, 0.82].flatMap((x) => [0.3, 1.5].map((y) => b(x, y, 0.36, 0.14, 0.05, 0.02, BLACK))),
    mono(1.8, 0.8, 1.75, 0.25, FELT),
  ], { tags: "outdoor garden storage tools shed small timber lean to" });
})();

const workshop = (() => {
  const backBatts = range(6).map((i) => b(-1.17 + i * 0.468, 1.08, -1.17, 0.03, 1.84, 0.02, WOOD));
  const sideBatts = range(5).map((i) => b(-1.46, 1.08, -0.88 + i * 0.44, 0.02, 1.84, 0.03, WOOD));
  return gd("Workshop shed 3.0 x 2.4 m", 3.0, 2.4, 2.65, [
    b(0, 0.08, 0, 2.96, 0.16, 2.36, WOOD),
    b(0, 1.08, 1.12, 2.9, 1.84, 0.08, OAK, { m: true }), b(0, 1.08, -1.12, 2.9, 1.84, 0.08, OAK, { m: true }),
    b(-1.41, 1.08, 0, 0.08, 1.84, 2.3, OAK, { m: true }), b(1.41, 1.08, 0, 0.08, 1.84, 2.3, OAK, { m: true }),
    ...backBatts, ...sideBatts,
    b(0.55, 0.93, 1.165, 1.16, 1.8, 0.04, WHITE),
    ...[0.29, 0.81].flatMap((x) => [b(x, 0.93, 1.19, 0.52, 1.7, 0.02, "#4f6f62", { m: true }), b(x, 1.3, 1.2, 0.38, 0.5, 0.01, "#3f5a4f"), b(x, 0.6, 1.2, 0.38, 0.5, 0.01, "#3f5a4f")]),
    sp(0.5, 0.95, 1.205, 0.04, GOLD), sp(0.6, 0.95, 1.205, 0.04, GOLD),
    b(-0.75, 1.2, 1.165, 0.8, 0.7, 0.04, WHITE), b(-0.75, 1.2, 1.18, 0.7, 0.6, 0.01, GLASS), b(-0.75, 1.2, 1.19, 0.03, 0.6, 0.01, WHITE), b(-0.75, 1.2, 1.19, 0.7, 0.03, 0.01, WHITE),
    b(-0.75, 0.82, 1.19, 0.9, 0.04, 0.06, WHITE),
    ...[-1, 1].map((s) => b(-0.75 + s * 0.52, 1.2, 1.18, 0.18, 0.7, 0.03, "#3e6a5a")),
    b(1.47, 1.2, 0, 0.04, 0.7, 0.8, WHITE), b(1.485, 1.2, 0, 0.01, 0.6, 0.7, GLASS), b(1.49, 1.2, 0, 0.01, 0.6, 0.03, WHITE),
    ...gable(3.0, 2.4, 2.0, 0.6, ROOFC, { m: true }),
    ...gend(3.0, 2.0, 0.58, 1.14, OAK), ...gend(3.0, 2.0, 0.58, -1.14, OAK),
    b(0, 2.62, 0, 0.1, 0.04, 2.4, DARK),
  ], { tags: "outdoor garden storage tools shed large timber hobby cabin window door" });
})();

const pottingBench = gd("Potting bench with cold frame 1.2 m", 1.2, 0.6, 1.45, [
  ...[-1, 1].flatMap((s) => [b(s * 0.55, 0.43, 0.25, 0.06, 0.86, 0.06, WOOD, { m: true }), b(s * 0.55, 0.63, -0.25, 0.06, 1.26, 0.06, WOOD, { m: true })]),
  ...[-0.21, -0.07, 0.07, 0.21].map((z) => b(0, 0.865, z, 1.2, 0.03, 0.13, OAK, { m: true })),
  ...[-0.17, 0, 0.17].map((z) => b(0, 0.25, z, 1.1, 0.025, 0.15, OAK, { m: true })),
  ...[-1, 1].map((s) => b(0, 0.78, s * 0.27, 1.1, 0.06, 0.03, WOOD)),
  b(0, 1.1, -0.27, 1.2, 0.25, 0.03, OAK, { m: true }),
  b(-0.25, 0.94, -0.17, 0.6, 0.12, 0.03, OAK), b(-0.25, 0.92, 0.2, 0.6, 0.08, 0.03, OAK), ...[-1, 1].map((s) => b(-0.25 + s * 0.29, 0.93, 0.02, 0.03, 0.1, 0.4, OAK)),
  b(-0.25, 0.9, 0.02, 0.54, 0.02, 0.34, "#4a3a2e"), plantAt("flower_bed", 0.5, 0.2, 0.3, -0.25, 0.02, 1, 0.9),
  b(-0.25, 1.265, -0.045, 0.6, 0.02, 0.42, GLASS, { r: [-1.05, 0, 0] }), rod([-0.5, 0.94, 0.18], [-0.5, 1.2, 0.04], 0.015, STEEL),
  ...[0.18, 0.33, 0.48].flatMap((x, i) => [cy(x, 0.94, 0.05, 0.12, 0.1, TERRA), sp(x, 1.02, 0.05, 0.11, i % 2 ? LEAF : "#3f6b3a")]),
  b(0.38, 0.895, -0.14, 0.3, 0.03, 0.18, BLACK), ...[0.3, 0.38, 0.46].map((x) => sp(x, 0.92, -0.14, 0.05, "#7fae4c")),
], { tags: "outdoor garden greenhouse seedlings plants gardening table work bench frame" });

export const FURNITURE2: Record<string, Def> = {
  gd_pergola_curtains: pergolaCurtains,
  gd_gazebo_curtains: gazeboCurtains,
  gd_patio_heater_mushroom: patioHeater,
  gd_fire_table_gas: fireTable,
  gd_bench_wood_15: benchWood,
  gd_bench_stone_14: benchStone,
  gd_outdoor_kitchen_island: kitchenIsland,
  gd_pizza_oven_stand: pizzaOven,
  gd_smoker_barrel: smoker,
  gd_bar_cart: barCart,
  gd_hot_tub_square: hotTubSquare,
  gd_hot_tub_barrel: hotTubBarrel,
  gd_log_store_roof: logStore,
  gd_shed_leanto: leanTo,
  gd_shed_workshop: workshop,
  gd_potting_bench_frame: pottingBench,
};
