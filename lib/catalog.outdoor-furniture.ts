import type { Def, Part } from "./catalog";
import { b, cy, sp, turned, taperedLeg, cushion, pillow, seam, drawerFront, WOOD, MATT, STONE, STEEL, CHROME, BLACK_METAL, PLASTIC, RUBBER, FAB } from "./partsKit.ts";
import {
  WATER, RED, GOLD, CREAM, ROOFC, FELT, SAND, ROPE, PINK, POST, TILE, SOILM, LEAFM, WATERM, GLASSM, SOIL,
  WHITE, BLACK, DARK, GREY, LGREY, OAK, DECK, TRUNK, C_STEEL, C_WOOD, C_STONE,
  def, el, ring, radial, cx, cz, rod, pipe, gable, gend,
} from "./catalog.outdoor-kit.ts";

// Outdoor furniture, grills, play equipment and garden utilities (the structures, plants and lights are in catalog.outdoor.ts).
const ENAMEL = { tex: "metal", metal: 0.3, rough: 0.3 } as const; // porcelain-enamel grill bowl
const HAM = "#d89b4a";

// ---------- cooking ----------
const grillKettle = def("Round BBQ grill 0.7 m", 0.7, 0.7, 1.06, [
  ...[Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 + 4.189].map((a) => pipe([0.12 * Math.cos(a), 0.58, 0.12 * Math.sin(a)], [0.27 * Math.cos(a), 0.03, 0.27 * Math.sin(a)], 0.03, C_STEEL, STEEL)),
  cy(0, 0.5, 0, 0.2, 0.05, C_STEEL, STEEL),
  turned(0, 0.54, 0, [[0.07, 0], [0.17, 0.03], [0.25, 0.1], [0.29, 0.2], [0.29, 0.28]], BLACK, { ...ENAMEL, m: true }),
  cy(0, 0.82, 0, 0.6, 0.035, C_STEEL, STEEL),
  turned(0, 0.82, 0, [[0.29, 0], [0.28, 0.04], [0.24, 0.12], [0.15, 0.19], [0.04, 0.21]], BLACK, { ...ENAMEL, m: true }),
  b(0, 0.9, 0.32, 0.22, 0.04, 0.06, C_WOOD, { ...WOOD, bevel: 0.015 }), sp(0, 1.03, 0, 0.06, C_STEEL, CHROME), cy(-0.12, 1.03, 0.0, 0.04, 0.02, C_STEEL, STEEL),
  ...[-1, 1].map((s) => b(s * 0.09, 0.9, 0.29, 0.015, 0.015, 0.06, C_STEEL, { ...CHROME, bevel: 0.003, detail: 1 })), // handle brackets
  cz(0, 0.985, 0.185, 0.045, 0.012, CREAM, { ...PLASTIC, detail: 2 }), // thermometer
  b(0.1, 0.66, 0.2, 0.08, 0.02, 0.03, DARK, { ...BLACK_METAL, bevel: 0.004, detail: 1 }), // vent slider
]);
const grillGas = def("Gas BBQ grill 1.7 m", 1.7, 0.6, 1.25, [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.42, 0.11, sz * 0.2, 0.04, 0.22, 0.04, C_STEEL, { ...STEEL, bevel: 0.008 }))),
  cx(-0.47, 0.07, -0.2, 0.14, 0.03, BLACK, RUBBER), cx(0.47, 0.07, -0.2, 0.14, 0.03, BLACK, RUBBER),
  b(0, 0.47, 0, 0.9, 0.5, 0.5, DARK, { ...BLACK_METAL, bevel: 0.008, m: true }),
  ...[-0.22, 0.22].flatMap((x) => drawerFront(x, 0.47, 0.249, 0.404, 0.424, GREY, { ...BLACK_METAL, thick: 0.012, bevel: 0.006 })),
  b(-0.05, 0.55, 0.272, 0.02, 0.12, 0.02, C_STEEL, { ...STEEL, bevel: 0.006 }), b(0.05, 0.55, 0.272, 0.02, 0.12, 0.02, C_STEEL, { ...STEEL, bevel: 0.006 }),
  b(0, 0.76, 0.0, 0.92, 0.04, 0.54, C_STEEL, { ...STEEL, bevel: 0.01 }),
  ...[-0.3, -0.1, 0.1, 0.3].map((x) => sp(x, 0.7, 0.27, 0.06, BLACK, PLASTIC)),
  b(0, 0.84, 0, 0.92, 0.12, 0.5, BLACK, { ...BLACK_METAL, bevel: 0.01 }),
  b(0, 1.0, 0, 0.94, 0.17, 0.5, C_STEEL, { ...STEEL, bevel: 0.014, m: true }),
  cx(0, 1.04, 0.27, 0.025, 0.6, C_STEEL, STEEL), b(-0.28, 1.04, 0.255, 0.025, 0.025, 0.05, C_STEEL, { ...STEEL, bevel: 0.006 }), b(0.28, 1.04, 0.255, 0.025, 0.025, 0.05, C_STEEL, { ...STEEL, bevel: 0.006 }),
  cz(0, 1.0, 0.255, 0.07, 0.012, WHITE, PLASTIC), cy(0.3, 1.15, -0.1, 0.06, 0.12, C_STEEL, STEEL),
  b(-0.7, 0.78, 0, 0.28, 0.03, 0.46, C_STEEL, { ...STEEL, bevel: 0.008 }), b(0.7, 0.78, 0, 0.28, 0.06, 0.46, DARK, { ...BLACK_METAL, bevel: 0.01 }), cy(0.7, 0.82, 0, 0.2, 0.02, BLACK, BLACK_METAL),
  ...[-0.7, 0.7].map((x) => cy(x, 0.38, 0.2, 0.03, 0.76, C_STEEL, STEEL)),
  ...[-0.06, 0, 0.06].map((x) => b(0.7 + x, 0.835, 0, 0.01, 0.01, 0.2, DARK, { ...BLACK_METAL, bevel: 0, detail: 1 })), // side-burner grate
  ...[-1, 1].map((s) => cx(s * 0.47, 0.07, -0.2, 0.05, 0.036, C_STEEL, { ...CHROME, detail: 2 })), // wheel hubs
  ...[-0.3, -0.1, 0.1, 0.3].map((x) => b(x, 0.7, 0.3, 0.006, 0.02, 0.004, WHITE, { ...PLASTIC, bevel: 0, detail: 2 })), // knob pointers
  b(0, 0.66, 0.262, 0.7, 0.04, 0.008, DARK, { ...BLACK_METAL, bevel: 0.002, detail: 1 }), // control panel
  ...[-0.55, -0.45, -0.35].map((x) => cy(x, 0.797, 0.15, 0.012, 0.02, C_STEEL, { ...CHROME, detail: 2 })), // tool hooks
]);

// ---------- table sets, lounger, parasol ----------
const chair = (x: number, z: number, out: 1 | -1): Part[] => {
  const th = 0.06, ly = (y: number) => 0.43 + (y - 0.43) * Math.cos(th), lz = (y: number) => out * (y - 0.43) * Math.sin(th), zb = z + out * 0.145, tilt: [number, number, number] = [out * th, 0, 0];
  return [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(x + sx * 0.15, z + sz * 0.14, 0.41, 0.032, 0.022, DARK, BLACK_METAL))),
    cushion(x, 0.43, z, 0.38, 0.045, 0.36, CREAM, { bevel: 0.015 }),
    ...[-1, 1].map((s) => cy(x + s * 0.17, ly(0.65), zb + lz(0.65), 0.025, 0.44, DARK, { ...BLACK_METAL, r: tilt })),
    b(x, ly(0.66), zb + lz(0.66), 0.32, 0.34, 0.03, CREAM, { ...FAB, bevel: 0.012, r: tilt }),
    b(x, ly(0.87), zb + lz(0.87), 0.38, 0.04, 0.03, DARK, { ...BLACK_METAL, bevel: 0.012 }), // un-tilted so the silhouette extent stays
    b(x, 0.395, z, 0.34, 0.03, 0.32, DARK, { ...BLACK_METAL, detail: 1 }), // seat frame
  ];
};
const tableSet = (label: string, w: number, d: number, n: number): Def => {
  const zc = d / 2 - 0.19, xs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * (n === 2 ? 0.6 : 0.65)), td = 0.62, pw = td / 4;
  return def(label, w, d, 0.92, [
    ...Array.from({ length: 4 }, (_, i) => b(0, 0.73, -td / 2 + pw * (i + 0.5), w, 0.04, pw - 0.004, OAK, { ...WOOD, bevel: 0.004, m: true })),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * (w / 2 - 0.06), sz * 0.24, 0.71, 0.05, 0.035, DARK, BLACK_METAL))),
    ...xs.flatMap((x) => [chair(x, -zc, -1), chair(x, zc, 1)].flat()),
    ...[-1, 1].map((s) => b(0, 0.69, s * 0.24, w - 0.14, 0.04, 0.02, DARK, { ...BLACK_METAL, detail: 1 })),
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.06), 0.69, 0, 0.02, 0.04, 0.46, DARK, { ...BLACK_METAL, detail: 1 })),
  ]);
};

const lounger = (() => {
  const a = 0.8, L = 0.95, zh = -0.3, yh = 0.4, dY = Math.sin(a), dZ = -Math.cos(a), nY = Math.cos(a), nZ = Math.sin(a);
  const cyH = yh + (L / 2) * dY, czH = zh + (L / 2) * dZ, t = L / 2 - 0.17;
  return def("Sun lounger", 0.65, 2.0, 1.12, [
    ...[-1, 1].map((s) => cz(s * 0.29, 0.3, 0.33, 0.04, 1.3, C_STEEL, STEEL)),
    ...[-1, 1].flatMap((s) => [
      cy(s * 0.29, 0.15, 0.9, 0.04, 0.3, C_STEEL, STEEL), cy(s * 0.29, 0.15, -0.25, 0.04, 0.3, C_STEEL, STEEL), cx(s * 0.31, 0.04, 0.92, 0.08, 0.03, BLACK, RUBBER),
      pipe([s * 0.29, yh - 0.05, zh], [s * 0.29, yh - 0.05 + L * dY, zh + L * dZ], 0.04, C_STEEL, STEEL),
    ]),
    b(0, 0.36, 0.33, 0.58, 0.07, 1.3, CREAM, { ...FAB, m: true, bevel: 0.03 }),
    b(0, cyH, czH, 0.58, 0.07, L, CREAM, { ...FAB, m: true, bevel: 0.03, r: [a, 0, 0] }),
    pillow(0, cyH + t * dY + 0.085 * nY, czH + t * dZ + 0.085 * nZ, 0.4, 0.1, 0.24, "#f4efe2", { r: [a, 0, 0] }),
    ...[-0.05, 0.33, 0.7].map((z) => seam(0, 0.3955, z, 0.56, 0.002, 0.006, "#c9b895")),
    ...[-1, 1].map((s) => cx(s * 0.31, 0.04, 0.92, 0.036, 0.04, C_STEEL, { ...CHROME, detail: 2 })),
    ...[-1, 1].map((s) => b(s * 0.29, 0.41, 0.98, 0.04, 0.012, 0.06, DARK, { ...RUBBER, bevel: 0.004, detail: 1 })), // end caps
  ]);
})();
const parasol = def("Garden parasol 2.5 m", 2.5, 2.5, 2.65, [
  turned(0, 0, 0, [[0.2, 0], [0.275, 0.02], [0.275, 0.07], [0.22, 0.1]], C_STONE, STONE), cy(0, 1.2, 0, 0.05, 2.2, C_STEEL, STEEL),
  turned(0, 2.25, 0, [[1.25, 0], [1.2, 0.03], [1.0, 0.1], [0.7, 0.18], [0.4, 0.25], [0.15, 0.3], [0.06, 0.31]], CREAM, { ...FAB, m: true }),
  cy(0, 2.2, 0, 2.5, 0.05, WHITE, FAB), sp(0, 2.6, 0, 0.07, C_STEEL, CHROME),
  ...ring(8, 0.62, (_x, _z, a) => pipe([0.05 * Math.cos(a), 2.165, 0.05 * Math.sin(a)], [1.2 * Math.cos(a), 2.165, 1.2 * Math.sin(a)], 0.02, C_STEEL, { ...STEEL, detail: 1 })), // ribs
  cy(0, 2.1, 0, 0.08, 0.06, C_STEEL, { ...CHROME, detail: 1 }), cy(0, 1.3, 0, 0.07, 0.1, DARK, { ...PLASTIC, detail: 2 }), // runner, crank
]);
const hammock = (() => {
  const A = 0.574, Lc = 1.107, o = { ...FAB, m: true as const, bevel: 0.025 };
  return def("Hammock with stand", 3.4, 1.0, 1.35, [
    ...[-1, 1].flatMap((s) => [...[-1, 1].map((t) => pipe([s * 1.5, 0.03, t * 0.42], [s * 1.62, 1.25, 0], 0.06, C_STEEL, STEEL)), b(s * 1.5, 0.04, 0, 0.05, 0.05, 0.84, C_STEEL, { ...STEEL, bevel: 0.02 }), sp(s * 1.62, 1.25, 0, 0.08, C_STEEL, CHROME)]),
    b(0, 0.56, 0, 1.3, 0.06, 0.7, HAM, o),
    b(-1.115, 0.9, 0, Lc, 0.06, 0.66, HAM, { ...o, r: [0, 0, -A] }), b(1.115, 0.9, 0, Lc, 0.06, 0.66, HAM, { ...o, r: [0, 0, A] }),
    pillow(-0.5, 0.64, 0, 0.4, 0.1, 0.4, CREAM),
    ...[-0.5, -0.25, 0, 0.25, 0.5].map((x) => seam(x, 0.592, 0, 0.04, 0.003, 0.68, "#a8722f")),
    ...[-1, 1].flatMap((s) => [-1, 1].map((t) => pipe([s * 1.58, 1.2, t * 0.3], [s * 1.62, 1.25, 0], 0.015, ROPE, { ...FAB, detail: 1 }))),
  ]);
})();
const swingSet = def("Swing set 3 m", 3.0, 1.7, 2.05, [
  ...[-1, 1].flatMap((s) => [
    pipe([s * 1.3, 0.03, -0.75], [s * 1.3, 1.9, -0.05], 0.09, C_WOOD, { ...WOOD, m: true }), pipe([s * 1.3, 0.03, 0.75], [s * 1.3, 1.9, 0.05], 0.09, C_WOOD, { ...WOOD, m: true }),
    b(s * 1.3, 0.5, 0, 0.06, 0.05, 1.05, C_WOOD, { ...WOOD, m: true, bevel: 0.012 }),
  ]),
  cx(0, 1.95, 0, 0.1, 2.9, C_WOOD, { ...WOOD, m: true }),
  ...[[-0.5, RED], [0.5, "#4a6b8a"]].flatMap(([x, c]) => [
    cy(+x - 0.2, 1.15, 0, 0.014, 1.5, FELT, BLACK_METAL), cy(+x + 0.2, 1.15, 0, 0.014, 1.5, FELT, BLACK_METAL), b(+x, 0.4, 0, 0.5, 0.04, 0.2, String(c), { ...RUBBER, bevel: 0.016 }),
    sp(+x - 0.2, 1.9, 0, 0.04, DARK, { ...BLACK_METAL, detail: 1 }), sp(+x + 0.2, 1.9, 0, 0.04, DARK, { ...BLACK_METAL, detail: 1 }),
  ]),
  ...[-1, 1].flatMap((s) => [-1, 1].map((t) => cy(s * 1.3, 0.02, t * 0.75, 0.12, 0.04, DARK, { ...BLACK_METAL, detail: 1 }))), // ground plates
]);
const trampoline = def("Trampoline 3 m", 3, 3, 2.4, [
  ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => cy(sx * 0.95, 0.43, sz * 0.95, 0.07, 0.86, C_STEEL, STEEL)),
  cy(0, 0.83, 0, 2.8, 0.06, GREY, BLACK_METAL),
  turned(0, 0.87, 0, [[1.46, 0], [1.5, 0.02], [1.5, 0.06], [1.46, 0.08], [1.3, 0.08]], "#2f6f9f", { ...PLASTIC, rough: 0.7, m: true }),
  cy(0, 0.945, 0, 2.6, 0.03, BLACK, { ...FAB, rough: 0.9 }),
  ...ring(8, 1.4, (x, z) => cy(x, 1.65, z, 0.035, 1.5, C_STEEL, STEEL)),
  ...ring(8, 1.4, (x, z, a) => pipe([x, 2.38, z], [1.4 * Math.cos(a + Math.PI / 4), 2.38, 1.4 * Math.sin(a + Math.PI / 4)], 0.03, C_STEEL, STEEL)),
  ...ring(24, 1.4, (x, z) => b(x, 1.65, z, 0.01, 1.5, 0.01, "#2a2c30", { ...FAB, bevel: 0 })),
  ...ring(8, 1.4, (x, z) => cy(x, 1.1, z, 0.07, 0.5, "#2f6f9f", { ...PLASTIC, rough: 0.7, detail: 1 })), // pole foam
  ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => cy(sx * 0.95, 0.01, sz * 0.95, 0.1, 0.02, BLACK, { ...RUBBER, detail: 1 })), // feet
]);
const playhouse = def("Wooden playhouse 1.3 x 1.2 m", 1.3, 1.2, 1.65, [
  b(0, 0.04, 0, 1.3, 0.08, 1.2, DECK, { ...WOOD, bevel: 0.008 }),
  b(0, 0.58, -0.05, 1.1, 1.0, 0.9, OAK, { ...WOOD, m: true }),
  ...gable(1.3, 1.2, 1.1, 0.42, ROOFC, { ...TILE, bevel: 0.008 }),
  ...gend(1.3, 1.08, 0.4, 0.4, OAK, 3, 0.04, WOOD), ...gend(1.3, 1.08, 0.4, -0.5, OAK, 3, 0.04, WOOD),
  b(-0.2, 0.5, 0.405, 0.34, 0.8, 0.02, POST, { ...WOOD, bevel: 0.006 }), sp(-0.08, 0.5, 0.425, 0.04, GOLD, { tex: "metal", metal: 1, rough: 0.3 }),
  b(0.28, 0.7, 0.405, 0.34, 0.34, 0.012, WHITE, { ...MATT, bevel: 0.004 }), b(0.28, 0.7, 0.412, 0.28, 0.28, 0.012, "#8fb0c8", GLASSM),
  b(0.28, 0.5, 0.44, 0.36, 0.08, 0.07, C_WOOD, { ...WOOD, bevel: 0.006 }), sp(0.2, 0.57, 0.44, 0.08, RED, LEAFM), sp(0.32, 0.57, 0.44, 0.08, GOLD, LEAFM), sp(0.38, 0.56, 0.44, 0.07, PINK, LEAFM),
  b(0.557, 0.7, -0.05, 0.015, 0.3, 0.3, "#8fb0c8", GLASSM),
  b(-0.2, 0.03, 0.54, 0.4, 0.05, 0.12, C_STONE, { ...STONE, bevel: 0.008 }),
  ...[-1, 1].map((s) => b(0.28 + s * 0.215, 0.7, 0.41, 0.08, 0.34, 0.012, "#4a8a5a", { ...WOOD, bevel: 0.003, detail: 1 })), // shutters
  b(0.28, 0.7, 0.42, 0.28, 0.012, 0.008, WHITE, { ...MATT, bevel: 0, detail: 1 }), b(0.28, 0.7, 0.42, 0.012, 0.28, 0.008, WHITE, { ...MATT, bevel: 0, detail: 1 }),
  b(0, 1.545, 0, 0.1, 0.03, 1.2, ROOFC, { ...TILE, bevel: 0.006, detail: 1 }), // ridge cap
  ...[0.28, 0.12].map((x) => seam(-0.2 + (x - 0.2), 0.5, 0.4175, 0.004, 0.76, 0.004, "#3a2a20")), // door planks
  ...[-0.46, -0.22, 0.02, 0.26, 0.5].map((x) => seam(x, 0.35, -0.5, 0.004, 0.6, 0.004, "#8e7248")), // back wall planks
  rod([-0.3, 0.82, 0.418], [-0.1, 0.18, 0.418], 0.03, "#5a3f2d", { ...WOOD, bevel: 0, detail: 1 }), // door brace
  sp(0.4, 0.62, 0.45, 0.025, GOLD, { ...LEAFM, detail: 2 }),
]);
const picnicTable = def("Picnic table 1.8 m", 1.8, 1.5, 0.8, [
  ...[-0.24, 0, 0.24].map((z) => b(0, 0.76, z, 1.8, 0.04, 0.22, OAK, { ...WOOD, bevel: 0.006, m: true })),
  ...[-1, 1].map((s) => b(0, 0.45, s * 0.6, 1.8, 0.04, 0.27, OAK, { ...WOOD, bevel: 0.006, m: true })),
  ...[-0.6, 0.6].flatMap((x) => [
    rod([x, 0.03, -0.68], [x, 0.72, -0.1], 0.07, C_WOOD, { ...WOOD, bevel: 0.006 }), rod([x, 0.03, 0.68], [x, 0.72, 0.1], 0.07, C_WOOD, { ...WOOD, bevel: 0.006 }),
    b(x, 0.41, 0, 0.06, 0.04, 1.4, C_WOOD, { ...WOOD, bevel: 0.008 }),
    b(x, 0.72, 0, 0.06, 0.04, 0.7, C_WOOD, { ...WOOD, bevel: 0.006, detail: 1 }), // table cleat
    ...[-1, 1].map((s) => sp(x + 0.036, 0.62, s * 0.2, 0.03, C_STEEL, { ...CHROME, detail: 2 })), // bolt heads
  ]),
]);

// ---------- bins and utilities ----------
const binParts = (x: number, z: number, body: string, lid: string, m?: true): Part[] => [
  b(x, 0.3, z + 0.04, 0.46, 0.34, 0.52, body, { ...PLASTIC, bevel: 0.02, m }), b(x, 0.72, z + 0.05, 0.52, 0.56, 0.58, body, { ...PLASTIC, bevel: 0.025, m }),
  b(x, 1.03, z, 0.58, 0.06, 0.72, lid, { ...PLASTIC, bevel: 0.02 }), b(x, 1.07, z - 0.3, 0.42, 0.03, 0.04, lid, { ...PLASTIC, bevel: 0.01 }),
  cx(x - 0.24, 0.1, z - 0.26, 0.2, 0.06, BLACK, RUBBER), cx(x + 0.24, 0.1, z - 0.26, 0.2, 0.06, BLACK, RUBBER),
  cx(x, 1.0, z - 0.35, 0.03, 0.4, DARK, { ...BLACK_METAL, detail: 1 }), // hinge
  b(x, 1.0, z + 0.35, 0.54, 0.03, 0.025, lid, { ...PLASTIC, bevel: 0.008, detail: 1 }), // lid lip
  cx(x, 0.1, z - 0.26, 0.02, 0.5, C_STEEL, { ...STEEL, detail: 1 }), // axle
  ...[-1, 1].map((s) => cx(x + s * 0.275, 0.1, z - 0.26, 0.06, 0.01, C_STEEL, { ...CHROME, detail: 2 })), // hubs
  b(x, 0.72, z + 0.341, 0.36, 0.3, 0.006, body, { ...PLASTIC, bevel: 0.004, detail: 1 }), // moulded panel
];
const bin = (label: string, body: string, lid: string): Def => def(label, 0.58, 0.72, 1.09, binParts(0, 0, body, lid, true));
const binStore = def("Bin store for 3 bins", 2.2, 0.8, 1.2, [
  b(0, 0.03, 0, 2.2, 0.06, 0.8, C_STONE, { ...STONE, bevel: 0.008 }),
  b(0, 0.65, -0.38, 2.2, 1.2, 0.04, C_WOOD, { ...WOOD, m: true, bevel: 0.006 }), ...[-1, 1].map((s) => b(s * 1.08, 0.62, 0, 0.04, 1.12, 0.8, C_WOOD, { ...WOOD, m: true, bevel: 0.006 })),
  ...binParts(-0.7, 0, "#2f6b3c", "#24512e"), ...binParts(0, 0, "#2a2c30", "#1c1d20"), ...binParts(0.7, 0, "#2f5f9f", "#244a7c"),
  ...[-0.88, -0.44, 0, 0.44, 0.88].map((x) => seam(x, 0.65, -0.355, 0.006, 1.18, 0.004, "#5a4630")), // plank gaps
  b(0, 1.225, -0.38, 2.24, 0.03, 0.08, C_WOOD, { ...WOOD, m: true, bevel: 0.008, detail: 1 }),
]);
const firePit = def("Round fire pit 0.9 m", 0.9, 0.9, 0.58, [
  cy(0, 0.05, 0, 0.62, 0.04, "#2a2a2a", BLACK_METAL),
  ...ring(10, 0.35, (x, z, _a, i) => el(x, 0.09, z, 0.2, 0.16, 0.2, i % 2 ? C_STONE : GREY, { ...STONE, m: true })),
  ...ring(10, 0.35, (x, z, _a, i) => el(x, 0.22, z, 0.2, 0.14, 0.2, i % 2 ? GREY : C_STONE, { ...STONE, m: true }), Math.PI / 10),
  cx(0, 0.13, 0.04, 0.1, 0.5, TRUNK, WOOD), cz(0.03, 0.22, 0, 0.1, 0.5, "#5a3f2d", WOOD), rod([-0.2, 0.14, 0.15], [0.2, 0.32, -0.1], 0.08, TRUNK, { ...WOOD, bevel: 0.02 }),
  el(0, 0.36, 0, 0.22, 0.4, 0.22, "#ff8a2e", { glow: true }), el(0.05, 0.3, -0.04, 0.14, 0.3, 0.14, "#ffd34a", { glow: true }),
  cy(0, 0.075, 0, 0.5, 0.012, "#4a4743", { ...RUBBER, detail: 1 }), // ash bed
  rod([-0.12, 0.1, -0.12], [0.12, 0.2, 0.1], 0.02, TRUNK, { ...WOOD, bevel: 0, detail: 1 }), rod([0.1, 0.1, -0.1], [-0.1, 0.22, 0.08], 0.02, "#5a3f2d", { ...WOOD, bevel: 0, detail: 1 }), // kindling
], { light: { y: 0.4, color: "#ff9a4a" } });
const fountain = def("Tiered stone fountain 1.2 m", 1.2, 1.2, 1.55, [
  turned(0, 0, 0, [[0.55, 0], [0.6, 0.03], [0.6, 0.27], [0.57, 0.3]], C_STONE, { ...STONE, m: true }), cy(0, 0.295, 0, 1.04, 0.03, WATER, WATERM),
  turned(0, 0.33, 0, [[0.1, 0], [0.07, 0.1], [0.09, 0.2], [0.06, 0.3], [0.08, 0.44]], C_STONE, { ...STONE, m: true }),
  turned(0, 0.73, 0, [[0.15, 0], [0.25, 0.03], [0.35, 0.07], [0.35, 0.1]], C_STONE, { ...STONE, m: true }), cy(0, 0.865, 0, 0.62, 0.02, WATER, WATERM),
  turned(0, 0.86, 0, [[0.06, 0], [0.04, 0.1], [0.06, 0.2], [0.05, 0.28]], C_STONE, { ...STONE, m: true }),
  turned(0, 1.14, 0, [[0.08, 0], [0.15, 0.04], [0.18, 0.08]], C_STONE, { ...STONE, m: true }), cy(0, 1.235, 0, 0.3, 0.02, WATER, WATERM),
  cy(0, 1.35, 0, 0.03, 0.22, "#9fdcf0", WATERM), sp(0, 1.48, 0, 0.1, WATER, WATERM),
  ...ring(8, 0.5, (x, z) => sp(x, 0.31, z, 0.05, "#9fdcf0", { ...WATERM, detail: 2 })), // splashes
  ...ring(6, 0.3, (x, z) => sp(x, 0.87, z, 0.04, "#9fdcf0", { ...WATERM, detail: 2 })),
]);
const well = def("Garden well 1 m", 1.0, 1.0, 2.1, [
  cy(0, 0.4, 0, 1.0, 0.8, C_STONE, { ...STONE, m: true }), cy(0, 0.795, 0, 0.7, 0.02, "#1f3a4a", WATERM),
  ...[0.2, 0.55].map((y) => cy(0, y, 0, 1.0, 0.015, "#7a7f86", STONE)),
  ...ring(12, 0.43, (x, z, _a, i) => el(x, 0.81, z, 0.14, 0.08, 0.14, i % 2 ? LGREY : GREY, STONE)),
  ...[-1, 1].map((s) => b(s * 0.45, 1.25, 0, 0.07, 0.9, 0.07, C_WOOD, { ...WOOD, bevel: 0.006 })), b(0, 1.7, 0, 1.0, 0.06, 0.06, C_WOOD, { ...WOOD, bevel: 0.006 }),
  cx(0, 1.35, 0, 0.05, 0.9, C_WOOD, WOOD), b(0, 1.22, 0, 0.012, 0.28, 0.012, ROPE, { ...FAB, bevel: 0 }), turned(0, 0.91, 0, [[0.06, 0], [0.075, 0.1], [0.08, 0.18]], C_WOOD, WOOD),
  ...gable(1.0, 1.0, 1.73, 0.3, ROOFC, { ...TILE, m: true }, 0.04), ...gend(1.0, 1.74, 0.28, 0.45, C_WOOD, 3, 0.03, WOOD), ...gend(1.0, 1.74, 0.28, -0.45, C_WOOD, 3, 0.03, WOOD),
  ...ring(14, 0.5, (x, z, a, i) => b(x, 0.375, z, 0.03, 0.3, 0.2, i % 2 ? C_STONE : "#aab0b6", { ...STONE, bevel: 0.006, detail: 1, r: radial(a) }), 0), // stone courses
  ...ring(14, 0.5, (x, z, a, i) => b(x, 0.67, z, 0.03, 0.22, 0.2, i % 2 ? "#aab0b6" : C_STONE, { ...STONE, bevel: 0.006, detail: 1, r: radial(a) }), Math.PI / 14),
  ...[0.975, 1.0].map((y) => cy(0, y, 0, y === 1.0 ? 0.165 : 0.162, 0.01, C_STEEL, { ...STEEL, detail: 2 })), // bucket hoops
  b(0, 2.04, 0, 0.07, 0.025, 1.0, ROOFC, { ...TILE, bevel: 0.006, m: true, detail: 1 }), // ridge cap
]);
const waterButt = def("Water butt 0.6 m", 0.6, 0.6, 1.02, [
  b(0, 0.07, 0, 0.56, 0.14, 0.56, C_STONE, { ...STONE, bevel: 0.01 }),
  turned(0, 0.14, 0, [[0.265, 0], [0.28, 0.1], [0.285, 0.4], [0.28, 0.7], [0.27, 0.82]], "#2f6b3c", { ...PLASTIC, m: true }),
  cy(0, 0.3, 0, 0.58, 0.03, "#24512e", PLASTIC), cy(0, 0.7, 0, 0.58, 0.03, "#24512e", PLASTIC),
  turned(0, 0.955, 0, [[0.3, 0], [0.3, 0.02], [0.27, 0.04]], "#24512e", PLASTIC),
  cz(0, 0.28, 0.27, 0.04, 0.1, C_STEEL, CHROME), b(0, 0.31, 0.29, 0.015, 0.05, 0.015, C_STEEL, { ...CHROME, bevel: 0.004 }),
  cy(0.1, 1.0, 0.0, 0.12, 0.02, "#1c3a22", { ...PLASTIC, detail: 1 }), sp(0, 1.0, 0, 0.06, "#24512e", { ...PLASTIC, detail: 1 }), // inlet and knob
  sp(0, 0.325, 0.29, 0.03, C_STEEL, { ...CHROME, detail: 2 }),
]);
const clothesRotary = def("Rotary clothes dryer 2 m", 2.0, 2.0, 1.7, [
  cy(0, 0.04, 0, 0.1, 0.08, DARK, BLACK_METAL), cy(0, 0.85, 0, 0.05, 1.7, C_STEEL, STEEL), turned(0, 1.58, 0, [[0.05, 0], [0.07, 0.02], [0.07, 0.06], [0.04, 0.08]], DARK, BLACK_METAL),
  b(0, 1.62, 0, 1.9, 0.03, 0.03, C_STEEL, { ...STEEL, bevel: 0.012 }), b(0, 1.62, 0, 0.03, 0.03, 1.9, C_STEEL, { ...STEEL, bevel: 0.012 }),
  ...[0.3, 0.6, 0.9].flatMap((r) => [...[-1, 1].map((s) => b(0, 1.62, s * r, 2 * r, 0.006, 0.006, WHITE, { ...FAB, bevel: 0 })), ...[-1, 1].map((s) => b(s * r, 1.62, 0, 0.006, 0.006, 2 * r, WHITE, { ...FAB, bevel: 0 }))]),
  b(0.3, 1.45, 0.9, 0.4, 0.35, 0.012, "#4a6b8a", { ...FAB, bevel: 0 }), b(-0.4, 1.43, 0.9, 0.4, 0.4, 0.012, GOLD, { ...FAB, bevel: 0 }), b(0.9, 1.43, 0.3, 0.012, 0.36, 0.4, RED, { ...FAB, bevel: 0 }),
  cy(0, 0.1, 0, 0.08, 0.2, DARK, { ...BLACK_METAL, detail: 1 }), // ground sleeve
  ...[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([x, z]) => sp(x * 0.95, 1.62, z * 0.95, 0.04, DARK, { ...BLACK_METAL, detail: 1 })), // arm tips
  ...[0.12, 0.48].map((x) => b(x, 1.62, 0.9, 0.02, 0.05, 0.03, "#c9a26b", { ...WOOD, bevel: 0.003, detail: 2 })), // pegs
]);
const clothesLine = def("Clothes line between posts 3 m", 3.2, 0.2, 1.95, [
  ...[-1, 1].flatMap((s) => [cy(s * 1.55, 0.95, 0, 0.07, 1.9, C_STEEL, { ...STEEL, m: true }), turned(s * 1.55, 0, 0, [[0.08, 0], [0.09, 0.01], [0.09, 0.03], [0.04, 0.04]], DARK, BLACK_METAL)]),
  pipe([-1.55, 1.85, 0], [0, 1.8, 0], 0.012, WHITE, FAB), pipe([0, 1.8, 0], [1.55, 1.85, 0], 0.012, WHITE, FAB),
  b(-0.7, 1.4, 0, 0.7, 0.8, 0.012, CREAM, { ...FAB, bevel: 0 }), b(0.3, 1.55, 0, 0.4, 0.5, 0.012, "#4a6b8a", { ...FAB, bevel: 0 }), b(0.85, 1.65, 0, 0.18, 0.3, 0.012, RED, { ...FAB, bevel: 0 }), b(-0.1, 1.7, 0, 0.08, 0.2, 0.012, GOLD, { ...FAB, bevel: 0 }),
  ...[-1, 1].map((s) => sp(s * 1.55, 1.915, 0, 0.08, C_STEEL, { ...STEEL, detail: 1 })), // post caps
  ...[[-0.9, 0.7], [-0.5, 0.7], [0.15, 0.4], [0.45, 0.4], [0.85, 0.18], [-0.1, 0.08]].map(([x]) => b(x, 1.8, 0.007, 0.02, 0.06, 0.03, "#c9a26b", { ...WOOD, bevel: 0.003, detail: 2 })), // pegs
]);
const kennel = def("Dog kennel 0.8 x 1.0 m", 0.8, 1.0, 0.95, [
  b(0, 0.05, 0, 0.8, 0.1, 0.8, DECK, { ...WOOD, bevel: 0.008 }), b(0, 0.38, 0, 0.7, 0.56, 0.76, C_WOOD, { ...WOOD, m: true }),
  ...gable(0.8, 0.84, 0.66, 0.26, ROOFC, TILE), ...gend(0.8, 0.66, 0.26, 0.37, C_WOOD, 3, 0.03, WOOD), ...gend(0.8, 0.66, 0.26, -0.37, C_WOOD, 3, 0.03, WOOD),
  b(0, 0.3, 0.385, 0.28, 0.4, 0.01, "#1a1511", { ...MATT, bevel: 0 }), cz(0, 0.5, 0.385, 0.28, 0.01, "#1a1511", MATT),
  turned(0.25, 0.005, 0.44, [[0.04, 0], [0.06, 0.02], [0.065, 0.05]], RED, PLASTIC), cy(0.25, 0.058, 0.44, 0.1, 0.008, "#6b4a2a", SOILM),
  ...[-0.24, -0.12, 0.12, 0.24].map((x) => seam(x, 0.4, 0.3905, 0.004, 0.5, 0.004, "#4a3a2a")), // front planks
  ...[-1, 1].map((s) => b(s * 0.16, 0.3, 0.39, 0.03, 0.42, 0.012, CREAM, { ...MATT, bevel: 0.003, detail: 1 })), b(0, 0.53, 0.39, 0.34, 0.03, 0.012, CREAM, { ...MATT, bevel: 0.003, detail: 1 }), // door trim
  b(0, 0.915, 0, 0.06, 0.025, 0.84, ROOFC, { ...TILE, bevel: 0.006, detail: 1 }), // ridge cap
  b(0, 0.68, 0.395, 0.14, 0.04, 0.006, "#c6a15b", { ...STEEL, bevel: 0.002, detail: 2 }), // name plate
]);
const birdFeeder = def("Bird feeder on a pole", 0.4, 0.4, 1.65, [
  cy(0, 0.65, 0, 0.04, 1.3, DARK, BLACK_METAL), turned(0, 0, 0, [[0.05, 0], [0.05, 0.06], [0.02, 0.1]], DARK, BLACK_METAL),
  b(0, 1.3, 0, 0.3, 0.03, 0.3, C_WOOD, { ...WOOD, bevel: 0.006, m: true }), b(0, 1.36, 0, 0.24, 0.1, 0.24, "#d9b44a", { tex: "paint", rough: 0.9, bevel: 0.01 }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.12, 1.43, sz * 0.12, 0.02, 0.2, C_WOOD, WOOD))),
  ...gable(0.4, 0.34, 1.53, 0.1, ROOFC, { ...TILE, m: true }, 0.02),
  sp(0.1, 1.42, 0.08, 0.07, RED, FAB), sp(0.12, 1.47, 0.09, 0.045, RED, FAB), b(0.15, 1.47, 0.09, 0.03, 0.01, 0.01, "#e8a02c", { ...PLASTIC, bevel: 0.002 }),
  b(0.05, 1.42, 0.08, 0.07, 0.015, 0.025, RED, { ...FAB, bevel: 0.004, detail: 1, r: [0, 0, 0.35] }), // tail
  sp(0.145, 1.485, 0.115, 0.012, BLACK, { ...PLASTIC, detail: 2 }), // eye
  cz(0, 1.335, 0.14, 0.012, 0.22, C_WOOD, { ...WOOD, detail: 1 }), // perch
  b(0, 1.665, 0, 0.03, 0.02, 0.03, DARK, { ...BLACK_METAL, bevel: 0.004, detail: 2 }), // hanger
]);
const composter = def("Compost bin 0.8 m", 0.8, 0.8, 0.9, [
  el(0, 0.6, 0, 0.7, 0.5, 0.7, SOIL, SOILM), el(0.1, 0.8, 0.05, 0.3, 0.14, 0.3, "#6b5a3a", SOILM),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.385, 0.4, sz * 0.385, 0.05, 0.8, 0.05, POST, { ...WOOD, bevel: 0.006 }))),
  ...[0.15, 0.3, 0.45, 0.6, 0.75].flatMap((y) => [...[-1, 1].map((s) => b(0, y, s * 0.385, 0.76, 0.1, 0.03, C_WOOD, { ...WOOD, bevel: 0.004, m: true })), ...[-1, 1].map((s) => b(s * 0.385, y, 0, 0.03, 0.1, 0.76, C_WOOD, { ...WOOD, bevel: 0.004, m: true }))]),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.385, 0.81, sz * 0.385, 0.07, 0.02, 0.07, POST, { ...WOOD, bevel: 0.005, detail: 1 }))), // post caps
  sp(0.15, 0.88, 0.1, 0.04, "#e8c84a", { ...LEAFM, detail: 2 }), sp(-0.05, 0.86, 0.15, 0.035, "#8a3a2a", { ...LEAFM, detail: 2 }), sp(0.05, 0.88, -0.1, 0.04, "#3f6b3a", { ...LEAFM, detail: 2 }), sp(0.2, 0.85, 0.0, 0.03, "#e8dcc4", { ...LEAFM, detail: 2 }),
]);
const sandpit = def("Sandpit 1.2 m", 1.2, 1.2, 0.3, [
  b(0, 0.1, 0, 1.1, 0.16, 1.1, SAND, { ...STONE, rough: 0.95, bevel: 0.004 }),
  ...[-1, 1].map((s) => b(0, 0.1, s * 0.58, 1.2, 0.2, 0.04, C_WOOD, { ...WOOD, m: true, bevel: 0.008 })), ...[-1, 1].map((s) => b(s * 0.58, 0.1, 0, 0.04, 0.2, 1.12, C_WOOD, { ...WOOD, m: true, bevel: 0.008 })),
  ...[[-1, -1], [1, 1]].map(([sx, sz]) => b(sx * 0.5, 0.22, sz * 0.5, 0.2, 0.04, 0.2, C_WOOD, { ...WOOD, m: true, bevel: 0.008 })),
  el(-0.2, 0.19, 0.1, 0.4, 0.1, 0.35, SAND, { ...STONE, rough: 0.95 }), turned(0.3, 0.15, 0.25, [[0.05, 0], [0.065, 0.07], [0.07, 0.14]], RED, PLASTIC), cy(0.3, 0.297, 0.25, 0.1, 0.01, SAND, { ...STONE, rough: 0.95 }),
  b(0.15, 0.2, -0.3, 0.08, 0.02, 0.2, "#2f6f9f", { ...PLASTIC, bevel: 0.006, r: [0, 0.5, 0] }),
  turned(-0.27, 0.22, 0.12, [[0.06, 0], [0.05, 0.05], [0.05, 0.07], [0.025, 0.09]], SAND, { ...STONE, rough: 0.95, detail: 1 }), // sandcastle
  rod([0.1, 0.205, -0.2], [0.04, 0.215, -0.1], 0.02, "#2f6f9f", { ...PLASTIC, detail: 1 }), // spade handle
  sp(0.05, 0.19, 0.38, 0.03, PINK, { ...PLASTIC, detail: 2 }), sp(-0.35, 0.18, -0.1, 0.025, CREAM, { ...PLASTIC, detail: 2 }),
]);

/** Everything catalog.outdoor.ts places in OUTDOOR. */
export const F = { grillKettle, grillGas, chair, tableSet, lounger, parasol, hammock, swingSet, trampoline, playhouse, picnicTable, bin, binStore, firePit, fountain, well, waterButt, clothesRotary, clothesLine, kennel, birdFeeder, composter, sandpit };
