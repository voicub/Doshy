import type { Def, Part } from "../catalog.ts";
import { BLACK, BRASS, CREAM, OAK, WALNUT, WHITE, WOOD, b, cy, dims, discZ, piece, rodX, sp } from "./kit.ts";
import { cabinet, fin } from "./storage.ts";
import * as K from "../partsKit.ts";

const PORCELAIN = "#f6f6f4";
const WATER = "#bcd9e4";
const CHROME = "#c4c8ce";
const BRASS_M: K.Opt = { tex: "metal", metal: 1, rough: 0.3 };
const MIRROR: K.Opt = { tex: "metal", metal: 0.9, rough: 0.05, bevel: 0 };
const WICKER = { ...K.WOOD, rough: 0.9 };

// ---------- vanity units ----------
const tap = (x: number, y: number, z: number): Part[] => [
  K.turned(x, y, z, [[0.022, 0], [0.022, 0.012], [0.013, 0.025], [0.011, 0.12]], CHROME, K.CHROME),
  cy(x, y + 0.115, z + 0.04, 0.02, 0.09, CHROME, { ...K.CHROME, r: [Math.PI / 2, 0, 0] }), // spout
  b(x + 0.025, y + 0.095, z, 0.035, 0.01, 0.01, CHROME, { ...K.CHROME, bevel: 0.003, detail: 2 }), // lever
];
const basin = (x: number, y: number, z: number, w: number): Part[] => [
  b(x, y + 0.01, z, w, 0.02, 0.38, PORCELAIN, { ...K.CERAMIC, bevel: 0.009 }),
  b(x, y + 0.021, z + 0.02, w - 0.1, 0.004, 0.28, "#e1e4e6", { ...K.CERAMIC, bevel: 0.002 }),
  cy(x, y + 0.024, z + 0.04, 0.04, 0.003, CHROME, { ...K.CHROME, bevel: 0, detail: 2 }), // plug
  ...tap(x, y, z - 0.18),
];
/** Vanity unit with a ceramic top and one basin per `basins`. */
const vanity = (label: string, w: number, d: number, basins: number, c: string, rows: number): Def => {
  const body = cabinet("Bathroom", label, w, d, 0.8, basins === 1 && w < 0.9 ? 1 : 2, rows, c, { handle: "bar", legH: 0.15, legC: BLACK });
  const xs = basins === 1 ? [0] : [-w / 4, w / 4];
  return {
    ...body,
    h: 0.97,
    parts: [...body.parts, b(0, 0.815, 0, w + 0.02, 0.03, d + 0.01, PORCELAIN, { ...K.CERAMIC, bevel: 0.008 }), ...xs.flatMap((x) => basin(x, 0.83, 0.0, Math.min(0.5, w / basins - 0.12)))],
  };
};

// ---------- tubs and showers ----------
const stadium = (w: number, d: number, y: number, h: number, c: string, o: K.Opt, shrink = 0): Part[] => {
  const dd = d - shrink;
  return [b(0, y, 0, w - d, h, dd, c, o), ...[-1, 1].map((s) => cy(s * (w - d) / 2, y, 0, dd, h, c, o))];
};
const tub = (label: string, w: number, d: number): Def =>
  piece("Bathroom", label, w, d, 0.78, [
    ...stadium(w, d, 0.28, 0.5, PORCELAIN, { ...K.CERAMIC, bevel: 0.003 }),
    ...stadium(w - 0.1, d - 0.1, 0.535, 0.02, WATER, { tex: "ceramic", rough: 0.05, bevel: 0.002 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => K.turned(sx * (w / 2 - 0.25), 0, sz * (d / 2 - 0.2), [[0.025, 0], [0.032, 0.012], [0.035, 0.04]], BRASS, BRASS_M))),
    K.turned(w / 2 - 0.12, 0, 0, [[0.03, 0], [0.03, 0.02], [0.016, 0.05], [0.013, 0.76]], CHROME, K.CHROME),
    rodX(w / 2 - 0.12, 0.74, 0.0, 0.02, 0.12, CHROME, K.CHROME),
    discZ(w / 2 - 0.12, 0.7, -0.06, 0.02, 0.12, CHROME, K.CHROME),
    ...stadium(w + 0.02, d + 0.02, 0.515, 0.03, PORCELAIN, { ...K.CERAMIC, bevel: 0.012, detail: 1 }), // rolled rim
  ]);

/** Frame bars of a glass screen along x (len) or z, bottom at y0, with the glass pane inside. */
const screen = (axis: "x" | "z", at: number, from: number, len: number, y0: number, hh: number): Part[] => {
  const t = 0.02;
  const mid = from + len / 2;
  const fr: K.Opt = { ...K.CHROME, bevel: 0.003 };
  const bar = (u: number, y: number, sx: number, sy: number): Part => (axis === "x" ? b(u, y, at, sx, sy, t, CHROME, fr) : b(at, y, u, t, sy, sx, CHROME, fr));
  const shineO: K.Opt = { tex: "plastic", ...K.GLOSS, bevel: 0 };
  const shine = axis === "x" ? b(mid, y0 + hh / 2, at, 0.03, hh * 0.7, 0.008, "#e4f0f4", { ...shineO, r: [0, 0, 0.35] }) : b(at, y0 + hh / 2, mid, 0.008, hh * 0.7, 0.03, "#e4f0f4", { ...shineO, r: [-0.35, 0, 0] });
  const pane: K.Opt = { tex: "ceramic", rough: 0.05, bevel: 0, glass: true };
  const glass = axis === "x" ? b(mid, y0 + hh / 2, at, len - 2 * t, hh - 2 * t, 0.008, WATER, pane) : b(at, y0 + hh / 2, mid, 0.008, hh - 2 * t, len - 2 * t, WATER, pane);
  return [bar(mid, y0 + hh, len, t), bar(mid, y0, len, t), bar(from + t / 2, y0 + hh / 2, t, hh), bar(from + len - t / 2, y0 + hh / 2, t, hh), glass, shine];
};
const tray = (w: number, d: number): Part[] => [
  b(0, 0.035, 0, w, 0.07, d, PORCELAIN, { ...K.CERAMIC, bevel: 0.006 }),
  cy(0, 0.072, 0, 0.1, 0.004, CHROME, K.CHROME),
  b(0, 0.0705, 0, w - 0.04, 0.003, d - 0.04, "#e1e4e6", { ...K.CERAMIC, bevel: 0, detail: 1 }), // slightly sunken floor of the tray
];
const showerHead = (x: number, z: number): Part[] => [
  cy(x, 1.1, z, 0.025, 2.0, CHROME, K.CHROME),
  cy(x, 2.02, z + 0.12, 0.02, 0.24, CHROME, { ...K.CHROME, r: [Math.PI / 2, 0, 0] }),
  K.turned(x, 1.99, z + 0.24, [[0.02, 0], [0.085, 0.006], [0.09, 0.012], [0.09, 0.02]], CHROME, K.CHROME),
  K.turned(x + 0.12, 1.05, z + 0.02, [[0.022, 0], [0.025, 0.012], [0.025, 0.09], [0.02, 0.1]], BLACK, K.BLACK_METAL),
  b(x + 0.12, 1.1, z + 0.048, 0.012, 0.012, 0.03, CHROME, { ...K.CHROME, bevel: 0.003, detail: 2 }), // mixer lever
];
const walkIn = (w: number, d: number): Def =>
  piece("Bathroom", `Walk-in shower with glass screen ${dims(w, d)}`, w, d, 2.1, [
    ...tray(w, d),
    ...screen("x", d / 2 - 0.02, -w / 2 + 0.02, w * 0.62, 0.07, 1.95),
    ...showerHead(-w / 2 + 0.2, -d / 2 + 0.06),
  ]);
const cornerShower = (w: number): Def =>
  piece("Bathroom", `Corner shower, glass doors ${dims(w, w)}`, w, w, 2.1, [
    ...tray(w, w),
    ...screen("x", w / 2 - 0.02, -w / 2 + 0.02, w - 0.04, 0.07, 1.95),
    ...screen("z", w / 2 - 0.02, -w / 2 + 0.02, w - 0.04, 0.07, 1.95),
    b(0, 1.0, w / 2 - 0.0, 0.015, 0.4, 0.04, CHROME, { ...K.CHROME, bevel: 0.004 }),
    ...showerHead(-w / 2 + 0.15, -w / 2 + 0.06),
  ]);

// ---------- fixtures ----------
const bidet = (): Def =>
  piece("Bathroom", `Bidet ${dims(0.36, 0.55)}`, 0.36, 0.55, 0.5, [
    b(0, 0.16, 0.02, 0.32, 0.3, 0.46, PORCELAIN, { ...K.CERAMIC, bevel: 0.06 }),
    b(0, 0.34, 0.04, 0.38, 0.06, 0.5, PORCELAIN, { ...K.CERAMIC, bevel: 0.026 }),
    cy(0, 0.375, 0.08, 0.22, 0.01, "#e1e4e6", { ...K.CERAMIC, bevel: 0.003 }),
    b(0, 0.04, -0.12, 0.2, 0.08, 0.2, "#e6e4df", { ...K.CERAMIC, bevel: 0.01 }),
    ...tap(0, 0.37, -0.2),
    cy(0, 0.381, 0.09, 0.025, 0.003, CHROME, { ...K.CHROME, bevel: 0, detail: 2 }), // drain
  ]);
const towelRail = (label: string, w: number, h: number): Def => {
  const rungs = Math.round(h / 0.15);
  const tube = { ...K.LACQUER, m: true } as const;
  return piece("Bathroom", label, w, 0.1, 1.55, [
    ...[-1, 1].map((s) => cy(s * (w / 2 - 0.015), 1.55 - h / 2 - 0.1, 0, 0.03, h, WHITE, tube)),
    ...Array.from({ length: rungs }, (_, i) => rodX(0, 1.55 - 0.1 - 0.04 - i * ((h - 0.08) / (rungs - 1)), 0.0, 0.022, w - 0.06, WHITE, K.LACQUER)),
    b(0.05, 1.55 - 0.1 - 0.22, 0.04, 0.34, 0.2, 0.03, "#4a6b8a", { ...K.FAB, bevel: 0.012 }),
    b(-0.07, 1.55 - 0.1 - 0.52, 0.04, 0.3, 0.26, 0.03, CREAM, { ...K.FAB, bevel: 0.012 }),
    ...[-1, 1].map((s) => cy(s * (w / 2 - 0.015), 1.45, 0, 0.036, 0.01, WHITE, { ...K.LACQUER, bevel: 0.003, detail: 1 })), // end caps
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.015), 1.55 - 0.1 - h - 0.005, 0.0, 0.04, 0.012, 0.04, "#b8bcc2", { ...K.CHROME, bevel: 0.004, detail: 2 })), // valves
  ], { wall: true });
};
const towelLadder = (): Def => {
  const w = { ...K.WOOD, m: true } as const;
  return piece("Bathroom", `Towel ladder, standing ${dims(0.5, 0.35)}`, 0.5, 0.35, 1.5, [
    ...[-1, 1].map((s) => b(s * 0.22, 0.75, 0, 0.035, 1.55, 0.03, WOOD, { ...w, bevel: 0.006, r: [-0.2, 0, 0] })),
    ...[0.25, 0.5, 0.75, 1.0, 1.25].map((y) => b(0, y, 0.15 - y * 0.2 - 0.0, 0.42, 0.025, 0.03, WOOD, { ...w, bevel: 0.007 })),
    b(0, 1.1, -0.12, 0.38, 0.32, 0.04, "#4a6b8a", { ...K.FAB, bevel: 0.014 }),
    b(0, 0.62, -0.02, 0.34, 0.3, 0.04, CREAM, { ...K.FAB, bevel: 0.014 }),
    ...[-1, 1].flatMap((s) => [0.25, 0.75, 1.25].map((y) => cy(s * 0.215, y, 0.15 - y * 0.2, 0.012, 0.012, "#b8bcc2", { ...K.CHROME, r: [0, 0, Math.PI / 2], detail: 2 }))), // screw heads
  ]);
};
const hamper = (label: string, round: boolean): Def =>
  round
    ? piece("Bathroom", label, 0.42, 0.42, 0.62, [
      K.turned(0, 0, 0, [[0.19, 0], [0.2, 0.28], [0.2, 0.56]], "#d6cfc4", { ...WICKER, m: true }),
      K.turned(0, 0.555, 0, [[0.21, 0], [0.21, 0.02], [0.18, 0.04]], WOOD, K.WOOD),
      ...[-1, 1].map((s) => b(s * 0.2, 0.46, 0, 0.02, 0.08, 0.08, WOOD, { ...K.WOOD, bevel: 0.006 })),
      ...[0.15, 0.3, 0.45].map((y) => cy(0, y, 0, 0.402, 0.016, "#b8aa94", { ...WICKER, bevel: 0.005, detail: 1 })), // weave bands
    ])
    : piece("Bathroom", label, 0.45, 0.35, 0.62, [
      b(0, 0.28, 0, 0.44, 0.56, 0.34, "#c9a46b", { ...WICKER, m: true, bevel: 0.012 }),
      ...[0.15, 0.3, 0.45].map((y) => b(0, y, 0, 0.452, 0.025, 0.352, "#a8834f", { ...WICKER, bevel: 0.005 })),
      b(0, 0.595, 0, 0.45, 0.05, 0.35, "#a8834f", { ...WICKER, bevel: 0.012 }),
      sp(0, 0.63, 0, 0.04, BRASS, BRASS_M),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.215, 0.28, sz * 0.165, 0.022, 0.56, 0.022, "#a8834f", { ...WICKER, bevel: 0.004, detail: 1 }))), // corner posts
    ]);
const mirrorCabinet = (w: number): Def =>
  piece("Bathroom", `Mirror cabinet with LED light ${dims(w, 0.15)}`, w, 0.15, 1.9, [
    b(0, 1.52, 0, w, 0.7, 0.14, WHITE, { ...fin(WHITE), bevel: 0.008 }),
    b(0, 1.52, 0.072, w - 0.05, 0.64, 0.01, "#b9cfd9", MIRROR),
    b(-w * 0.15, 1.6, 0.079, 0.03, 0.4, 0.004, "#e6f1f6", { tex: "plastic", ...K.GLOSS, bevel: 0, r: [0, 0, 0.2] }),
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.012), 1.52, 0.078, 0.012, 0.6, 0.012, "#fff6e0", { glow: true, tex: "plastic", rough: 0.3 })),
    b(0, 1.88, 0.07, w - 0.1, 0.012, 0.012, "#fff6e0", { glow: true, tex: "plastic", rough: 0.3 }),
    b(0, 1.52, 0.0775, 0.004, 0.64, 0.006, WHITE, { ...K.MATT, bevel: 0, detail: 1 }), // door gap
    b(0, 1.52, 0.077, w - 0.03, 0.67, 0.004, WHITE, { ...fin(WHITE), bevel: 0.002, detail: 1 }), // mirror bezel
    b(w * 0.4, 1.35, 0.082, 0.012, 0.1, 0.012, "#b8bcc2", { ...K.STEEL, bevel: 0.003, detail: 2 }), // pull
  ], { wall: true, light: { y: 1.7, color: "#fff6e0", k: 0.5 } });

export const BATH: Record<string, Def> = {
  dc_vanity_60: vanity(`Vanity unit, single basin ${dims(0.6, 0.46)}`, 0.6, 0.46, 1, WHITE, 2),
  dc_vanity_80: vanity(`Vanity unit, single basin ${dims(0.8, 0.5)}`, 0.8, 0.5, 1, OAK, 2),
  dc_vanity_120: vanity(`Vanity unit, wide single basin ${dims(1.2, 0.5)}`, 1.2, 0.5, 1, WALNUT, 2),
  dc_vanity_double_140: vanity(`Vanity unit, double basin ${dims(1.4, 0.5)}`, 1.4, 0.5, 2, "#8d9299", 2),
  dc_vanity_double_180: vanity(`Vanity unit, double basin, wide ${dims(1.8, 0.52)}`, 1.8, 0.52, 2, WHITE, 2),
  dc_tub_freestanding_170: tub(`Freestanding bathtub ${dims(1.7, 0.8)}`, 1.7, 0.8),
  dc_tub_freestanding_150: tub(`Freestanding bathtub, compact ${dims(1.5, 0.75)}`, 1.5, 0.75),
  dc_shower_walkin_120: walkIn(1.2, 0.9),
  dc_shower_walkin_160: walkIn(1.6, 0.9),
  dc_shower_corner_90: cornerShower(0.9),
  dc_shower_corner_100: cornerShower(1.0),
  dc_bidet: bidet(),
  dc_towel_rail_120: towelRail(`Heated towel rail ${dims(0.5, 1.2)}`, 0.5, 1.2),
  dc_towel_rail_80: towelRail(`Heated towel rail, short ${dims(0.5, 0.8)}`, 0.5, 0.8),
  dc_towel_ladder: towelLadder(),
  dc_hamper_basket: hamper(`Laundry hamper, wicker ${dims(0.45, 0.35)}`, false),
  dc_hamper_round: hamper(`Laundry hamper, round ${dims(0.42, 0.42)}`, true),
  dc_mirror_cabinet_60: mirrorCabinet(0.6),
  dc_mirror_cabinet_80: mirrorCabinet(0.8),
};
