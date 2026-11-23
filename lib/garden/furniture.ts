import type { Def, Part } from "../catalog";
import type { Opt } from "../partsKit.ts";
import { b, cy, sp } from "../partsKit.ts";
import { cx, cz, rod, el, ring, range, PI, gd, STEEL, DARK, GREY, OAK, WOOD, WHITE, BLACK, STONE, CREAM, TERRA, GOLD, SAND, RATTAN, TEAK, GLASS } from "./kit.ts";
import { FURNITURE2 } from "./furniture2.ts";

// Garden furniture: dining sets, bistro, lounge sets, daybeds, loungers, parasols (pergola, heaters, kitchens, tubs, sheds: furniture2.ts).
type O = Opt;
// surface classes (tex/rough only: the shapes are unchanged)
const WD: Opt = { tex: "wood", rough: 0.55 }, RT: Opt = { tex: "wood", rough: 0.8, bevel: 0.01 }, MT: Opt = { tex: "metal", metal: 0.85, rough: 0.45 }, FB: Opt = { tex: "fabric", rough: 0.95 };
const ST: Opt = { tex: "stone", rough: 0.4 }, GL: Opt = { rough: 0.05, bevel: 0 }, CR: Opt = { tex: "ceramic", rough: 0.6 }, RB: Opt = { tex: "rubber", rough: 0.9 };

/** Box in a local frame at (x, z) whose +z (the chair back / sofa back) points along (ox, oz): lets one chair or sofa face any of the 4 sides. */
const loc = (x: number, z: number, ox: number, oz: number) => (lx: number, y: number, lz: number, sx: number, sy: number, sz: number, c: string, o?: O): Part =>
  b(x + lx * oz + lz * ox, y, z - lx * ox + lz * oz, ox ? sz : sx, sy, ox ? sx : sz, c, o);

/** Slatted dining chair, back towards (ox, oz). The seat and slats are the recolourable wood. */
const chair = (x: number, z: number, ox: number, oz: number, wood = OAK, leg = DARK): Part[] => {
  const P = loc(x, z, ox, oz);
  return [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => P(sx * 0.17, 0.2, sz * 0.17, 0.03, 0.4, 0.03, leg, MT))),
    P(0, 0.43, 0, 0.42, 0.04, 0.42, wood, { ...WD, bevel: 0.008, m: true }),
    ...[-1, 1].map((s) => P(s * 0.19, 0.67, 0.2, 0.03, 0.46, 0.03, leg, MT)),
    P(0, 0.6, 0.2, 0.35, 0.06, 0.02, wood, { ...WD, bevel: 0.006, m: true }), P(0, 0.75, 0.2, 0.35, 0.06, 0.02, wood, { ...WD, bevel: 0.006, m: true }),
    P(0, 0.465, -0.01, 0.38, 0.03, 0.36, CREAM, { ...FB, bevel: 0.012 }),
  ];
};

const dRound4 = gd("Round dining set, 4 seats 2.0 m", 2.0, 2.0, 0.9, [
  cy(0, 0.74, 0, 1.2, 0.04, OAK, { ...WD, m: true }), cy(0, 0.36, 0, 0.1, 0.7, DARK, MT), cy(0, 0.76, 0, 0.05, 0.012, BLACK, MT),
  b(0, 0.03, 0, 0.8, 0.05, 0.07, DARK, MT), b(0, 0.03, 0, 0.07, 0.05, 0.8, DARK, MT),
  ...([[0, 1], [0, -1], [1, 0], [-1, 0]] as const).flatMap(([ox, oz]) => chair(ox * 0.75, oz * 0.75, ox, oz)),
], { tags: "outdoor patio table chairs round eat meal" });

const dRect6 = gd("Dining set, 6 seats 2.4 m", 2.4, 1.5, 0.9, [
  b(0, 0.74, 0, 1.8, 0.04, 0.9, OAK, { ...WD, m: true }), b(0, 0.68, 0, 1.6, 0.08, 0.7, DARK, MT),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.82, 0.36, sz * 0.38, 0.06, 0.72, 0.06, DARK, MT))),
  ...[-0.45, 0.45].flatMap((x) => [chair(x, -0.53, 0, -1), chair(x, 0.53, 0, 1)].flat()),
  ...chair(-0.98, 0, -1, 0), ...chair(0.98, 0, 1, 0),
], { tags: "outdoor patio table chairs rectangular eat meal family" });

/** Long trestle table with a bench down each side. */
const benchTable = (label: string, len: number, seats: number): Def => {
  const ex = len / 2 - 0.3;
  return gd(label, len, 1.5, 0.85, [
    ...[-1, 0, 1].map((k) => b(0, 0.74, k * 0.265, len, 0.04, 0.255, OAK, { ...WD, m: true })),
    ...[-1, 1].flatMap((sx) => [
      ...[-1, 1].map((sz) => b(sx * ex, 0.36, sz * 0.3, 0.07, 0.72, 0.07, WOOD, WD)),
      ...[-1, 1].map((sz) => b(sx * ex, 0.2, sz * 0.6, 0.06, 0.4, 0.24, WOOD, WD)),
      b(sx * ex, 0.18, 0, 0.06, 0.05, 1.2, WOOD, WD),
    ]),
    ...[-1, 1].map((s) => b(0, 0.42, s * 0.6, len, 0.04, 0.3, OAK, { ...WD, m: true })),
    b(0, 0.3, 0, len - 0.6, 0.05, 0.05, WOOD, WD),
    b(0, 0.765, 0, len - 0.5, 0.006, 0.12, TERRA, { ...FB, bevel: 0 }),
    ...range(seats / 2 - 1).map((i) => cy(-len / 2 + 0.6 + (i * (len - 1.2)) / (seats / 2 - 2 || 1), 0.8, 0, 0.09, 0.08, GOLD, CR)),
  ], { tags: "outdoor patio table benches trestle beer garden party eat meal family" });
};

// ---------- bistro ----------
const bistro = gd("Bistro set, table and 2 chairs", 0.6, 1.3, 0.9, [
  cy(0, 0.7, 0, 0.6, 0.03, "#5f9d94", { ...MT, rough: 0.4, m: true }), cy(0, 0.35, 0, 0.05, 0.7, DARK, MT), cy(0, 0.015, 0, 0.4, 0.03, DARK, MT),
  ...chair(0, -0.42, 0, -1, "#5f9d94", STEEL), ...chair(0, 0.42, 0, 1, "#5f9d94", STEEL),
], { tags: "outdoor patio balcony small cafe table chairs two" });

const stool = (x: number, z: number): Part[] => [
  cy(x, 0.67, z, 0.34, 0.04, TEAK, { ...WD, m: true }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => rod([x + sx * 0.14, 0.0, z + sz * 0.14], [x + sx * 0.1, 0.65, z + sz * 0.1], 0.025, DARK, MT))),
  cy(x, 0.28, z, 0.28, 0.02, DARK, MT),
];
const bistroBar = gd("Bistro high table with 2 stools", 1.24, 0.6, 1.08, [
  cy(0, 1.05, 0, 0.6, 0.03, "#5f9d94", { ...MT, rough: 0.4, m: true }), cy(0, 0.52, 0, 0.06, 1.04, DARK, MT), cy(0, 0.015, 0, 0.42, 0.03, DARK, MT), cy(0, 0.3, 0, 0.3, 0.015, DARK, MT),
  ...stool(-0.45, 0), ...stool(0.45, 0),
], { tags: "outdoor patio balcony bar counter table stools high tall" });

// ---------- lounge ----------
const SOFA = "#d9d2c0", PILL = "#6e8f86";
/** Sofa or armchair (width `len`, 0.8 deep) with `n` seat and back cushions, back towards (ox, oz). Cushions are the recolourable fabric. */
const seater = (x: number, z: number, ox: number, oz: number, len: number, n: number): Part[] => {
  const P = loc(x, z, ox, oz), w = (len - 0.2) / n, xs = range(n).map((i) => -(len - 0.2) / 2 + (i + 0.5) * w);
  return [
    P(0, 0.24, 0, len, 0.2, 0.78, RATTAN, RT),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => P(sx * (len / 2 - 0.05), 0.07, sz * 0.33, 0.06, 0.14, 0.06, DARK, MT))),
    P(0, 0.6, 0.34, len, 0.5, 0.1, RATTAN, RT),
    ...[-1, 1].map((s) => P(s * (len / 2 - 0.05), 0.5, -0.02, 0.1, 0.28, 0.74, RATTAN, RT)),
    ...xs.map((cx_) => P(cx_, 0.41, -0.05, w - 0.02, 0.14, 0.62, SOFA, { ...FB, bevel: 0.04, m: true })),
    ...xs.map((cx_) => P(cx_, 0.63, 0.22, w - 0.04, 0.36, 0.12, SOFA, { ...FB, bevel: 0.04, m: true })),
  ];
};

const loungeCorner = (() => {
  const seat = (x: number, z: number, sx: number, sz: number) => b(x, 0.41, z, sx, 0.14, sz, SOFA, { ...FB, bevel: 0.04, m: true });
  const bk = (x: number, z: number, sx: number, sz: number, r: [number, number, number]) => b(x, 0.7, z, sx, 0.36, sz, SOFA, { ...FB, bevel: 0.04, m: true, r });
  return gd("Lounge corner set 2.6 x 2.6 m", 2.6, 2.6, 0.9, [
    b(0, 0.22, -0.9, 2.6, 0.24, 0.8, RATTAN, RT), b(-0.9, 0.22, 0.4, 0.8, 0.24, 1.8, RATTAN, RT),
    b(0, 0.55, -1.22, 2.6, 0.42, 0.16, RATTAN, RT), b(-1.22, 0.55, 0.08, 0.16, 0.42, 2.44, RATTAN, RT),
    b(1.22, 0.5, -0.9, 0.16, 0.3, 0.8, RATTAN, RT), b(-0.9, 0.5, 1.22, 0.8, 0.3, 0.16, RATTAN, RT),
    ...([[-1.26, -1.26], [1.26, -1.26], [1.26, -0.54], [-0.54, -0.54], [-0.54, 1.26], [-1.26, 1.26]] as const).map(([x, z]) => b(x, 0.05, z, 0.07, 0.1, 0.07, DARK, MT)),
    seat(-0.82, -0.82, 0.64, 0.64), seat(-0.09, -0.82, 0.8, 0.64), seat(0.73, -0.82, 0.8, 0.64), seat(-0.82, -0.09, 0.64, 0.8), seat(-0.82, 0.73, 0.64, 0.8),
    bk(-0.82, -1.07, 0.64, 0.12, [-0.15, 0, 0]), bk(-0.09, -1.07, 0.8, 0.12, [-0.15, 0, 0]), bk(0.73, -1.07, 0.8, 0.12, [-0.15, 0, 0]),
    bk(-1.07, -0.09, 0.12, 0.8, [0, 0, 0.15]), bk(-1.07, 0.73, 0.12, 0.8, [0, 0, 0.15]),
    b(0.4, 0.62, -0.95, 0.3, 0.3, 0.1, TERRA, { ...FB, bevel: 0.04, r: [-0.3, 0, 0] }), b(-0.8, 0.62, 0.9, 0.1, 0.3, 0.3, PILL, { ...FB, bevel: 0.04, r: [0, 0, 0.3] }), b(1.0, 0.62, -0.95, 0.3, 0.3, 0.1, GOLD, { ...FB, bevel: 0.04, r: [-0.3, 0, 0] }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(0.45 + sx * 0.4, 0.17, 0.5 + sz * 0.4, 0.05, 0.34, 0.05, RATTAN, RT))),
    b(0.45, 0.35, 0.5, 0.95, 0.04, 0.95, RATTAN, RT), b(0.45, 0.375, 0.5, 0.88, 0.012, 0.88, GLASS, GL), b(0.45, 0.14, 0.5, 0.8, 0.025, 0.8, RATTAN, RT),
  ], { tags: "outdoor patio modular sofa l-shaped sectional rattan garden lounge" });
})();

const loungeSofaSet = gd("Lounge set: 2-seat sofa, 2 armchairs, table", 2.8, 1.8, 0.9, [
  b(0, 0.01, 0.1, 2.4, 0.02, 1.4, "#cfc6b0", { ...FB, bevel: 0.008 }),
  ...seater(0, -0.5, 0, -1, 1.6, 2), ...seater(-1.0, 0.2, -1, 0, 0.75, 1), ...seater(1.0, 0.2, 1, 0, 0.75, 1),
  ...[-0.45, 0.45].map((x) => b(x, 0.62, -0.6, 0.28, 0.28, 0.08, x < 0 ? TERRA : PILL, { ...FB, bevel: 0.035, r: [-0.25, 0, 0] })),
  b(0, 0.33, 0.4, 1.0, 0.04, 0.6, RATTAN, RT), b(0, 0.355, 0.4, 0.94, 0.012, 0.54, GLASS, GL),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.45, 0.155, 0.4 + sz * 0.25, 0.05, 0.31, 0.05, RATTAN, RT))),
  cy(0.2, 0.4, 0.4, 0.1, 0.07, TERRA, CR), cy(-0.2, 0.39, 0.4, 0.14, 0.05, WHITE, CR),
], { tags: "outdoor patio sofa armchairs rattan garden lounge conversation set rug" });

// ---------- daybeds ----------
const daybed = gd("Daybed with canopy 2.2 x 1.4 m", 2.2, 1.4, 2.1, [
  b(0, 0.25, 0, 2.0, 0.2, 1.2, RATTAN, RT), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.95, 0.07, sz * 0.55, 0.08, 0.14, 0.08, DARK, MT))),
  ...[-1, 1].map((s) => b(0, 0.25, s * 0.605, 1.9, 0.04, 0.01, TEAK, WD)),
  b(0, 0.42, 0.0, 1.9, 0.14, 1.1, SOFA, { ...FB, bevel: 0.04, m: true }),
  ...[-0.62, 0, 0.62].map((x) => b(x, 0.68, -0.42, 0.58, 0.4, 0.14, SAND, { ...FB, bevel: 0.05, r: [-0.2, 0, 0] })),
  ...[-1, 1].map((s) => cz(s * 0.88, 0.57, 0.1, 0.2, 0.8, SOFA, { ...FB, m: true })),
  b(0.3, 0.57, 0.2, 0.3, 0.3, 0.1, TERRA, { ...FB, bevel: 0.04, r: [-0.3, 0, 0] }), b(-0.3, 0.57, 0.2, 0.3, 0.3, 0.1, "#6e8f86", { ...FB, bevel: 0.04, r: [-0.3, 0, 0] }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 1.05, 1.0, sz * 0.65, 0.07, 2.0, 0.07, TEAK, WD))),
  ...[-1, 1].map((s) => b(0, 2.0, s * 0.65, 2.1, 0.07, 0.07, TEAK, WD)), ...[-1, 1].map((s) => b(s * 1.05, 2.0, 0, 0.07, 0.07, 1.3, TEAK, WD)),
  b(0, 2.04, 0, 2.2, 0.03, 1.4, SOFA, { ...FB, m: true }),
  ...[-1, 1].map((s) => b(0, 1.95, s * 0.69, 2.2, 0.14, 0.02, SOFA, { ...FB, m: true })),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.98, 1.25, sz * 0.63, 0.2, 1.5, 0.03, WHITE, FB))),
], { tags: "outdoor patio sun bed rattan gazebo relax lounge" });

const daybedRound = (() => {
  const back = range(9).map((i) => {
    const a = PI + ((i + 0.5) / 9) * PI;
    return b(0.9 * Math.cos(a), 0.62, 0.9 * Math.sin(a), 0.34, 0.5, 0.14, RATTAN, { ...RT, r: [0, Math.atan2(-Math.cos(a), -Math.sin(a)), 0] });
  });
  const pillows = [-0.55, 0, 0.55].map((x, i) => b(x, 0.68, -0.7 + Math.abs(x) * 0.3, 0.4, 0.3, 0.12, i === 1 ? SAND : "#6e8f86", { ...FB, bevel: 0.05, r: [-0.25, 0, 0] }));
  return gd("Round daybed with canopy hood 2.0 m", 2.0, 2.0, 2.2, [
    cy(0, 0.22, 0, 1.9, 0.24, RATTAN, RT), cy(0, 0.22, 0, 1.94, 0.03, TEAK, WD), cy(0, 0.1, 0, 1.4, 0.06, DARK, MT),
    ...ring(6, 0.7, (x, z) => cy(x, 0.05, z, 0.12, 0.1, DARK, MT)),
    cy(0, 0.41, 0, 1.7, 0.16, SOFA, { ...FB, m: true }), ...back, ...pillows,
    cy(0, 0.9, -0.85, 0.07, 1.2, TEAK, WD), ...[-1, 1].map((s) => rod([s * 0.75, 0.9, -0.5], [s * 0.7, 1.45, -0.7], 0.04, TEAK, WD)),
    el(0, 1.65, -0.05, 1.9, 1.0, 1.9, SOFA, { ...FB, m: true }),
    ...ring(10, 0.62, (x, z) => sp(x * 1.4, 1.22, z * 0.9 - 0.05, 0.07, TERRA, FB), PI),
  ], { tags: "outdoor patio sun bed rattan round circular hooded relax lounge" });
})();

// ---------- loungers ----------
const lounger = (x: number): Part[] => {
  const a = 0.8, L = 0.95, zh = -0.3, yh = 0.4;
  return [
    ...[-1, 1].map((s) => b(x + s * 0.29, 0.3, 0.33, 0.04, 0.04, 1.3, STEEL, MT)),
    ...[-1, 1].flatMap((s) => [b(x + s * 0.29, 0.15, 0.9, 0.04, 0.3, 0.04, STEEL, MT), b(x + s * 0.29, 0.15, -0.25, 0.04, 0.3, 0.04, STEEL, MT), cx(x + s * 0.31, 0.04, 0.92, 0.08, 0.03, BLACK, RB), rod([x + s * 0.29, yh - 0.05, zh], [x + s * 0.29, yh - 0.05 + L * Math.sin(a), zh - L * Math.cos(a)], 0.04, STEEL, MT)]),
    b(x, 0.36, 0.33, 0.58, 0.07, 1.3, SOFA, { ...FB, bevel: 0.03, m: true }),
    b(x, yh + (L / 2) * Math.sin(a), zh - (L / 2) * Math.cos(a), 0.58, 0.07, L, SOFA, { ...FB, bevel: 0.03, m: true, r: [a, 0, 0] }),
    b(x, 0.41, 0.78, 0.5, 0.03, 0.3, WHITE, { ...FB, bevel: 0.012 }),
  ];
};
const loungerPair = gd("Sun loungers, pair with side table 1.9 m", 1.9, 2.0, 1.12, [
  ...lounger(-0.62), ...lounger(0.62),
  cy(0, 0.3, 0, 0.42, 0.03, TEAK, { ...WD, m: true }), cy(0, 0.15, 0, 0.05, 0.3, DARK, MT), cy(0, 0.015, 0, 0.3, 0.03, DARK, MT),
  cy(0.05, 0.36, 0.02, 0.07, 0.1, GLASS, GL), cy(-0.08, 0.35, -0.05, 0.1, 0.08, TERRA, CR),
], { tags: "outdoor patio sunbed pool sunbathing deck chairs two" });

const loungerRattan = gd("Rattan lounger with canopy 1.0 x 2.0 m", 1.0, 2.0, 1.8, [
  b(0, 0.22, 0.05, 0.9, 0.22, 1.8, RATTAN, RT), b(0, 0.22, 0.05, 0.92, 0.03, 1.82, TEAK, WD),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.4, 0.055, 0.05 + sz * 0.8, 0.07, 0.11, 0.07, DARK, MT))),
  b(0, 0.4, 0.2, 0.8, 0.12, 1.4, SOFA, { ...FB, bevel: 0.04, m: true }),
  b(0, 0.66, -0.71, 0.84, 0.05, 0.6, RATTAN, { ...RT, r: [0.8, 0, 0] }), b(0, 0.7, -0.72, 0.78, 0.12, 0.58, SOFA, { ...FB, bevel: 0.04, m: true, r: [0.8, 0, 0] }),
  b(0, 0.56, 0.78, 0.5, 0.2, 0.16, SAND, { ...FB, bevel: 0.05, r: [0.3, 0, 0] }),
  ...[-1, 1].map((s) => b(s * 0.47, 0.88, -0.9, 0.06, 1.75, 0.06, TEAK, WD)), ...[-1, 1].map((s) => b(s * 0.47, 0.72, -0.05, 0.06, 1.45, 0.06, TEAK, WD)),
  ...[-1, 1].map((s) => rod([s * 0.47, 1.74, -0.9], [s * 0.47, 1.44, -0.05], 0.05, TEAK, WD)),
  b(0, 1.62, -0.475, 1.0, 0.04, 0.9, SOFA, { ...FB, m: true, r: [0.34, 0, 0] }),
  b(0, 1.4, -0.04, 1.0, 0.1, 0.02, SOFA, { ...FB, m: true }),
  ...[-1, 1].map((s) => b(s * 0.46, 1.0, -0.88, 0.02, 1.0, 0.18, WHITE, FB)),
], { tags: "outdoor patio sunbed rattan hooded shade relax lounge" });

// ---------- parasols ----------
const parasolSquare = gd("Square parasol 2.5 m", 2.5, 2.5, 2.65, [
  b(0, 0.04, 0, 0.8, 0.08, 0.8, STONE, { ...ST, bevel: 0.01 }), cy(0, 1.2, 0, 0.05, 2.2, STEEL, MT), cy(0.04, 1.0, 0, 0.03, 0.06, STEEL, MT),
  ...[2.5, 2.0, 1.5, 1.0, 0.5].map((s, i) => b(0, 2.28 + i * 0.07, 0, s, 0.06, s, CREAM, { ...FB, m: true })),
  ...[-1, 1].map((s) => b(0, 2.22, s * 1.23, 2.5, 0.1, 0.03, CREAM, { ...FB, m: true })), ...[-1, 1].map((s) => b(s * 1.23, 2.22, 0, 0.03, 0.1, 2.5, CREAM, { ...FB, m: true })),
  ...[0, PI / 2].map((a) => b(0, 2.2, 0, 2.4, 0.02, 0.03, STEEL, { ...MT, r: [0, a, 0] })),
  sp(0, 2.6, 0, 0.07, STEEL, MT),
], { tags: "outdoor patio shade sun umbrella square" });

const parasolCantilever = (() => {
  const X = -1.35, HX = 0.3;
  return gd("Cantilever parasol 3 m", 3.6, 3.0, 2.8, [
    b(X, 0.04, 0, 0.9, 0.08, 0.9, GREY, { ...ST, bevel: 0.01 }), b(X, 0.1, 0, 0.9, 0.04, 0.14, DARK, MT), b(X, 0.1, 0, 0.14, 0.04, 0.9, DARK, MT),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(X + sx * 0.28, 0.17, sz * 0.28, 0.3, 0.14, STONE, ST))),
    cy(X, 1.42, 0, 0.09, 2.7, DARK, MT), rod([X, 2.76, 0], [HX, 2.66, 0], 0.07, DARK, MT), sp(HX, 2.63, 0, 0.1, STEEL, MT), cy(HX, 2.5, 0, 0.05, 0.3, STEEL, MT),
    cx(X + 0.1, 1.2, 0.05, 0.05, 0.1, STEEL, MT),
    ...[3.0, 2.4, 1.8, 1.2, 0.6].map((s, i) => b(HX, 2.3 + i * 0.075, 0, s, 0.06, s, SAND, { ...FB, m: true })),
    ...[-1, 1].map((s) => b(HX, 2.25, s * 1.47, 3.0, 0.1, 0.03, SAND, { ...FB, m: true })), ...[-1, 1].map((s) => b(HX + s * 1.47, 2.25, 0, 0.03, 0.1, 3.0, SAND, { ...FB, m: true })),
  ], { tags: "outdoor patio shade sun umbrella side arm offset hanging large" });
})();

const parasolRound = gd("Big round parasol 3.2 m", 3.2, 3.2, 2.7, [
  cy(0, 0.05, 0, 0.7, 0.1, STONE, ST), cy(0, 1.2, 0, 0.07, 2.4, STEEL, MT),
  ...[3.2, 2.7, 2.2, 1.7, 1.2, 0.7].map((dia, i) => cy(0, 2.3 + i * 0.06, 0, dia, 0.06, CREAM, { ...FB, m: true })),
  ...ring(8, 1.45, (x, z) => rod([0, 2.28, 0], [x, 2.2, z], 0.025, STEEL, MT)),
  ...ring(20, 1.58, (x, z) => sp(x, 2.27, z, 0.1, CREAM, { ...FB, m: true })),
  sp(0, 2.68, 0, 0.07, STEEL, MT),
], { tags: "outdoor patio shade sun umbrella circular large" });

const BASE: Record<string, Def> = {
  gd_dining_round_4: dRound4,
  gd_dining_rect_6: dRect6,
  gd_dining_bench_8: benchTable("Long table with 2 benches, 8 seats 2.4 m", 2.4, 8),
  gd_dining_bench_6: benchTable("Table with 2 benches, 6 seats 1.8 m", 1.8, 6),
  gd_bistro_set: bistro,
  gd_bistro_bar_set: bistroBar,
  gd_lounge_corner: loungeCorner,
  gd_lounge_sofa_set: loungeSofaSet,
  gd_daybed_canopy: daybed,
  gd_daybed_round: daybedRound,
  gd_lounger_pair: loungerPair,
  gd_lounger_rattan_canopy: loungerRattan,
  gd_parasol_square_25: parasolSquare,
  gd_parasol_cantilever_3: parasolCantilever,
  gd_parasol_round_32: parasolRound,
};

export const FURNITURE: Record<string, Def> = { ...BASE, ...FURNITURE2 };

