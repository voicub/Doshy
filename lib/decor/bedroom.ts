import type { Def, Part } from "../catalog.ts";
import { BIRCH, BLACK, BRASS, CREAM, DARKWOOD, DGREY, METAL, OAK, WALNUT, WHITE, WOOD, b, cy, dims, piece, sp } from "./kit.ts";
import { cabinet } from "./storage.ts";
import { CHROME, FAB, LACQUER, LEATHER as LEATHER_M, MATT, STEEL, WOOD as WOOD_M, pillow, seam, taperedLeg, turned } from "../partsKit.ts";

// ---------- beds ----------
type Head = "panel" | "tall" | "slats";
const MATTRESS = "#e9e7e2";
const SOFT = { ...FAB, m: true } as const;

/** Bed: frame and headboard in the main material, mattress, duvet with a folded top, pillows. Headboard at -z. */
const bed = (label: string, w: number, d: number, head: Head, c: string, linen: string, pillows: number): Def => {
  const hb = head === "tall" ? 1.15 : head === "slats" ? 1.0 : 0.85;
  const mw = w - 0.1;
  const mz0 = -d / 2 + 0.08;
  const ml = d - 0.1;
  const dl = ml * 0.68;
  const pw = (mw - 0.1) / pillows;
  const M = head === "tall" ? SOFT : { ...WOOD_M, m: true } as const; // upholstered frame vs wooden
  const n = Math.max(3, Math.round(w / 0.3));
  const headParts: Part[] =
    head === "slats"
      ? [
        ...[-1, 1].map((s) => b(s * (w / 2 - 0.03), hb / 2, -d / 2 + 0.03, 0.05, hb, 0.05, c, { ...M, bevel: 0.008 })),
        b(0, hb - 0.03, -d / 2 + 0.03, w, 0.05, 0.05, c, { ...M, bevel: 0.01 }),
        b(0, 0.55, -d / 2 + 0.03, w, 0.04, 0.04, c, { ...M, bevel: 0.008 }),
        ...Array.from({ length: Math.round(w / 0.12) }, (_, i) => b(-w / 2 + 0.09 + i * ((w - 0.18) / (Math.round(w / 0.12) - 1)), 0.72, -d / 2 + 0.03, 0.02, 0.32, 0.02, c, { ...M, bevel: 0.004 })),
      ]
      : [
        b(0, hb / 2 + 0.05, -d / 2 + 0.03, w, hb - 0.1, 0.06, c, { ...M, bevel: head === "tall" ? 0.03 : 0.015 }),
        ...(head === "tall"
          ? [
            ...Array.from({ length: n }, (_, i) => b(-w / 2 + (w / n) * (i + 0.5), hb / 2 + 0.1, -d / 2 + 0.064, 0.012, hb - 0.3, 0.008, DGREY, { ...FAB, bevel: 0.002 })),
            ...Array.from({ length: n }, (_, i) => [0.45, 0.75].map((f) => sp(-w / 2 + (w / n) * (i + 0.5), hb * f, -d / 2 + 0.065, 0.024, c, { ...SOFT, detail: 2 }))).flat(),
          ]
          : [b(0, hb / 2 + 0.06, -d / 2 + 0.07, w - 0.1, hb - 0.24, 0.012, c, { ...M, bevel: 0.004, detail: 1 })]),
      ];
  return piece("Bedroom", label, w, d, hb, [
    b(0, 0.14, 0, w, 0.18, d - 0.02, c, { ...M, bevel: 0.015 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * (w / 2 - 0.05), sz * (d / 2 - 0.05), 0.05, 0.05, 0.036, DARKWOOD, WOOD_M))),
    b(0, 0.34, mz0 + ml / 2, mw, 0.22, ml, MATTRESS, { ...FAB, bevel: 0.035 }),
    b(0, 0.46, mz0 + ml - dl / 2, mw + 0.04, 0.05, dl, linen, { ...FAB, bevel: 0.02 }),
    b(0, 0.49, mz0 + ml - dl, mw + 0.04, 0.06, 0.14, CREAM, { ...FAB, bevel: 0.025 }),
    ...Array.from({ length: pillows }, (_, i) => pillow(-mw / 2 + 0.05 + pw * (i + 0.5), 0.5, mz0 + 0.24, pw - 0.04, 0.12, 0.34, i % 2 ? "#cfd8d4" : WHITE, { r: [-0.1, 0, 0] })),
    ...headParts,
    // mattress welt, a throw across the foot and a seam down the duvet
    seam(0, 0.255, mz0 + ml + 0.001, mw - 0.02, 0.006, 0.006, "#c9c6bf", FAB),
    b(0, 0.495, mz0 + ml - 0.17, mw + 0.05, 0.02, 0.24, "#b9a98f", { ...FAB, bevel: 0.01, detail: 1 }),
    seam(0, 0.492, mz0 + ml - dl / 2 - 0.1, 0.006, 0.006, dl - 0.3, "#c9c6bf", FAB),
  ]);
};

const kidBed = (): Def => {
  const K = { ...LACQUER, m: true } as const;
  const Y = "#d9a02c";
  return piece("Bedroom", `Kids bed with rails ${dims(0.95, 1.95)}`, 0.95, 1.95, 0.86, [
    b(0, 0.16, 0, 0.95, 0.14, 1.95, "#4a9ad9", { ...K, bevel: 0.012 }),
    b(0, 0.3, 0.0, 0.88, 0.14, 1.85, MATTRESS, { ...FAB, bevel: 0.03 }),
    b(0, 0.35, 0.3, 0.9, 0.05, 1.15, Y, { ...FAB, bevel: 0.02 }),
    pillow(0, 0.4, -0.78, 0.5, 0.1, 0.3, WHITE),
    b(0, 0.5, -0.96, 0.95, 0.7, 0.04, "#4a9ad9", { ...K, bevel: 0.015 }),
    b(0, 0.4, 0.96, 0.95, 0.5, 0.04, "#4a9ad9", { ...K, bevel: 0.015 }),
    ...[-1, 1].flatMap((s) => [
      b(s * 0.46, 0.5, -0.25, 0.025, 0.2, 1.0, Y, { ...WOOD_M, bevel: 0.006 }),
      b(s * 0.46, 0.4, -0.25, 0.025, 0.04, 1.0, Y, { ...WOOD_M, bevel: 0.006 }),
      ...[-0.6, -0.25, 0.1, 0.45].map((z) => b(s * 0.46, 0.45, z, 0.025, 0.28, 0.03, Y, { ...WOOD_M, bevel: 0.005 })),
    ]),
    ...[-1, 1].flatMap((s) => [-1, 1].map((z) => sp(s * 0.4, z > 0 ? 0.66 : 0.86, z * 0.96, 0.05, "#4a9ad9", { ...K, detail: 1 }))),
    seam(0, 0.57, -0.935, 0.7, 0.02, 0.01, WHITE, { ...MATT, bevel: 0.004 }),
  ]);
};

const bunk = (): Def => {
  const W = { ...WOOD_M, m: true } as const;
  const pil = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.46, 0.875, sz * 1.0, 0.06, 1.75, 0.06, WOOD, { ...W, bevel: 0.008 })));
  return piece("Bedroom", `Bunk bed ${dims(0.95, 2.1)}`, 0.95, 2.1, 1.75, [
    ...pil,
    ...[0.32, 1.25].flatMap((y) => [
      b(0, y - 0.1, 0, 0.9, 0.04, 2.0, WOOD, { ...W, bevel: 0.006 }),
      b(0, y + 0.03, 0.0, 0.84, 0.16, 1.92, MATTRESS, { ...FAB, bevel: 0.03 }),
      b(0, y + 0.115, 0.25, 0.86, 0.04, 1.2, y > 1 ? "#4a9ad9" : "#d9a02c", { ...FAB, bevel: 0.02 }),
      pillow(0, y + 0.1, -0.78, 0.5, 0.08, 0.3, WHITE),
    ]),
    ...[-1, 1].flatMap((s) => [b(s * 0.46, 1.5, -0.2, 0.03, 0.2, 1.2, WOOD, { ...W, bevel: 0.006 }), b(s * 0.46, 1.1, -0.1, 0.03, 0.04, 1.9, WOOD, { ...W, bevel: 0.006 })]),
    ...[-1, 1].map((s) => b(s * 0.2, 0.85, 1.0, 0.04, 1.6, 0.04, WOOD, { ...W, bevel: 0.006 })),
    ...[0.2, 0.5, 0.8, 1.1].map((y) => b(0, y, 1.0, 0.36, 0.035, 0.04, WOOD, { ...W, bevel: 0.006 })),
    // post caps and the ladder bolts
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => sp(sx * 0.46, 1.73, sz * 1.0, 0.07, WOOD, { ...W, detail: 1 }))),
    ...[0.2, 0.5, 0.8, 1.1].flatMap((y) => [-1, 1].map((s) => cy(s * 0.2, y, 1.025, 0.014, 0.01, METAL, { ...STEEL, detail: 2, r: [Math.PI / 2, 0, 0] }))),
  ]);
};

const canopy = (): Def => {
  const w = 1.7;
  const d = 2.15;
  const P = { ...LACQUER, m: true } as const;
  const post: [number, number][] = [[0.03, 0], [0.035, 0.05], [0.026, 0.12], [0.026, 0.9], [0.033, 0.96], [0.026, 1.02], [0.026, 2.05], [0.034, 2.12], [0.022, 2.2]];
  return piece("Bedroom", `Canopy bed 160 x 200 ${dims(w, d)}`, w, d, 2.2, [
    b(0, 0.14, 0, w, 0.18, d - 0.02, WHITE, { ...P, bevel: 0.012 }),
    b(0, 0.34, 0.0, w - 0.1, 0.22, d - 0.1, MATTRESS, { ...FAB, bevel: 0.035 }),
    b(0, 0.46, 0.3, w - 0.06, 0.05, 1.3, "#d6cfc4", { ...FAB, bevel: 0.02 }),
    ...[-0.4, 0.4].map((x) => pillow(x, 0.52, -0.82, 0.6, 0.12, 0.34, WHITE, { r: [-0.1, 0, 0] })),
    b(0, 0.7, -d / 2 + 0.03, w, 1.1, 0.05, WHITE, { ...P, bevel: 0.01 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => turned(sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), post, WHITE, P))),
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.04), 2.17, 0, 0.05, 0.05, d - 0.08, WHITE, { ...P, bevel: 0.008 })),
    ...[-1, 1].map((s) => b(0, 2.17, s * (d / 2 - 0.04), w - 0.08, 0.05, 0.05, WHITE, { ...P, bevel: 0.008 })),
    ...[-1, 1].flatMap((s) => [-0.65, 0, 0.65].map((z) => b(s * (w / 2 - 0.04), 1.7, z, 0.02, 0.9, 0.42, "#f1ede4", { ...FAB, bevel: 0.004 }))),
    b(0, 1.7, -d / 2 + 0.07, w - 0.2, 0.9, 0.02, "#f1ede4", { ...FAB, bevel: 0.004 }),
    // headboard panelling and a bolster at the foot
    b(0, 0.7, -d / 2 + 0.06, w - 0.2, 0.9, 0.012, WHITE, { ...P, bevel: 0.004, detail: 1 }),
    b(0, 0.5, d / 2 - 0.3, w - 0.2, 0.05, 0.22, "#d6cfc4", { ...FAB, bevel: 0.02, detail: 1 }),
  ]);
};

const daybed = (): Def => {
  const P = { ...LACQUER, m: true } as const;
  const foot: [number, number][] = [[0.02, 0], [0.03, 0.03], [0.022, 0.07], [0.03, 0.13]];
  return piece("Bedroom", `Daybed ${dims(2.05, 0.95)}`, 2.05, 0.95, 0.9, [
    b(0, 0.18, 0, 2.05, 0.1, 0.95, WHITE, { ...P, bevel: 0.01 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => turned(sx * 0.98, 0, sz * 0.43, foot, WHITE, P))),
    b(0, 0.3, 0.02, 1.95, 0.14, 0.85, MATTRESS, { ...FAB, bevel: 0.04 }),
    b(0, 0.6, -0.455, 2.05, 0.6, 0.04, WHITE, { ...P, bevel: 0.008 }),
    ...[-1, 1].map((s) => b(s * 1.015, 0.55, 0.0, 0.04, 0.5, 0.95, WHITE, { ...P, bevel: 0.008 })),
    ...Array.from({ length: 14 }, (_, i) => b(-0.94 + i * 0.145, 0.6, -0.455, 0.018, 0.5, 0.025, CREAM, { ...MATT, bevel: 0.004 })),
    ...[-0.7, 0.0, 0.7].map((x) => pillow(x, 0.5, -0.3, 0.55, 0.3, 0.14, i3(x), { r: [-0.35, 0, 0] })),
    // mattress welt, rail caps
    seam(0, 0.26, 0.447, 1.9, 0.006, 0.006, "#c9c6bf", FAB),
    b(0, 0.905, -0.455, 2.07, 0.02, 0.06, WHITE, { ...P, bevel: 0.008, detail: 1 }),
    ...[-1, 1].map((s) => sp(s * 1.015, 0.82, 0.455, 0.05, WHITE, { ...P, detail: 1 })),
  ]);
};
const i3 = (x: number) => (x < 0 ? "#cfd8d4" : x > 0 ? "#d9a02c" : "#8a9a8c");

const crib = (): Def => {
  const w = 0.7;
  const d = 1.3;
  const n = 11;
  const P = { ...LACQUER, m: true } as const;
  const bars = (z: number, len: number, along: "x" | "z"): Part[] =>
    Array.from({ length: n }, (_, i) => {
      const o = -len / 2 + 0.04 + (i * (len - 0.08)) / (n - 1);
      return along === "x" ? b(o, 0.72, z, 0.018, 0.46, 0.018, WHITE, { ...P, bevel: 0.003 }) : b(z, 0.72, o, 0.018, 0.46, 0.018, WHITE, { ...P, bevel: 0.003 });
    });
  return piece("Bedroom", `Baby crib ${dims(w, d)}`, w, d, 1.0, [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * (w / 2 - 0.02), 0.5, sz * (d / 2 - 0.02), 0.04, 1.0, 0.04, WHITE, { ...P, bevel: 0.006 }))),
    b(0, 0.3, 0, w - 0.04, 0.03, d - 0.04, WHITE, { ...P, bevel: 0.005 }),
    b(0, 0.35, 0, w - 0.08, 0.07, d - 0.08, MATTRESS, { ...FAB, bevel: 0.025 }),
    b(0, 0.405, 0.2, w - 0.1, 0.03, 0.7, "#cfe0ea", { ...FAB, bevel: 0.012 }),
    pillow(0, 0.43, -0.45, 0.4, 0.06, 0.25, WHITE),
    ...[-1, 1].flatMap((s) => [b(s * (w / 2 - 0.02), 0.96, 0, 0.04, 0.04, d - 0.04, WHITE, { ...P, bevel: 0.01 }), b(s * (w / 2 - 0.02), 0.5, 0, 0.04, 0.03, d - 0.04, WHITE, { ...P, bevel: 0.006 })]),
    ...[-1, 1].flatMap((s) => [b(0, 0.96, s * (d / 2 - 0.02), w - 0.04, 0.04, 0.04, WHITE, { ...P, bevel: 0.01 }), b(0, 0.5, s * (d / 2 - 0.02), w - 0.04, 0.03, 0.04, WHITE, { ...P, bevel: 0.006 })]),
    ...[-1, 1].flatMap((s) => bars(s * (w / 2 - 0.02), d, "z")),
    ...[-1, 1].flatMap((s) => bars(s * (d / 2 - 0.02), w, "x")),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => sp(sx * (w / 2 - 0.02), 0.995, sz * (d / 2 - 0.02), 0.045, WHITE, { ...P, detail: 1 }))),
  ]);
};

// ---------- nightstands ----------
const night = (label: string, w: number, d: number, h: number, kind: "drawer" | "scandi" | "round"): Def => {
  if (kind === "round") {
    const a = (i: number) => (i * 2 * Math.PI) / 3;
    return piece("Bedroom", label, w, w, h, [
      cy(0, h - 0.015, 0, w, 0.03, WHITE, { ...LACQUER, m: true, bevel: 0.006 }),
      ...[0, 1, 2].map((i) => taperedLeg(Math.sin(a(i)) * w * 0.3, Math.cos(a(i)) * w * 0.3, h - 0.03, 0.032, 0.02, BRASS, { tex: "metal", metal: 1, rough: 0.3 })),
      cy(0, 0.2, 0, w * 0.75, 0.02, WHITE, { ...LACQUER, m: true, bevel: 0.004 }),
      cy(0, h - 0.035, 0, w * 0.9, 0.012, WHITE, { ...LACQUER, m: true, bevel: 0.003, detail: 1 }),
      ...[0, 1, 2].map((i) => sp(Math.sin(a(i)) * w * 0.3, 0.01, Math.cos(a(i)) * w * 0.3, 0.022, BRASS, { ...CHROME, detail: 2 })),
    ]);
  }
  if (kind === "scandi") {
    return piece("Bedroom", label, w, d, h, [
      b(0, h - 0.015, 0, w, 0.03, d, BIRCH, { ...WOOD_M, m: true, bevel: 0.006 }),
      b(0, h - 0.13, 0, w - 0.04, 0.17, d - 0.02, BIRCH, { ...WOOD_M, m: true, bevel: 0.004 }),
      b(0, h - 0.13, d / 2 - 0.006, w - 0.08, 0.13, 0.014, WHITE, { ...LACQUER, bevel: 0.004 }),
      cy(0, h - 0.13, d / 2 + 0.012, 0.03, 0.02, BLACK, { ...CHROME, r: [Math.PI / 2, 0, 0] }),
      b(0, 0.18, 0, w - 0.06, 0.02, d - 0.04, BIRCH, { ...WOOD_M, m: true, bevel: 0.004 }),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * (w / 2 - 0.03), sz * (d / 2 - 0.03), h - 0.03, 0.038, 0.028, BIRCH, { ...WOOD_M, m: true }))),
      b(0, h - 0.13, d / 2 + 0.002, w - 0.05, 0.15, 0.004, BIRCH, { ...WOOD_M, m: true, bevel: 0, detail: 1 }),
    ]);
  }
  return cabinet("Bedroom", label, w, d, h, 1, 2, OAK, { handle: "knob", legH: 0.06, legC: DARKWOOD });
};

// ---------- wardrobes ----------
const slidingWardrobe = (w: number, doors: number): Def => {
  const dw = w / doors;
  return piece("Bedroom", `Sliding-door wardrobe ${dims(w, 0.6)}`, w, 0.6, 2.4, [
    b(0, 1.2, -0.03, w, 2.4, 0.54, "#a79d8f", { ...MATT, bevel: 0.006 }),
    ...Array.from({ length: doors }, (_, i) => {
      const x = -w / 2 + dw * (i + 0.5);
      const front = i % 2 === 0;
      const mirror = i === 1 && doors === 3;
      return [
        b(x, 1.2, front ? 0.265 : 0.225, dw - 0.01, 2.3, 0.03, mirror ? "#b9cfd9" : WHITE, mirror ? { rough: 0.08, metal: 0.2, bevel: 0.002 } : { ...LACQUER, m: true, bevel: 0.005 }),
        b(x + dw * 0.4, 1.1, front ? 0.285 : 0.245, 0.012, 0.3, 0.012, METAL, { ...STEEL, bevel: 0.003, detail: 2 }),
        ...(mirror ? [] : [b(x, 1.2, front ? 0.282 : 0.242, dw - 0.14, 2.16, 0.004, WHITE, { ...LACQUER, m: true, bevel: 0.002, detail: 1 })]),
      ];
    }).flat(),
    b(0, 2.37, 0.24, w, 0.04, 0.1, METAL, { ...STEEL, bevel: 0.004 }),
    b(0, 0.04, 0.24, w, 0.04, 0.1, METAL, { ...STEEL, bevel: 0.004 }),
  ]);
};
const hingedWardrobe = (label: string, w: number, doors: number, c: string): Def =>
  cabinet("Bedroom", label, w, 0.58, 2.1, doors, 1, c, { handle: "vbar", legH: 0.04, legC: BLACK });
const walkIn = (): Def => {
  const w = 1.8;
  const B = { ...LACQUER, m: true, bevel: 0.004 } as const;
  const hang = (x: number): Part[] => Array.from({ length: 8 }, (_, i) => b(x + i * 0.06, 1.55, 0, 0.02, 0.65, 0.3, ["#2f3c52", "#d6cfc4", "#7a2f2a", "#5b7a5e", "#8d9299"][i % 5], { ...FAB, bevel: 0.006 }));
  return piece("Bedroom", `Walk-in closet with rail ${dims(w, 0.55)}`, w, 0.55, 2.1, [
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.011), 1.05, 0, 0.022, 2.1, 0.55, WHITE, B)),
    b(0, 2.09, 0, w, 0.022, 0.55, WHITE, B),
    b(0, 0.04, 0, w, 0.08, 0.55, WHITE, B),
    b(0, 1.05, -0.268, w - 0.04, 2.0, 0.012, "#d8d5ce", { ...MATT, bevel: 0 }),
    b(-0.45, 1.05, 0, 0.022, 2.0, 0.54, WHITE, B),
    ...[0.45, 0.8, 1.15, 1.5, 1.85].map((y) => b(-0.68, y, 0, 0.44, 0.022, 0.54, WHITE, B)),
    b(0.45, 1.88, 0, 0.78, 0.02, 0.5, WHITE, B),
    cy(0.45, 1.8, 0, 0.025, 0.86, METAL, { ...CHROME, r: [0, 0, Math.PI / 2] }),
    cy(0.45, 1.1, 0, 0.025, 0.86, METAL, { ...CHROME, r: [0, 0, Math.PI / 2] }),
    ...hang(0.12),
    ...Array.from({ length: 7 }, (_, i) => b(0.12 + i * 0.06, 0.8, 0, 0.02, 0.55, 0.3, ["#d9a02c", "#4a6b8a", "#e8e0d0", "#3a3a3a"][i % 4], { ...FAB, bevel: 0.006 })),

    ...[-0.8, -0.58].map((x) => b(x, 0.55, 0.0, 0.18, 0.1, 0.4, "#d6cfc4", { ...LEATHER_M, bevel: 0.025 })),
    sp(0.2, 0.15, 0.0, 0.2, "#c8c2b8", FAB),
    // hanger hooks along the rail, a plinth line under the shelves
    ...Array.from({ length: 8 }, (_, i) => cy(0.12 + i * 0.06, 1.89, 0, 0.008, 0.04, METAL, { ...STEEL, bevel: 0, detail: 2 })),
    ...[0.45, 0.8, 1.15, 1.5, 1.85].map((y) => b(-0.68, y - 0.013, 0.265, 0.44, 0.004, 0.004, WHITE, { ...MATT, detail: 1 })),
  ]);
};
const kidsWardrobe = (): Def => {
  const c = cabinet("Bedroom", `Kids wardrobe ${dims(0.8, 0.5)}`, 0.8, 0.5, 1.5, 2, 1, "#d9a02c", { handle: "knob", legH: 0.04, legC: "#4a9ad9" });
  return { ...c, parts: [...c.parts, b(-0.2, 1.0, 0.255, 0.18, 0.18, 0.01, "#4a9ad9", { ...LACQUER, bevel: 0.003 }), b(0.2, 1.0, 0.255, 0.18, 0.18, 0.01, "#b0645a", { ...LACQUER, bevel: 0.003 })] };
};

// ---------- dressers ----------
const dresser = (label: string, w: number, d: number, h: number, cols: number, rows: number, c: string): Def =>
  cabinet("Bedroom", label, w, d, h, cols, rows, c, { handle: "bar", legH: 0.12, legC: BLACK, round: true });

export const BEDROOM: Record<string, Def> = {
  dc_bed_single_90: bed(`Single bed 90 x 200`, 1.0, 2.1, "panel", OAK, "#8a9a8c", 1),
  dc_bed_single_120: bed(`Small double bed 120 x 200`, 1.3, 2.1, "slats", BLACK, "#6b6e72", 1),
  dc_bed_double_140: bed(`Double bed 140 x 200`, 1.5, 2.1, "panel", WALNUT, "#d6cfc4", 2),
  dc_bed_queen_160: bed(`Queen bed 160 x 200`, 1.7, 2.1, "tall", "#c8c2b8", "#6b7f93", 2),
  dc_bed_king_180: bed(`King bed 180 x 200`, 1.9, 2.1, "tall", "#8d9299", "#e8e0d0", 2),
  dc_bed_king_200: bed(`Super king bed 200 x 200`, 2.1, 2.1, "slats", WHITE, "#9aa5a0", 2),
  dc_bed_kid: kidBed(),
  dc_bed_bunk: bunk(),
  dc_bed_canopy: canopy(),
  dc_bed_day: daybed(),
  dc_crib: crib(),
  dc_night_drawer: night(`Bedside table, wood ${dims(0.45, 0.4)}`, 0.45, 0.4, 0.55, "drawer"),
  dc_night_scandi: night(`Bedside table, scandinavian ${dims(0.45, 0.35)}`, 0.45, 0.35, 0.5, "scandi"),
  dc_night_round: night(`Bedside table, round ${dims(0.4, 0.4)}`, 0.4, 0.4, 0.5, "round"),
  dc_wardrobe_sliding_150: slidingWardrobe(1.5, 2),
  dc_wardrobe_sliding_200: slidingWardrobe(2.0, 2),
  dc_wardrobe_sliding_250: slidingWardrobe(2.5, 3),
  dc_wardrobe_hinged_100: hingedWardrobe(`Wardrobe, 2 doors ${dims(1.0, 0.58)}`, 1.0, 2, WHITE),
  dc_wardrobe_hinged_150: hingedWardrobe(`Wardrobe, 3 doors ${dims(1.5, 0.58)}`, 1.5, 3, OAK),
  dc_wardrobe_walkin: walkIn(),
  dc_wardrobe_kids: kidsWardrobe(),
  dc_dresser_6: dresser(`Dresser, 6 drawers wide ${dims(1.5, 0.45)}`, 1.5, 0.45, 0.85, 2, 3, WHITE),
  dc_dresser_4: dresser(`Dresser, 4 drawers ${dims(1.0, 0.45)}`, 1.0, 0.45, 0.85, 1, 4, OAK),
  dc_chest_tall_5: dresser(`Tall chest of drawers, 5 drawers ${dims(0.8, 0.45)}`, 0.8, 0.45, 1.25, 1, 5, WALNUT),
  dc_chest_tall_slim: dresser(`Slim chest of drawers, 6 drawers ${dims(0.55, 0.4)}`, 0.55, 0.4, 1.3, 1, 6, WHITE),
};
