import type { Def, Part } from "../catalog.ts";
import { BLACK, BRASS, CREAM, DGREY, METAL, PI, PI2, WHITE, WOOD, b, cy, discZ, piece, sp, strut, wire } from "./kit.ts";
import * as K from "../partsKit.ts";

const BR: K.Opt = { tex: "metal", metal: 1, rough: 0.28 }; // polished brass
const SHADE: K.Opt = { ...K.FAB, rough: 0.9 }; // linen shade

const GLOW = "#fff0c8";
const MARBLE = "#ece9e4";
const CEIL = 2.6;
const lamp = (label: string, w: number, d: number, h: number, parts: Part[], y: number, color = "#ffd9a0", wall = false): Def =>
  piece("Lighting & devices", label, w, d, h, parts, { light: { y, color }, ...(wall ? { wall: true as const } : {}) });

// ---------- ceiling pendants (ids contain "ceiling": they hang from the ceiling and ignore walls) ----------
const canopy = (): Part[] => [cy(0, CEIL - 0.015, 0, 0.12, 0.03, WHITE, { ...K.MATT, bevel: 0.006 }), cy(0, CEIL - 0.035, 0, 0.05, 0.01, METAL, { ...K.STEEL, detail: 1 })];
const cord = (x: number, z: number, bottom: number, c = BLACK): Part => cy(x, (CEIL + bottom) / 2, z, 0.012, CEIL - bottom, c, { ...K.RUBBER, bevel: 0 });

const pendantGlobe = (dia: number, drop: number, c: string): Def => {
  const y = CEIL - drop;
  return lamp(`Pendant light, glass globe ${Math.round(dia * 100)} cm`, dia, dia, CEIL, [
    ...canopy(), cord(0, 0, y + dia / 2), K.turned(0, y + dia / 2, 0, [[0.03, 0], [0.03, 0.012], [0.018, 0.026], [0.02, 0.04]], c, { ...BR }),
    sp(0, y, 0, dia, GLOW, { glow: true }),
  ], y);
};
/** Dome pendant: a stack of cylinders from a narrow neck to a wide rim, bulb glowing underneath. */
const pendantCone = (dia: number, drop: number, c: string): Def => {
  const top = CEIL - drop;
  return lamp(`Pendant light, dome shade ${Math.round(dia * 100)} cm`, dia, dia, CEIL, [
    ...canopy(), cord(0, 0, top),
    K.turned(0, top - 0.2, 0, [[0.5, 0], [0.49, 0.02], [0.45, 0.06], [0.38, 0.1], [0.28, 0.14], [0.2, 0.17], [0.175, 0.185]].map(([r, h]) => [r * dia, h] as [number, number]), c, { ...K.LACQUER, m: true }),
    cy(0, top - 0.025, 0, dia * 0.4, 0.02, METAL, { ...K.STEEL, detail: 1 }),
    cy(0, top - 0.04 - 3 * 0.045 - 0.03, 0, dia * 0.8, 0.012, GLOW, { glow: true }),
    sp(0, top - 0.2, 0, 0.09, GLOW, { glow: true }),
  ], top - 0.2);
};
const pendantCluster = (): Def => {
  const drops = [0.55, 0.9, 0.7, 1.15, 0.8];
  const xs = [-0.22, -0.11, 0, 0.11, 0.22];
  return lamp("Pendant light, cluster of 5 globes", 0.6, 0.3, CEIL, [
    b(0, CEIL - 0.015, 0, 0.5, 0.03, 0.08, WHITE, { ...K.MATT, bevel: 0.01 }),
    ...xs.flatMap((x, i) => {
      const y = CEIL - drops[i];
      const z = (i % 2 ? 1 : -1) * 0.06;
      return [cord(x, z, y + 0.1, BLACK), K.turned(x, y + 0.085, z, [[0.014, 0], [0.022, 0.012], [0.014, 0.03]], BLACK, { ...K.BLACK_METAL, detail: 1 }), sp(x, y, z, 0.18, GLOW, { glow: true })];
    }),
  ], CEIL - 0.8);
};
const chandelierClassic = (): Def => {
  const arms = 6;
  return lamp("Chandelier, classic 6 arms", 0.8, 0.8, CEIL, [
    ...canopy(), cy(0, CEIL - 0.25, 0, 0.02, 0.45, BRASS, BR),
    sp(0, 2.2, 0, 0.12, BRASS, BR), sp(0, 2.05, 0, 0.09, BRASS, BR),
    ...Array.from({ length: arms }, (_, i) => {
      const a = (i * 2 * PI) / arms;
      const x = Math.sin(a) * 0.3;
      const z = Math.cos(a) * 0.3;
      return [
        b(x / 2, 2.0, z / 2, 0.02, 0.02, 0.3, BRASS, { ...BR, bevel: 0.006, r: [0, a, 0] }),
        K.turned(x, 2.015, z, [[0.012, 0], [0.02, 0.008], [0.022, 0.02], [0.02, 0.03]], BRASS, BR),
        K.turned(x, 2.05, z, [[0.016, 0], [0.015, 0.1]], CREAM, { ...K.CERAMIC, rough: 0.5 }),
        sp(x / 2, 2.03, z / 2, 0.03, BRASS, { ...BR, detail: 1 }),
        sp(x, 1.99, z, 0.022, "#dfeef5", { tex: "ceramic", rough: 0.05, detail: 2 }),
        sp(x, 2.17, z, 0.04, GLOW, { glow: true }),
      ];
    }).flat(),
    K.turned(0, 1.89, 0, [[0.012, 0.12], [0.02, 0.09], [0.012, 0.06], [0.02, 0.03], [0.012, 0]], BRASS, BR),
  ], 2.1);
};
const chandelierRing = (): Def => {
  const seg = 14;
  const R = 0.34;
  return lamp("Chandelier, modern ring", 0.8, 0.8, CEIL, [
    ...canopy(),
    ...[0, 1, 2].map((i) => {
      const a = (i * 2 * PI) / 3 + 0.3;
      return cord(Math.sin(a) * R * 0.8, Math.cos(a) * R * 0.8, 2.1);
    }),
    ...Array.from({ length: seg }, (_, i) => {
      const a = (i * 2 * PI) / seg;
      return b(Math.sin(a) * R, 2.05, Math.cos(a) * R, 0.05, 0.04, 2 * R * Math.tan(PI / seg) + 0.01, BRASS, { ...BR, bevel: 0.006, r: [0, a + PI / 2, 0] });
    }),
    ...Array.from({ length: seg }, (_, i) => {
      const a = ((i + 0.5) * 2 * PI) / seg;
      return sp(Math.sin(a) * R / Math.cos(PI / seg), 2.05, Math.cos(a) * R / Math.cos(PI / seg), 0.055, BRASS, { ...BR, detail: 1 });
    }),
    ...Array.from({ length: seg }, (_, i) => {
      const a = (i * 2 * PI) / seg;
      return b(Math.sin(a) * (R - 0.025), 2.05, Math.cos(a) * (R - 0.025), 0.012, 0.025, 2 * R * Math.tan(PI / seg), GLOW, { glow: true, r: [0, a + PI / 2, 0] });
    }),
  ], 2.05);
};
const pendantLinear = (w: number): Def =>
  lamp(`Pendant light, linear ${Math.round(w * 100)} cm`, w, 0.1, CEIL, [
    ...[-1, 1].map((s) => cord(s * (w / 2 - 0.15), 0, 1.95)),
    b(0, CEIL - 0.015, 0, w - 0.2, 0.03, 0.06, WHITE, { ...K.MATT, bevel: 0.008 }),
    b(0, 1.95, 0, w, 0.06, 0.1, BLACK, { ...K.BLACK_METAL, bevel: 0.012 }),
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.15), 1.985, 0, 0.04, 0.01, 0.04, METAL, { ...K.STEEL, detail: 1 })),
    b(0, 1.915, 0, w - 0.04, 0.012, 0.07, GLOW, { glow: true }),
  ], 1.9);
const track = (w: number, heads: number): Def => {
  const xs = Array.from({ length: heads }, (_, i) => -w / 2 + 0.2 + (i * (w - 0.4)) / (heads - 1));
  return lamp(`Track light, ${heads} spots ${Math.round(w * 100)} cm`, w, 0.15, CEIL, [
    b(0, CEIL - 0.02, 0, w, 0.04, 0.04, WHITE, { ...K.MATT, bevel: 0.006 }),
    ...xs.flatMap((x, i) => {
      const a = (i % 2 ? 0.45 : -0.45);
      return [
        cy(x, CEIL - 0.08, 0, 0.02, 0.08, METAL, K.STEEL),
        cy(x, CEIL - 0.19, 0.0, 0.07, 0.14, WHITE, { ...K.PLASTIC, bevel: 0.006, r: [a, 0, 0] }),
        cy(x, CEIL - 0.15, 0, 0.078, 0.012, METAL, { ...K.STEEL, bevel: 0, detail: 1, r: [a, 0, 0] }),
        cy(x, CEIL - 0.19 - Math.cos(a) * 0.072, Math.sin(a) * 0.072, 0.055, 0.012, GLOW, { glow: true, r: [a, 0, 0] }),
      ];
    }),
  ], CEIL - 0.25);
};

// ---------- floor lamps ----------
const arcLamp = (): Def => {
  const R = 0.8;
  const x0 = -0.55;
  const arc = Array.from({ length: 8 }, (_, i) => {
    const t0 = (i * PI) / 2 / 8;
    const t1 = ((i + 1) * PI) / 2 / 8;
    return wire(x0 + R * (1 - Math.cos(t0)), 1.1 + R * Math.sin(t0), x0 + R * (1 - Math.cos(t1)), 1.1 + R * Math.sin(t1), 0, 0.025, METAL, K.STEEL);
  });
  return lamp("Floor lamp, arc with marble base", 1.45, 0.3, 2.0, [
    b(x0, 0.04, 0, 0.3, 0.08, 0.22, MARBLE, { ...K.STONE, bevel: 0.012 }),
    cy(x0, 0.6, 0, 0.025, 1.1, METAL, K.STEEL),
    ...arc,
    K.shade(x0 + R + 0.05, 1.7, 0, 0.06, 0.34, 0.16, WHITE, { ...K.MATT, rough: 0.5 }),
    cy(x0 + R + 0.05, 1.7, 0, 0.3, 0.02, GLOW, { glow: true }),
    cy(x0 + R + 0.05, 1.88, 0, 0.04, 0.05, METAL, K.STEEL),
  ], 1.7);
};
const tripodLamp = (): Def =>
  lamp("Floor lamp, wooden tripod", 0.5, 0.5, 1.6, [
    ...[0, 1, 2].map((i) => {
      const a = (i * 2 * PI) / 3 + 0.5;
      return strut(Math.sin(a) * 0.2, Math.cos(a) * 0.2, Math.sin(a) * 0.02, Math.cos(a) * 0.02, 1.2, 0.03, WOOD, { ...K.WOOD, m: true });
    }),
    K.turned(0, 1.175, 0, [[0.03, 0], [0.05, 0.012], [0.05, 0.035], [0.03, 0.05]], BLACK, K.BLACK_METAL),
    K.shade(0, 1.25, 0, 0.38, 0.42, 0.3, CREAM, SHADE),
    cy(0, 1.547, 0, 0.385, 0.008, BRASS, { ...BR, bevel: 0, detail: 1 }),
    cy(0, 1.253, 0, 0.425, 0.008, BRASS, { ...BR, bevel: 0, detail: 1 }),
    cy(0, 1.3, 0, 0.38, 0.02, GLOW, { glow: true }),
  ], 1.35);
const torchiere = (): Def =>
  lamp("Floor lamp, uplighter", 0.34, 0.34, 1.85, [
    K.turned(0, 0, 0, [[0.15, 0], [0.15, 0.012], [0.12, 0.028], [0.03, 0.03]], BLACK, K.BLACK_METAL),
    cy(0, 0.9, 0, 0.025, 1.8, BRASS, BR),
    K.turned(0, 1.67, 0, [[0.05, 0], [0.05, 0.03], [0.04, 0.04], [0.1, 0.125]], BRASS, BR),
    K.turned(0, 1.795, 0, [[0.1, 0], [0.14, 0.02], [0.16, 0.05]], WHITE, { ...K.CERAMIC, rough: 0.4 }),
    cy(0, 1.03, 0, 0.04, 0.03, BRASS, { ...BR, detail: 1 }),
    cy(0, 1.85, 0, 0.28, 0.02, GLOW, { glow: true }),
  ], 1.8);
const readingLamp = (): Def =>
  lamp("Floor lamp, reading light", 0.6, 0.3, 1.5, [
    K.turned(-0.15, 0, 0, [[0.13, 0], [0.13, 0.012], [0.1, 0.028], [0.015, 0.03]], BLACK, K.BLACK_METAL),
    cy(-0.15, 0.7, 0, 0.02, 1.4, BLACK, K.BLACK_METAL),
    wire(-0.15, 1.4, 0.0, 1.5, 0, 0.02, BLACK, K.BLACK_METAL),
    sp(-0.15, 1.4, 0, 0.04, BLACK, { ...K.BLACK_METAL, detail: 1 }),
    K.shade(0.14, 1.29, 0, 0.16, 0.22, 0.14, "#b8683f", SHADE),
    cy(0.14, 1.28, 0, 0.19, 0.015, GLOW, { glow: true }),
  ], 1.3);

// ---------- table lamps (set the height to 0.75 m to stand them on a table) ----------
const tableLamp = (label: string, parts: Part[], h: number, w = 0.35): Def => lamp(label, w, w, h, parts, h * 0.7);
const classicLamp = (): Def => tableLamp("Table lamp, classic", [
  K.turned(0, 0, 0, [[0.07, 0], [0.07, 0.015], [0.05, 0.03]], BRASS, BR),
  K.turned(0, 0.03, 0, [[0.05, 0], [0.08, 0.04], [0.09, 0.1], [0.08, 0.16], [0.04, 0.2], [0.02, 0.25], [0.02, 0.31]], "#4a6b8a", { ...K.CERAMIC, m: true }),
  K.shade(0, 0.32, 0, 0.22, 0.3, 0.2, CREAM, SHADE),
  cy(0, 0.2, 0, 0.05, 0.012, BRASS, { ...BR, detail: 1 }),
  cy(0, 0.35, 0, 0.26, 0.02, GLOW, { glow: true }),
], 0.52);
const mushroomLamp = (): Def => tableLamp("Table lamp, mushroom", [
  K.turned(0, 0, 0, [[0.09, 0], [0.09, 0.012], [0.06, 0.02]], WHITE, K.PLASTIC),
  K.turned(0, 0.01, 0, [[0.04, 0], [0.025, 0.04], [0.025, 0.2], [0.03, 0.24]], WHITE, K.PLASTIC),
  cy(0, 0.2, 0, 0.065, 0.01, BRASS, { ...BR, detail: 1 }),
  sp(0, 0.29, 0, 0.26, GLOW, { glow: true }),
], 0.42, 0.28);
const industrialLamp = (): Def => tableLamp("Table lamp, industrial", [
  K.turned(0, 0, 0, [[0.08, 0], [0.08, 0.015], [0.05, 0.03]], BLACK, K.BLACK_METAL),
  cy(0, 0.17, 0, 0.02, 0.3, BLACK, K.BLACK_METAL),
  wire(0, 0.32, 0.12, 0.4, 0, 0.02, BLACK, K.BLACK_METAL),
  K.turned(0.14, 0.33, 0, [[0.07, 0], [0.066, 0.02], [0.045, 0.07], [0.015, 0.1]], BLACK, { ...K.BLACK_METAL, r: [0, 0, 0.3] }),
  sp(0, 0.32, 0, 0.04, BLACK, { ...K.BLACK_METAL, detail: 1 }),
  sp(0.15, 0.33, 0, 0.05, GLOW, { glow: true }),
], 0.5, 0.44);
const moonLamp = (): Def => tableLamp("Kids lamp, moon", [
  K.turned(0, 0, 0, [[0.06, 0], [0.06, 0.012], [0.04, 0.03]], WOOD, K.WOOD),
  sp(0, 0.13, 0, 0.18, "#fff6d8", { glow: true }),
], 0.25, 0.2);
const bedsideLamp = (): Def => tableLamp("Bedside lamp, small", [
  K.turned(0, 0, 0, [[0.04, 0], [0.05, 0.05], [0.05, 0.12], [0.03, 0.19], [0.03, 0.2]], WHITE, { ...K.CERAMIC, m: true }),
  cy(0, 0.27, 0, 0.2, 0.14, GLOW, { glow: true }),
  cy(0, 0.35, 0, 0.17, 0.01, CREAM, { ...SHADE, bevel: 0.004 }),
], 0.37, 0.22);

// ---------- wall sconces ----------
const sconce = (label: string, parts: Part[], w: number, h: number): Def => lamp(label, w, 0.3, h, parts, 1.75, "#ffd9a0", true);
const sconceClassic = (): Def => sconce("Wall light, classic", [
  b(0, 1.7, -0.08, 0.1, 0.2, 0.02, BRASS, { ...BR, bevel: 0.006 }),
  b(0, 1.68, -0.03, 0.02, 0.02, 0.1, BRASS, { ...BR, bevel: 0.006 }),
  cy(0, 1.74, 0.0, 0.03, 0.1, GLOW, { glow: true }),
  K.shade(0, 1.75, 0, 0.14, 0.1, 0.16, CREAM, SHADE),
  ...[-1, 1].map((s) => sp(0.0, 1.7 + s * 0.07, -0.065, 0.015, BRASS, { ...BR, detail: 2 })),
], 0.18, 1.95);
const sconceBar = (): Def => sconce("Wall light, modern bar", [
  b(0, 1.7, -0.08, 0.04, 0.05, 0.02, BLACK, K.BLACK_METAL),
  discZ(0, 1.7, -0.04, 0.05, 0.06, BLACK, { ...K.BLACK_METAL, r: [0, 0, PI2] }),
  cy(0, 1.7, -0.01, 0.05, 0.45, GLOW, { glow: true, r: [0, 0, PI2] }),
  cy(0, 1.7, -0.01, 0.06, 0.04, BLACK, { ...K.BLACK_METAL, r: [0, 0, PI2] }),
  ...[-1, 1].map((s) => cy(s * 0.235, 1.7, -0.01, 0.062, 0.03, BLACK, { ...K.BLACK_METAL, detail: 1, r: [0, 0, PI2] })),
], 0.5, 1.8);
const sconceSwing = (): Def => sconce("Wall light, swing arm", [
  b(0, 1.7, -0.08, 0.07, 0.07, 0.02, BLACK, { ...K.BLACK_METAL, bevel: 0.005 }),
  b(0, 1.7, -0.01, 0.015, 0.015, 0.14, BLACK, K.BLACK_METAL),
  b(0.12, 1.7, 0.06, 0.28, 0.015, 0.015, BLACK, { ...K.BLACK_METAL, r: [0, -0.35, 0] }),
  K.shade(0.25, 1.63, 0.1, 0.08, 0.12, 0.1, WHITE, K.PLASTIC),
  sp(0.245, 1.7, 0.085, 0.03, BLACK, { ...K.BLACK_METAL, detail: 1 }),
  cy(0.25, 1.62, 0.1, 0.09, 0.012, GLOW, { glow: true }),
], 0.64, 1.8);

// ---------- strips and string lights (flat or wall-hung) ----------
/** A glowing line: sits on a worktop edge, under a cabinet or around a headboard. h <= 5 cm so walls never block it. */
const ledStrip = (len: number, color: string): Def =>
  piece("Lighting & devices", `LED strip ${len} m`, len, 0.03, 0.02, [
    b(0, 0.006, 0, len, 0.012, 0.02, "#e6e4df", { ...K.PLASTIC, bevel: 0.002 }),
    ...(len > 1 ? Array.from({ length: Math.floor(len) + 1 }, (_, i) => b(-len / 2 + 0.05 + i * ((len - 0.1) / Math.floor(len)), 0.006, 0, 0.012, 0.014, 0.022, "#b8bcc2", { ...K.STEEL, detail: 2 })) : []),
    b(0, 0.013, 0, len - 0.02, 0.004, 0.012, color, { glow: true }),
  ], { light: { y: 0.01, color, k: 0.5 } });
/** Draped string: wire sagging between two ends, a glowing bulb every `step`. */
const drape = (label: string, w: number, top: number, sag: number, step: number, dia: number, color: string): Def => {
  const n = Math.round(w / step);
  const at = (u: number) => [-w / 2 + 0.02 + (u * (w - 0.04)) / n, top - sag * (1 - ((2 * u) / n - 1) ** 2)] as const;
  return piece("Lighting & devices", label, w, 0.06, top + 0.05, [
    ...Array.from({ length: n }, (_, i) => wire(...at(i), ...at(i + 1), 0, 0.01, BLACK, K.RUBBER)),
    ...Array.from({ length: n + 1 }, (_, i) => sp(at(i)[0], at(i)[1] - dia / 2, 0.01, dia, color, { glow: true })),
    ...[0, n].map((i) => cy(at(i)[0], top + 0.015, -0.0, 0.03, 0.03, BLACK, K.PLASTIC)),
    ...(dia > 0.04 ? Array.from({ length: n + 1 }, (_, i) => cy(at(i)[0], at(i)[1] + 0.008, 0.01, 0.02, 0.016, BLACK, { ...K.PLASTIC, detail: 2 })) : []),
  ], { wall: true, light: { y: top - sag, color, k: 0.6 } });
};
const fairyCurtain = (): Def => {
  const n = 9;
  return piece("Lighting & devices", "Fairy light curtain 1.5 m", 1.5, 0.05, 2.3, [
    b(0, 2.28, 0, 1.5, 0.015, 0.015, BLACK, K.PLASTIC),
    ...Array.from({ length: n }, (_, i) => {
      const x = -0.7 + (i * 1.4) / (n - 1);
      const len = 1.5 + (i % 3) * 0.15;
      return [cy(x, 2.28 - len / 2, 0, 0.006, len, DGREY, { ...K.RUBBER, bevel: 0 }), ...Array.from({ length: 5 }, (_, k) => sp(x, 2.2 - k * (len / 5.2), 0.01, 0.03, GLOW, { glow: true }))];
    }).flat(),
  ], { wall: true, light: { y: 1.6, color: GLOW, k: 0.5 } });
};

export const LIGHTS: Record<string, Def> = {
  dc_ceiling_pendant_globe_30: pendantGlobe(0.3, 0.75, BRASS),
  dc_ceiling_pendant_globe_45: pendantGlobe(0.45, 0.8, BLACK),
  dc_ceiling_pendant_dome_35: pendantCone(0.35, 0.7, "#2f3c52"),
  dc_ceiling_pendant_dome_55: pendantCone(0.55, 0.8, WHITE),
  dc_ceiling_pendant_cluster: pendantCluster(),
  dc_ceiling_chandelier_classic: chandelierClassic(),
  dc_ceiling_chandelier_ring: chandelierRing(),
  dc_ceiling_pendant_linear_90: pendantLinear(0.9),
  dc_ceiling_pendant_linear_150: pendantLinear(1.5),
  dc_ceiling_track_2: track(0.9, 2),
  dc_ceiling_track_3: track(1.4, 3),
  dc_ceiling_track_4: track(2.0, 4),
  dc_lamp_floor_arc: arcLamp(),
  dc_lamp_floor_tripod: tripodLamp(),
  dc_lamp_floor_uplight: torchiere(),
  dc_lamp_floor_reading: readingLamp(),
  dc_lamp_table_classic: classicLamp(),
  dc_lamp_table_mushroom: mushroomLamp(),
  dc_lamp_table_industrial: industrialLamp(),
  dc_lamp_table_moon: moonLamp(),
  dc_lamp_table_bedside: bedsideLamp(),
  dc_sconce_classic: sconceClassic(),
  dc_sconce_bar: sconceBar(),
  dc_sconce_swing: sconceSwing(),
  dc_led_strip_1m: ledStrip(1, "#ffd9a0"),
  dc_led_strip_2m: ledStrip(2, "#ffd9a0"),
  dc_led_strip_3m_color: ledStrip(3, "#ff6aa8"),
  dc_string_lights_3m: drape("String lights, festoon 3 m", 3.0, 2.3, 0.35, 0.3, 0.06, "#ffe2a8"),
  dc_string_lights_2m: drape("String lights, festoon 2 m", 2.0, 2.3, 0.25, 0.25, 0.055, "#ffe2a8"),
  dc_fairy_lights_2m: drape("Fairy lights, warm 2 m", 2.0, 2.2, 0.2, 0.1, 0.025, "#ffd27a"),
  dc_fairy_curtain: fairyCurtain(),
};

