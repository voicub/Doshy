import type { Def, Part } from "../catalog";
import { BLACK, BULB_OFF, DARK, GREY, PI, STEEL, WARM, b, cy, flame, gd, globe, led, lit, range, ring, rod, seg2, sp, strand, swung } from "./kit.ts";

// String lights, lanterns, torches, fire bowl, floodlight, neon, canopy and the controller box. Lighting rules: see lib/garden/lights.ts
// (light y <= 1.78: higher sources would count as ceiling lamps and take the indoor lamps' shadow slots, so overhead strings aim their pool from 1.7 m).
const HOOK_Y = 2.6;
const PIPE = "#2b2e33";
const ORANGE = "#ff9a4a";

/** Festoon / cafe string lights: big round bulbs on a wire sagging between two hooks `len` m apart. */
const festoon = (len: number, posts = false): Def => {
  const L = posts ? len - 0.3 : len, sag = 0.12 + len * 0.045;
  const hooks = [-1, 1].map((s) => b((s * L) / 2, HOOK_Y + 0.02, 0, 0.04, 0.05, 0.04, DARK));
  const poles = posts ? [-1, 1].flatMap((s) => [cy((s * L) / 2, HOOK_Y / 2, 0, 0.07, HOOK_Y, "#5a5f66", { m: true }), cy((s * L) / 2, 0.02, 0, 0.22, 0.04, DARK)]) : [];
  return gd(posts ? `Festoon lights on two posts ${len} m` : `Festoon string lights ${len} m`, len, 0.24, HOOK_Y + 0.06, [
    ...poles, ...hooks, ...strand(L, HOOK_Y, sag, 0, Math.max(3, Math.round(len / 0.55)), (x, y, z) => globe(x, y, z, 0.09, BULB_OFF)),
  ], { ...lit(1.7, WARM, 0.7), tags: "festoon cafe bistro string lights bulbs patio terrace catenary outdoor wire garland" });
};

/** Fine fairy-light string, twinkling. */
const fairyString = (len: number): Def =>
  gd(`Fairy light string ${len} m`, len, 0.12, 2.5, strand(len, 2.4, 0.25, 0, Math.round(len * 9), (x, y, z) => led(x, y, z, 0.026, BULB_OFF, 1), "#8a8f96"), {
    ...lit(1.7, WARM, 0.45), tags: "fairy lights string twinkle wire led garland outdoor drape",
  });

/** A 3 x 3 m patio canopy of fairy-light strings on four slim posts. */
const canopy = (): Def => {
  const zs = [-1.1, -0.55, 0, 0.55, 1.1];
  return gd("Fairy light canopy 3 x 3 m", 3.0, 3.0, 2.55, [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 1.45, 1.25, sz * 1.45, 0.05, 2.5, "#5a5f66", { m: true }))),
    ...[-1, 1].map((s) => b(0, 2.51, s * 1.45, 2.95, 0.03, 0.03, "#5a5f66", { m: true })),
    ...[-1, 1].map((s) => b(s * 1.45, 2.51, 0, 0.03, 0.03, 2.95, "#5a5f66", { m: true })),
    ...zs.flatMap((z, k) => strand(2.9, 2.48, 0.1, z, 9, (x, y, zz, i) => led(x, y, zz, 0.028, BULB_OFF, 1 + ((i + k) % 2) * 0.3), "#8a8f96", 6)),
  ], { ...lit(1.7, WARM, 0.6), tags: "fairy lights canopy ceiling patio pergola starry terrace twinkle" });
};

/** Open lantern frame with a flickering lit body, `s` metres wide. */
const lanternParts = (x: number, yBase: number, s: number, h: number): Part[] => {
  const body = { ...b(x, yBase + h / 2, 0, s * 0.8, h * 0.8, s * 0.8, "#ffe3b0", { glow: true }), twinkle: 2 };
  return [
    b(x, yBase + 0.015, 0, s, 0.03, s, DARK, { m: true }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(x + (sx * (s - 0.02)) / 2, yBase + h / 2, (sz * (s - 0.02)) / 2, 0.02, h, 0.02, DARK, { m: true }))),
    body, b(x, yBase + h + 0.015, 0, s, 0.03, s, DARK, { m: true }), b(x, yBase + h + 0.05, 0, s * 0.6, 0.04, s * 0.6, DARK, { m: true }),
  ];
};

const lanternGround = gd("Garden lantern 0.5 m", 0.26, 0.26, 0.55, [
  ...lanternParts(0, 0, 0.24, 0.32),
  b(0, 0.48, 0, 0.16, 0.012, 0.012, STEEL), b(-0.08, 0.45, 0, 0.012, 0.06, 0.012, STEEL), b(0.08, 0.45, 0, 0.012, 0.06, 0.012, STEEL),
  b(0, 0.51, 0, 0.14, 0.012, 0.012, STEEL),
], { ...lit(0.2, ORANGE, 0.35), tags: "lantern candle ground garden moroccan flicker" });

const candles = gd("Candle lanterns, set of 3", 0.5, 0.3, 0.3, [
  ...[[-0.17, 0.0, 0.12], [0.02, -0.04, 0.2], [0.18, 0.05, 0.15]].flatMap(([x, z, h]) => [
    b(x, 0.01, z, 0.11, 0.02, 0.11, DARK),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(x + sx * 0.05, h / 2 + 0.01, z + sz * 0.05, 0.012, h, 0.012, DARK))),
    cy(x, 0.06, z, 0.07, 0.08, "#f3e8cf"), flame(x, 0.12, z, 0.03),
    b(x, h + 0.015, z, 0.11, 0.015, 0.11, DARK),
  ]),
], { ...lit(0.12, ORANGE, 0.3), tags: "candle lanterns set tealight table garden flame" });

/** Shepherd's crook with a lantern that sways in the wind. */
const crookLantern = (): Def => {
  const arc = range(7).map((i) => {
    const a0 = PI - (i / 7) * PI, a1 = PI - ((i + 1) / 7) * PI;
    return seg2(0.2 * Math.cos(a0), 1.85 + 0.2 * Math.sin(a0), 0.2 * Math.cos(a1), 1.85 + 0.2 * Math.sin(a1), 0, 0.03, PIPE);
  });
  const sway = (p: Part) => swung(p, 1.8, 5, 12, "z");
  return gd("Hanging lantern on a hook post 2 m", 0.6, 0.3, 2.07, [
    cy(-0.2, 0.01, 0, 0.18, 0.02, PIPE), cy(-0.2, 0.93, 0, 0.03, 1.86, PIPE, { m: true }), ...arc,
    b(0.2, 1.82, 0, 0.012, 0.04, 0.012, PIPE),
    ...[sway(b(0.2, 1.73, 0, 0.01, 0.12, 0.01, STEEL)), ...lanternParts(0.2, 1.37, 0.14, 0.22).map(sway)],
  ], { wind: true, ...lit(1.5, ORANGE, 0.35), tags: "lantern hanging crook shepherd hook post garden candle sway" });
};

const tiki = gd("Tiki torch 1.7 m", 0.2, 0.2, 1.82, [
  cy(0, 0.7, 0, 0.045, 1.4, "#8a6a45", { m: true }), cy(0, 0.35, 0, 0.055, 0.04, "#d9c08a"), cy(0, 0.9, 0, 0.055, 0.04, "#d9c08a"),
  cy(0, 1.5, 0, 0.12, 0.1, DARK), cy(0, 1.57, 0, 0.17, 0.04, DARK),
  flame(0, 1.66, 0, 0.07), flame(0.02, 1.7, 0.01, 0.045),
], { ...lit(1.7, ORANGE, 0.5), tags: "tiki torch flame bamboo pole garden party fire" });

const fireBowl = gd("Fire bowl on a stand 0.6 m", 0.62, 0.62, 0.85, [
  cy(0, 0.04, 0, 0.3, 0.08, DARK), cy(0, 0.3, 0, 0.14, 0.5, DARK, { m: true }),
  cy(0, 0.56, 0, 0.62, 0.1, "#3a3d42", { m: true }), cy(0, 0.62, 0, 0.58, 0.03, "#2a2c30"),
  cy(0, 0.64, 0, 0.5, 0.012, "#ff7a2a", { glow: true }),
  ...ring(3, 0.1, (x, z, _a, i) => flame(x, 0.7 + (i % 2) * 0.03, z, 0.1 - i * 0.012)), flame(0, 0.75, 0, 0.13),
], { ...lit(0.7, ORANGE, 0.8), tags: "fire bowl pit brazier flame glow garden patio warmth" });

const solarPost = gd("Solar lamp post 1.4 m", 0.22, 0.22, 1.42, [
  cy(0, 0.02, 0, 0.14, 0.04, PIPE), cy(0, 0.6, 0, 0.05, 1.1, PIPE, { m: true }),
  ...lanternParts(0, 1.08, 0.14, 0.22).map((p, i, all) => (i === all.length - 1 ? { ...p, p: [0, 1.38, 0] as [number, number, number] } : p)),
  b(0, 1.405, 0, 0.18, 0.012, 0.18, "#223a5a", { r: [0.18, 0, 0] }),
], { ...lit(1.2, WARM, 0.35), tags: "solar lamp post garden path light lantern sun powered" });

/** Wall floodlight with a motion sensor; the wall is at -z. */
const flood = (() => {
  const head = (s: number): Part[] => [
    rod([s * 0.06, 1.75, -0.04], [s * 0.13, 1.74, 0.03], 0.02, DARK),
    b(s * 0.14, 1.7, 0.06, 0.15, 0.1, 0.08, DARK, { r: [0.5, 0, 0] }),
    b(s * 0.14, 1.678, 0.098, 0.13, 0.08, 0.008, "#fff8e0", { glow: true, r: [0.5, 0, 0] }),
  ];
  return gd("Motion floodlight, twin head", 0.44, 0.2, 1.9, [
    b(0, 1.76, -0.09, 0.1, 0.16, 0.02, DARK), b(0, 1.76, -0.06, 0.07, 0.1, 0.05, DARK),
    sp(0, 1.76, -0.01, 0.07, "#f2f1ee"), led(0, 1.82, 0.02, 0.016, "#ff7a6a"),
    ...head(-1), ...head(1),
  ], { wall: true, ...lit(1.7, "#f2f7ff", 1.2), tags: "floodlight motion sensor pir security light garden wall led flood" });
})();

/** Backing board with a glowing neon tube path, wall mounted at about 1.4 m (wall at -z). */
const neon = (label: string, tubes: Part[], w: number, h: number, color: string, tags: string): Def =>
  gd(label, w + 0.06, 0.06, 1.4 + h / 2 + 0.03, [b(0, 1.4, -0.015, w + 0.04, h + 0.04, 0.02, "#1b1d22", { m: true }), ...tubes], { wall: true, ...lit(1.4, color, 0.35), tags: `neon sign glow tube wall decor ${tags}` });
const wavePts = range(25).map((i) => [-0.36 + (i / 24) * 0.72, 1.46 + 0.06 * Math.sin((i / 24) * PI * 4)] as const);
const neonWave = neon("Neon script sign, wavy line", [
  ...wavePts.slice(1).map(([x, y], i) => seg2(wavePts[i][0], wavePts[i][1], x, y, 0.005, 0.016, "#ff9bf0", { glow: true })),
  seg2(-0.3, 1.3, 0.3, 1.3, 0.005, 0.016, "#ff9bf0", { glow: true }), led(0.38, 1.3, 0.005, 0.03, "#ff9bf0"),
], 0.9, 0.36, "#ff6ad5", "welcome wavy script");
const neonRing = neon("Neon ring sign", [
  ...range(24).map((i) => seg2(0.22 * Math.cos((i / 24) * PI * 2), 1.4 + 0.22 * Math.sin((i / 24) * PI * 2), 0.22 * Math.cos(((i + 1) / 24) * PI * 2), 1.4 + 0.22 * Math.sin(((i + 1) / 24) * PI * 2), 0.005, 0.016, "#9be8ff", { glow: true })),
  ...range(4).map((i) => seg2(0, 1.4, 0.13 * Math.cos((i / 4) * PI * 2 + 0.4), 1.4 + 0.13 * Math.sin((i / 4) * PI * 2 + 0.4), 0.005, 0.014, "#9be8ff", { glow: true })),
], 0.5, 0.5, "#5ad7ff", "ring circle star");

/** Weatherproof smart controller box: status LEDs glow while the linked switch is on (no light of its own). */
const controller = gd("Smart garden light controller box", 0.2, 0.1, 1.4, [
  b(0, 1.2, -0.01, 0.18, 0.24, 0.07, GREY), b(0, 1.2, 0.027, 0.15, 0.2, 0.006, "#2b2e33"),
  ...[0, 1, 2].map((i) => led(-0.045, 1.27 - i * 0.04, 0.034, 0.016, "#7fe8a0")),
  b(0.025, 1.24, 0.033, 0.07, 0.07, 0.004, "#3a3d42"), cy(0.075, 1.36, -0.01, 0.01, 0.12, BLACK),
  ...[-0.05, 0, 0.05].map((x) => cy(x, 1.06, -0.01, 0.022, 0.06, BLACK)),
], { wall: true, tags: "controller box smart switch relay transformer driver garden lighting zigbee wifi shelly" });

export const HANG_LIGHTS: Record<string, Def> = {
  gd_festoon_3: festoon(3), gd_festoon_5: festoon(5), gd_festoon_8: festoon(8), gd_festoon_12: festoon(12),
  gd_festoon_posts_5: festoon(5, true),
  gd_fairy_string_5: fairyString(5),
  gd_fairy_canopy: canopy(),
  gd_lantern_ground: lanternGround,
  gd_lantern_candles: candles,
  gd_lantern_hook: crookLantern(),
  gd_tiki_torch: tiki,
  gd_fire_bowl: fireBowl,
  gd_solar_post: solarPost,
  gd_flood_motion: flood,
  gd_neon_wave: neonWave,
  gd_neon_ring: neonRing,
  gd_light_controller: controller,
};
