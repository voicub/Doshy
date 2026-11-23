import type { Def, Part } from "../catalog.ts";
import { BLACK, BRASS, CREAM, DARKWOOD, LGREY, METAL, OAK, WALNUT, WHITE, b, cy, dims, discZ, piece, rodX, sp } from "./kit.ts";
import * as K from "../partsKit.ts";

const BR: K.Opt = { tex: "metal", metal: 1, rough: 0.28 }; // polished brass
const MIR: K.Opt = { tex: "metal", metal: 1, rough: 0.04, bevel: 0 }; // silvered glass
const ART: K.Opt = { ...K.MATT, bevel: 0 }; // paint on paper
const FIB: K.Opt = { ...K.FAB, bevel: 0.002 }; // flat woven rug layers

const MIRROR = "#b9cfd9";
const SHINE = "#e6f1f6";
const PAPER = "#f4f1ea";
const MOUNT = 1.5; // centre height of wall pictures

// ---------- framed art ----------
type Motif = "blocks" | "landscape" | "circles" | "botanical";
const motif = (kind: Motif, w: number, h: number, y: number, z: number): Part[] => {
  const iw = w - 0.08;
  const ih = h - 0.08;
  if (kind === "landscape") {
    return [
      b(0, y + ih * 0.22, z, iw, ih * 0.56, 0.008, "#9dc3d9"),
      b(0, y - ih * 0.28, z, iw, ih * 0.44, 0.008, "#5b7a5e"),
      b(-iw * 0.2, y - ih * 0.02, z + 0.002, iw * 0.55, ih * 0.14, 0.008, "#7a9a6a"),
      discZ(iw * 0.22, y + ih * 0.22, z + 0.004, Math.min(iw, ih) * 0.2, 0.008, "#f2c14e"),
    ];
  }
  if (kind === "circles") {
    const r = Math.min(iw, ih);
    return [
      discZ(-iw * 0.18, y + ih * 0.12, z, r * 0.44, 0.008, "#c1784a"),
      discZ(iw * 0.16, y - ih * 0.1, z + 0.002, r * 0.5, 0.008, "#2f3c52"),
      discZ(iw * 0.18, y + ih * 0.22, z + 0.004, r * 0.2, 0.008, "#d9a02c"),
    ];
  }
  if (kind === "botanical") {
    return [
      b(0, y - ih * 0.05, z, 0.01, ih * 0.8, 0.008, "#3f6b3a"),
      ...[-0.3, -0.1, 0.1, 0.3].flatMap((f, i) => [
        b(-0.06 * iw, y + ih * f, z + 0.002, iw * 0.3, ih * 0.1, 0.008, "#4d7d3d", { r: [0, 0, 0.5] }),
        b(0.06 * iw, y + ih * (f - 0.1) + (i % 2) * 0.01, z + 0.002, iw * 0.3, ih * 0.1, 0.008, "#3f6b3a", { r: [0, 0, -0.5] }),
      ]),
    ];
  }
  return [
    b(-iw * 0.2, y + ih * 0.1, z, iw * 0.5, ih * 0.6, 0.008, "#c1784a"),
    b(iw * 0.2, y - ih * 0.12, z + 0.002, iw * 0.5, ih * 0.5, 0.008, "#2f3c52"),
    b(0, y + ih * 0.3, z + 0.004, iw * 0.3, ih * 0.16, 0.008, "#d9a02c"),
  ];
};
const frame = (x: number, y: number, w: number, h: number, c: string, kind: Motif, m = true): Part[] => [
  b(x, y, 0, w, h, 0.03, c, { ...K.WOOD, bevel: 0.006, ...(m ? { m: true } : {}) }),
  b(x, y, 0.008, w - 0.05, h - 0.05, 0.03, PAPER, { ...K.MATT, bevel: 0 }),
  ...motif(kind, w - 0.01, h - 0.01, y, 0.02).map((p) => ({ ...ART, ...p, p: [p.p[0] + x, p.p[1], p.p[2]] as [number, number, number] })),
  // mat shadow lines and a hanging hook
  ...[-1, 1].flatMap((s) => [
    b(x, y + (s * (h - 0.055)) / 2, 0.0235, w - 0.055, 0.004, 0.003, "#d9d3c6", { ...K.MATT, detail: 1 }),
    b(x + (s * (w - 0.055)) / 2, y, 0.0235, 0.004, h - 0.055, 0.003, "#d9d3c6", { ...K.MATT, detail: 1 }),
  ]),
  b(x, y + h / 2 - 0.03, -0.017, 0.03, 0.012, 0.006, METAL, { ...K.STEEL, bevel: 0.002, detail: 2 }),
];
const art = (label: string, w: number, h: number, kind: Motif, c: string): Def =>
  piece("Decor", label, w, 0.05, MOUNT + h / 2 + 0.02, frame(0, MOUNT, w, h, c, kind), { wall: true });
const gallery = (label: string, w: number, set: [number, number, number, number, string, Motif][]): Def =>
  piece("Decor", label, w, 0.05, 2.1, set.flatMap(([x, y, fw, fh, c, k]) => frame(x, y, fw, fh, c, k, c !== WHITE)), { wall: true });

// ---------- mirrors ----------
const roundMirror = (dia: number, c: string): Def =>
  piece("Decor", `Round mirror ${Math.round(dia * 100)} cm`, dia, 0.05, MOUNT + dia / 2 + 0.02, [
    discZ(0, MOUNT, 0, dia, 0.03, c, { ...(c === BRASS ? BR : K.BLACK_METAL), m: true }),
    discZ(0, MOUNT, 0.012, dia - 0.06, 0.015, MIRROR, MIR),
    b(-dia * 0.12, MOUNT + dia * 0.12, 0.022, 0.03, dia * 0.35, 0.004, SHINE, { ...K.PLASTIC, bevel: 0, r: [0, 0, 0.6] }),
    discZ(0, MOUNT, 0.0215, dia - 0.05, 0.004, c, { ...(c === BRASS ? BR : K.BLACK_METAL), detail: 1 }),
    b(0, MOUNT + dia / 2 - 0.02, -0.017, 0.04, 0.012, 0.006, METAL, { ...K.STEEL, detail: 2 }),
  ], { wall: true });
const archMirror = (): Def => {
  const w = 0.7;
  const y0 = 0.3;
  const top = 1.5;
  return piece("Decor", `Arched mirror ${dims(w, 0.05)} x 155`, w, 0.05, 1.9, [
    b(0, (y0 + top) / 2, 0, w, top - y0, 0.03, BLACK, { ...K.BLACK_METAL, bevel: 0.006, m: true }),
    discZ(0, top, 0, w, 0.03, BLACK, { ...K.BLACK_METAL, m: true }),
    b(0, (y0 + top) / 2 + 0.02, 0.012, w - 0.06, top - y0 - 0.04, 0.015, MIRROR, MIR),
    discZ(0, top, 0.012, w - 0.06, 0.015, MIRROR, MIR),
    b(-0.1, 1.2, 0.022, 0.03, 0.6, 0.004, SHINE, { ...K.PLASTIC, bevel: 0, r: [0, 0, 0.15] }),
    b(0, y0 + 0.01, 0.022, w - 0.04, 0.008, 0.006, BLACK, { ...K.BLACK_METAL, bevel: 0.002, detail: 1 }),
    b(0, top + w / 2 - 0.02, -0.017, 0.04, 0.012, 0.006, METAL, { ...K.STEEL, detail: 2 }),
  ], { wall: true });
};
const wideMirror = (): Def =>
  piece("Decor", `Wide mirror, thin frame ${dims(1.0, 0.05)} x 60`, 1.0, 0.05, 1.8, [
    b(0, 1.5, 0, 1.0, 0.6, 0.03, BRASS, { ...BR, bevel: 0.005, m: true }),
    b(0, 1.5, 0.012, 0.95, 0.55, 0.015, MIRROR, MIR),
    b(-0.2, 1.5, 0.022, 0.04, 0.4, 0.004, SHINE, { ...K.PLASTIC, bevel: 0, r: [0, 0, 0.5] }),
    ...[-1, 1].map((s) => b(s * 0.46, 1.5, 0.0225, 0.01, 0.55, 0.003, BRASS, { ...BR, bevel: 0, detail: 1 })),
  ], { wall: true });
const leaningMirror = (): Def =>
  piece("Decor", `Full-length mirror, leaning ${dims(0.6, 0.3)} x 170`, 0.6, 0.3, 1.7, [
    b(0, 0.85, 0, 0.6, 1.66, 0.04, OAK, { ...K.WOOD, bevel: 0.008, m: true, r: [-0.12, 0, 0] }),
    b(0, 0.85, 0.016, 0.54, 1.58, 0.012, MIRROR, { ...MIR, r: [-0.12, 0, 0] }),
    b(-0.12, 0.95, 0.03, 0.04, 0.8, 0.004, SHINE, { ...K.PLASTIC, bevel: 0, r: [-0.12, 0, 0.1] }),
    b(0, 0.7, -0.04, 0.05, 1.2, 0.025, OAK, { ...K.WOOD, bevel: 0.004, m: true, r: [-0.12, 0, 0], detail: 1 }),
    ...[-1, 1].map((s) => cy(s * 0.27, 0.02, 0.12, 0.04, 0.04, "#2a2a2a", { ...K.RUBBER, detail: 2 })),
  ]);

// ---------- rugs (flat: walls never matter) ----------
const rugRect = (label: string, w: number, d: number, c: string, kind: "border" | "stripes" | "shag" | "medallion", cat: "Decor" | "Bathroom" = "Decor"): Def => {
  const alt = "#d6cfc4";
  const parts: Part[] = [b(0, 0.007, 0, w, 0.014, d, c, { ...FIB, m: true })];
  if (kind === "border") parts.push(b(0, 0.0155, 0, w - 0.14, 0.003, d - 0.14, alt, FIB), b(0, 0.0175, 0, w - 0.3, 0.003, d - 0.3, c, { ...FIB, m: true }));
  if (kind === "medallion") {
    parts.push(
      b(0, 0.0155, 0, w - 0.16, 0.003, d - 0.16, "#8a3b34", FIB),
      b(0, 0.0175, 0, w - 0.3, 0.003, d - 0.3, c, { ...FIB, m: true }),
      b(0, 0.0195, 0, w * 0.5, 0.003, d * 0.45, "#c9a46b", { ...FIB, r: [0, 0, 0] }),
      b(0, 0.0215, 0, w * 0.38, 0.003, d * 0.33, "#2f3c52", FIB),
      b(0, 0.0235, 0, w * 0.12, 0.003, d * 0.18, "#c9a46b", { ...FIB, r: [0, 0.8, 0] }),
    );
  }
  if (kind === "stripes") {
    const n = 7;
    parts.push(...Array.from({ length: n }, (_, i) => b(-w / 2 + (w / n) * (i + 0.5), 0.0155, 0, w / n - 0.04, 0.003, d - 0.1, i % 2 ? alt : "#2f3c52", FIB)));
  }
  if (kind === "shag") {
    parts.push(
      b(0, 0.027, 0, w - 0.04, 0.026, d - 0.04, c, { ...K.FAB, rough: 1, bevel: 0.008, m: true }),
      ...Array.from({ length: Math.round(d / 0.2) }, (_, i) => b(0, 0.041, -d / 2 + 0.12 + i * 0.2, w - 0.1, 0.004, 0.03, "#ffffff", { ...FIB, rough: 1 })),
    );
  } else if (cat === "Decor") {
    // knotted fringe at both short ends
    parts.push(...[-1, 1].map((s) => b(0, 0.005, s * (d / 2 + 0.012), w - 0.04, 0.008, 0.03, CREAM, { ...FIB, detail: 1 })));
  }
  return piece(cat, label, w, d, kind === "shag" ? 0.045 : 0.025, parts);
};
const rugRound = (dia: number, c: string): Def =>
  piece("Decor", `Round rug ${Math.round(dia * 100)} cm`, dia, dia, 0.025, [
    cy(0, 0.007, 0, dia, 0.014, c, { ...FIB, m: true }),
    cy(0, 0.0155, 0, dia * 0.82, 0.003, "#d6cfc4", FIB),
    cy(0, 0.0175, 0, dia * 0.66, 0.003, c, { ...FIB, m: true }),
    cy(0, 0.0195, 0, dia * 0.2, 0.003, "#d6cfc4", FIB),
    cy(0, 0.0215, 0, dia * 0.5, 0.002, "#b8ada0", { ...FIB, detail: 1 }),
  ]);
const runner = (w: number, d: number, c: string): Def => {
  // 3 cm tassels at both short ends
  return piece("Decor", `Hall runner ${dims(w, d)}`, w, d, 0.025, [
    b(0, 0.007, 0, w, 0.014, d - 0.04, c, { ...FIB, m: true }),
    b(0, 0.0155, 0, w - 0.1, 0.003, d - 0.14, "#d6cfc4", FIB),
    b(0, 0.0175, 0, w - 0.18, 0.003, d - 0.22, c, { ...FIB, m: true }),
    ...[-1, 1].flatMap((s) => Array.from({ length: 7 }, (_, i) => b(-w / 2 + 0.05 + i * ((w - 0.1) / 6), 0.004, s * (d / 2 - 0.01), 0.025, 0.008, 0.03, CREAM, FIB))),
  ]);
};

// ---------- curtains and blinds ----------
const curtainRod = (w: number, c: string, rings: number[]): Part[] => {
  const mo = c === BRASS ? BR : c === BLACK ? K.BLACK_METAL : K.STEEL;
  return [
    rodX(0, 2.35, 0, 0.022, w, c, mo),
    sp(-w / 2 + 0.02, 2.35, 0, 0.055, c, mo),
    sp(w / 2 - 0.02, 2.35, 0, 0.055, c, mo),
    ...rings.map((x) => b(x, 2.3, 0, 0.012, 0.07, 0.05, c, { ...mo, bevel: 0.004 })),
  ];
};
/** Wall brackets holding the rod: appended after the panels so the curtain rig's part indices stay put. */
const brackets = (w: number, c: string): Part[] =>
  [-1, 1].map((s) => b(s * (w / 2 - 0.08), 2.35, -0.03, 0.02, 0.02, 0.06, c, { ...(c === BRASS ? BR : c === BLACK ? K.BLACK_METAL : K.STEEL), bevel: 0.004, detail: 1 }));
const panels = (x0: number, x1: number, c: string, c2: string, thick: number, layer: "sheer" | "blackout", top = 2.28, m = true): Part[] => {
  const n = Math.max(3, Math.round((x1 - x0) / 0.1));
  const w = (x1 - x0) / n;
  const h = top - 0.03;
  return Array.from({ length: n }, (_, i) => b(x0 + w * (i + 0.5), h / 2 + 0.03, i % 2 ? 0.02 : -0.02, w, h, thick, i % 2 ? c2 : c, { ...K.FAB, layer, ...(m ? { m: true } : {}) }));
};
const sheer = (w: number): Def =>
  piece("Decor", `Sheer curtain ${Math.round(w * 100)} cm wide`, w, 0.1, 2.4, [
    ...curtainRod(w, METAL, []),
    ...panels(-w / 2 + 0.03, w / 2 - 0.03, "#f4f1ea", "#e8e4da", 0.02, "sheer"),
    ...brackets(w, METAL),
  ], { wall: true });
const blackout = (w: number): Def =>
  piece("Decor", `Blackout curtain ${Math.round(w * 100)} cm wide`, w, 0.1, 2.4, [
    ...curtainRod(w, BLACK, []),
    ...panels(-w / 2 + 0.03, w / 2 - 0.03, "#4a4f5a", "#3d4350", 0.045, "blackout"),
    b(0, 2.26, 0.0, w - 0.06, 0.06, 0.06, "#2f343d", { ...K.FAB, bevel: 0.01, m: true }),
    ...brackets(w, BLACK),
  ], { wall: true });
const curtainPair = (w: number): Def => {
  const pw = 0.75;
  return piece("Decor", `Curtains with rod, two panels ${Math.round(w * 100)} cm`, w, 0.1, 2.4, [
    ...curtainRod(w, BRASS, [-w / 2 + 0.2, -w / 2 + 0.45, w / 2 - 0.2, w / 2 - 0.45]),
    ...panels(-w / 2 + 0.03, -w / 2 + pw, "#c9b79a", "#b8a687", 0.045, "sheer"),
    ...panels(w / 2 - pw, w / 2 - 0.03, "#c9b79a", "#b8a687", 0.045, "sheer"),
    ...[-1, 1].map((s) => b(s * (w / 2 - pw - 0.0), 0.95, 0.05, 0.12, 0.03, 0.04, "#8c4a3e", { ...K.FAB, bevel: 0.01 })),
    ...brackets(w, BRASS),
    ...[-1, 1].map((s) => b(s * (w / 2 - pw - 0.0), 0.95, 0.075, 0.03, 0.03, 0.01, BRASS, { ...BR, detail: 2 })),
  ], { wall: true });
};
const roller = (w: number, down: number): Def =>
  piece("Decor", `Roller blind ${Math.round(w * 100)} cm`, w, 0.08, 2.4, [
    rodX(0, 2.28, 0, 0.055, w, WHITE, K.PLASTIC),
    b(0, 2.28 - down / 2, 0.0, w - 0.04, down, 0.012, CREAM, { ...K.FAB, bevel: 0.002, m: true }),
    b(0, 2.28 - down, 0.008, w - 0.04, 0.03, 0.02, METAL, { ...K.STEEL, bevel: 0.006 }),
    b(w / 2 - 0.1, 2.28 - down - 0.08, 0.01, 0.006, 0.1, 0.006, METAL, { ...K.STEEL, bevel: 0.002 }),
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.01), 2.28, 0, 0.02, 0.06, 0.06, WHITE, { ...K.PLASTIC, bevel: 0.006, detail: 1 })),
    sp(w / 2 - 0.1, 2.28 - down - 0.14, 0.01, 0.022, METAL, { ...K.STEEL, detail: 2 }),
  ], { wall: true });
const venetian = (w: number): Def => {
  const n = 28;
  return piece("Decor", `Venetian blind ${Math.round(w * 100)} cm`, w, 0.08, 2.4, [
    b(0, 2.3, 0, w, 0.05, 0.05, WHITE, { ...K.PLASTIC, bevel: 0.006, m: true }),
    ...Array.from({ length: n }, (_, i) => b(0, 2.25 - i * 0.04, 0.0, w - 0.03, 0.012, 0.05, i % 2 ? "#f1efe9" : "#ece9e2", { ...K.PLASTIC, bevel: 0.002, m: true, r: [0.35, 0, 0] })),
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.05), 2.25 - (n * 0.04) / 2, 0.0, 0.004, n * 0.04, 0.004, LGREY, K.PLASTIC)),
    b(0, 2.25 - n * 0.04, 0, w - 0.02, 0.025, 0.045, WHITE, { ...K.PLASTIC, bevel: 0.006, m: true }),
    b(w / 2 - 0.12, 2.3, 0.03, 0.012, 0.18, 0.012, LGREY, { ...K.PLASTIC, detail: 2 }),
  ], { wall: true });
};
const roman = (w: number): Def =>
  piece("Decor", `Roman blind ${Math.round(w * 100)} cm`, w, 0.08, 2.4, [
    b(0, 2.3, 0, w, 0.05, 0.06, DARKWOOD, { ...K.WOOD, bevel: 0.006 }),
    ...Array.from({ length: 9 }, (_, i) => b(0, 2.2 - i * 0.12, 0.0 + (i % 2 ? 0.02 : 0), w - 0.04, 0.115, 0.03, i % 2 ? "#d8cfbf" : "#cbbfa8", { ...K.FAB, bevel: 0.012, m: true })),
    ...Array.from({ length: 9 }, (_, i) => b(0, 2.2 - i * 0.12 - 0.058, (i % 2 ? 0.02 : 0) + 0.016, w - 0.05, 0.004, 0.004, "#a89b82", { ...K.FAB, bevel: 0, detail: 1 })),
  ], { wall: true });

export const WALLS: Record<string, Def> = {
  dc_art_small_30x40: art(`Framed picture, small ${dims(0.3, 0.4)}`, 0.3, 0.4, "botanical", WHITE),
  dc_art_medium_50x70: art(`Framed picture, medium ${dims(0.5, 0.7)}`, 0.5, 0.7, "blocks", OAK),
  dc_art_large_80x120: art(`Framed picture, large ${dims(0.8, 1.2)}`, 0.8, 1.2, "landscape", BLACK),
  dc_art_wide_120x60: art(`Framed picture, wide ${dims(1.2, 0.6)}`, 1.2, 0.6, "landscape", WALNUT),
  dc_art_square_60: art(`Framed picture, square ${dims(0.6, 0.6)}`, 0.6, 0.6, "circles", BRASS),
  dc_gallery_3: gallery(`Picture row, 3 frames ${dims(1.5, 0.05)}`, 1.5, [
    [-0.5, 1.55, 0.4, 0.5, BLACK, "blocks"], [0, 1.55, 0.4, 0.5, WHITE, "circles"], [0.5, 1.55, 0.4, 0.5, OAK, "botanical"],
  ]),
  dc_gallery_6: gallery(`Gallery wall, 6 frames ${dims(1.7, 0.05)}`, 1.7, [
    [-0.55, 1.75, 0.45, 0.6, BLACK, "landscape"], [0.0, 1.8, 0.5, 0.4, WHITE, "circles"], [0.5, 1.7, 0.4, 0.55, OAK, "blocks"],
    [-0.6, 1.2, 0.3, 0.4, WHITE, "botanical"], [-0.2, 1.3, 0.4, 0.4, WALNUT, "circles"], [0.3, 1.2, 0.5, 0.35, BLACK, "blocks"],
  ]),
  dc_mirror_round_60: roundMirror(0.6, BRASS),
  dc_mirror_round_90: roundMirror(0.9, BLACK),
  dc_mirror_arch: archMirror(),
  dc_mirror_wide: wideMirror(),
  dc_mirror_leaning: leaningMirror(),
  dc_rug_rect_120: rugRect(`Rug ${dims(1.2, 1.7)}`, 1.2, 1.7, "#b9b2a6", "border"),
  dc_rug_rect_160: rugRect(`Rug ${dims(1.6, 2.3)}`, 1.6, 2.3, "#8a9a8c", "border"),
  dc_rug_rect_200: rugRect(`Rug, large ${dims(2.0, 3.0)}`, 2.0, 3.0, "#b9b2a6", "border"),
  dc_rug_classic_200: rugRect(`Classic patterned rug ${dims(2.0, 3.0)}`, 2.0, 3.0, "#a0443a", "medallion"),
  dc_rug_classic_160: rugRect(`Classic patterned rug ${dims(1.6, 2.3)}`, 1.6, 2.3, "#a0443a", "medallion"),
  dc_rug_round_120: rugRound(1.2, "#c1784a"),
  dc_rug_round_160: rugRound(1.6, "#8a9a8c"),
  dc_rug_round_200: rugRound(2.0, "#b9b2a6"),
  dc_rug_runner_80x240: runner(0.8, 2.4, "#6b7f93"),
  dc_rug_runner_70x300: runner(0.7, 3.0, "#a0443a"),
  dc_rug_shag_160: rugRect(`Shaggy rug ${dims(1.6, 2.3)}`, 1.6, 2.3, "#e8e0d0", "shag"),
  dc_rug_shag_200: rugRect(`Shaggy rug, large ${dims(2.0, 3.0)}`, 2.0, 3.0, "#d6cfc4", "shag"),
  dc_rug_striped_140: rugRect(`Striped rug ${dims(1.4, 2.0)}`, 1.4, 2.0, "#f1efe9", "stripes"),
  dc_rug_striped_200: rugRect(`Striped rug, large ${dims(2.0, 3.0)}`, 2.0, 3.0, "#f1efe9", "stripes"),
  dc_rug_bath: rugRect(`Bath mat ${dims(0.5, 0.8)}`, 0.5, 0.8, "#8fb3b8", "shag", "Bathroom"),
  dc_curtain_sheer_140: sheer(1.4),
  dc_curtain_sheer_240: sheer(2.4),
  dc_curtain_blackout_140: blackout(1.4),
  dc_curtain_blackout_240: blackout(2.4),
  dc_curtain_pair_200: curtainPair(2.0),
  dc_curtain_pair_300: curtainPair(3.0),
  dc_blinds_roller_100: roller(1.0, 1.2),
  dc_blinds_roller_140: roller(1.4, 0.7),
  dc_blinds_venetian_100: venetian(1.0),
  dc_blinds_venetian_140: venetian(1.4),
  dc_blinds_roman_100: roman(1.0),
};

