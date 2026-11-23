import type { Def, Part } from "../catalog";
import { b, cy, sp, cx, cz, rod, el, ring, range, plantAt, gd, wheelRing, PI, RED, GOLD, WOOD, OAK, DARK, STEEL, WHITE, BLACK, LEAF1, LEAF2, LEAF3, STONE, GREY, ROPE } from "./kit.ts";

const ANTH = "#4a4d52", PINK = "#e07aa6";
const GREENS = [LEAF1, LEAF2, LEAF3, "#5e8f45"];

const verticalGarden = gd("Vertical garden wall 1.2 x 1.8 m", 1.2, 0.25, 1.8, [
  ...[-1, 1].map((s) => b(s * 0.58, 0.9, 0, 0.04, 1.8, 0.1, WOOD, { m: true })), b(0, 0.04, 0, 1.2, 0.08, 0.16, WOOD, { m: true }), b(0, 1.78, 0, 1.2, 0.04, 0.12, WOOD, { m: true }),
  b(0, 0.92, -0.04, 1.12, 1.68, 0.02, "#3a3d36"),
  ...range(5).flatMap((r) => range(4).flatMap((c) => {
    const x = -0.42 + c * 0.28, y = 0.25 + r * 0.33, i = r * 4 + c;
    return [b(x, y, 0.0, 0.25, 0.2, 0.1, "#4d5a48", { m: true }), el(x, y + 0.13, 0.02, 0.25, 0.17, 0.12, GREENS[i % 4]), ...(i % 3 === 0 ? [sp(x + 0.04, y + 0.18, 0.08, 0.05, i % 2 ? PINK : GOLD)] : [])];
  })),
], { tags: "outdoor living wall green pockets plants frame" });

const trellis = gd("Trellis with climbing plants 1.2 x 2.0 m", 1.2, 0.36, 2.0, [
  ...[-1, 1].map((s) => b(s * 0.58, 0.95, 0, 0.04, 1.9, 0.04, WOOD, { m: true })), b(0, 1.92, 0, 1.2, 0.04, 0.04, WOOD, { m: true }), b(0, 0.1, 0, 1.2, 0.04, 0.04, WOOD, { m: true }),
  ...range(5).map((i) => b(-0.4 + i * 0.2, 1.0, 0.02, 0.02, 1.8, 0.02, OAK, { m: true })),
  ...range(9).map((i) => b(0, 0.25 + i * 0.2, -0.02, 1.12, 0.02, 0.02, OAK, { m: true })),
  ...[[-0.3, 0.7, 0.3], [0.2, 1.0, 0.36], [-0.1, 1.4, 0.3], [0.35, 1.6, 0.28], [-0.35, 1.75, 0.26], [0.05, 0.4, 0.28]].map(([x, y, s], i) => el(x, y, 0.03, s, s * 1.2, 0.1, GREENS[i % 4])),
  ...[[-0.25, 0.8], [0.25, 1.1], [-0.05, 1.5], [0.4, 1.7], [-0.4, 1.8]].map(([x, y], i) => sp(x, y, 0.07, 0.07, i % 2 ? PINK : "#f6dc7a")),
  plantAt("rose", 0.5, 0.6, 0.3, 0, 0.05, 2, 0),
], { tags: "outdoor garden lattice screen climber fence wall" });

const roseArch = (() => {
  const arc = (z: number) => range(8).map((j) => {
    const a0 = (PI * j) / 8, a1 = (PI * (j + 1)) / 8;
    return rod([0.6 * Math.cos(a0), 1.7 + 0.6 * Math.sin(a0), z], [0.6 * Math.cos(a1), 1.7 + 0.6 * Math.sin(a1), z], 0.035, ANTH, { m: true });
  });
  return gd("Rose arch 1.4 x 2.4 m", 1.4, 0.6, 2.4, [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.6, 0.85, sz * 0.2, 0.04, 1.7, 0.04, ANTH, { m: true }))),
    ...[-1, 1].flatMap((sz) => arc(sz * 0.2)), ...range(5).map((i) => b(0, 2.22 + (i === 0 || i === 4 ? -0.3 : i === 1 || i === 3 ? -0.08 : 0.1), 0, 0.03, 0.03, 0.4, ANTH)),
    ...[-1, 1].flatMap((s) => [b(s * 0.6, 0.5, 0, 0.03, 0.03, 0.4, ANTH), b(s * 0.6, 1.1, 0, 0.03, 0.03, 0.4, ANTH)]),
    ...range(10).map((i) => { const a = (PI * (i + 0.5)) / 10; return el(0.6 * Math.cos(a), 1.7 + 0.6 * Math.sin(a), 0, 0.2, 0.18, 0.3, GREENS[i % 4]); }),
    ...[-1, 1].flatMap((s) => [el(s * 0.6, 1.3, 0, 0.14, 0.5, 0.26, GREENS[1]), el(s * 0.6, 0.9, 0, 0.14, 0.4, 0.26, GREENS[2])]),
    ...range(8).map((i) => { const a = (PI * (i + 0.8)) / 9; return sp(0.6 * Math.cos(a), 1.7 + 0.6 * Math.sin(a), 0.12 * (i % 2 ? 1 : -1), 0.07, i % 3 ? RED : PINK); }),
    plantAt("rose", 0.4, 0.8, 0.4, -0.5, 0, 1, 0), plantAt("rose", 0.4, 0.8, 0.4, 0.5, 0, 4, 0),
  ], { tags: "outdoor arbour entrance archway climbing roses" });
})();

const woodGate = gd("Wooden garden gate with posts 1.2 m", 1.2, 0.12, 1.3, [
  ...[-1, 1].flatMap((s) => [b(s * 0.55, 0.65, 0, 0.1, 1.3, 0.1, WOOD, { m: true }), b(s * 0.55, 1.28, 0, 0.13, 0.04, 0.13, OAK, { m: true })]),
  ...[-0.4, 0.4].map((x) => b(x, 0.6, 0, 0.06, 1.0, 0.04, OAK, { m: true })), b(0, 1.04, 0, 0.9, 0.08, 0.04, OAK, { m: true }), b(0, 0.22, 0, 0.9, 0.08, 0.04, OAK, { m: true }),
  rod([-0.4, 0.24, 0.025], [0.4, 1.02, 0.025], 0.06, OAK, { m: true }),
  ...range(7).map((i) => b(-0.33 + i * 0.11, 0.65, -0.02, 0.07, 0.95 - (i % 2 ? 0.06 : 0), 0.02, OAK, { m: true })),
  ...[0.3, 0.95].map((y) => b(-0.46, y, 0.04, 0.12, 0.03, 0.015, DARK)), b(0.38, 0.62, 0.035, 0.05, 0.02, 0.02, DARK), sp(0.38, 0.62, 0.05, 0.03, DARK),
], { tags: "outdoor fence door entrance wood garden" });

const ironGate = gd("Wrought-iron gate 1.0 m", 1.0, 0.1, 1.6, [
  ...[-1, 1].flatMap((s) => [b(s * 0.47, 0.75, 0, 0.07, 1.5, 0.07, BLACK, { m: true }), sp(s * 0.47, 1.52, 0, 0.1, GOLD), b(s * 0.47, 1.43, 0, 0.1, 0.03, 0.1, BLACK)]),
  b(0, 1.1, 0, 0.84, 0.03, 0.03, BLACK, { m: true }), b(0, 0.2, 0, 0.84, 0.03, 0.03, BLACK, { m: true }), b(0, 0.9, 0, 0.84, 0.02, 0.02, BLACK, { m: true }),
  ...range(9).flatMap((i) => { const x = -0.36 + i * 0.09, hi = i === 4 ? 1.3 : 1.2 + 0.04 * (1 - Math.abs(i - 4) / 4); return [b(x, 0.65 + (hi - 1.3) / 2 + 0.1, 0, 0.02, hi - 0.2 + 0.04, 0.02, BLACK, { m: true }), b(x, hi + 0.04, 0, 0.04, 0.04, 0.02, GOLD, { r: [0, 0, PI / 4] })]; }),
  ...ring(10, 0.09, (x, z, a) => b(x * 0.8, 1.26 + z, 0, 0.02, 0.02, 0.02, GOLD, { r: [0, 0, a] }), 0),
  b(0.3, 0.8, 0.03, 0.06, 0.02, 0.02, GOLD),
], { tags: "outdoor driveway entrance metal black door ornamental" });

const shower = gd("Outdoor shower stand 2.3 m", 0.4, 0.4, 2.3, [
  b(0, 0.03, 0, 0.4, 0.06, 0.4, WOOD, { m: true }), ...range(4).map((i) => b(0, 0.065, -0.15 + i * 0.1, 0.38, 0.01, 0.07, OAK, { m: true })),
  cy(0, 1.1, -0.1, 0.05, 2.1, STEEL), b(0, 2.17, -0.1, 0.03, 0.03, 0.18, STEEL), cy(0, 2.2, 0.03, 0.22, 0.03, STEEL), cy(0, 2.18, 0.03, 0.18, 0.015, GREY),
  cy(0, 1.2, -0.04, 0.025, 0.1, STEEL, { r: [PI / 2, 0, 0] }), sp(0, 1.2, 0.03, 0.06, GOLD), b(0.06, 1.35, -0.04, 0.1, 0.02, 0.02, GOLD),
  cy(0, 0.2, -0.06, 0.03, 0.28, STEEL), cy(0, 0.35, -0.02, 0.025, 0.03, STEEL, { r: [PI / 2, 0, 0] }), cy(0, 0.34, 0.04, 0.07, 0.02, GREY),
  ...[-1, 1].map((s) => b(s * 0.15, 1.7, -0.1, 0.02, 0.1, 0.03, DARK)), b(0, 1.9, -0.09, 0.05, 0.02, 0.05, DARK),
  ...[-1, 1].map((s) => cy(s * 0.08, 0.5, 0.1, 0.01, 0.16, "#8fd8f0")),
], { tags: "outdoor pool beach rinse shower shower-head tap wood" });

const bikeRack = (() => {
  const bike = (x: number): Part[] => [
    ...wheelRing(x, 0.33, -0.5, 0.66, 0.04, BLACK, STEEL, 8), ...wheelRing(x, 0.33, 0.5, 0.66, 0.04, BLACK, STEEL, 8),
    rod([x, 0.33, -0.5], [x, 0.32, -0.08], 0.025, RED, { m: true }), rod([x, 0.32, -0.08], [x, 0.85, -0.16], 0.03, RED, { m: true }),
    rod([x, 0.85, -0.16], [x, 0.76, 0.36], 0.025, RED, { m: true }), rod([x, 0.32, -0.08], [x, 0.76, 0.36], 0.035, RED, { m: true }),
    rod([x, 0.76, 0.36], [x, 0.33, 0.5], 0.025, STEEL), rod([x, 0.33, -0.5], [x, 0.85, -0.16], 0.02, RED, { m: true }),
    b(x, 0.9, -0.16, 0.05, 0.03, 0.18, BLACK), b(x, 0.88, 0.38, 0.4, 0.025, 0.025, BLACK), b(x, 0.82, 0.37, 0.02, 0.12, 0.02, STEEL),
    ...[-1, 1].map((s) => b(x + s * 0.2, 0.88, 0.38, 0.03, 0.03, 0.08, BLACK)), cz(x, 0.1, -0.06, 0.1, 0.03, DARK),
  ];
  return gd("Bike stand for 3 bikes 1.8 m", 1.8, 1.7, 1.0, [
    b(0, 0.04, 0.5, 1.8, 0.04, 0.04, ANTH, { m: true }), b(0, 0.04, -0.5, 1.8, 0.04, 0.04, ANTH, { m: true }),
    ...[-0.9, -0.3, 0.3, 0.9].flatMap((x) => [b(x - Math.sign(x) * 0.0, 0.2, 0.5, 0.025, 0.4, 0.025, ANTH, { m: true }), b(x, 0.2, -0.5, 0.025, 0.4, 0.025, ANTH, { m: true })]),
    ...[-0.6, 0, 0.6].flatMap(bike),
  ], { tags: "outdoor bicycle parking cycle shed storage rack" });
})();

const tumbler = gd("Compost tumbler 0.8 m", 0.8, 0.6, 0.95, [
  ...[-1, 1].flatMap((s) => [rod([s * 0.33, 0.02, -0.22], [s * 0.34, 0.6, 0], 0.04, DARK), rod([s * 0.33, 0.02, 0.22], [s * 0.34, 0.6, 0], 0.04, DARK), b(s * 0.33, 0.02, 0, 0.04, 0.04, 0.46, DARK)]),
  cx(0, 0.62, 0, 0.56, 0.62, "#3f7a4a", { m: true }), ...[-0.31, 0.31].map((x) => cx(x, 0.62, 0, 0.6, 0.04, DARK)), ...[-0.1, 0.1].map((x) => cx(x, 0.62, 0, 0.58, 0.015, "#2f5f3a", { m: true })),
  b(0, 0.9, 0.0, 0.3, 0.03, 0.2, "#2a2c2f"), b(0, 0.93, 0.0, 0.1, 0.02, 0.04, DARK), cx(0, 0.62, 0, 0.04, 0.78, STEEL),
  ...[-1, 1].map((s) => b(s * 0.2, 0.5, 0.29, 0.04, 0.04, 0.04, GREY)),
], { tags: "outdoor composter rotating drum recycling waste soil" });

const deckBox = gd("Outdoor storage box 1.3 m", 1.3, 0.6, 0.7, [
  b(0, 0.29, 0, 1.3, 0.58, 0.58, "#7d6a58", { m: true }), b(0, 0.62, 0, 1.32, 0.08, 0.6, "#8d7a66", { m: true }),
  ...range(4).map((i) => b(0, 0.1 + i * 0.13, 0.295, 1.28, 0.012, 0.01, DARK)), ...[-1, 1].map((s) => b(s * 0.655, 0.29, 0, 0.012, 0.56, 0.5, DARK)),
  ...[-1, 1].flatMap((s) => [b(s * 0.5, 0.3, 0.3, 0.06, 0.56, 0.015, DARK, { m: true }), b(s * 0.5, 0.58, -0.3, 0.05, 0.05, 0.015, STEEL), b(s * 0.62, 0.02, 0, 0.06, 0.04, 0.56, DARK)]),
  b(0, 0.55, 0.305, 0.12, 0.04, 0.015, STEEL), b(0, 0.55, 0.31, 0.06, 0.012, 0.008, GOLD), ...[-1, 1].map((s) => cy(s * 0.45, 0.02, -0.25, 0.08, 0.04, BLACK)),
], { tags: "outdoor deck box chest cushion bin patio wood lid" });

const hoseReel = gd("Hose reel and watering can 0.6 m", 0.6, 0.4, 0.55, [
  b(0, 0.015, 0, 0.5, 0.03, 0.34, DARK), ...[-1, 1].map((s) => b(s * 0.1, 0.17, -0.02, 0.025, 0.28, 0.025, ANTH, { m: true })), b(-0.1, 0.06, 0, 0.025, 0.04, 0.3, ANTH, { m: true }),
  cx(-0.1, 0.3, -0.02, 0.4, 0.02, ANTH, { m: true }), cx(0.0, 0.3, -0.02, 0.4, 0.02, ANTH, { m: true }), cx(-0.05, 0.3, -0.02, 0.3, 0.12, "#2f7a4a"), cx(-0.05, 0.3, -0.02, 0.18, 0.12, "#256a3a"),
  rod([-0.15, 0.3, 0.1], [-0.15, 0.36, 0.2], 0.02, ANTH), sp(-0.15, 0.36, 0.2, 0.05, GOLD),
  cy(0.19, 0.1, 0.0, 0.14, 0.2, "#3f7a4a", { m: true }), cy(0.19, 0.205, 0, 0.1, 0.01, "#3f7a4a"), rod([0.19, 0.12, 0.07], [0.19, 0.24, 0.16], 0.025, "#3f7a4a", { m: true }),
  b(0.19, 0.24, 0.17, 0.05, 0.02, 0.04, "#3f7a4a"), rod([0.19, 0.12, -0.07], [0.19, 0.24, -0.07], 0.02, "#3f7a4a"), b(0.19, 0.23, -0.1, 0.02, 0.1, 0.02, "#3f7a4a"),
], { tags: "outdoor garden hose tap watering can sprinkler" });

const flagpole = gd("Flagpole 5 m", 1.0, 0.3, 5.0, [
  cy(-0.4, 0.04, 0, 0.26, 0.08, STONE), cy(-0.4, 2.5, 0, 0.08, 5.0 - 0.2, WHITE), sp(-0.4, 4.9, 0, 0.12, GOLD), cy(-0.4, 0.15, 0, 0.12, 0.12, GREY),
  b(-0.32, 0.9, 0.0, 0.02, 0.5, 0.012, ROPE), b(-0.33, 1.2, 0.03, 0.04, 0.08, 0.02, STEEL),
  b(0.05, 4.4, 0, 0.9, 0.2, 0.01, RED, { m: true }), b(0.05, 4.2, 0, 0.9, 0.2, 0.01, WHITE), b(0.05, 4.0, 0, 0.9, 0.2, 0.01, "#3f6fb0", { m: true }),
  b(-0.38, 4.4, 0, 0.03, 0.03, 0.03, STEEL), b(-0.38, 4.0, 0, 0.03, 0.03, 0.03, STEEL),
], { tags: "outdoor pole flag national banner mast" });

const dryWall = (() => {
  const tones = ["#b9b4a8", "#a39d90", "#c8c2b4", "#8f8a7f"];
  const row = (y: number, h: number, z: number): Part[] => range(6).map((i) => b(-0.62 + i * 0.25 + (y > 0.2 && y < 0.4 ? 0.1 : 0) * (i === 5 ? 0 : 1), y, z, 0.25 - (i % 2) * 0.03, h, 0.08, tones[(i + Math.round(y * 10)) % 4], { m: true }));
  return gd("Dry stone planted wall 1.5 m", 1.6, 0.5, 0.86, [
    b(0, 0.25, 0, 1.46, 0.5, 0.3, "#8a8578", { m: true }),
    ...[0.09, 0.27, 0.43].flatMap((y) => [...row(y, 0.16, 0.175), ...row(y, 0.16, -0.175)]),
    ...range(6).map((i) => b(-0.6 + i * 0.24, 0.51, 0, 0.26, 0.04, 0.4, tones[i % 4], { m: true })),
    b(0, 0.54, 0, 1.3, 0.02, 0.3, "#4a3a2e"), sp(-0.55, 0.22, 0.2, 0.1, "#6f8a4a"), sp(0.4, 0.34, 0.2, 0.08, "#6f8a4a"), sp(0.1, 0.12, -0.2, 0.1, "#6f8a4a"),
    plantAt("groundcover", 0.6, 0.15, 0.3, -0.4, 0, 1, 0.55), plantAt("lavender", 0.45, 0.3, 0.28, 0.15, 0, 2, 0.55), plantAt("groundcover", 0.5, 0.15, 0.3, 0.55, 0, 3, 0.55),
  ], { tags: "outdoor retaining low rockery stone boundary" });
})();

export const FEATURES2: Record<string, Def> = {
  gd_vertical_garden: verticalGarden, gd_trellis_climbers: trellis, gd_rose_arch: roseArch, gd_gate_wood_posts: woodGate, gd_gate_wrought_iron: ironGate,
  gd_outdoor_shower: shower, gd_bike_stand_3: bikeRack, gd_compost_tumbler: tumbler, gd_deck_storage_box: deckBox, gd_hose_reel_can: hoseReel,
  gd_flagpole_5m: flagpole, gd_dry_stone_wall: dryWall,
};
