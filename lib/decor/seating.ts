import type { Def, Part } from "../catalog.ts";
import { BIRCH, BLACK, BRASS, DARKWOOD, DGREY, LEATHER, LGREY, METAL, OAK, PI, PI2, WALNUT, WOOD, b, cy, dims, piece, rodX, sp } from "./kit.ts";
import { BLACK_METAL, CHROME, FAB, LEATHER as LEATHER_M, PLASTIC, RUBBER, STEEL, WOOD as WOOD_M, cushion, pillow, seam, taperedLeg, taperedLegs, turned } from "../partsKit.ts";

/** y, z of the point (ly, lz) of a part centred at (y, z) and tilted about x by t. */
const tilt = (y: number, z: number, t: number, ly: number, lz: number): [number, number] =>
  [y + ly * Math.cos(t) - lz * Math.sin(t), z + ly * Math.sin(t) + lz * Math.cos(t)];
/** Bun foot: a turned wooden foot of height h. */
const bunFoot = (x: number, z: number, h: number, dia: number, c: string, o = {}): Part =>
  turned(x, 0, z, [[dia * 0.4, 0], [dia / 2, h * 0.15], [dia * 0.4, h * 0.5], [dia * 0.3, h * 0.7], [dia / 2, h]], c, { ...WOOD_M, ...o });

// ---------- sofas ----------
type SofaOpt = {
  c: string; arm: number; armTop: number; legH: number; legC: string; backTop: number;
  roll?: boolean; accent?: string; fold?: boolean; roundLeg?: boolean;
};
const BACK_D = 0.2;
const SEAT_H = 0.13;
const UPH = { ...FAB, m: true } as const;

/** Straight sofa: frame, one seat + back cushion per seat, two arms, four legs. Footprint w x d, back at -z. */
const sofaParts = (w: number, d: number, seats: number, o: SofaOpt): Part[] => {
  const { c, arm, armTop, legH, backTop, accent } = o;
  const baseTop = legH + 0.2;
  const seatTop = baseTop + SEAT_H;
  const inner = w - 2 * arm;
  const sw = inner / seats;
  const sd = d - BACK_D - 0.03;
  const xs = Array.from({ length: seats }, (_, i) => -inner / 2 + sw * (i + 0.5));
  const bcY = seatTop + 0.17;
  const bcZ = -d / 2 + BACK_D + 0.07;
  const [btnY, btnZ] = tilt(bcY, bcZ, -0.16, 0, 0.07);
  return [
    b(0, legH + 0.1, 0, w, 0.2, d, c, { ...UPH, bevel: 0.025 }),
    ...xs.map((x) => cushion(x, baseTop + SEAT_H / 2, d / 2 - sd / 2, sw - 0.012, SEAT_H, sd, c, { m: true })),
    b(0, (baseTop + backTop) / 2, -d / 2 + BACK_D / 2, inner, backTop - baseTop, BACK_D, c, { ...UPH, bevel: 0.04 }),
    ...xs.map((x) => cushion(x, bcY, bcZ, sw - 0.03, 0.34, 0.14, c, { m: true, r: [-0.16, 0, 0] })),
    ...[-1, 1].flatMap((s) => {
      const x = s * (w / 2 - arm / 2);
      const topY = o.roll ? armTop - arm / 2 : armTop;
      return [
        b(x, (legH + topY) / 2, 0, arm, topY - legH, d, c, { ...UPH, bevel: 0.03 }),
        ...(o.roll ? [cy(x, topY, 0, arm, d - 0.01, c, { ...UPH, bevel: 0.02, r: [PI2, 0, 0] })] : []),
        seam(s * inner / 2, (baseTop + armTop) / 2, d / 2 + 0.001, 0.005, armTop - baseTop - 0.06, 0.005, c, { ...FAB, m: true }),
      ];
    }),
    ...(o.roundLeg
      ? taperedLegs(w - 0.2 + 0.1, d - 0.2 + 0.1, legH, o.legC, 0.045, 0.03, 0.05, WOOD_M)
      : [-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * (w / 2 - 0.1), legH / 2, sz * (d / 2 - 0.1), 0.05, legH, 0.05, o.legC, { ...WOOD_M, bevel: 0.006 })))),
    // piping along the front of every seat cushion and a button on every back cushion
    ...xs.map((x) => b(x, seatTop - 0.012, d / 2 - 0.004, sw - 0.05, 0.012, 0.012, c, { ...UPH, bevel: 0.005, detail: 1 })),
    ...xs.map((x) => sp(x, btnY, btnZ, 0.022, c, { ...UPH, detail: 2 })),
    ...(accent
      ? [-1, 1].map((s) => pillow(s * (inner / 2 - 0.22), seatTop + 0.19, -d / 2 + BACK_D + 0.2, 0.4, 0.36, 0.1, accent, { r: [-0.35, 0, s * 0.12] }))
      : []),
    ...(o.fold
      ? [b(0, legH + 0.04, d / 2 - 0.01, w - 0.2, 0.03, 0.02, LGREY, { ...PLASTIC, bevel: 0.006 }), b(0, seatTop + 0.002, 0.1, w - 0.2, 0.004, 0.008, DGREY, { ...FAB, bevel: 0.002 })]
      : []),
  ];
};

const MODERN: Omit<SofaOpt, "c"> = { arm: 0.14, armTop: 0.62, legH: 0.12, legC: WALNUT, backTop: 0.82, roundLeg: true };
const SCANDI: Omit<SofaOpt, "c"> = { arm: 0.07, armTop: 0.6, legH: 0.18, legC: BIRCH, backTop: 0.8, roundLeg: true, accent: "#d9a02c" };
const SOFT: Omit<SofaOpt, "c"> = { arm: 0.22, armTop: 0.64, legH: 0.08, legC: DARKWOOD, backTop: 0.86, roll: true };

const sofa = (label: string, w: number, d: number, seats: number, o: SofaOpt): Def => piece("Living", label, w, d, 0.9, sofaParts(w, d, seats, o));

/** L-shaped sofa: main run along the back, chaise at one end. side = +1 chaise on the right (+x), -1 on the left. */
const lSofa = (label: string, w: number, d: number, side: 1 | -1, c: string): Def => {
  const arm = 0.14;
  const legH = 0.12;
  const baseTop = legH + 0.2;
  const chaiseW = 0.95;
  const mainD = 0.92;
  const cx = side * (w / 2 - chaiseW / 2);
  const mainW = w - chaiseW - arm;
  const mainCx = (side * (arm - chaiseW)) / 2; // main seats sit between the arm and the chaise
  const seats = Math.max(2, Math.round(mainW / 0.7));
  const sw = mainW / seats;
  const sd = mainD - BACK_D - 0.03;
  const armX = -side * (w / 2 - arm / 2);
  const xs = Array.from({ length: seats }, (_, i) => mainCx - mainW / 2 + sw * (i + 0.5));
  const seatTop = baseTop + SEAT_H;
  const parts: Part[] = [
    b(0, legH + 0.1, -d / 2 + mainD / 2, w, 0.2, mainD, c, { ...UPH, bevel: 0.025 }),
    b(cx, legH + 0.1, 0, chaiseW, 0.2, d, c, { ...UPH, bevel: 0.025 }),
    ...xs.map((x) => cushion(x, baseTop + SEAT_H / 2, -d / 2 + mainD - sd / 2, sw - 0.012, SEAT_H, sd, c, { m: true })),
    cushion(cx, baseTop + SEAT_H / 2, d / 2 - (d - BACK_D) / 2 - 0.01, chaiseW - 0.1, SEAT_H, d - BACK_D - 0.03, c, { m: true }),
    b(0, (baseTop + 0.82) / 2, -d / 2 + BACK_D / 2, w - arm, 0.82 - baseTop, BACK_D, c, { ...UPH, bevel: 0.04 }),
    ...[...xs, cx].map((x) => cushion(x, seatTop + 0.17, -d / 2 + BACK_D + 0.07, (x === cx ? chaiseW - 0.1 : sw) - 0.03, 0.34, 0.14, c, { m: true, r: [-0.16, 0, 0] })),
    b(armX, (legH + 0.62) / 2, -d / 2 + mainD / 2, arm, 0.62 - legH, mainD, c, { ...UPH, bevel: 0.03 }),
    ...taperedLegs(w - 0.1, d - 0.1, legH, WALNUT, 0.045, 0.03, 0.05, WOOD_M),
    pillow(cx, seatTop + 0.17, d / 2 - 0.35, 0.38, 0.3, 0.1, "#d9a02c", { r: [-0.35, 0, 0.1] }),
    // piping along the seat fronts, chaise end seam
    ...xs.map((x) => b(x, seatTop - 0.012, -d / 2 + mainD - 0.004, sw - 0.05, 0.012, 0.012, c, { ...UPH, bevel: 0.005, detail: 1 })),
    b(cx, seatTop - 0.012, d / 2 - 0.004, chaiseW - 0.15, 0.012, 0.012, c, { ...UPH, bevel: 0.005, detail: 1 }),
    seam(cx - side * (chaiseW / 2 - 0.05), seatTop - 0.07, d / 2 - 0.3, 0.005, 0.005, 0.5, c, { ...FAB, m: true, detail: 1 }),
    ...[...xs, cx].map((x) => {
      const [y, z] = tilt(seatTop + 0.17, -d / 2 + BACK_D + 0.07, -0.16, 0, 0.07);
      return sp(x, y, z, 0.022, c, { ...UPH, detail: 2 });
    }),
  ];
  return piece("Living", label, w, d, 0.9, parts);
};

/** Modular sofa piece: seat block with back at -z; corner adds a back on the -x side too. */
const modPiece = (label: string, w: number, d: number, corner: boolean, c: string): Def => {
  const legH = 0.1;
  const baseTop = legH + 0.22;
  const parts: Part[] = [
    b(0, legH + 0.11, 0, w, 0.22, d, c, { ...UPH, bevel: 0.025 }),
    cushion(corner ? 0.05 : 0, baseTop + SEAT_H / 2, corner ? 0.05 : 0.07, w - (corner ? 0.15 : 0.04), SEAT_H, d - (corner ? 0.15 : 0.2), c, { m: true }),
    b(0, 0.58, -d / 2 + 0.1, w, 0.52, 0.2, c, { ...UPH, bevel: 0.04 }),
    cushion(0, 0.62, -d / 2 + 0.27, w - 0.1, 0.34, 0.14, c, { m: true, r: [-0.16, 0, 0] }),
    ...(corner
      ? [b(-w / 2 + 0.1, 0.58, 0.1, 0.2, 0.52, d - 0.2, c, { ...UPH, bevel: 0.04 }), cushion(-w / 2 + 0.27, 0.62, 0.1, 0.14, 0.34, d - 0.4, c, { m: true })]
      : []),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * (w / 2 - 0.06), legH / 2, sz * (d / 2 - 0.06), 0.06, legH, 0.06, BLACK, { ...BLACK_METAL, bevel: 0.006 }))),
    b(corner ? 0.05 : 0, baseTop + SEAT_H - 0.012, d / 2 - 0.004, w - (corner ? 0.2 : 0.1), 0.012, 0.012, c, { ...UPH, bevel: 0.005, detail: 1 }),
    seam(0, 0.2, d / 2 + 0.001, w - 0.08, 0.005, 0.005, c, { ...FAB, m: true }),
  ];
  return piece("Living", label, w, d, 0.82, parts);
};

/** Chesterfield: leather, rolled arms as high as the back, buttoned. */
const chesterfield = (label: string, w: number, d: number, c: string): Def => {
  const BTN = "#2a170c";
  const cols = Math.floor((w - 0.5) / 0.17);
  const xs = Array.from({ length: cols }, (_, i) => -((cols - 1) * 0.17) / 2 + i * 0.17);
  const L = { ...LEATHER_M, m: true } as const;
  const parts: Part[] = [
    b(0, 0.26, 0, w, 0.32, d, c, { ...L, bevel: 0.03 }),
    cushion(0, 0.47, 0.06, w - 0.44, 0.1, d - 0.3, c, { ...LEATHER_M, m: true }),
    b(0, 0.6, -d / 2 + 0.12, w - 0.1, 0.4, 0.24, c, { ...L, bevel: 0.05 }),
    rodX(0, 0.78, -d / 2 + 0.13, 0.2, w - 0.08, c, { ...L, bevel: 0.03 }),
    ...[-1, 1].flatMap((s) => [
      b(s * (w / 2 - 0.11), 0.4, 0, 0.22, 0.6, d, c, { ...L, bevel: 0.03 }),
      cy(s * (w / 2 - 0.11), 0.7, 0, 0.26, d - 0.02, c, { ...L, bevel: 0.03, r: [PI2, 0, 0] }),
      ...[-0.18, 0.12].map((z) => sp(s * (w / 2 - 0.0), 0.5, z, 0.035, BTN, { ...LEATHER_M, detail: 2 })),
      // brass-free tufted arm front: a vertical seam each side of the scroll
      seam(s * (w / 2 - 0.11), 0.42, d / 2 + 0.001, 0.005, 0.4, 0.005, BTN),
    ]),
    ...xs.flatMap((x) => [0.5, 0.64].map((y) => sp(x, y, -d / 2 + 0.245, 0.035, BTN, { ...LEATHER_M, detail: 1 }))),
    ...xs.slice(0, -1).map((x) => seam(x + 0.085, 0.57, -d / 2 + 0.243, 0.005, 0.3, 0.005, BTN)),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => bunFoot(sx * (w / 2 - 0.1), sz * (d / 2 - 0.1), 0.1, 0.07, DARKWOOD))),
  ];
  return piece("Living", label, w, d, 0.92, parts);
};

// ---------- armchairs ----------
const wingback = (): Def => {
  const c = "#7a8f6a";
  const U = { ...FAB, m: true } as const;
  return piece("Living", "Wingback armchair 80 x 85", 0.8, 0.85, 1.12, [
    b(0, 0.3, 0, 0.7, 0.24, 0.8, c, { ...U, bevel: 0.03 }),
    cushion(0, 0.46, 0.08, 0.46, 0.12, 0.56, c, { m: true }),
    b(0, 0.74, -0.32, 0.58, 0.78, 0.16, c, { ...U, bevel: 0.05 }),
    ...[-1, 1].flatMap((s) => [
      b(s * 0.3, 0.9, -0.16, 0.12, 0.45, 0.42, c, { ...U, bevel: 0.04 }),
      b(s * 0.33, 0.45, 0.04, 0.14, 0.34, 0.72, c, { ...U, bevel: 0.03 }),
      cy(s * 0.33, 0.62, 0.04, 0.17, 0.72, c, { ...U, bevel: 0.02, r: [PI2, 0, 0] }),
      // nailhead trim down the arm front
      ...[0.4, 0.5, 0.6].map((y) => sp(s * 0.33, y, 0.4, 0.014, BRASS, { ...CHROME, detail: 2, rough: 0.3 })),
      seam(s * 0.3, 0.74, -0.235, 0.005, 0.2, 0.005, c, { ...FAB, m: true }),
    ]),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.3, sz * 0.34, 0.12, 0.06, 0.04, DARKWOOD, WOOD_M))),
    seam(0, 0.76, -0.236, 0.4, 0.005, 0.005, c, { ...FAB, m: true }),
    b(0, 0.17, 0.4, 0.66, 0.02, 0.005, c, { ...U, detail: 1 }),
  ]);
};
const lounge = (): Def => {
  const t = "#c1784a";
  return piece("Living", "Lounge armchair, wood frame 75 x 80", 0.75, 0.8, 0.82, [
    ...[-1, 1].flatMap((s) => [
      b(s * 0.3, 0.55, 0, 0.05, 0.05, 0.62, OAK, { ...WOOD_M, bevel: 0.01 }),
      taperedLeg(s * 0.3, 0.28, 0.53, 0.05, 0.034, OAK, { ...WOOD_M, r: [0.02, 0, 0] }),
      b(s * 0.3, 0.38, 0.28, 0.03, 0.4, 0.03, OAK, WOOD_M), // dowel core inside the tilted leg
      b(s * 0.3, 0.2, -0.28, 0.05, 0.4, 0.05, OAK, { ...WOOD_M, bevel: 0.008, r: [0.2, 0, 0] }),
      b(s * 0.3, 0.57, 0.1, 0.06, 0.012, 0.3, OAK, { ...WOOD_M, bevel: 0.005, detail: 1 }),
    ]),
    cushion(0, 0.4, 0.0, 0.52, 0.1, 0.55, t, { m: true }),
    cushion(0, 0.62, -0.28, 0.52, 0.42, 0.1, t, { m: true, r: [-0.3, 0, 0] }),
    b(0, 0.34, -0.1, 0.56, 0.03, 0.04, OAK, { ...WOOD_M, bevel: 0.006 }),
    seam(0, 0.405, 0.275, 0.46, 0.005, 0.005, t, { ...FAB, m: true }),
  ]);
};
const tub = (): Def => {
  const c = "#b0645a";
  const staves = Array.from({ length: 7 }, (_, i) => {
    const a = (-105 + i * 35) * (PI / 180);
    return b(Math.sin(a) * 0.3, 0.55, -Math.cos(a) * 0.3 + 0.04, 0.17, 0.46, 0.09, c, { ...FAB, m: true, bevel: 0.03, r: [0, a, 0] });
  });
  return piece("Living", "Tub armchair 74 x 74", 0.74, 0.74, 0.8, [
    cy(0, 0.2, 0.02, 0.62, 0.26, c, { ...FAB, m: true, bevel: 0.04 }),
    cy(0, 0.37, 0.04, 0.5, 0.1, c, { ...FAB, m: true, bevel: 0.04 }),
    ...staves,
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.2, sz * 0.2, 0.07, 0.04, 0.025, BRASS, { tex: "metal", metal: 1, rough: 0.3 }))),
    ...staves.slice(0, -1).map((_s, i) => {
      const a = (-105 + (i + 0.5) * 35) * (PI / 180);
      return seam(Math.sin(a) * 0.335, 0.55, -Math.cos(a) * 0.335 + 0.04, 0.006, 0.4, 0.006, c, { ...FAB, m: true, r: [0, a, 0] });
    }),
  ]);
};
const scandiChair = (): Def => {
  const t = "#d6cfc4";
  return piece("Living", "Scandinavian armchair, birch 70 x 78", 0.7, 0.78, 0.8, [
    ...[-1, 1].flatMap((s) => [
      b(s * 0.3, 0.46, 0.0, 0.04, 0.04, 0.66, BIRCH, { ...WOOD_M, bevel: 0.01 }),
      taperedLeg(s * 0.3, 0.28, 0.44, 0.04, 0.028, BIRCH, WOOD_M),
      b(s * 0.3, 0.4, -0.3, 0.04, 0.8, 0.04, BIRCH, { ...WOOD_M, bevel: 0.01, r: [-0.18, 0, 0] }),
    ]),
    b(0, 0.35, 0.02, 0.56, 0.04, 0.6, BIRCH, { ...WOOD_M, bevel: 0.008 }),
    cushion(0, 0.42, 0.04, 0.5, 0.1, 0.5, t, { m: true }),
    cushion(0, 0.6, -0.27, 0.5, 0.36, 0.08, t, { m: true, r: [-0.2, 0, 0] }),
    seam(0, 0.465, 0.29, 0.4, 0.005, 0.005, t, { ...FAB, m: true }),
  ]);
};
const beanBag = (label: string, dia: number, c: string): Def => piece("Living", label, dia, dia, dia * 0.8, [
  cy(0, dia * 0.09, 0, dia * 0.9, dia * 0.18, c, { ...FAB, m: true, bevel: dia * 0.07 }),
  sp(0, dia * 0.36, dia * 0.05, dia * 0.72, c, { ...FAB, m: true }),
  sp(0, dia * 0.55, -dia * 0.18, dia * 0.5, c, { ...FAB, m: true }),
  // soft lumps, a carry loop and a seam round the belly
  sp(dia * 0.2, dia * 0.5, dia * 0.12, dia * 0.28, c, { ...FAB, m: true, detail: 1 }),
  sp(-dia * 0.22, dia * 0.46, dia * 0.1, dia * 0.26, c, { ...FAB, m: true, detail: 1 }),
  cy(0, dia * 0.23, dia * 0.05, dia * 0.71, 0.008, c, { ...FAB, m: true, bevel: 0, detail: 1 }),
  b(0, dia * 0.77, -dia * 0.18, 0.1, 0.03, 0.025, c, { ...FAB, m: true, bevel: 0.01, detail: 2 }),
]);
const rocker = (): Def => {
  const pad = "#d9cbb0";
  return piece("Living", "Rocking chair, wood 62 x 90", 0.62, 0.9, 1.0, [
    ...[-1, 1].flatMap((s) => [
      b(s * 0.25, 0.04, 0, 0.04, 0.04, 0.88, WOOD, { ...WOOD_M, m: true, bevel: 0.012 }),
      taperedLeg(s * 0.25, 0.32, 0.34, 0.04, 0.03, WOOD, { ...WOOD_M, m: true, r: [0.1, 0, 0] }),
      b(s * 0.25, 0.5, -0.28, 0.04, 0.9, 0.04, WOOD, { ...WOOD_M, m: true, bevel: 0.008, r: [-0.25, 0, 0] }),
      b(s * 0.25, 0.55, 0.05, 0.04, 0.04, 0.6, WOOD, { ...WOOD_M, m: true, bevel: 0.01 }),
      b(s * 0.25, 0.575, 0.05, 0.06, 0.012, 0.28, WOOD, { ...WOOD_M, m: true, bevel: 0.005, detail: 1 }),
    ]),
    b(0, 0.42, 0.02, 0.5, 0.04, 0.54, WOOD, { ...WOOD_M, m: true, bevel: 0.008 }),
    cushion(0, 0.44, 0.02, 0.44, 0.06, 0.46, pad),
    ...[0.62, 0.78, 0.94].map((y) => b(0, y - 0.05, -0.33 - (y - 0.62) * 0.2, 0.46, 0.06, 0.025, WOOD, { ...WOOD_M, m: true, bevel: 0.006, r: [-0.25, 0, 0] })),
  ]);
};

// ---------- stools, ottomans, benches ----------
const stool = (label: string, dia: number, h: number): Def => piece("Living", label, dia, dia, h, [
  cy(0, h - 0.02, 0, dia, 0.04, WOOD, { ...WOOD_M, m: true, bevel: 0.008 }),
  ...[0, 1, 2].map((i) => {
    const a = (i * 2 * PI) / 3 + 0.5;
    return taperedLeg(Math.sin(a) * dia * 0.28, Math.cos(a) * dia * 0.28, h - 0.04, 0.038, 0.026, WOOD, { ...WOOD_M, m: true });
  }),
  cy(0, h - 0.055, 0, dia * 0.9, 0.012, WOOD, { ...WOOD_M, m: true, bevel: 0.004, detail: 1 }),
  ...[0, 1, 2].map((i) => {
    const a = (i * 2 * PI) / 3 + 0.5 + PI / 3;
    return b(Math.sin(a) * dia * 0.14, h * 0.3, Math.cos(a) * dia * 0.14, dia * 0.28, 0.02, 0.02, WOOD, { ...WOOD_M, m: true, bevel: 0.004, detail: 1, r: [0, a - PI / 2, 0] });
  }),
]);
const pouf = (label: string, dia: number, h: number, c: string): Def => {
  const r = dia / 2;
  return piece("Living", label, dia, dia, h, [
    turned(0, 0, 0, [[r * 0.82, 0], [r * 0.96, h * 0.1], [r, h * 0.42], [r * 0.95, h * 0.78], [r * 0.7, h * 0.95], [r * 0.45, h]], c, { ...FAB, m: true }),
    cy(0, h * 0.5, 0, dia * 0.985, 0.01, c, { ...FAB, m: true, bevel: 0, detail: 1 }),
    sp(0, h - 0.005, 0, 0.03, c, { ...FAB, m: true, detail: 2 }),
  ]);
};
const ottoman = (label: string, w: number, d: number, h: number, c: string, tray = false): Def => piece("Living", label, w, d, h + (tray ? 0.03 : 0), [
  cushion(0, h / 2 + 0.03, 0, w, h - 0.06, d, c, { m: true, bevel: 0.045 }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => bunFoot(sx * (w / 2 - 0.07), sz * (d / 2 - 0.07), 0.06, 0.05, WALNUT))),
  b(0, h * 0.45, 0, w - 0.02, 0.008, d - 0.02, c, { ...FAB, m: true, bevel: 0, detail: 1 }),
  ...(tray
    ? [
      b(0, h + 0.015, 0, w - 0.1, 0.03, d - 0.1, DARKWOOD, { ...WOOD_M, bevel: 0.006 }),
      b(0, h + 0.015, 0, w - 0.16, 0.034, d - 0.16, WOOD, { ...WOOD_M, bevel: 0.004 }),
      ...[-1, 1].map((s) => b(s * (w / 2 - 0.05), h + 0.03, 0, 0.012, 0.012, 0.12, BRASS, { tex: "metal", metal: 1, rough: 0.3, bevel: 0.004, detail: 2 })),
    ]
    : []),
]);
const storageOttoman = (): Def => piece("Living", "Storage ottoman 100 x 50", 1.0, 0.5, 0.45, [
  b(0, 0.2, 0, 1.0, 0.36, 0.5, "#8d9299", { ...FAB, m: true, bevel: 0.02 }),
  cushion(0, 0.4, 0, 1.0, 0.08, 0.5, "#8d9299", { m: true, bevel: 0.03 }),
  b(0, 0.445, 0.0, 0.9, 0.008, 0.4, "#767b82", { ...FAB, bevel: 0.002 }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.45, sz * 0.2, 0.03, 0.045, 0.035, BLACK, WOOD_M))),
  b(0, 0.355, 0.25 - 0.003, 0.98, 0.012, 0.006, "#767b82", { ...FAB, detail: 1 }),
  ...[-1, 1].map((s) => b(s * 0.5 - s * 0.004, 0.3, 0, 0.008, 0.07, 0.14, BLACK, { ...LEATHER_M, bevel: 0.003, detail: 2 })),
]);
const bench = (label: string, w: number, d: number, h: number, kind: "hall" | "bed" | "rustic"): Def => {
  if (kind === "rustic") {
    return piece("Kitchen & dining", label, w, d, h, [
      b(0, h - 0.03, 0, w, 0.06, d, OAK, { ...WOOD_M, m: true, bevel: 0.01 }),
      ...[-1, 1].flatMap((s) => [
        b(s * (w / 2 - 0.2), h / 2 - 0.03, 0, 0.06, h - 0.06, d - 0.06, OAK, { ...WOOD_M, m: true, bevel: 0.006 }),
        b(s * (w / 2 - 0.2), 0.12, 0, 0.1, 0.04, d - 0.04, OAK, { ...WOOD_M, m: true, bevel: 0.006 }),
      ]),
      b(0, 0.14, 0, w - 0.4, 0.04, 0.05, OAK, { ...WOOD_M, m: true, bevel: 0.006 }),
      seam(0, h - 0.0, 0, w - 0.02, 0.004, 0.004, DARKWOOD, { ...WOOD_M, detail: 1 }),
      ...[-1, 1].flatMap((s) => [-1, 1].map((z) => cy(s * (w / 2 - 0.2), h + 0.001, z * (d / 2 - 0.05), 0.012, 0.004, BLACK, { ...STEEL, detail: 2 }))),
    ]);
  }
  const bed = kind === "bed";
  const tc = bed ? "#c8c2b8" : "#d6cfc4";
  return piece(bed ? "Bedroom" : "Living", label, w, d, h, [
    cushion(0, h - 0.07, 0, w, 0.14, d, tc, { m: true, bevel: 0.04 }),
    b(0, h - 0.145, 0, w - 0.04, 0.03, d - 0.04, DARKWOOD, { ...WOOD_M, bevel: 0.006 }),
    ...taperedLegs(w - 0.0, d - 0.0, h - 0.16, bed ? BLACK : WALNUT, 0.045, 0.03, 0.05, bed ? BLACK_METAL : WOOD_M),
    ...(bed ? [] : [b(0, 0.15, 0, w - 0.14, 0.02, d - 0.1, WALNUT, { ...WOOD_M, bevel: 0.005 })]),
    b(0, h - 0.0, d / 2 - 0.004, w - 0.1, 0.012, 0.012, tc, { ...FAB, m: true, bevel: 0.005, detail: 1 }),
    sp(-w * 0.25, h + 0.0, 0, 0.022, tc, { ...FAB, m: true, detail: 2 }),
    sp(w * 0.25, h + 0.0, 0, 0.022, tc, { ...FAB, m: true, detail: 2 }),
  ]);
};

// ---------- dining chairs ----------
const diningChair = (label: string, parts: Part[]): Def => piece("Kitchen & dining", label, 0.46, 0.5, 0.9, parts);
const WM = { ...WOOD_M, m: true } as const;
const chairWood = (): Def => diningChair("Dining chair, classic wood 46 x 50", [
  b(0, 0.45, 0.02, 0.42, 0.045, 0.42, WOOD, { ...WM, bevel: 0.01 }),
  ...[-1, 1].flatMap((s) => [
    taperedLeg(s * 0.19, 0.2, 0.44, 0.04, 0.028, WOOD, WM),
    b(s * 0.19, 0.45, -0.19, 0.04, 0.9, 0.04, WOOD, { ...WM, bevel: 0.008 }),
  ]),
  ...[0.58, 0.69, 0.8].map((y) => b(0, y, -0.19, 0.34, 0.07, 0.025, WOOD, { ...WM, bevel: 0.006 })),
  b(0, 0.3, 0.02, 0.36, 0.03, 0.03, WOOD, { ...WM, bevel: 0.005 }),
  b(0, 0.395, 0.21, 0.34, 0.06, 0.02, WOOD, { ...WM, bevel: 0.005, detail: 1 }),
  b(0, 0.87, -0.19, 0.4, 0.04, 0.03, WOOD, { ...WM, bevel: 0.01, detail: 1 }),
  ...[-1, 1].map((s) => b(s * 0.19, 0.01, 0.2, 0.034, 0.02, 0.034, BLACK, { ...RUBBER, bevel: 0.004, detail: 2 })),
]);
const chairModern = (): Def => {
  const c = "#8a9a8c";
  return diningChair("Dining chair, upholstered 46 x 52", [
    cushion(0, 0.46, 0.02, 0.44, 0.08, 0.44, c, { m: true }),
    cushion(0, 0.68, -0.21, 0.42, 0.34, 0.06, c, { m: true, r: [-0.12, 0, 0] }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.19, sz * 0.19 + 0.02, 0.42, 0.03, 0.02, BLACK, BLACK_METAL))),
    b(0, 0.35, 0.02, 0.38, 0.02, 0.02, BLACK, { ...BLACK_METAL, bevel: 0.004 }),
    seam(0, 0.502, 0.24, 0.36, 0.005, 0.005, c, { ...FAB, m: true }),
    ...[-1, 1].map((s) => seam(s * 0.1, 0.68 + 0.0, -0.17, 0.005, 0.28, 0.005, c, { ...FAB, m: true, r: [-0.12, 0, 0] })),
  ]);
};
const chairScandi = (): Def => diningChair("Dining chair, shell seat 46 x 50", [
  b(0, 0.44, 0.0, 0.46, 0.04, 0.44, "#d9d4ca", { ...PLASTIC, m: true, bevel: 0.015 }),
  b(0, 0.66, -0.2, 0.46, 0.34, 0.04, "#d9d4ca", { ...PLASTIC, m: true, bevel: 0.02, r: [-0.15, 0, 0] }),
  ...[-1, 1].flatMap((sx) => [
    taperedLeg(sx * 0.17, 0.17, 0.42, 0.035, 0.022, BIRCH, { ...WOOD_M, r: [0, 0, sx * 0.1] }),
    taperedLeg(sx * 0.17, -0.14, 0.42, 0.035, 0.022, BIRCH, { ...WOOD_M, r: [0, 0, sx * 0.1] }),
  ]),
  b(0, 0.41, 0.0, 0.44, 0.012, 0.42, "#d9d4ca", { ...PLASTIC, m: true, bevel: 0.004, detail: 1 }),
  b(0, 0.34, 0.0, 0.3, 0.02, 0.02, BIRCH, { ...WOOD_M, bevel: 0.004, detail: 1 }),
]);
const chairIndustrial = (): Def => diningChair("Dining chair, metal and wood 46 x 48", [
  b(0, 0.46, 0.0, 0.4, 0.035, 0.38, WOOD, { ...WM, bevel: 0.008 }),
  b(0, 0.7, -0.2, 0.36, 0.2, 0.03, WOOD, { ...WM, bevel: 0.008, r: [-0.1, 0, 0] }),
  ...[-1, 1].flatMap((sx) => [
    b(sx * 0.18, 0.22, 0.17, 0.03, 0.44, 0.03, BLACK, { ...BLACK_METAL, bevel: 0.004 }),
    b(sx * 0.18, 0.45, -0.18, 0.03, 0.9, 0.03, BLACK, { ...BLACK_METAL, bevel: 0.004 }),
    b(sx * 0.18, 0.01, 0.17, 0.034, 0.02, 0.034, BLACK, { ...RUBBER, bevel: 0.004, detail: 2 }),
    b(sx * 0.18, 0.01, -0.18, 0.034, 0.02, 0.034, BLACK, { ...RUBBER, bevel: 0.004, detail: 2 }),
    cy(sx * 0.16, 0.465, -0.0, 0.014, 0.004, BLACK, { ...STEEL, detail: 2 }),
  ]),
  b(0, 0.2, 0.0, 0.36, 0.02, 0.02, BLACK, { ...BLACK_METAL, bevel: 0.004 }),
  b(0, 0.15, -0.0, 0.02, 0.02, 0.36, BLACK, { ...BLACK_METAL, bevel: 0.004 }),
  b(0, 0.43, 0.0, 0.34, 0.02, 0.32, BLACK, { ...BLACK_METAL, bevel: 0.004, detail: 1 }),
]);
const chairRustic = (): Def => diningChair("Dining chair, ladder back 46 x 50", [
  b(0, 0.45, 0.02, 0.42, 0.05, 0.42, "#c9a46b", { ...WOOD_M, bevel: 0.008 }),
  ...[-1, 1].flatMap((s) => [
    turned(s * 0.19, 0, 0.2, [[0.014, 0], [0.022, 0.06], [0.016, 0.14], [0.022, 0.24], [0.02, 0.3], [0.022, 0.44]], DARKWOOD, WM),
    b(s * 0.19, 0.45, -0.19, 0.045, 0.9, 0.045, DARKWOOD, { ...WM, bevel: 0.01 }),
    sp(s * 0.19, 0.895, -0.19, 0.045, DARKWOOD, { ...WOOD_M, m: true, detail: 1 }),
  ]),
  ...[0.55, 0.67, 0.79].map((y) => b(0, y, -0.19, 0.34, 0.03, 0.03, DARKWOOD, { ...WM, bevel: 0.008 })),
  b(0, 0.25, 0.02, 0.34, 0.025, 0.025, DARKWOOD, { ...WM, bevel: 0.005 }),
  ...[-0.12, 0, 0.12].map((x) => b(x, 0.455, 0.02, 0.004, 0.052, 0.42, DARKWOOD, { tex: "wood", bevel: 0, detail: 1 })),
]);

// ---------- bar stools ----------
const barStool = (label: string, h: number, back: boolean, c: string): Def => {
  const top = c === WOOD ? { ...WOOD_M, m: true } as const : { ...LEATHER_M, m: true } as const;
  return piece("Kitchen & dining", label, 0.42, 0.42, back ? h + 0.3 : h, [
    cy(0, h - 0.03, 0, 0.36, 0.06, c, { ...top, bevel: 0.02 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.14, (h - 0.06) / 2, sz * 0.14, 0.025, h - 0.06, BLACK, BLACK_METAL))),
    cy(0, h * 0.35, 0, 0.3, 0.015, BLACK, BLACK_METAL),
    cy(0, 0.01, 0, 0.36, 0.02, BLACK, { ...BLACK_METAL, bevel: 0.004 }),
    ...(back ? [cushion(0, h + 0.12, -0.17, 0.32, 0.22, 0.04, c, { ...top, bevel: 0.015 }), b(0, h + 0.0, -0.17, 0.04, 0.1, 0.03, BLACK, { ...BLACK_METAL, bevel: 0.004 })] : []),
    cy(0, h - 0.008, 0, 0.36, 0.008, c, { ...top, bevel: 0, detail: 1 }),
    ...[-1, 1].map((s) => b(s * 0.14, 0.04, 0.0, 0.02, 0.02, 0.28, BLACK, { ...BLACK_METAL, bevel: 0.004, detail: 1 })),
  ]);
};

// ---------- office chairs ----------
const star = (c: string, stem: string): Part[] => [
  ...Array.from({ length: 5 }, (_, i) => {
    const a = (i * 2 * PI) / 5;
    return b(Math.sin(a) * 0.15, 0.09, Math.cos(a) * 0.15, 0.04, 0.03, 0.3, c, { ...PLASTIC, bevel: 0.008, r: [0, a, 0] });
  }),
  ...Array.from({ length: 5 }, (_, i) => {
    const a = (i * 2 * PI) / 5;
    return sp(Math.sin(a) * 0.28, 0.035, Math.cos(a) * 0.28, 0.06, BLACK, RUBBER);
  }),
  cy(0, 0.26, 0, 0.05, 0.32, stem, STEEL),
  cy(0, 0.17, 0, 0.065, 0.14, BLACK, { ...PLASTIC, bevel: 0.006, detail: 1 }),
];
const meshChair = (): Def => piece("Office", "Office chair, mesh 64 x 64", 0.64, 0.64, 1.0, [
  ...star(BLACK, METAL),
  cushion(0, 0.46, 0.02, 0.5, 0.08, 0.48, "#26282b", { m: true }),
  b(0, 0.74, -0.24, 0.46, 0.5, 0.04, "#33363a", { ...FAB, bevel: 0.004, r: [-0.1, 0, 0] }),
  b(0, 0.74, -0.265, 0.5, 0.54, 0.02, BLACK, { ...PLASTIC, m: true, bevel: 0.012, r: [-0.1, 0, 0] }),
  b(0, 1.0 - 0.04, -0.28, 0.3, 0.1, 0.05, BLACK, { ...PLASTIC, bevel: 0.015 }),
  ...[-1, 1].flatMap((s) => [b(s * 0.28, 0.6, 0.0, 0.04, 0.03, 0.3, BLACK, { ...PLASTIC, bevel: 0.01 }), b(s * 0.28, 0.54, -0.05, 0.03, 0.12, 0.03, BLACK, { ...PLASTIC, bevel: 0.006 })]),
  ...[-0.12, 0, 0.12].map((x) => b(x, 0.74, -0.22, 0.005, 0.46, 0.005, BLACK, { ...PLASTIC, bevel: 0, detail: 1, r: [-0.1, 0, 0] })),
  b(0.2, 0.52, 0.2, 0.025, 0.01, 0.04, BLACK, { ...PLASTIC, bevel: 0.004, detail: 2 }),
]);
const executiveChair = (): Def => {
  const dark = "#3d2314";
  const T = -0.12;
  return piece("Office", "Office chair, executive leather 68 x 68", 0.68, 0.68, 1.25, [
    ...star(METAL, METAL),
    cushion(0, 0.47, 0.02, 0.54, 0.12, 0.52, LEATHER, { ...LEATHER_M, m: true }),
    b(0, 0.86, -0.25, 0.52, 0.74, 0.12, LEATHER, { ...LEATHER_M, m: true, bevel: 0.05, r: [T, 0, 0] }),
    pillow(0, 1.1, -0.28, 0.4, 0.2, 0.12, LEATHER, { ...LEATHER_M, m: true, bevel: 0.05, r: [T, 0, 0] }),
    ...[-1, 1].flatMap((s) => [
      b(s * 0.29, 0.66, 0.0, 0.07, 0.05, 0.4, LEATHER, { ...LEATHER_M, m: true, bevel: 0.02 }),
      b(s * 0.29, 0.56, -0.08, 0.03, 0.2, 0.03, METAL, { ...STEEL, bevel: 0.006 }),
    ]),
    // channel stitching across the backrest and seat
    ...[-0.24, -0.08, 0.08, 0.24].map((ly) => {
      const [y, z] = tilt(0.86, -0.25, T, ly, 0.062);
      return seam(0, y, z, 0.46, 0.006, 0.006, dark, { ...LEATHER_M, r: [T, 0, 0] });
    }),
    seam(0, 0.535, 0.28, 0.5, 0.006, 0.006, dark, LEATHER_M),
    ...[-1, 1].map((s) => cy(s * 0.29, 0.69, 0.18, 0.02, 0.012, METAL, { ...CHROME, detail: 2 })),
  ]);
};
const gamingChair = (): Def => {
  const T = -0.14;
  const red = "#d3263a";
  return piece("Office", "Office chair, gaming 66 x 70", 0.66, 0.7, 1.3, [
    ...star(BLACK, "#2a2c30"),
    cushion(0, 0.46, 0.02, 0.52, 0.1, 0.5, BLACK, LEATHER_M),
    ...[-1, 1].map((s) => cushion(s * 0.23, 0.5, 0.02, 0.08, 0.14, 0.5, red, { ...LEATHER_M, m: true, bevel: 0.025 })),
    b(0, 0.9, -0.26, 0.5, 0.78, 0.1, BLACK, { ...LEATHER_M, bevel: 0.04, r: [T, 0, 0] }),
    ...[-1, 1].map((s) => b(s * 0.2, 0.92, -0.225, 0.1, 0.7, 0.03, red, { ...LEATHER_M, m: true, bevel: 0.012, r: [T, 0, 0] })),
    pillow(0, 1.2, -0.3, 0.32, 0.16, 0.1, BLACK, { ...LEATHER_M, bevel: 0.05, r: [T, 0, 0] }),
    ...[-1, 1].flatMap((s) => [b(s * 0.3, 0.64, 0.0, 0.06, 0.04, 0.36, "#2a2c30", { ...PLASTIC, bevel: 0.012 }), b(s * 0.3, 0.55, -0.08, 0.03, 0.18, 0.03, BLACK, { ...BLACK_METAL, bevel: 0.006 })]),
    // contrast stitching down the wings, lumbar pillow
    ...[-1, 1].map((s) => {
      const [y, z] = tilt(0.9, -0.26, T, 0, 0.052);
      return seam(s * 0.11, y, z, 0.005, 0.7, 0.005, red, { ...LEATHER_M, m: true, r: [T, 0, 0] });
    }),
    pillow(0, 0.78, -0.2, 0.3, 0.14, 0.06, "#2a2c30", { ...LEATHER_M, bevel: 0.03, r: [T, 0, 0] }),
    ...[-1, 1].map((s) => cy(s * 0.3, 0.665, 0.1, 0.02, 0.012, BLACK, { ...PLASTIC, detail: 2 })),
  ]);
};

export const SEATING: Record<string, Def> = {
  // sofas
  dc_sofa_modern_2: sofa(`Sofa, 2-seat ${dims(1.6, 0.9)}`, 1.6, 0.9, 2, { ...MODERN, c: "#8d9299" }),
  dc_sofa_modern_3: sofa(`Sofa, 3-seat ${dims(2.1, 0.92)}`, 2.1, 0.92, 3, { ...MODERN, c: "#8d9299" }),
  dc_sofa_modern_3xl: sofa(`Sofa, 3-seat large ${dims(2.4, 1.0)}`, 2.4, 1.0, 3, { ...MODERN, c: "#8d9299", accent: "#c1784a" }),
  dc_sofa_scandi_2: sofa(`Scandinavian sofa, 2-seat ${dims(1.5, 0.8)}`, 1.5, 0.8, 2, { ...SCANDI, c: "#d6cfc4" }),
  dc_sofa_scandi_3: sofa(`Scandinavian sofa, 3-seat ${dims(2.0, 0.85)}`, 2.0, 0.85, 3, { ...SCANDI, c: "#d6cfc4" }),
  dc_loveseat: sofa(`Loveseat ${dims(1.3, 0.85)}`, 1.3, 0.85, 2, { ...SOFT, c: "#4a6b8a" }),
  dc_sofa_l_right: lSofa(`L-shaped sofa, chaise on the right ${dims(2.7, 1.6)}`, 2.7, 1.6, 1, "#8d9299"),
  dc_sofa_l_left: lSofa(`L-shaped sofa, chaise on the left ${dims(2.7, 1.6)}`, 2.7, 1.6, -1, "#8d9299"),
  dc_sofa_l_small_right: lSofa(`Small L-shaped sofa, chaise on the right ${dims(2.3, 1.5)}`, 2.3, 1.5, 1, "#c8c2b8"),
  dc_sofa_l_small_left: lSofa(`Small L-shaped sofa, chaise on the left ${dims(2.3, 1.5)}`, 2.3, 1.5, -1, "#c8c2b8"),
  dc_sofa_module_corner: modPiece(`Modular sofa, corner piece ${dims(1.0, 1.0)}`, 1.0, 1.0, true, "#8a9a8c"),
  dc_sofa_module_seat: modPiece(`Modular sofa, middle piece ${dims(0.9, 1.0)}`, 0.9, 1.0, false, "#8a9a8c"),
  dc_chesterfield_2: chesterfield(`Chesterfield sofa, 2-seat ${dims(1.7, 0.9)}`, 1.7, 0.9, LEATHER),
  dc_chesterfield_3: chesterfield(`Chesterfield sofa, 3-seat ${dims(2.1, 0.9)}`, 2.1, 0.9, LEATHER),
  dc_sofabed_2: piece("Living", `Sofa bed, 2-seat ${dims(1.6, 0.9)}`, 1.6, 0.9, 0.9, sofaParts(1.6, 0.9, 2, { ...MODERN, c: "#5f7a8a", fold: true, backTop: 0.78 })),
  dc_sofabed_3: piece("Living", `Sofa bed, 3-seat ${dims(1.95, 0.95)}`, 1.95, 0.95, 0.9, sofaParts(1.95, 0.95, 3, { ...MODERN, c: "#5f7a8a", fold: true, backTop: 0.78 })),
  // armchairs
  dc_armchair_wingback: wingback(),
  dc_armchair_lounge: lounge(),
  dc_armchair_tub: tub(),
  dc_armchair_scandi: scandiChair(),
  dc_armchair_rocking: rocker(),
  dc_beanbag_90: beanBag(`Bean bag ${dims(0.9, 0.9)}`, 0.9, "#c1784a"),
  dc_beanbag_110: beanBag(`Bean bag, large ${dims(1.1, 1.1)}`, 1.1, "#4a6b8a"),
  // stools, ottomans, benches
  dc_stool_wood: stool(`Wooden stool ${dims(0.34, 0.34)}`, 0.34, 0.46),
  dc_stool_wood_low: stool(`Low wooden stool ${dims(0.3, 0.3)}`, 0.3, 0.32),
  dc_pouf_45: pouf(`Pouf ${dims(0.45, 0.45)}`, 0.45, 0.4, "#d9cbb0"),
  dc_pouf_60: pouf(`Pouf, large ${dims(0.6, 0.6)}`, 0.6, 0.42, "#b0645a"),
  dc_ottoman_70: ottoman(`Ottoman ${dims(0.7, 0.7)}`, 0.7, 0.7, 0.42, "#5f7a8a"),
  dc_ottoman_tray_90: ottoman(`Ottoman with tray ${dims(0.9, 0.9)}`, 0.9, 0.9, 0.4, "#8d9299", true),
  dc_ottoman_storage_100: storageOttoman(),
  dc_bench_hall_100: bench(`Hall bench ${dims(1.0, 0.38)}`, 1.0, 0.38, 0.46, "hall"),
  dc_bench_bed_140: bench(`Bed-end bench ${dims(1.4, 0.4)}`, 1.4, 0.4, 0.46, "bed"),
  dc_bench_dining_160: bench(`Dining bench, rustic ${dims(1.6, 0.36)}`, 1.6, 0.36, 0.46, "rustic"),
  // dining chairs
  dc_chair_dining_wood: chairWood(),
  dc_chair_dining_modern: chairModern(),
  dc_chair_dining_scandi: chairScandi(),
  dc_chair_dining_industrial: chairIndustrial(),
  dc_chair_dining_rustic: chairRustic(),
  // bar stools
  dc_stool_bar_counter: barStool("Bar stool, counter height 65 cm", 0.65, true, "#c1784a"),
  dc_stool_bar_high: barStool("Bar stool, high 75 cm", 0.75, true, "#8d9299"),
  dc_stool_bar_backless: barStool("Bar stool, backless 75 cm", 0.75, false, WOOD),
  // office chairs
  dc_chair_office_mesh: meshChair(),
  dc_chair_office_executive: executiveChair(),
  dc_chair_office_gaming: gamingChair(),
};
