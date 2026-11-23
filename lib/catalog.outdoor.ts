import type { Def, Part } from "./catalog";
import { b, cy, sp, turned, seam, WOOD, MATT, STONE, STEEL, CHROME, BLACK_METAL, PLASTIC } from "./partsKit.ts";
import {
  WATER, COPING, TERRA, SOIL, GLASS, RED, GOLD, CREAM, FELT, POST, TILE, SOILM, LEAFM, WATERM, GLASSM, ALU,
  WHITE, DARK, GREY, DECK, LEAF1, LEAF2, LEAF3, C_STEEL, C_WOOD, C_STONE,
  def, plantAt, el, ring, radial, cx, cz, rod, gable, gend, mono, raise,
} from "./catalog.outdoor-kit.ts";
import { F } from "./catalog.outdoor-furniture.ts";
import { vegPart } from "./catalog.vegetation.ts";
import type { Species } from "./vegetation.ts";

// Outdoor catalog: pools, fences, shelters, garden furniture, plants, lights, utilities. Plain-word labels, sizes in the label.
// Structures, plants, paths and lights live here; furniture, grills, play and utilities in catalog.outdoor-furniture.ts. Helpers: catalog.outdoor-kit.ts.

// ---------- pools ----------
const pool = (w: number, d: number): Def => {
  const xo = w / 2 - 0.25, xi = w / 2 - 0.55;
  return def(`Swimming pool ${w} x ${d} m`, w, d, 0.95, [
    b(0, 0.04, 0, w - 0.8, 0.08, d - 0.8, WATER, WATERM),
    b(0, 0.082, 0, w - 0.9, 0.004, 0.05, "#2f8fbf", { ...WATERM, bevel: 0 }),
    ...[-1, 1].map((s) => b(0, 0.06, s * (d / 2 - 0.2), w, 0.12, 0.4, COPING, { ...STONE, bevel: 0.012, m: true })),
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.2), 0.06, 0, 0.4, 0.12, d - 0.8, COPING, { ...STONE, bevel: 0.012, m: true })),
    ...[-0.25, 0.25].flatMap((z) => [
      cy(xo, 0.51, z, 0.035, 0.78, C_STEEL, CHROME), cy(xi, 0.45, z, 0.035, 0.9, C_STEEL, CHROME), cx((xo + xi) / 2, 0.9, z, 0.035, xo - xi, C_STEEL, CHROME),
      sp(xo, 0.9, z, 0.045, C_STEEL, { ...CHROME, detail: 1 }), sp(xi, 0.9, z, 0.045, C_STEEL, { ...CHROME, detail: 1 }), cy(xo, 0.126, z, 0.08, 0.012, C_STEEL, { ...CHROME, detail: 2 }),
    ]),
    ...[0.25, 0.45, 0.65].map((y) => cz(xi, y, 0, 0.03, 0.5, C_STEEL, CHROME)),
    ...[-1, 1].map((s) => b(0, 0.0835, s * (d / 2 - 0.45), w - 0.9, 0.003, 0.03, "#bfeaf6", { rough: 0.1, bevel: 0, detail: 1 })), // waterline tile
  ]);
};
const kid = [[-1.3, 0.3, 2.0], [0, -0.2, 2.2], [1.3, 0.3, 2.0]] as const;
const kidney = def("Kidney pool 5 x 3 m", 5.2, 3.0, 0.1, [
  ...kid.map(([x, z, dia]) => turned(x, 0, z, [[dia / 2 + 0.17, 0], [dia / 2 + 0.2, 0.015], [dia / 2 + 0.2, 0.045], [dia / 2 + 0.18, 0.06]], COPING, { ...STONE, m: true })),
  ...kid.map(([x, z, dia]) => cy(x, 0.0375, z, dia, 0.075, WATER, WATERM)),
  cy(0.2, 0.0765, -0.25, 0.7, 0.003, "#6fc8e8", WATERM),
  cy(-1.3, 0.0765, 0.35, 0.5, 0.003, "#6fc8e8", WATERM),
]);
const hotTub = def("Round hot tub 2.1 m", 2.1, 2.1, 0.92, [
  cy(0, 0.4, 0, 2.0, 0.8, C_WOOD, { ...WOOD, m: true }),
  turned(0, 0.8, 0, [[0.985, 0], [1.05, 0.012], [1.05, 0.068], [1.0, 0.08], [0.9, 0.08]], "#e8e6e0", { ...PLASTIC, rough: 0.3 }),
  cy(0, 0.885, 0, 1.76, 0.02, "#5cc3e6", WATERM), // raised so the water shows inside the rim
  ...ring(8, 0.78, (x, z) => sp(x, 0.88, z, 0.07, WHITE, PLASTIC)),
  b(0, 0.12, 0.93, 0.7, 0.24, 0.24, C_WOOD, { ...WOOD, m: true, bevel: 0.01 }),
  b(0, 0.26, 0.9, 0.5, 0.04, 0.2, C_STONE, { ...STONE, bevel: 0.008 }),
  b(-0.55, 0.45, 0.82, 0.14, 0.2, 0.03, DARK, { ...PLASTIC, bevel: 0.008, r: [0, 0.55, 0] }),
  ...[0.18, 0.62].map((y) => cy(0, y, 0, 2.03, 0.025, C_STEEL, { ...BLACK_METAL, detail: 1 })),
  ...ring(12, 1.0, (x, z, a) => b(x, 0.4, z, 0.012, 0.78, 0.08, "#6f5236", { bevel: 0, detail: 1, r: radial(a) })), // stave gaps
]);

// ---------- fences and gate ----------
const picketTop = (x: number, z: number, y: number, c: string) => b(x, y, z, 0.085, 0.085, 0.025, c, { ...MATT, bevel: 0.003, m: true, r: [0, 0, Math.PI / 4] });
const fencePicket = def("Picket fence 1.8 m", 1.8, 0.1, 1.15, [
  ...[-1, 1].map((s) => b(s * 0.86, 0.575, 0, 0.08, 1.15, 0.08, WHITE, { ...MATT, bevel: 0.006, m: true })),
  ...[0.3, 0.8].map((y) => b(0, y, -0.02, 1.72, 0.06, 0.04, WHITE, { ...MATT, bevel: 0.004, m: true })),
  ...Array.from({ length: 9 }, (_, i) => [b(-0.7 + i * 0.175, 0.55, 0.035, 0.12, 1.0, 0.025, WHITE, { ...MATT, bevel: 0.003, m: true }), picketTop(-0.7 + i * 0.175, 0.035, 1.05, WHITE)]).flat(),
  ...[-1, 1].map((s) => b(s * 0.86, 1.165, 0, 0.1, 0.03, 0.1, WHITE, { ...MATT, bevel: 0.008, m: true, detail: 1 })), // post caps
]);
const fencePanel = def("Solid garden fence 1.8 m", 1.8, 0.1, 1.9, [
  ...[-1, 1].map((s) => b(s * 0.86, 0.95, 0, 0.09, 1.9, 0.09, POST, { ...WOOD, bevel: 0.006 })),
  ...[0.3, 1.0, 1.55].map((y) => b(0, y, -0.035, 1.7, 0.07, 0.03, POST, { ...WOOD, bevel: 0.004 })),
  ...Array.from({ length: 10 }, (_, i) => b(-0.81 + i * 0.18, 0.88, i % 2 ? 0.02 : 0.005, 0.18, 1.76, 0.03, i % 2 ? "#a9825a" : "#9a7048", { ...WOOD, bevel: 0.003, m: true })),
  b(0, 1.84, 0, 1.8, 0.04, 0.1, "#5a3f2d", { ...WOOD, bevel: 0.008 }),
  ...[-1, 1].map((s) => b(s * 0.86, 1.915, 0, 0.12, 0.03, 0.12, "#5a3f2d", { ...WOOD, bevel: 0.01, detail: 1 })),
]);
const fenceMesh = def("Wire mesh fence 1.8 m", 1.8, 0.1, 1.2, [
  ...[-1, 1].map((s) => cy(s * 0.875, 0.6, 0, 0.05, 1.2, "#2f5f3a", { ...ALU, m: true })),
  ...[0.04, 1.16].map((y) => b(0, y, 0, 1.75, 0.03, 0.03, "#2f5f3a", { ...ALU, bevel: 0.012, m: true })),
  ...Array.from({ length: 12 }, (_, i) => b(-0.82 + i * 0.15, 0.6, 0.01, 0.008, 1.1, 0.008, "#6f7a80", { ...STEEL, bevel: 0 })),
  ...Array.from({ length: 8 }, (_, i) => b(0, 0.12 + i * 0.14, 0.01, 1.7, 0.008, 0.008, "#6f7a80", { ...STEEL, bevel: 0 })),
  ...[-1, 1].map((s) => sp(s * 0.875, 1.22, 0, 0.06, "#2f5f3a", { ...ALU, m: true, detail: 1 })),
]);
const gate = def("Garden gate 1.0 m", 1.0, 0.1, 1.2, [
  ...[-1, 1].map((s) => b(s * 0.47, 0.6, 0, 0.08, 1.2, 0.08, WHITE, { ...MATT, bevel: 0.006, m: true })),
  ...[0.25, 0.95].map((y) => b(0, y, -0.01, 0.84, 0.06, 0.04, WHITE, { ...MATT, bevel: 0.004, m: true })),
  rod([-0.34, 0.28, -0.01], [0.34, 0.92, -0.01], 0.03, WHITE, { ...MATT, m: true }),
  ...Array.from({ length: 5 }, (_, i) => [b(-0.3 + i * 0.15, 0.55, 0.03, 0.1, 0.9, 0.025, WHITE, { ...MATT, bevel: 0.003, m: true }), picketTop(-0.3 + i * 0.15, 0.03, 1.0, WHITE)]).flat(),
  b(-0.4, 0.95, 0.04, 0.05, 0.03, 0.03, DARK, BLACK_METAL), b(-0.4, 0.25, 0.04, 0.05, 0.03, 0.03, DARK, BLACK_METAL), b(0.39, 0.6, 0.04, 0.04, 0.1, 0.03, DARK, BLACK_METAL),
  ...[-1, 1].map((s) => b(s * 0.47, 1.215, 0, 0.1, 0.03, 0.1, WHITE, { ...MATT, bevel: 0.008, m: true, detail: 1 })),
  cy(0.35, 0.6, 0.06, 0.02, 0.03, DARK, { ...BLACK_METAL, detail: 2 }), // latch pin
]);

// ---------- shelters ----------
const pergola = def("Pergola 3 x 3 m", 3, 3, 2.55, [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 1.4, 1.2, sz * 1.4, 0.12, 2.4, 0.12, C_WOOD, { ...WOOD, bevel: 0.01, m: true }))),
  ...[-1, 1].map((s) => b(s * 1.4, 2.3, 0, 0.12, 0.16, 3.0, C_WOOD, { ...WOOD, bevel: 0.01, m: true })),
  ...Array.from({ length: 10 }, (_, i) => b(0, 2.45, -1.35 + i * 0.3, 3.0, 0.08, 0.07, C_WOOD, { ...WOOD, bevel: 0.006, m: true })),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => rod([sx * 1.4, 1.6, sz * 1.4], [sx * 1.4, 2.25, sz * 1.0], 0.06, C_WOOD, { ...WOOD, bevel: 0.006, m: true }))),
  sp(-1.3, 2.0, 1.3, 0.3, LEAF1, LEAFM), sp(-1.3, 1.6, 1.3, 0.26, LEAF2, LEAFM), sp(1.3, 2.1, -1.3, 0.3, LEAF2, LEAFM), sp(1.3, 1.7, -1.3, 0.26, LEAF3, LEAFM),
  ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [
    b(sx * 1.4, 0.02, sz * 1.4, 0.18, 0.04, 0.18, DARK, { ...BLACK_METAL, detail: 1 }), // base plate
    cx(sx * 1.465, 2.3, sz * 1.4, 0.025, 0.01, C_STEEL, { ...CHROME, detail: 2 }), // bolt head
  ])),
  sp(-1.35, 2.3, 1.3, 0.16, LEAF3, { ...LEAFM, detail: 1 }), sp(-1.25, 1.25, 1.35, 0.18, LEAF1, { ...LEAFM, detail: 1 }), sp(1.35, 2.3, -1.3, 0.16, LEAF1, { ...LEAFM, detail: 1 }), sp(1.25, 1.3, -1.35, 0.18, LEAF3, { ...LEAFM, detail: 1 }),
]);
const rail = (f: number, alongX: boolean): Part[] => {
  const o = { ...MATT, m: true as const };
  const q = (a: number, y: number, l: number, th: number, h: number) => (alongX ? b(a, y, f, l, h, th, WHITE, { ...o, bevel: 0.008 }) : b(f, y, a, th, h, l, WHITE, { ...o, bevel: 0.008 }));
  return [q(0, 0.95, 2.6, 0.07, 0.06), q(0, 0.35, 2.6, 0.05, 0.05), ...Array.from({ length: 7 }, (_, i) => { const a = -1.2 + i * 0.4; return alongX ? cy(a, 0.65, f, 0.04, 0.6, WHITE, o) : cy(f, 0.65, a, 0.04, 0.6, WHITE, o); })];
};
const gazebo = def("Gazebo 3 x 3 m", 3, 3, 3.4, [
  b(0, 0.06, 0, 3, 0.12, 3, DECK, { ...WOOD, bevel: 0.006 }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 1.35, 1.26, sz * 1.35, 0.12, 2.28, 0.12, WHITE, { ...MATT, bevel: 0.01, m: true }))),
  ...rail(-1.35, true), ...rail(-1.35, false), ...rail(1.35, false),
  ...[-1, 1].map((s) => b(0, 2.34, s * 1.35, 2.6, 0.12, 0.1, WHITE, { ...MATT, bevel: 0.01, m: true })),
  ...[-1, 1].map((s) => b(s * 1.35, 2.34, 0, 0.1, 0.12, 2.6, WHITE, { ...MATT, bevel: 0.01, m: true })),
  ...Array.from({ length: 7 }, (_, k) => b(0, 2.46 + 0.12 * k, 0, 3.0 - 0.4 * k, 0.12, 3.0 - 0.4 * k, "#5a4a42", { ...TILE, bevel: 0.012 })),
  turned(0, 3.24, 0, [[0.02, 0], [0.05, 0.03], [0.07, 0.07], [0.03, 0.11], [0.01, 0.13]], GOLD, { ...CHROME, rough: 0.3 }), // finial
  cy(0, 2.25, 0, 0.02, 0.3, DARK, BLACK_METAL), sp(0, 2.05, 0, 0.18, "#ffe3b0", { glow: true }),
  turned(0, 2.14, 0, [[0.09, 0], [0.09, 0.012], [0.03, 0.06]], DARK, { ...BLACK_METAL, detail: 1 }), // lantern cap
  ...Array.from({ length: 9 }, (_, i) => seam(-1.2 + i * 0.3, 0.121, 0, 0.006, 0.002, 2.6, "#6b5640")), // deck boards
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => rod([sx * 1.35, 2.15, sz * 1.35], [sx * 1.15, 2.28, sz * 1.35], 0.04, WHITE, { ...MATT, m: true, detail: 1 }))), // corner brackets
], { light: { y: 2.0, color: "#ffd9a0" } });

const shed = (label: string, w: number, d: number, y0: number, rise: number, dw: number, dx: number, ww: number, wx: number): Def => {
  const s = d - 0.1, bw = w - 0.1, zf = s / 2, dh = y0 - 0.2, BODY = "#a98a5f", dY = 0.08 + dh / 2;
  return def(label, w, d, y0 + rise + 0.08, [
    b(0, 0.04, 0, w - 0.04, 0.08, d - 0.04, "#6a6d72", { ...STONE, bevel: 0.01 }),
    b(0, (0.08 + y0) / 2, 0, bw, y0 - 0.08, s, BODY, { ...WOOD, m: true }),
    ...[1, 2, 3, 4, 5].map((k) => { const dep = s * (1 - k / 6); return b(0, y0 + (rise * k) / 12, -zf + dep / 2, bw, (rise * k) / 6, dep, BODY, { ...WOOD, m: true }); }),
    ...Array.from({ length: Math.floor(bw / 0.2) }, (_, i) => b(-bw / 2 + 0.1 + i * 0.2, (0.08 + y0) / 2, zf + 0.004, 0.02, y0 - 0.1, 0.008, "#8e7248", { ...WOOD, bevel: 0 })),
    b(dx, dY, zf + 0.004, dw + 0.08, dh + 0.04, 0.012, CREAM, { ...MATT, bevel: 0.004 }),
    b(dx, dY, zf + 0.012, dw, dh, 0.02, "#6b4a35", { ...WOOD, bevel: 0.005 }),
    ...(dw > 1 ? [b(dx, dY, zf + 0.024, 0.012, dh, 0.006, "#3a2a20", { ...WOOD, bevel: 0 })] : []),
    ...(dw > 1 ? [-0.06, 0.06] : [dw / 2 - 0.08]).map((hx) => b(dx + hx, 1.0, zf + 0.03, 0.03, 0.12, 0.02, C_STEEL, { ...STEEL, bevel: 0.006 })),
    b(wx, 1.3, zf + 0.006, ww + 0.08, 0.58, 0.012, CREAM, { ...MATT, bevel: 0.004 }), b(wx, 1.3, zf + 0.014, ww, 0.5, 0.012, "#8fb0c8", GLASSM), b(wx, 1.3, zf + 0.022, 0.02, 0.5, 0.006, CREAM, { ...MATT, bevel: 0 }),
    mono(w, d, y0 + 0.03, rise, FELT, { tex: "rubber", rough: 0.9, bevel: 0.006 }),
    // trims and hardware
    ...[-1, 1].map((k) => b(k * (bw / 2 - 0.03), (0.08 + y0) / 2, zf + 0.004, 0.06, y0 - 0.08, 0.02, CREAM, { ...MATT, bevel: 0.004, detail: 1 })),
    rod([dx - dw / 2 + 0.06, 0.14, zf + 0.027], [dx + dw / 2 - 0.06, 0.08 + dh - 0.06, zf + 0.027], 0.03, "#5a3f2d", { ...WOOD, bevel: 0, detail: 1 }),
    ...Array.from({ length: Math.round(dw / 0.18) - 1 }, (_, i) => seam(dx - dw / 2 + (i + 1) * (dw / Math.round(dw / 0.18)), dY, zf + 0.0225, 0.004, dh - 0.04, 0.004, "#3a2a20")),
    ...[0.25, dh - 0.25].map((y) => b(dx - dw / 2 + 0.06, 0.08 + y, zf + 0.026, 0.1, 0.03, 0.008, DARK, { ...BLACK_METAL, bevel: 0, detail: 2 })),
    b(dx + (dw > 1 ? 0.06 : dw / 2 - 0.08), 0.93, zf + 0.04, 0.03, 0.04, 0.02, DARK, { ...BLACK_METAL, detail: 2 }), // padlock
    b(wx, 1.3 - 0.305, zf + 0.025, ww + 0.1, 0.03, 0.04, CREAM, { ...MATT, bevel: 0.006, detail: 1 }), b(wx, 1.3, zf + 0.022, ww, 0.02, 0.006, CREAM, { ...MATT, bevel: 0, detail: 1 }),
    cx(0, y0 + 0.01, d / 2 - 0.02, 0.05, w - 0.1, "#4a4d52", { ...ALU, detail: 1 }), // gutter
  ]);
};

const gh = 3.5, gw = 2.5;
const greenhouse = def("Greenhouse 2.5 x 3.5 m", gw, gh, 2.5, [
  b(0, 0.02, 0, gw - 0.1, 0.04, gh - 0.1, "#9a9288", { ...STONE, bevel: 0.006 }),
  ...[-1, 1].map((s) => b(0, 0.15, s * (gh / 2 - 0.025), gw, 0.3, 0.05, GREY, { ...STONE, bevel: 0.006 })),
  ...[-1, 1].map((s) => b(s * (gw / 2 - 0.025), 0.15, 0, 0.05, 0.3, gh - 0.1, GREY, { ...STONE, bevel: 0.006 })),
  b(0, 1.0, -1.74, 2.4, 1.4, 0.02, GLASS, GLASSM),
  ...[-1, 1].map((s) => b(s * 1.24, 1.0, 0, 0.02, 1.4, 3.4, GLASS, GLASSM)),
  ...[-1, 1].map((s) => b(s * 0.8, 1.0, 1.74, 0.8, 1.4, 0.02, GLASS, GLASSM)),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 1.225, 1.0, sz * 1.725, 0.05, 1.4, 0.05, C_STEEL, { ...ALU, bevel: 0.006, m: true }))),
  ...[-1, 1].map((s) => b(s * 0.4, 1.0, 1.74, 0.04, 1.4, 0.04, C_STEEL, { ...ALU, bevel: 0.005, m: true })),
  ...[-1, 1].map((s) => b(0, 1.7, s * 1.725, 2.5, 0.05, 0.05, C_STEEL, { ...ALU, bevel: 0.006, m: true })),
  ...[-1, 1].map((s) => b(s * 1.225, 1.7, 0, 0.05, 0.05, 3.5, C_STEEL, { ...ALU, bevel: 0.006, m: true })),
  ...[-0.6, 0.6].flatMap((z) => [-1, 1].map((s) => b(s * 1.24, 1.0, z, 0.04, 1.4, 0.04, C_STEEL, { ...ALU, bevel: 0.005, m: true }))),
  b(0, 1.0, -1.74, 0.04, 1.4, 0.04, C_STEEL, { ...ALU, bevel: 0.005, m: true }),
  ...[-1, 1].map((s) => b(s * 1.24, 1.0, 0, 0.03, 0.03, 3.4, C_STEEL, { ...ALU, bevel: 0.005, m: true })),
  ...gable(gw, 3.4, 1.7, 0.7, GLASS, GLASSM, 0.02),
  b(0, 2.42, 0, 0.06, 0.06, 3.5, C_STEEL, { ...ALU, bevel: 0.01, m: true }),
  ...[-1.5, -0.75, 0, 0.75, 1.5].flatMap((z) => [-1, 1].map((s) => rod([s * 1.2, 1.7, z], [0, 2.4, z], 0.04, C_STEEL, { ...ALU, m: true }))),
  ...gend(gw, 1.72, 0.66, -1.74, GLASS, 3, 0.02, GLASSM), ...gend(gw, 1.72, 0.66, 1.74, GLASS, 3, 0.02, GLASSM),
  ...[-1, 1].map((s) => b(s * 0.8, 0.75, -0.3, 0.45, 0.04, 2.2, C_WOOD, { ...WOOD, bevel: 0.006 })),
  ...[-1, 1].flatMap((s) => [-0.8, -0.3, 0.2].map((z, i) => sp(s * 0.8, 0.93, z, 0.28, i % 2 ? LEAF1 : LEAF2, LEAFM))),
  turned(0, 0, 0.9, [[0.1, 0], [0.12, 0.02], [0.15, 0.2]], TERRA, TILE), sp(0, 0.4, 0.9, 0.4, LEAF2, LEAFM), sp(0.1, 0.5, 0.95, 0.12, RED, LEAFM),
  ...[-1, 1].flatMap((s) => [-0.8, -0.3, 0.2].map((z) => b(s * 0.8, 0.785, z, 0.3, 0.03, 0.38, "#2f2f33", { ...PLASTIC, detail: 1 }))), // seed trays
  ...[-1, 1].map((s) => b(s * 0.4, 1.0, 1.77, 0.025, 0.12, 0.02, C_STEEL, { ...CHROME, detail: 2 })), // door handles
  ...[-1, 1].map((s) => cz(s * 1.18, 1.69, 0, 0.05, 3.4, "#4a4d52", { ...ALU, detail: 1 })), // gutters
  b(0.4, 2.05, 0.62, 0.7, 0.02, 0.5, GLASS, { ...GLASSM, detail: 1, r: [0, 0, -0.45] }), // roof vent
]);

// ---------- beds, pots, plants ----------
const bed = (w: number, d: number): Def => {
  const nz = Math.round(d / 0.5), step = (d - 0.4) / (nz - 1), wood = { ...WOOD, bevel: 0.006, m: true as const };
  return def(`Raised bed ${w} x ${d} m`, w, d, 0.9, [
    b(0, 0.2, 0, w - 0.09, 0.3, d - 0.09, SOIL, { ...SOILM, bevel: 0.01 }),
    ...[0.1, 0.28].flatMap((y) => [...[-1, 1].map((s) => b(0, y, s * (d / 2 - 0.0225), w, 0.17, 0.045, C_WOOD, wood)), ...[-1, 1].map((s) => b(s * (w / 2 - 0.0225), y, 0, 0.045, 0.17, d - 0.09, C_WOOD, wood))]),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * (w / 2 - 0.03), 0.19, sz * (d / 2 - 0.03), 0.06, 0.38, 0.06, C_WOOD, wood))),
    ...Array.from({ length: nz }, (_, i) => {
      const z = -(d - 0.4) / 2 + i * step, xl = -w * 0.23, xr = w * 0.23;
      return [sp(xl, 0.45, z, 0.24, i % 2 ? LEAF1 : LEAF2, LEAFM), sp(xl + 0.03, 0.55, z, 0.12, "#7fae4c", LEAFM), cy(xr, 0.6, z, 0.02, 0.5, C_WOOD, WOOD), sp(xr, 0.7, z, 0.2, LEAF3, LEAFM), sp(xr + 0.06, 0.62, z + 0.06, 0.08, RED, LEAFM), sp(xr - 0.06, 0.78, z - 0.04, 0.08, "#ef7d2d", LEAFM)];
    }).flat(),
    ...[-1, 1].map((s) => b(0, 0.375, s * (d / 2 - 0.0225), w + 0.02, 0.025, 0.065, C_WOOD, { ...wood, detail: 1 })), // cap boards
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.0225), 0.375, 0, 0.065, 0.025, d - 0.09, C_WOOD, { ...wood, detail: 1 })),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * (w / 2 - 0.006), 0.28, sz * (d / 2 - 0.006), 0.012, 0.3, 0.012, DARK, { ...BLACK_METAL, bevel: 0, detail: 1 }))), // corner brackets
    ...Array.from({ length: nz }, (_, i) => b(w * 0.23 + 0.12, 0.42, -(d - 0.4) / 2 + i * step, 0.06, 0.07, 0.01, WHITE, { ...PLASTIC, bevel: 0.003, detail: 2 })), // plant labels
  ]);
};
const potRound = def("Large round plant pot 0.5 m", 0.5, 0.5, 0.9, [
  turned(0, 0, 0, [[0.13, 0], [0.15, 0.02], [0.17, 0.12], [0.2, 0.25], [0.23, 0.33], [0.235, 0.37], [0.25, 0.38], [0.25, 0.44], [0.235, 0.45]], TERRA, { ...TILE, m: true }), cy(0, 0.43, 0, 0.42, 0.04, SOIL, SOILM),
  plantAt("shrub", 0.46, 0.45, 0.46, 0, 0, 2, 0.45),
]);
const trough = def("Plant trough 1.0 x 0.3 m", 1.0, 0.3, 0.58, [
  b(0, 0.17, 0, 1.0, 0.34, 0.3, TERRA, { ...TILE, bevel: 0.012, m: true }), b(0, 0.355, 0, 0.92, 0.03, 0.22, SOIL, SOILM),
  plantAt("flower_bed_c", 0.92, 0.24, 0.26, 0, 0, 0, 0.37),
  b(0, 0.335, 0, 1.04, 0.02, 0.34, TERRA, { ...TILE, bevel: 0.006, m: true, detail: 1 }), // rim lip
  ...[-0.3, 0, 0.3].map((x) => b(x, 0.16, 0.152, 0.24, 0.2, 0.006, "#9a5232", { ...TILE, bevel: 0.002, detail: 1 })), // front panels
]);

const oak = def("Oak tree", 2.4, 2.4, 4.6, [vegPart("oak", 2.4, 4.6, 2.4, 0)]);
const pine = def("Pine tree", 2.2, 2.2, 4.5, [vegPart("pine", 2.2, 4.5, 2.2, 0)]);
const birch = def("Birch tree", 1.8, 1.8, 4.1, [vegPart("birch", 1.8, 4.1, 1.8, 0)]);
const palm = def("Palm tree", 3.0, 3.0, 4.2, [vegPart("palm", 3.0, 4.2, 3.0, 0)]);
const fruitTree = (label: string, seed: number): Def => def(label, 2.0, 2.0, 3.45, [vegPart("apple", 2.0, 3.45, 2.0, seed)]);

const hedge = (label: string, w: number, d: number, h: number): Def => def(label, w, d, h, [vegPart(w >= 2 ? "hedge_long" : "hedge", w, h, d, 0)]);
const bushSmall = def("Small round bush 0.6 m", 0.6, 0.6, 0.6, [vegPart("shrub", 0.6, 0.6, 0.6, 1)]);
const bushFlower = (label: string, species: Species): Def => def(label, 0.9, 0.9, 0.85, [vegPart(species, 0.9, 0.85, 0.9, 0)]);
const flowerBed = def("Mixed flower bed 2.0 x 0.8 m", 2.0, 0.8, 0.55, [
  ...[-1, 1].map((s) => b(0, 0.1, s * 0.375, 2.0, 0.2, 0.05, C_STONE, { ...STONE, bevel: 0.01, m: true })), ...[-1, 1].map((s) => b(s * 0.975, 0.1, 0, 0.05, 0.2, 0.7, C_STONE, { ...STONE, bevel: 0.01, m: true })),
  vegPart("flower_bed", 1.9, 0.55, 0.7, 0),
  ...[-1, 1].map((s) => b(0, 0.205, s * 0.375, 2.04, 0.02, 0.07, C_STONE, { ...STONE, bevel: 0.006, m: true, detail: 1 })), // coping
  ...[-1, 1].map((s) => b(s * 0.975, 0.205, 0, 0.07, 0.02, 0.7, C_STONE, { ...STONE, bevel: 0.006, m: true, detail: 1 })),
]);

const rockSmall = def("Small rock group", 0.8, 0.6, 0.35, [
  plantAt("rock", 0.45, 0.3, 0.36, -0.15, 0, 0), plantAt("rock", 0.32, 0.24, 0.3, 0.2, 0.1, 1), plantAt("rock", 0.24, 0.2, 0.22, 0.1, -0.17, 2), plantAt("rock", 0.18, 0.12, 0.16, -0.3, 0.2, 3),
]);
const rockLarge = def("Large rock group", 1.6, 1.2, 0.85, [
  plantAt("rock_moss", 0.95, 0.7, 0.8, -0.35, 0.05, 0), plantAt("rock", 0.8, 0.56, 0.7, 0.35, -0.1, 1), plantAt("rock_moss", 0.6, 0.4, 0.5, 0, 0.33, 2), plantAt("rock", 0.5, 0.4, 0.45, -0.1, -0.25, 3),
  plantAt("rock", 0.35, 0.2, 0.3, 0.55, 0.35, 0), plantAt("rock", 0.3, 0.2, 0.28, -0.65, -0.35, 1),
]);
const stepSlabs = def("Stepping stone slabs, set of 5", 0.6, 2.2, 0.06, [-0.9, -0.45, 0, 0.45, 0.9].map((z, i) => b(i % 2 ? 0.05 : -0.05, 0.03, z, 0.5, 0.06, 0.35, i % 2 ? C_STONE : GREY, { ...STONE, bevel: 0.012, m: true })));
const stepRound = def("Round stepping stones, set of 5", 0.5, 2.0, 0.05, [-0.8, -0.4, 0, 0.4, 0.8].map((z, i) => turned(i % 2 ? 0.06 : -0.06, 0, z, [[0.155, 0], [0.17, 0.01], [0.17, 0.04], [0.16, 0.05]], i % 2 ? C_STONE : GREY, { ...STONE, m: true })));
const pathGravel = def("Gravel path 1 x 2 m", 1.0, 2.0, 0.07, [
  b(0, 0.0125, 0, 1.0, 0.025, 2.0, "#a79c88", { ...STONE, rough: 0.95, bevel: 0.004, m: true }),
  ...[-1, 1].map((s) => b(s * 0.485, 0.03, 0, 0.03, 0.06, 2.0, POST, { ...WOOD, bevel: 0.006 })),
  ...Array.from({ length: 24 }, (_, i) => el(((i * 37) % 19) / 19 * 0.86 - 0.43, 0.025, ((i * 53) % 29) / 29 * 1.9 - 0.95, 0.07, 0.04, 0.055, i % 3 ? "#8d8678" : "#c4b9a4", { ...STONE, rough: 0.9 })),
  ...Array.from({ length: 14 }, (_, i) => el(((i * 29 + 7) % 23) / 23 * 0.86 - 0.43, 0.03, ((i * 41 + 5) % 31) / 31 * 1.9 - 0.95, 0.045, 0.03, 0.04, i % 2 ? "#b3a893" : "#7d776a", { ...STONE, rough: 0.9, detail: 1 })),
]);
const pathPavers = def("Paved path 1 x 2 m", 1.0, 2.0, 0.06, [
  b(0, 0.01, 0, 1.0, 0.02, 2.0, "#7d7a72", { ...STONE, rough: 0.95, bevel: 0 }),
  ...Array.from({ length: 12 }, (_, i) => b(i % 2 ? 0.245 : -0.245, 0.03, -0.833 + Math.floor(i / 2) * 0.333, 0.46, 0.04, 0.31, i % 3 ? "#b8b0a0" : "#a8a090", { ...STONE, bevel: 0.007, m: true })),
]);
const pathCurved = def("Curved paved path", 1.7, 1.7, 0.06, [
  ...Array.from({ length: 5 }, (_, k) => { const t = ((k + 0.5) * Math.PI) / 10; return b(-0.75 + 0.75 * Math.cos(t), 0.03, 0.75 - 0.75 * Math.sin(t), 0.46, 0.04, 0.21, k % 2 ? "#a8a090" : "#b8b0a0", { ...STONE, bevel: 0.007, m: true, r: [0, t, 0] }); }),
  ...Array.from({ length: 8 }, (_, k) => { const t = ((k + 0.5) * Math.PI) / 16; return b(-0.75 + 1.25 * Math.cos(t), 0.03, 0.75 - 1.25 * Math.sin(t), 0.46, 0.04, 0.225, k % 2 ? "#b8b0a0" : "#a8a090", { ...STONE, bevel: 0.007, m: true, r: [0, t, 0] }); }),
]);
const decking = (n: number): Def => def(`Wooden decking ${n} x ${n} m`, n, n, 0.08, [
  b(0, 0.02, 0, n, 0.04, n, "#6b5640", { ...WOOD, bevel: 0 }),
  ...Array.from({ length: n * 6 }, (_, i) => b(0, 0.06, -n / 2 + (i + 0.5) / 6, n, 0.04, 0.155, i % 3 ? DECK : "#9a7650", { ...WOOD, bevel: 0.004, m: true })),
  ...[-1, 1].map((s) => b(0, 0.082, s * (n / 2 - 0.06), n, 0.004, 0.12, DECK, { ...WOOD, bevel: 0.002, m: true, detail: 1 })), // picture-frame border
  ...[-1, 1].map((s) => b(s * (n / 2 - 0.06), 0.082, 0, 0.12, 0.004, n - 0.24, DECK, { ...WOOD, bevel: 0.002, m: true, detail: 1 })),
]);

// ---------- lights ----------
const bollard = def("Garden bollard light 0.8 m", 0.16, 0.16, 0.8, [
  turned(0, 0, 0, [[0.07, 0], [0.07, 0.04], [0.055, 0.06]], DARK, BLACK_METAL), cy(0, 0.33, 0, 0.1, 0.6, GREY, { ...ALU, m: true }), cy(0, 0.64, 0, 0.1, 0.1, "#fff1c8", { glow: true }),
  turned(0, 0.68, 0, [[0.05, 0], [0.07, 0.01], [0.07, 0.03], [0.045, 0.04]], DARK, BLACK_METAL), turned(0, 0.73, 0, [[0.05, 0], [0.05, 0.03], [0.025, 0.05]], DARK, BLACK_METAL),
  ...ring(4, 0.052, (x, z) => cy(x, 0.062, z, 0.014, 0.01, C_STEEL, { ...CHROME, detail: 2 })), // base bolts
], { light: { y: 0.64, color: "#ffd9a0" } });
const postLamp = def("Garden post lamp 2.2 m", 0.3, 0.3, 2.3, [
  turned(0, 0, 0, [[0.09, 0], [0.1, 0.02], [0.1, 0.07], [0.05, 0.12]], DARK, BLACK_METAL), turned(0, 0.1, 0, [[0.04, 0], [0.034, 0.15], [0.03, 1.0], [0.03, 1.9]], DARK, { ...BLACK_METAL, m: true }),
  b(0, 2.0, 0, 0.2, 0.3, 0.2, "#ffe3b0", { glow: true }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.105, 2.0, sz * 0.105, 0.025, 0.32, 0.025, DARK, { ...BLACK_METAL, bevel: 0.005 }))),
  b(0, 2.17, 0, 0.3, 0.04, 0.3, DARK, { ...BLACK_METAL, bevel: 0.008 }), b(0, 2.22, 0, 0.18, 0.05, 0.18, DARK, { ...BLACK_METAL, bevel: 0.006 }),
  turned(0, 2.245, 0, [[0.025, 0], [0.04, 0.02], [0.02, 0.05]], DARK, BLACK_METAL), b(0, 1.83, 0, 0.22, 0.03, 0.22, DARK, { ...BLACK_METAL, bevel: 0.006 }),
  b(0, 2.2, 0, 0.24, 0.025, 0.24, DARK, { ...BLACK_METAL, bevel: 0.005, detail: 1 }),
  ...[0.3, 1.0, 1.9].map((y) => cy(0, y, 0, 0.08, 0.025, DARK, { ...BLACK_METAL, detail: 1 })), // collars
], { light: { y: 2.0, color: "#ffcf8a" } });
const wallLantern = def("Wall lantern", 0.2, 0.25, 2.0, [
  b(0, 1.8, -0.115, 0.1, 0.24, 0.02, DARK, { ...BLACK_METAL, bevel: 0.006 }), b(0, 1.78, -0.07, 0.03, 0.03, 0.08, DARK, { ...BLACK_METAL, bevel: 0.006 }),
  b(0, 1.78, 0.03, 0.12, 0.2, 0.12, "#ffe3b0", { glow: true }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.065, 1.78, 0.03 + sz * 0.065, 0.02, 0.22, 0.02, DARK, { ...BLACK_METAL, bevel: 0.004 }))),
  b(0, 1.67, 0.03, 0.14, 0.03, 0.14, DARK, { ...BLACK_METAL, bevel: 0.006 }), b(0, 1.9, 0.03, 0.16, 0.03, 0.16, DARK, { ...BLACK_METAL, bevel: 0.006 }), b(0, 1.935, 0.03, 0.09, 0.03, 0.09, DARK, { ...BLACK_METAL, bevel: 0.006 }),
  b(0, 1.96, 0.03, 0.05, 0.02, 0.05, DARK, { ...BLACK_METAL, detail: 1 }), sp(0, 1.67, 0.03, 0.04, DARK, { ...BLACK_METAL, detail: 1 }),
], { wall: true, light: { y: 1.78, color: "#ffcf8a" } });
const floodlight = (() => {
  const a = 0.5;
  return def("Wall floodlight", 0.3, 0.3, 2.3, [
    b(0, 2.2, -0.12, 0.08, 0.14, 0.03, DARK, { ...BLACK_METAL, bevel: 0.006 }), b(0, 2.15, -0.04, 0.04, 0.04, 0.14, DARK, { ...BLACK_METAL, bevel: 0.006 }),
    b(0, 2.15, 0.08, 0.24, 0.16, 0.1, DARK, { ...BLACK_METAL, bevel: 0.01, r: [a, 0, 0] }),
    b(0, 2.124, 0.128, 0.2, 0.12, 0.012, "#fff8e0", { glow: true, r: [a, 0, 0] }),
    sp(0, 2.2, 0.0, 0.06, WHITE, PLASTIC),
    ...[-0.07, 0, 0.07].map((x) => b(x, 2.19, 0.04, 0.012, 0.03, 0.09, DARK, { ...BLACK_METAL, bevel: 0, detail: 1, r: [a, 0, 0] })), // cooling fins
    ...[-1, 1].map((s) => b(s * 0.125, 2.15, 0.07, 0.012, 0.1, 0.06, DARK, { ...BLACK_METAL, bevel: 0.003, detail: 1 })), // yoke
    sp(0, 2.145, 0.14, 0.03, "#2a2c30", { ...PLASTIC, detail: 2 }), // sensor
  ], { wall: true, light: { y: 2.0, color: "#f2f7ff", k: 1.6 } });
})();

const mailPost = def("Mailbox on a post", 0.3, 0.5, 1.25, [
  b(0, 0.5, 0, 0.08, 1.0, 0.08, C_WOOD, { ...WOOD, bevel: 0.006, m: true }), cy(0, 0.01, 0, 0.16, 0.02, DARK, BLACK_METAL),
  b(0, 1.04, 0, 0.2, 0.08, 0.44, "#3a5f7a", { ...ALU, bevel: 0.006, m: true }), cz(0, 1.1, 0, 0.2, 0.44, "#3a5f7a", { ...ALU, m: true }), cz(0, 1.1, 0.225, 0.2, 0.012, "#2a2c30", BLACK_METAL),
  b(0.12, 1.15, -0.1, 0.02, 0.14, 0.04, RED, { ...PLASTIC, bevel: 0.004 }),
  b(0, 1.012, 0, 0.1, 0.025, 0.1, C_WOOD, { ...WOOD, bevel: 0.005, m: true, detail: 1 }), // post cap
  rod([0, 0.82, 0], [0, 1.0, 0.18], 0.04, C_WOOD, { ...WOOD, bevel: 0.004, m: true, detail: 1 }), // support arm
  sp(0, 1.12, 0.235, 0.03, C_STEEL, { ...CHROME, detail: 2 }), // door knob
]);
const mailWall = def("Wall mailbox", 0.36, 0.14, 1.5, [
  b(0, 1.3, 0, 0.34, 0.26, 0.12, "#3a5f7a", { ...ALU, bevel: 0.008, m: true }), b(0, 1.435, 0.005, 0.35, 0.03, 0.13, "#2c485c", { ...ALU, bevel: 0.006 }),
  b(0, 1.37, 0.062, 0.24, 0.02, 0.004, "#17181a", { ...BLACK_METAL, bevel: 0 }), b(0, 1.31, 0.062, 0.3, 0.12, 0.004, "#2c485c", { ...ALU, bevel: 0.002 }), b(0, 1.31, 0.066, 0.08, 0.03, 0.004, C_STEEL, { ...STEEL, bevel: 0.002 }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => cy(sx * 0.16, 1.3 + sy * 0.11, 0.061, 0.015, 0.004, C_STEEL, { ...CHROME, detail: 2, r: [Math.PI / 2, 0, 0] }))), // screws
], { wall: true });
const SEG: Record<string, string> = { "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg", "0": "abcdef" };
const seg = (s: string, x: number) => ("adg".includes(s)
  ? b(x, s === "a" ? 1.655 : s === "g" ? 1.6 : 1.545, 0.0125, 0.044, 0.008, 0.004, WHITE, { ...PLASTIC, bevel: 0.001 })
  : b(x + ("bc".includes(s) ? 0.026 : -0.026), "bf".includes(s) ? 1.627 : 1.573, 0.0125, 0.008, 0.048, 0.004, WHITE, { ...PLASTIC, bevel: 0.001 }));
const numberSign = (label: string, digits: string): Def => def(label, 0.1 + 0.08 * digits.length, 0.03, 1.75, [
  b(0, 1.6, 0, 0.1 + 0.08 * digits.length, 0.16, 0.02, "#3a4650", { ...ALU, bevel: 0.006, m: true }),
  ...[...digits].flatMap((ch, i) => [...SEG[ch]].map((s) => seg(s, (i - (digits.length - 1) / 2) * 0.08))),
  ...[-1, 1].map((s) => sp(s * (0.05 + 0.04 * digits.length - 0.012), 1.6 + 0.06, 0.012, 0.012, C_STEEL, { ...CHROME, detail: 2 })),
], { wall: true });

export const OUTDOOR: Record<string, Def> = {
  out_pool_4x2: pool(4, 2), out_pool_6x3: pool(6, 3), out_pool_8x4: pool(8, 4), out_pool_kidney: kidney, out_hot_tub: hotTub,
  out_fence_picket: fencePicket, out_fence_solid: fencePanel, out_fence_mesh: fenceMesh, out_gate_picket: gate,
  out_pergola: pergola, out_gazebo: gazebo,
  out_shed_small: shed("Tool shed 1.8 x 1.2 m", 1.8, 1.2, 1.85, 0.25, 0.7, -0.4, 0.4, 0.45),
  out_shed_large: shed("Large shed 3 x 2 m", 3, 2, 2.2, 0.35, 1.2, -0.7, 0.7, 0.8),
  out_greenhouse: greenhouse,
  out_grill_kettle: F.grillKettle, out_grill_gas: F.grillGas,
  out_table_set_4: F.tableSet("Outdoor table with 4 chairs", 1.6, 0.9, 2), out_table_set_6: F.tableSet("Outdoor table with 6 chairs", 2.2, 1.0, 3),
  out_picnic_table: F.picnicTable, out_lounger: F.lounger, out_parasol: F.parasol, out_hammock: F.hammock, out_swing_set: F.swingSet, out_trampoline: F.trampoline, out_playhouse: F.playhouse,
  out_raised_bed_large: bed(1.2, 2.4), out_raised_bed_small: bed(0.8, 0.8), out_pot_round: potRound, out_trough: trough,
  out_tree_oak: oak, out_tree_pine: pine, out_tree_birch: birch, out_tree_palm: palm,
  out_tree_apple: fruitTree("Apple tree", 0), out_tree_orange: fruitTree("Orange tree", 2),
  out_hedge_long: hedge("Long hedge 3 m", 3.0, 0.6, 1.2), out_hedge_low: hedge("Low box hedge 1 m", 1.0, 0.5, 0.5),
  out_bush_small: bushSmall, out_bush_pink: bushFlower("Flowering bush, pink", "bush_pink"), out_bush_yellow: bushFlower("Flowering bush, yellow", "bush_yellow"),
  out_flower_bed_mixed: flowerBed, out_rocks_small: rockSmall, out_rocks_large: rockLarge,
  out_stepping_slabs: raise(stepSlabs, 0.04), out_stepping_round: raise(stepRound, 0.04),
  out_path_gravel: raise(pathGravel, 0.04), out_path_paved: raise(pathPavers, 0.04), out_path_curved: raise(pathCurved, 0.04), out_decking_2x2: raise(decking(2), 0.04), out_decking_3x3: raise(decking(3), 0.04),
  out_bollard_light: bollard, out_post_lamp: postLamp, out_wall_lantern: wallLantern, out_floodlight: floodlight,
  out_mailbox_post: mailPost, out_mailbox_wall: mailWall,
  out_house_number_two: numberSign("House number sign, two digits", "17"), out_house_number_one: numberSign("House number sign, one digit", "5"),
  out_bin_green: F.bin("Wheelie bin, green", "#2f6b3c", "#24512e"), out_bin_black: F.bin("Wheelie bin, black", "#2a2c30", "#1c1d20"),
  out_bin_blue: F.bin("Wheelie bin, blue", "#2f5f9f", "#244a7c"), out_bin_yellow: F.bin("Wheelie bin, yellow", "#d9b432", "#b8962a"),
  out_bin_store: F.binStore,
  out_fire_pit: F.firePit, out_fountain: F.fountain, out_well: F.well, out_water_butt: F.waterButt,
  out_clothes_rotary: F.clothesRotary, out_clothes_line: F.clothesLine, out_dog_kennel: F.kennel, out_bird_feeder: F.birdFeeder, out_compost_bin: F.composter, out_sandpit: F.sandpit,
};
