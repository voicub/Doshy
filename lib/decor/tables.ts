import type { Def, Part } from "../catalog.ts";
import { BIRCH, BLACK, BRASS, DARKWOOD, DGREY, GLASS, LGREY, METAL, OAK, WALNUT, WHITE, b, cy, dims, discZ, piece, rodX, sp } from "./kit.ts";
import { fin } from "./storage.ts";
import * as K from "../partsKit.ts";

const MARBLE = "#ece9e4";
const VEIN = "#b9b4ad";
const BRASS_M: K.Opt = { tex: "metal", metal: 1, rough: 0.3 };
const MARBLE_M: K.Opt = { ...K.STONE, rough: 0.25 };
const GLASS_M: K.Opt = { tex: "ceramic", rough: 0.08, bevel: 0, glass: true };
const MIRROR: K.Opt = { tex: "metal", metal: 0.9, rough: 0.05, bevel: 0 };
const WOOD_M: K.Opt = { ...K.WOOD, m: true };
const GROMMET = (x: number, y: number, z: number): Part => cy(x, y + 0.0015, z, 0.06, 0.003, BLACK, { ...K.RUBBER, bevel: 0, detail: 1 }); // cable hole in a desk top

// ---------- dining tables ----------
type Base = "legs" | "trestle" | "metal";
const tableBase = (w: number, d: number, h: number, c: string, base: Base): Part[] => {
  const top = h - 0.04;
  if (base === "trestle") {
    return [
      ...[-1, 1].flatMap((s) => [b(s * (w / 2 - 0.25), top / 2, 0, 0.07, top, d - 0.3, c, { ...WOOD_M, bevel: 0.012 }), b(s * (w / 2 - 0.25), 0.03, 0, 0.1, 0.06, d - 0.1, c, { ...WOOD_M, bevel: 0.01 })]),
      b(0, 0.2, 0, w - 0.5, 0.06, 0.05, c, { ...WOOD_M, bevel: 0.006 }),
      ...[-1, 1].map((s) => b(s * (w / 2 - 0.21), 0.2, 0, 0.03, 0.05, 0.025, DARKWOOD, { ...K.WOOD, bevel: 0.003, detail: 2 })), // pegged tenons
    ];
  }
  const col = base === "metal" ? BLACK : c;
  const o: K.Opt = base === "metal" ? { ...K.BLACK_METAL, bevel: 0.003 } : { ...WOOD_M, bevel: 0.003 };
  return [
    ...(base === "metal"
      ? [-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * (w / 2 - 0.07), top / 2, sz * (d / 2 - 0.07), 0.05, top, 0.05, col, { ...o, bevel: 0.004 })))
      : [-1, 1].flatMap((sx) => [-1, 1].map((sz) => K.taperedLeg(sx * (w / 2 - 0.07), sz * (d / 2 - 0.07), top, 0.07, 0.04, col, WOOD_M)))),
    ...[-1, 1].flatMap((s) => [b(0, top - 0.04, s * (d / 2 - 0.07), w - 0.2, 0.07, 0.025, col, o), b(s * (w / 2 - 0.07), top - 0.04, 0, 0.025, 0.07, d - 0.2, col, o)]),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (base === "metal"
      ? b(sx * (w / 2 - 0.07), top - 0.1, sz * (d / 2 - 0.07), 0.07, 0.012, 0.07, col, { ...K.BLACK_METAL, bevel: 0.002, detail: 2 }) // corner plate under the aprons
      : cy(sx * (w / 2 - 0.07), 0.04, sz * (d / 2 - 0.07), 0.046, 0.012, col, { ...WOOD_M, bevel: 0.003, detail: 2 })))), // turned ring above the foot
  ];
};
/** Rectangular table; `seams` are x positions of leaf joints on the top. */
const rectTable = (cat: "Kitchen & dining" | "Living" | "Office", label: string, w: number, d: number, h: number, c: string, base: Base, seams: number[] = []): Def =>
  piece(cat, label, w, d, h, [
    b(0, h - 0.02, 0, w, 0.04, d, c, { ...fin(c), bevel: 0.01 }),
    b(0, h - 0.046, 0, w - 0.05, 0.012, d - 0.05, c, { ...fin(c), bevel: 0.003, detail: 1 }), // shadow step under the top edge
    ...seams.map((x) => K.seam(x, h + 0.0005, 0, 0.008, 0.002, d, DGREY, K.MATT)),
    ...tableBase(w, d, h, base === "metal" ? BLACK : c, base),
    ...(base === "trestle"
      ? [
        ...[-1, 1].map((s) => K.seam(0, h + 0.001, s * d * 0.17, w - 0.02, 0.002, 0.004, "#5a4429", K.MATT)), // plank joints
        ...[-1, 1].map((s) => b(s * (w / 2 - 0.05), h - 0.02, 0, 0.1, 0.042, d + 0.004, c, { ...WOOD_M, bevel: 0.004, detail: 1 })), // breadboard ends
      ]
      : []),
  ]);

const roundTable = (label: string, dia: number, h: number, c: string, base: "pedestal" | "legs"): Def => {
  const f = fin(c);
  const R = dia * 0.25;
  const top = h - 0.04;
  return piece("Kitchen & dining", label, dia, dia, h, [
    cy(0, h - 0.02, 0, dia, 0.04, c, { ...f, bevel: 0.01 }),
    cy(0, h - 0.046, 0, dia - 0.05, 0.012, c, { ...f, bevel: 0.003, detail: 1 }), // shadow step under the top edge
    ...(base === "pedestal"
      ? [
        K.turned(0, 0, 0, [[R, 0], [R, 0.02], [R * 0.6, 0.045], [0.085, 0.09], [0.055, 0.17], [0.055, top - 0.14], [0.075, top - 0.05], [0.09, top]], c, f),
        cy(0, h - 0.05, 0, 0.26, 0.02, c, { ...f, bevel: 0.004, detail: 1 }), // collar under the top
      ]
      : [
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => K.taperedLeg(sx * dia * 0.3, sz * dia * 0.3, top, 0.07, 0.04, c, f))),
        ...[-1, 1].flatMap((s) => [b(0, top - 0.025, s * dia * 0.3, dia * 0.6, 0.05, 0.025, c, { ...f, bevel: 0.003 }), b(s * dia * 0.3, top - 0.025, 0, 0.025, 0.05, dia * 0.6, c, { ...f, bevel: 0.003 })]), // square apron joining the legs
      ]),
  ]);
};

const ovalTable = (label: string, w: number, d: number, h: number, c: string): Def => {
  const f = fin(c);
  return piece("Kitchen & dining", label, w, d, h, [
    b(0, h - 0.02, 0, w - d, 0.04, d, c, { ...f, bevel: 0.003 }),
    ...[-1, 1].map((s) => cy(s * (w - d) / 2, h - 0.02, 0, d, 0.04, c, { ...f, bevel: 0.003 })),
    ...[-1, 1].flatMap((s) => [b(s * (w / 2 - 0.35), (h - 0.04) / 2, 0, 0.09, h - 0.04, d * 0.45, c, { ...f, bevel: 0.01 }), b(s * (w / 2 - 0.35), 0.025, 0, 0.14, 0.05, d * 0.7, c, { ...f, bevel: 0.01 })]),
    b(0, 0.2, 0, w - 0.7, 0.05, 0.05, c, { ...f, bevel: 0.006 }),
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.35), h - 0.06, 0, 0.12, 0.04, d * 0.55, c, { ...f, bevel: 0.006, detail: 1 })), // cap of each trestle under the top
  ]);
};

const barTable = (): Def =>
  piece("Kitchen & dining", `Bar table ${dims(1.2, 0.6)}`, 1.2, 0.6, 1.05, [
    b(0, 1.03, 0, 1.2, 0.04, 0.6, DARKWOOD, { ...WOOD_M, bevel: 0.01 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.55, 0.505, sz * 0.25, 0.04, 1.01, 0.04, BLACK, { ...K.BLACK_METAL, bevel: 0.004 }))),
    rodX(0, 0.25, 0.25, 0.025, 1.06, BRASS, BRASS_M),
    rodX(0, 0.25, -0.25, 0.025, 1.06, BRASS, BRASS_M),
    b(0, 0.9, 0, 1.06, 0.06, 0.5, BLACK, { ...K.MATT, bevel: 0.006 }),
    b(0, 1.0, 0.3, 1.1, 0.03, 0.01, BLACK, { ...K.MATT, bevel: 0.002, detail: 1 }), // apron trim
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.55, 0.008, sz * 0.25, 0.05, 0.016, BLACK, { ...K.RUBBER, detail: 2 }))), // glides
  ]);
const bistro = (): Def =>
  piece("Kitchen & dining", `Round bar table ${dims(0.7, 0.7)}`, 0.7, 0.7, 1.05, [
    cy(0, 1.03, 0, 0.7, 0.04, WALNUT, { ...WOOD_M, bevel: 0.01 }),
    K.turned(0, 0, 0, [[0.225, 0], [0.225, 0.012], [0.12, 0.03], [0.035, 0.08], [0.03, 0.2], [0.03, 0.95], [0.045, 1.0]], BLACK, K.BLACK_METAL),
    cy(0, 0.3, 0, 0.25, 0.015, BLACK, { ...K.BLACK_METAL, bevel: 0.004 }),
    cy(0, 1.03, 0, 0.704, 0.012, BRASS, { ...BRASS_M, bevel: 0, detail: 1 }), // brass edge band
    cy(0, 0.995, 0, 0.12, 0.03, BLACK, { ...K.BLACK_METAL, bevel: 0.004, detail: 1 }), // column cap under the top
  ]);

// ---------- coffee and side tables ----------
const hairpin = (x: number, z: number, h: number): Part[] => [0.08, -0.08].map((r) => cy(x, h / 2, z, 0.014, h, BLACK, { ...K.BLACK_METAL, r: [0, 0, r] }));
const coffeeRound = (label: string, dia: number): Def =>
  piece("Living", label, dia, dia, 0.42, [
    cy(0, 0.4, 0, dia, 0.04, OAK, { ...WOOD_M, bevel: 0.008 }),
    ...[0, 1, 2].flatMap((i) => hairpin(Math.sin((i * 2 * Math.PI) / 3) * dia * 0.3, Math.cos((i * 2 * Math.PI) / 3) * dia * 0.3, 0.38)),
    ...[0, 1, 2].map((i) => cy(Math.sin((i * 2 * Math.PI) / 3) * dia * 0.3, 0.376, Math.cos((i * 2 * Math.PI) / 3) * dia * 0.3, 0.05, 0.008, BLACK, { ...K.BLACK_METAL, bevel: 0.002, detail: 1 })), // leg plates
  ]);
const nesting = (): Def =>
  piece("Living", `Nesting coffee tables, round ${dims(1.0, 0.6)}`, 1.0, 0.6, 0.45, [
    cy(-0.2, 0.43, 0, 0.6, 0.03, OAK, { ...WOOD_M, bevel: 0.007 }),
    ...[-1, 1].map((s) => cy(-0.2 + s * 0.2, 0.2, s * 0.0, 0.03, 0.41, BLACK, K.BLACK_METAL)),
    cy(0.28, 0.33, 0.04, 0.42, 0.03, WHITE, { ...fin(WHITE), bevel: 0.007 }),
    ...[-1, 1].map((s) => cy(0.28 + s * 0.14, 0.16, 0.04, 0.025, 0.31, BLACK, K.BLACK_METAL)),
    ...[-1, 1].map((s) => cy(-0.2 + s * 0.2, 0.008, 0, 0.045, 0.016, BLACK, { ...K.RUBBER, detail: 2 })),
  ]);
const glassCoffee = (): Def =>
  piece("Living", `Glass coffee table ${dims(1.1, 0.6)}`, 1.1, 0.6, 0.42, [
    b(0, 0.405, 0, 1.1, 0.02, 0.6, GLASS, GLASS_M),
    ...[-1, 1].flatMap((s) => [b(0, 0.395, s * 0.305, 1.12, 0.012, 0.01, METAL, { ...K.CHROME, bevel: 0.003 }), b(s * 0.555, 0.395, 0, 0.01, 0.012, 0.6, METAL, { ...K.CHROME, bevel: 0.003 })]), // frame under the glass
    b(0, 0.14, 0, 0.98, 0.015, 0.48, GLASS, GLASS_M),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.5, 0.2, sz * 0.25, 0.03, 0.4, METAL, K.CHROME))),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.5, 0.14, sz * 0.25, 0.04, 0.02, METAL, { ...K.CHROME, detail: 1 }))), // shelf collars
  ]);
const marbleRound = (): Def =>
  piece("Living", `Marble coffee table, round ${dims(0.7, 0.7)}`, 0.7, 0.7, 0.42, [
    cy(0, 0.4, 0, 0.7, 0.04, MARBLE, { ...MARBLE_M, m: true, bevel: 0.006 }),
    b(0.1, 0.4005, -0.05, 0.3, 0.001, 0.008, VEIN, { ...MARBLE_M, bevel: 0, r: [0, 0.5, 0] }),
    b(-0.12, 0.4005, 0.1, 0.22, 0.001, 0.005, VEIN, { ...MARBLE_M, bevel: 0, r: [0, -0.7, 0], detail: 1 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.18, 0.19, sz * 0.18, 0.03, 0.38, BRASS, BRASS_M))),
    cy(0, 0.1, 0, 0.4, 0.015, BRASS, { ...BRASS_M, bevel: 0.004 }),
  ]);
const marbleRect = (): Def =>
  piece("Living", `Marble coffee table ${dims(1.0, 0.55)}`, 1.0, 0.55, 0.42, [
    b(0, 0.4, 0, 1.0, 0.04, 0.55, MARBLE, { ...MARBLE_M, m: true, bevel: 0.006 }),
    b(-0.1, 0.4205, 0.05, 0.4, 0.002, 0.006, VEIN, { ...MARBLE_M, bevel: 0, r: [0, 0.4, 0] }),
    b(0.25, 0.4205, -0.1, 0.25, 0.002, 0.004, VEIN, { ...MARBLE_M, bevel: 0, r: [0, -0.5, 0], detail: 1 }),
    ...[-1, 1].map((s) => b(s * 0.44, 0.19, 0, 0.04, 0.38, 0.5, BLACK, { ...K.BLACK_METAL, bevel: 0.004 })),
    b(0, 0.05, 0, 0.84, 0.03, 0.04, BLACK, { ...K.BLACK_METAL, bevel: 0.004 }),
  ]);
const woodCoffee = (label: string, w: number, d: number, h: number): Def =>
  piece("Living", label, w, d, h, [
    b(0, h - 0.02, 0, w, 0.04, d, OAK, { ...WOOD_M, bevel: 0.01 }),
    b(0, 0.14, 0, w - 0.14, 0.025, d - 0.12, OAK, { ...WOOD_M, bevel: 0.005 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => K.taperedLeg(sx * (w / 2 - 0.05), sz * (d / 2 - 0.05), h - 0.04, 0.05, 0.034, OAK, WOOD_M))),
    ...[-1, 1].map((s) => b(0, h - 0.06, s * (d / 2 - 0.05), w - 0.12, 0.04, 0.02, OAK, { ...WOOD_M, bevel: 0.003 })), // aprons
    b(-0.2, 0.18, 0.0, 0.2, 0.05, 0.26, "#d9a02c", { ...K.MATT, bevel: 0.005 }),
    b(0.2, 0.17, 0.05, 0.22, 0.03, 0.3, "#4a6b8a", { ...K.MATT, bevel: 0.004, detail: 1 }), // magazines on the shelf
  ]);

const sideRound = (): Def =>
  piece("Living", `Round side table ${dims(0.45, 0.45)}`, 0.45, 0.45, 0.55, [
    cy(0, 0.53, 0, 0.45, 0.03, WHITE, { ...fin(WHITE), bevel: 0.006 }),
    cy(0, 0.508, 0, 0.4, 0.012, WHITE, { ...fin(WHITE), bevel: 0.003, detail: 1 }),
    K.turned(0, 0, 0, [[0.15, 0], [0.15, 0.012], [0.06, 0.03], [0.025, 0.07], [0.025, 0.5], [0.04, 0.52]], BLACK, K.BLACK_METAL),
  ]);
const sideC = (): Def =>
  piece("Living", `C-shaped side table ${dims(0.4, 0.5)}`, 0.4, 0.5, 0.6, [
    b(0, 0.585, 0.0, 0.4, 0.03, 0.4, WHITE, { ...fin(WHITE), bevel: 0.006 }),
    b(0, 0.015, 0.0, 0.34, 0.03, 0.5, BLACK, { ...K.BLACK_METAL, bevel: 0.006 }),
    b(-0.14, 0.3, -0.2, 0.03, 0.57, 0.03, BLACK, { ...K.BLACK_METAL, bevel: 0.004 }),
    b(0, 0.57, -0.2, 0.3, 0.03, 0.03, BLACK, { ...K.BLACK_METAL, bevel: 0.004, detail: 1 }), // top bracket tying the post to the table top
    ...[-1, 1].map((s) => cy(s * 0.12, 0.003, 0.2, 0.04, 0.006, BLACK, { ...K.RUBBER, detail: 2 })),
  ]);
const sideDrum = (): Def =>
  piece("Living", `Drum side table ${dims(0.4, 0.4)}`, 0.4, 0.4, 0.5, [
    K.turned(0, 0.02, 0, [[0.19, 0], [0.2, 0.05], [0.195, 0.23], [0.2, 0.41], [0.19, 0.46]], "#4a6b8a", { ...K.CERAMIC, m: true }),
    cy(0, 0.485, 0, 0.42, 0.03, BRASS, { ...BRASS_M, bevel: 0.006 }),
    cy(0, 0.25, 0, 0.402, 0.004, BRASS, { ...BRASS_M, bevel: 0, detail: 1 }), // brass inlay band
    cy(0, 0.03, 0, 0.42, 0.03, BRASS, { ...BRASS_M, bevel: 0.006 }),
  ]);

const consoleTable = (label: string, w: number, d: number, h: number, drawers: boolean): Def => {
  const f = { ...K.WOOD, m: true } as const;
  return piece("Living", label, w, d, h, [
    b(0, h - 0.02, 0, w, 0.04, d, WALNUT, { ...f, bevel: 0.008 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => K.taperedLeg(sx * (w / 2 - 0.04), sz * (d / 2 - 0.04), h - 0.04, 0.032, 0.02, BLACK, K.BLACK_METAL))),
    ...(drawers
      ? [
        b(0, h - 0.17, 0, w - 0.1, 0.2, d - 0.04, WALNUT, { ...f, bevel: 0.004 }),
        ...[-1, 1].flatMap((s) => [...K.drawerFront(s * (w / 4 - 0.01), h - 0.17, d / 2 - 0.018, w / 2 - 0.096, 0.174, WALNUT, { ...f, thick: 0.012 }), K.handleBar(s * (w / 4 - 0.01), h - 0.17, d / 2 - 0.006, 0.1, "x", BRASS, BRASS_M)]),
        b(0, 0.15, 0, w - 0.1, 0.025, d - 0.06, WALNUT, { ...f, bevel: 0.004 }),
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * (w / 2 - 0.04), h - 0.052, sz * (d / 2 - 0.04), 0.036, 0.012, BRASS, { ...BRASS_M, bevel: 0.003, detail: 2 }))), // leg-top caps
      ]
      : [
        b(0, 0.2, 0, w - 0.1, 0.025, d - 0.06, WALNUT, { ...f, bevel: 0.004 }),
        b(0, h - 0.065, d / 2 - 0.025, w - 0.08, 0.05, 0.02, WALNUT, { ...f, bevel: 0.003 }), // front apron
      ]),
  ]);
};

// ---------- desks ----------
const desk = (label: string, w: number, d: number, c: string, pedestal: boolean): Def => {
  const f = fin(c);
  return piece("Office", label, w, d, 0.75, [
    b(0, 0.735, 0, w, 0.03, d, c, { ...f, bevel: 0.006 }),
    b(-w / 2 + 0.02, 0.36, 0, 0.03, 0.72, d - 0.04, c, { ...f, bevel: 0.003 }),
    b(0, 0.55, -d / 2 + 0.03, w - 0.08, 0.3, 0.02, c, { ...f, bevel: 0.002 }),
    ...(pedestal
      ? [
        b(w / 2 - 0.23, 0.36, 0, 0.42, 0.72, d - 0.04, c, { ...f, bevel: 0.003 }),
        ...[0.58, 0.4, 0.22].flatMap((y) => K.drawerFront(w / 2 - 0.23, y, d / 2 - 0.019, 0.384, 0.154, WHITE, { ...K.LACQUER, thick: 0.014, handle: "bar-x" })),
      ]
      : [b(w / 2 - 0.02, 0.36, 0, 0.03, 0.72, d - 0.04, c, { ...f, bevel: 0.003 })]),
    GROMMET(-w / 2 + 0.2, 0.75, -d / 2 + 0.1),
  ]);
};
/** L-shaped desk: a run along the back and a return along one side. side = +1 return on the right, -1 on the left. */
const lDesk = (label: string, w: number, d: number, arm: number, side: 1 | -1, c: string): Def => {
  const retLen = d - arm;
  const retX = side * (w / 2 - arm / 2);
  const retZ = d / 2 - retLen / 2;
  const f = fin(c);
  return piece("Office", label, w, d, 0.75, [
    b(0, 0.735, -d / 2 + arm / 2, w, 0.03, arm, c, { ...f, bevel: 0.006 }),
    b(retX, 0.735, retZ, arm, 0.03, retLen, c, { ...f, bevel: 0.006 }),
    b(-side * (w / 2 - 0.03), 0.36, -d / 2 + arm / 2, 0.03, 0.72, arm - 0.04, c, { ...f, bevel: 0.003 }),
    b(retX, 0.36, d / 2 - 0.03, arm - 0.04, 0.72, 0.03, c, { ...f, bevel: 0.003 }),
    b(0, 0.55, -d / 2 + 0.03, w - 0.1, 0.3, 0.02, c, { ...f, bevel: 0.002 }),
    b(side * (w / 2 - arm), 0.36, retZ, 0.03, 0.72, retLen - 0.04, c, { ...f, bevel: 0.003 }),
    GROMMET(-side * (w / 2 - 0.2), 0.75, -d / 2 + 0.1),
    GROMMET(retX, 0.75, d / 2 - 0.15),
  ]);
};
const standingDesk = (): Def =>
  piece("Office", `Standing desk, adjustable ${dims(1.4, 0.7)}`, 1.4, 0.7, 1.1, [
    b(0, 1.085, 0, 1.4, 0.03, 0.7, BIRCH, { ...WOOD_M, bevel: 0.008 }),
    ...[-1, 1].flatMap((s) => [
      b(s * 0.55, 0.55, 0, 0.07, 1.04, 0.07, BLACK, { ...K.BLACK_METAL, bevel: 0.004 }),
      b(s * 0.55, 0.02, 0, 0.07, 0.04, 0.64, BLACK, { ...K.BLACK_METAL, bevel: 0.006 }),
      b(s * 0.55, 0.62, 0, 0.055, 0.4, 0.055, "#2a2c30", { ...K.BLACK_METAL, bevel: 0.003, detail: 1 }), // inner telescoping stage
    ]),
    b(0, 1.02, 0, 1.0, 0.05, 0.06, BLACK, { ...K.BLACK_METAL, bevel: 0.004 }),
    b(0.42, 1.06, 0.3, 0.12, 0.03, 0.06, "#2a2c30", { ...K.PLASTIC, bevel: 0.006 }),
    b(0.42, 1.0, 0.3, 0.1, 0.02, 0.01, "#4ad7ff", { glow: true, tex: "plastic", rough: 0.2 }),
    b(0, 0.98, -0.25, 1.1, 0.04, 0.1, BLACK, { ...K.BLACK_METAL, bevel: 0.004, detail: 1 }), // cable tray
    ...[0.38, 0.42, 0.46].map((x) => b(x, 1.07, 0.334, 0.016, 0.012, 0.006, "#8d9299", { ...K.PLASTIC, bevel: 0.002, detail: 2 })), // up/down buttons
  ]);
const kidsDesk = (): Def =>
  piece("Office", `Kids desk ${dims(1.0, 0.55)}`, 1.0, 0.55, 0.62, [
    b(0, 0.6, 0, 1.0, 0.03, 0.55, WHITE, { ...fin(WHITE), bevel: 0.012 }),
    ...[-1, 1].flatMap((s) => [b(s * 0.47, 0.29, 0, 0.04, 0.58, 0.5, "#4a9ad9", { ...K.LACQUER, bevel: 0.01 }), b(s * 0.47, 0.5, 0.2, 0.05, 0.1, 0.1, "#d9a02c", { ...K.LACQUER, bevel: 0.015 })]),
    b(0, 0.4, -0.25, 0.9, 0.3, 0.02, "#4a9ad9", { ...K.LACQUER, bevel: 0.004 }),
    b(0.3, 0.2, 0.0, 0.3, 0.02, 0.4, "#d9a02c", { ...K.LACQUER, bevel: 0.006 }),
    ...[-1, 1].map((s) => cy(s * 0.47, 0.01, 0.2, 0.04, 0.02, "#d9a02c", { ...K.RUBBER, detail: 2 })), // feet
  ]);

// ---------- dressing table ----------
const dressingTable = (): Def =>
  piece("Bedroom", `Dressing table with mirror ${dims(1.0, 0.45)}`, 1.0, 0.45, 1.55, [
    b(0, 0.74, 0, 1.0, 0.035, 0.45, WHITE, { ...fin(WHITE), bevel: 0.008 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => K.taperedLeg(sx * 0.46, sz * 0.19, 0.72, 0.045, 0.026, WHITE, fin(WHITE)))),
    b(0.27, 0.62, 0, 0.4, 0.16, 0.4, WHITE, { ...fin(WHITE), bevel: 0.004 }),
    ...K.drawerFront(0.27, 0.62, 0.196, 0.364, 0.124, LGREY, { ...K.LACQUER, thick: 0.012, handle: "knob", handleColor: BRASS }),
    b(-0.27, 0.705, 0.2, 0.4, 0.05, 0.02, WHITE, { ...fin(WHITE), bevel: 0.003 }), // aprons round the knee space
    b(0, 0.705, -0.19, 0.9, 0.05, 0.02, WHITE, { ...fin(WHITE), bevel: 0.003 }),
    b(0, 0.805, -0.2, 0.04, 0.095, 0.03, WHITE, { ...fin(WHITE), bevel: 0.006 }), // mirror post
    discZ(0, 1.2, -0.2, 0.7, 0.025, WHITE, { ...fin(WHITE), bevel: 0.008 }),
    discZ(0, 1.2, -0.185, 0.62, 0.012, "#b9cfd9", MIRROR),
    b(-0.25, 0.77, 0.0, 0.2, 0.03, 0.14, "#e6c6c2", { ...K.PLASTIC, bevel: 0.008 }),
    K.turned(-0.36, 0.7575, 0.05, K.vaseProfile(0.035, 0.08, 0.35), "#d9a02c", K.CERAMIC),
    cy(0.05, 0.775, 0.1, 0.04, 0.035, "#b0645a", { ...K.PLASTIC, bevel: 0.004 }),
    cy(0.05, 0.801, 0.1, 0.03, 0.018, "#c8a24a", { ...BRASS_M, detail: 2 }), // lipstick tip
  ]);
const vanityStool = (): Def =>
  piece("Bedroom", `Vanity stool ${dims(0.38, 0.38)}`, 0.38, 0.38, 0.47, [
    K.turned(0, 0.37, 0, [[0.17, 0], [0.19, 0.03], [0.19, 0.075], [0.15, 0.1]], "#e6c6c2", { ...K.FAB, m: true }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => K.taperedLeg(sx * 0.12, sz * 0.12, 0.37, 0.03, 0.018, BRASS, BRASS_M))),
    cy(0, 0.372, 0, 0.38, 0.008, "#d8b0ac", { ...K.FAB, bevel: 0.003, detail: 1 }), // piping round the seat
    sp(0, 0.469, 0, 0.02, "#cfa8a4", { ...K.FAB, detail: 2 }), // button
  ]);

export const TABLES: Record<string, Def> = {
  dc_table_dining_140: rectTable("Kitchen & dining", `Dining table ${dims(1.4, 0.8)}`, 1.4, 0.8, 0.75, OAK, "legs"),
  dc_table_dining_180: rectTable("Kitchen & dining", `Dining table ${dims(1.8, 0.9)}`, 1.8, 0.9, 0.75, OAK, "legs"),
  dc_table_dining_220: rectTable("Kitchen & dining", `Dining table, long ${dims(2.2, 1.0)}`, 2.2, 1.0, 0.75, OAK, "legs"),
  dc_table_dining_metal_160: rectTable("Kitchen & dining", `Dining table, black frame ${dims(1.6, 0.85)}`, 1.6, 0.85, 0.75, WALNUT, "metal"),
  dc_table_dining_rustic_200: rectTable("Kitchen & dining", `Rustic farmhouse table ${dims(2.0, 0.95)}`, 2.0, 0.95, 0.77, "#a37a4c", "trestle"),
  dc_table_extend_closed: rectTable("Kitchen & dining", `Extendable dining table, closed ${dims(1.4, 0.9)}`, 1.4, 0.9, 0.75, WALNUT, "legs", [-0.25, 0.25]),
  dc_table_extend_open: rectTable("Kitchen & dining", `Extendable dining table, open ${dims(2.0, 0.9)}`, 2.0, 0.9, 0.75, WALNUT, "legs", [-0.55, -0.25, 0.25, 0.55]),
  dc_table_round_90: roundTable(`Round dining table ${dims(0.9, 0.9)}`, 0.9, 0.75, WHITE, "pedestal"),
  dc_table_round_110: roundTable(`Round dining table ${dims(1.1, 1.1)}`, 1.1, 0.75, OAK, "pedestal"),
  dc_table_round_130: roundTable(`Round dining table, large ${dims(1.3, 1.3)}`, 1.3, 0.75, WALNUT, "legs"),
  dc_table_oval_180: ovalTable(`Oval dining table ${dims(1.8, 1.0)}`, 1.8, 1.0, 0.75, OAK),
  dc_table_oval_220: ovalTable(`Oval dining table, large ${dims(2.2, 1.1)}`, 2.2, 1.1, 0.75, WALNUT),
  dc_table_bar_120: barTable(),
  dc_table_bar_round: bistro(),
  dc_coffee_round_80: coffeeRound(`Coffee table, round ${dims(0.8, 0.8)}`, 0.8),
  dc_coffee_round_60: coffeeRound(`Coffee table, small round ${dims(0.6, 0.6)}`, 0.6),
  dc_coffee_nest: nesting(),
  dc_coffee_glass: glassCoffee(),
  dc_coffee_marble_round: marbleRound(),
  dc_coffee_marble_rect: marbleRect(),
  dc_coffee_wood_110: woodCoffee(`Coffee table, wood with shelf ${dims(1.1, 0.6)}`, 1.1, 0.6, 0.45),
  dc_coffee_wood_90: woodCoffee(`Coffee table, wood square ${dims(0.9, 0.9)}`, 0.9, 0.9, 0.4),
  dc_side_round: sideRound(),
  dc_side_c: sideC(),
  dc_side_drum: sideDrum(),
  dc_console_120: consoleTable(`Console table, narrow ${dims(1.2, 0.3)}`, 1.2, 0.3, 0.8, false),
  dc_console_160: consoleTable(`Console table with drawers ${dims(1.6, 0.38)}`, 1.6, 0.38, 0.82, true),
  dc_desk_120: desk(`Desk, simple ${dims(1.2, 0.6)}`, 1.2, 0.6, WHITE, false),
  dc_desk_140: desk(`Desk with drawers ${dims(1.4, 0.7)}`, 1.4, 0.7, OAK, true),
  dc_desk_160: desk(`Desk with drawers, wide ${dims(1.6, 0.75)}`, 1.6, 0.75, WALNUT, true),
  dc_desk_l_right: lDesk(`L-shaped desk, return on the right ${dims(1.6, 1.4)}`, 1.6, 1.4, 0.7, 1, OAK),
  dc_desk_l_left: lDesk(`L-shaped desk, return on the left ${dims(1.6, 1.4)}`, 1.6, 1.4, 0.7, -1, OAK),
  dc_desk_corner_right: lDesk(`Corner desk, return on the right ${dims(1.5, 1.5)}`, 1.5, 1.5, 0.6, 1, WHITE),
  dc_desk_corner_left: lDesk(`Corner desk, return on the left ${dims(1.5, 1.5)}`, 1.5, 1.5, 0.6, -1, WHITE),
  dc_desk_standing: standingDesk(),
  dc_desk_kids: kidsDesk(),
  dc_dressing_table: dressingTable(),
  dc_stool_vanity: vanityStool(),
};
