import type { Category, Def, Part } from "../catalog.ts";
import { BIRCH, BLACK, BRASS, CREAM, DARKWOOD, GLASS, LEAF2, OAK, TERRA, WALNUT, WHITE, WOOD, b, books, cy, dims, discZ, piece, sp } from "./kit.ts";
import * as K from "../partsKit.ts";

const GAP = "#44464a";
const BRASS_M: K.Opt = { tex: "metal", metal: 1, rough: 0.3 };
const MIRROR: K.Opt = { tex: "metal", metal: 0.9, rough: 0.05, bevel: 0 };
type Handle = "knob" | "bar" | "vbar" | "none";
type CabOpt = { legH?: number; legC?: string; handle?: Handle; gap?: string; round?: boolean; paint?: boolean; panel?: boolean; open?: number };

/** Warm hues read as wood, whites/greys/blues as painted board. */
const paintLike = (c: string) => { const n = parseInt(c.slice(1), 16); return ((n >> 16) & 255) - (n & 255) < 0x10; };
/** Material of a finish colour; `m` so the owner's finish tints it. */
export const fin = (c: string, paint = paintLike(c)): K.Opt => ({ ...(paint ? K.LACQUER : K.WOOD), m: true });
const tbooks = (...a: Parameters<typeof books>): Part[] => books(...a).map((p) => ({ ...p, ...K.MATT, bevel: 0.002 }));

/** Cabinet: dark carcass, a grid of cols x rows fronts in the main material (drawers or doors), optional legs and handles. `open` = index of a cell left without a front. */
export const cabinet = (cat: Category, label: string, w: number, d: number, h: number, cols: number, rows: number, c: string, o: CabOpt = {}): Def => {
  const legH = o.legH ?? 0;
  const handle = o.handle ?? "knob";
  const body = h - legH;
  const fw = (w - 0.04) / cols;
  const fh = (body - 0.08) / rows;
  const f = fin(c, o.paint);
  const face = d / 2 - 0.001; // front face of the fronts (18 mm thick)
  const parts: Part[] = [
    b(0, legH + (body - 0.03) / 2, -0.008, w, body - 0.03, d - 0.016, o.gap ?? GAP, { ...K.MATT, bevel: 0.004 }),
    b(0, h - 0.015, 0, w + 0.01, 0.03, d, c, { ...f, bevel: 0.008 }),
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.01), legH + (body - 0.03) / 2, 0, 0.02, body - 0.03, d, c, { ...f, bevel: 0.004 })),
    K.seam(0, h - 0.032, face, w - 0.03, 0.004, 0.004, "#2a2c30", K.MATT),
  ];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (o.open === k) continue;
      const x = -w / 2 + 0.02 + fw * (k + 0.5);
      const y = legH + 0.03 + fh * (r + 0.5);
      parts.push(...K.drawerFront(x, y, d / 2 - 0.019, fw - 0.006, fh - 0.006, c, { ...f, thick: 0.018 }));
      if (o.panel) parts.push(b(x, y, face + 0.002, fw * 0.72, fh * 0.7, 0.004, c, { ...f, bevel: 0.002, detail: 1 }));
      if (handle === "knob") parts.push(K.knob(x, y + (rows === 1 ? 0 : fh * 0.25), face, 0.03, BRASS, { rough: 0.3 }));
      else if (handle === "bar") parts.push(K.handleBar(x, y + fh * 0.3, face, Math.min(0.14, fw * 0.5), "x"));
      else if (handle === "vbar") parts.push(K.handleBar(x + (k % 2 ? 1 : -1) * (fw / 2 - 0.04), y, face, Math.min(0.22, fh * 0.4), "y"));
    }
  }
  if (legH > 0) {
    const lc = o.legC ?? DARKWOOD;
    const lm = lc === BLACK ? K.BLACK_METAL : paintLike(lc) ? K.LACQUER : K.WOOD;
    const [top, bot] = o.round ? [0.05, 0.028] : [0.045, 0.035];
    parts.push(...K.taperedLegs(w, d, legH, lc, top, bot, 0.06, lm));
  }
  return piece(cat, label, w, d, h, parts);
};

// ---------- bookcases and shelves ----------
const POTTERY = ["#e8e2d4", "#4a6b8a", "#b0645a"];
/** Something small on an empty shelf (detail 1): a vase, a bowl, or a stack of magazines. */
const ornament = (i: number, w: number, y: number, room: number): Part[] => {
  const x = (i % 2 ? -1 : 1) * w * 0.22;
  const kind = i % 3;
  if (kind === 0) return [K.turned(x, y, 0, K.vaseProfile(0.045, Math.min(0.22, room)), POTTERY[i % 3], { ...K.CERAMIC, detail: 1 })];
  if (kind === 1) return [K.turned(x, y, 0, K.bowlProfile(0.09, 0.06), "#c9a46b", { ...K.WOOD, detail: 1 })];
  return [0, 1, 2].map((n) => b(x, y + 0.01 + n * 0.02, 0, 0.22 - n * 0.01, 0.018, 0.16, ["#b7503c", "#e8e0d0", "#4a6b8a"][n], { ...K.MATT, bevel: 0.002, detail: 1 }));
};
const shelfBooks = (w: number, d: number, h: number, shelves: number, c: string, fill: number[]): Part[] => {
  const t = 0.022;
  const gap = (h - t) / (shelves + 1);
  return Array.from({ length: shelves }, (_, i) => {
    const y = gap * (i + 1);
    const out: Part[] = [b(0, y, 0, w - 2 * t, t, d - 0.02, c, { ...fin(c), bevel: 0.003 })];
    if (fill.includes(i)) {
      const n = Math.max(3, Math.floor((w - 0.12) / 0.05 * 0.65));
      out.push(...tbooks(-w / 2 + 0.06, y + t / 2, 0, n, d - 0.1, gap - 0.06));
    } else out.push(...ornament(i, w, y + t / 2, gap - 0.07));
    return out;
  }).flat();
};
const bookcase = (label: string, w: number, d: number, h: number, shelves: number, c: string, fill: number[]): Def => {
  const f = fin(c);
  return piece("Living", label, w, d, h, [
    b(-w / 2 + 0.011, h / 2, 0, 0.022, h, d, c, { ...f, bevel: 0.004 }),
    b(w / 2 - 0.011, h / 2, 0, 0.022, h, d, c, { ...f, bevel: 0.004 }),
    b(0, h - 0.011, 0, w, 0.022, d, c, { ...f, bevel: 0.006 }),
    b(0, 0.04, 0, w - 0.04, 0.08, d - 0.02, c, { ...f, bevel: 0.006 }),
    b(0, h / 2, -d / 2 + 0.006, w - 0.04, h - 0.04, 0.008, GAP, { ...K.MATT, bevel: 0 }),
    ...shelfBooks(w, d, h, shelves, c, fill),
    b(0, h - 0.034, d / 2 - 0.006, w - 0.044, 0.026, 0.012, c, { ...f, bevel: 0.003, detail: 1 }), // fascia under the top
    K.seam(0, 0.084, d / 2 - 0.012, w - 0.04, 0.006, 0.008, "#2a2c30", K.MATT), // plinth shadow line
  ]);
};
const ladderShelf = (): Def => {
  const w = 0.6;
  const d = 0.5;
  const h = 1.8;
  const slope = 0.25;
  const ys = [0.3, 0.58, 0.86, 1.14, 1.42, 1.7];
  return piece("Living", `Ladder shelf ${dims(w, d)}`, w, d, h, [
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.02), h / 2, 0.02, 0.04, 1.86, 0.03, OAK, { ...K.WOOD, m: true, bevel: 0.005, r: [-Math.atan(slope), 0, 0] })),
    ...ys.map((y, i) => b(0, y, -d / 2 + (0.5 - 0.07 * i) / 2, w - 0.04, 0.025, 0.5 - 0.07 * i, OAK, { ...K.WOOD, m: true, bevel: 0.004 })),
    ...tbooks(-0.2, 0.3125, -0.02, 6, 0.2, 0.22),
    K.turned(0.15, 0.5925, -0.1, [[0.04, 0], [0.058, 0.075], [0.06, 0.09]], "#b8683f", { ...K.CERAMIC, rough: 0.8 }),
    sp(0.15, 0.73, -0.1, 0.14, LEAF2, { tex: "paint", rough: 0.9 }),
    ...tbooks(-0.2, 0.8725, -0.05, 5, 0.18, 0.2),
    // front lip of each board (detail 1)
    ...ys.map((y, i) => b(0, y - 0.02, -d / 2 + 0.5 - 0.07 * i - 0.006, w - 0.06, 0.016, 0.012, OAK, { ...K.WOOD, m: true, bevel: 0.002, detail: 1 })),
  ]);
};
const openShelf = (): Def =>
  piece("Living", `Open shelving unit, black and wood ${dims(0.9, 0.35)}`, 0.9, 0.35, 1.8, [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.43, 0.9, sz * 0.16, 0.035, 1.8, 0.035, BLACK, { ...K.BLACK_METAL, bevel: 0.003 }))),
    ...[0.12, 0.6, 1.08, 1.56].map((y) => b(0, y, 0, 0.9, 0.04, 0.35, WOOD, { ...K.WOOD, m: true, bevel: 0.005 })),
    ...[-1, 1].map((s) => b(0, 0.85, s * 0.16, 0.86, 0.02, 0.02, BLACK, { ...K.BLACK_METAL, bevel: 0.002 })),
    ...tbooks(-0.38, 0.14, 0, 6, 0.26, 0.28),
    K.turned(0.25, 0.62, 0, [[0.05, 0], [0.068, 0.12], [0.07, 0.18]], TERRA, { ...K.CERAMIC, rough: 0.8 }),
    sp(0.25, 0.86, 0, 0.18, LEAF2, { tex: "paint", rough: 0.9 }),
    b(-0.2, 1.2, 0, 0.3, 0.2, 0.2, DARKWOOD, { ...K.WOOD, bevel: 0.01 }),
    ...tbooks(0.1, 1.1, 0, 5, 0.24, 0.22),
    b(-0.2, 1.215, 0.1, 0.1, 0.014, 0.006, BLACK, { ...K.MATT, bevel: 0, detail: 2 }), // handle slot of the box
    // back X-bracing of the frame (detail 1)
    ...[-1, 1].map((s) => b(0, 0.84, -0.165, 1.68, 0.014, 0.012, BLACK, { ...K.BLACK_METAL, bevel: 0.002, r: [0, 0, s * 1.03], detail: 1 })),
  ]);

const wallShelves = (label: string, w: number, rows: number, c: string): Def => {
  const ys = Array.from({ length: rows }, (_, i) => 1.1 + i * 0.38);
  const f = fin(c);
  return piece("Living", label, w, 0.22, ys[rows - 1] + 0.3, [
    ...ys.flatMap((y, i) => [
      b(0, y, 0, w, 0.03, 0.22, c, { ...f, bevel: 0.005 }),
      ...(i % 3 === 0 ? tbooks(-w / 2 + 0.06, y + 0.015, 0, 5, 0.16, 0.22) : []),
      ...(i % 3 === 1 ? [K.turned(w / 4, y + 0.015, 0, K.vaseProfile(0.05, 0.15), CREAM, K.CERAMIC), sp(w / 4, y + 0.22, 0, 0.14, LEAF2, { tex: "paint", rough: 0.9 }), b(-w / 4, y + 0.06, 0, 0.18, 0.09, 0.14, DARKWOOD, { ...K.WOOD, bevel: 0.008 })] : []),
      ...(i % 3 === 2 ? [K.turned(-w / 4, y + 0.015, 0, K.vaseProfile(0.05, 0.17), "#4a6b8a", K.CERAMIC), sp(w / 4, y + 0.06, 0, 0.1, BRASS, BRASS_M)] : []),
      // hidden-looking bracket pair under the board (detail 1)
      ...[-1, 1].flatMap((s) => [b(s * (w / 2 - 0.08), y - 0.05, -0.1, 0.012, 0.07, 0.02, BLACK, { ...K.BLACK_METAL, bevel: 0.002, detail: 1 }), b(s * (w / 2 - 0.08), y - 0.027, -0.01, 0.012, 0.012, 0.2, BLACK, { ...K.BLACK_METAL, bevel: 0.002, detail: 1 })]),
    ]),
  ], { wall: true });
};

// ---------- media and sideboards ----------
const tvUnit = (w: number): Def => {
  const cols = w > 1.6 ? 4 : 3;
  const c = cabinet("Living", `TV unit, low ${dims(w, 0.4)}`, w, 0.4, 0.5, cols, 1, OAK, { legH: 0.12, legC: BLACK, handle: "none", open: 0 });
  const fw = (w - 0.04) / cols;
  const x0 = -w / 2 + 0.02 + fw / 2; // the open cell: a media box sits in it
  return { ...c, parts: [...c.parts, b(x0, 0.21, 0.07, fw - 0.14, 0.12, 0.24, BLACK, { ...K.PLASTIC, bevel: 0.006 }), b(x0 + fw * 0.25, 0.21, 0.192, 0.012, 0.012, 0.004, "#4ad7ff", { ...K.PLASTIC, rough: 0.1, bevel: 0, detail: 2 })] };
};
const sideboard = (label: string, w: number, style: "scandi" | "classic" | "slat"): Def => {
  if (style === "classic") return cabinet("Living", label, w, 0.45, 0.9, 3, 1, WALNUT, { legH: 0.1, legC: DARKWOOD, handle: "knob", panel: true });
  if (style === "slat") {
    const base = cabinet("Living", label, w, 0.42, 0.78, 4, 1, WHITE, { legH: 0.2, legC: BIRCH, handle: "none", round: true });
    const slats = Array.from({ length: Math.round(w / 0.05) }, (_, i) => b(-w / 2 + 0.04 + i * 0.05, 0.5, 0.215, 0.025, 0.46, 0.012, BIRCH, { ...K.WOOD, bevel: 0.003 }));
    const rails = [0.27, 0.73].map((y) => b(0, y, 0.22, w - 0.04, 0.016, 0.01, BIRCH, { ...K.WOOD, bevel: 0.002, detail: 1 }));
    return { ...base, parts: [...base.parts, ...slats, ...rails] };
  }
  return cabinet("Living", label, w, 0.4, 0.75, 3, 1, OAK, { legH: 0.2, legC: BIRCH, handle: "vbar", round: true });
};

// ---------- hall and misc storage ----------
const shoeCabinet = (): Def => cabinet("Living", `Shoe cabinet, tilting doors ${dims(0.8, 0.24)}`, 0.8, 0.24, 1.1, 2, 2, WHITE, { handle: "bar" });
const hallTree = (): Def => {
  const W = { ...K.WOOD, m: true } as const;
  return piece("Living", `Hall tree with bench and hooks ${dims(0.9, 0.4)}`, 0.9, 0.4, 1.85, [
    b(0, 0.9, -0.18, 0.9, 1.8, 0.03, WOOD, { ...W, bevel: 0.006 }),
    b(0, 0.44, 0.0, 0.9, 0.05, 0.4, WOOD, { ...W, bevel: 0.01 }),
    ...[-1, 1].map((s) => b(s * 0.43, 0.2, 0, 0.04, 0.4, 0.38, WOOD, { ...W, bevel: 0.005 })),
    b(0, 0.16, 0.0, 0.82, 0.03, 0.34, WOOD, { ...W, bevel: 0.004 }),
    b(0, 1.83, -0.1, 0.92, 0.05, 0.2, WOOD, { ...W, bevel: 0.01 }),
    b(0, 1.4, -0.1, 0.8, 0.03, 0.2, WOOD, { ...W, bevel: 0.005 }),
    b(0, 1.12, -0.159, 0.66, 0.36, 0.012, WOOD, { ...W, bevel: 0.004 }), // mirror frame
    b(0, 1.12, -0.1525, 0.6, 0.3, 0.003, "#b9cfd9", MIRROR),
    ...[-0.34, -0.17, 0.17, 0.34].map((x) => [b(x, 1.0, -0.12, 0.012, 0.012, 0.1, BLACK, { ...K.BLACK_METAL, bevel: 0.002 }), sp(x, 1.0, -0.07, 0.03, BLACK, K.BLACK_METAL)]).flat(),
    K.cushion(0, 0.51, 0.0, 0.8, 0.04, 0.34, "#c9bba6", { bevel: 0.015 }),
    ...tbooks(-0.12, 1.415, -0.1, 4, 0.14, 0.16, 0.04),
    // lower shoe-rack slats and seat front lip (detail 1)
    ...[-0.25, 0, 0.25].map((x) => b(x, 0.18, 0.0, 0.2, 0.012, 0.3, WOOD, { ...W, bevel: 0.002, detail: 1 })),
    b(0, 0.425, 0.195, 0.86, 0.04, 0.012, WOOD, { ...W, bevel: 0.003, detail: 1 }),
  ]);
};
const coatRackWall = (): Def =>
  piece("Living", `Wall coat rack, 5 hooks ${dims(0.9, 0.16)}`, 0.9, 0.16, 1.75, [
    b(0, 1.65, -0.02, 0.9, 0.1, 0.02, OAK, { ...K.WOOD, m: true, bevel: 0.006 }),
    ...[-0.36, -0.18, 0, 0.18, 0.36].flatMap((x) => [b(x, 1.65, 0.03, 0.015, 0.015, 0.08, BLACK, { ...K.BLACK_METAL, bevel: 0.002 }), sp(x, 1.65, 0.075, 0.035, BLACK, K.BLACK_METAL)]),
    b(0.18, 1.45, 0.035, 0.36, 0.38, 0.07, "#4a6b8a", { ...K.FAB, bevel: 0.03 }),
    b(-0.18, 1.5, 0.035, 0.28, 0.3, 0.05, "#c1784a", { ...K.LEATHER, bevel: 0.02 }),
    // coat collar and bag strap (detail 1), bag buckle (detail 2)
    b(0.18, 1.625, 0.045, 0.2, 0.05, 0.07, "#3d5a74", { ...K.FAB, bevel: 0.015, detail: 1 }),
    b(-0.18, 1.6, 0.062, 0.02, 0.18, 0.008, "#8a5230", { ...K.LEATHER, bevel: 0.002, detail: 1 }),
    b(-0.18, 1.45, 0.064, 0.03, 0.03, 0.01, "#cfc8b4", { ...K.STEEL, bevel: 0.002, detail: 2 }),
  ], { wall: true });
const trunk = (): Def => {
  const W = { ...K.WOOD, m: true } as const;
  return piece("Living", `Vintage trunk ${dims(0.9, 0.45)}`, 0.9, 0.45, 0.48, [
    b(0, 0.16, 0, 0.9, 0.3, 0.45, DARKWOOD, { ...W, bevel: 0.012 }),
    b(0, 0.36, 0, 0.88, 0.14, 0.43, DARKWOOD, { ...W, bevel: 0.035 }),
    b(0, 0.44, 0, 0.84, 0.03, 0.4, DARKWOOD, { ...W, bevel: 0.012 }),
    ...[-0.3, 0.3].map((x) => b(x, 0.25, 0, 0.05, 0.46, 0.46, BRASS, { ...BRASS_M, bevel: 0.004 })),
    b(0, 0.29, 0.226, 0.05, 0.06, 0.012, BRASS, { ...BRASS_M, bevel: 0.003 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.43, 0.025, sz * 0.21, 0.05, 0.05, 0.05, BRASS, { ...BRASS_M, bevel: 0.006 }))),
    K.seam(0, 0.31, 0.226, 0.88, 0.006, 0.006, "#1f1814", K.MATT), // lid line
    ...[-0.3, 0.3].flatMap((x) => [0.1, 0.19, 0.38].map((y) => sp(x, y, 0.232, 0.014, BRASS, { ...BRASS_M, detail: 2 }))), // rivets
  ]);
};
const basket = (label: string, dia: number, h: number, c: string, blanket: boolean): Def => {
  const wick = { ...K.WOOD, rough: 0.9 };
  const rad = (f: number) => (dia / 2) * (0.86 + 0.14 * f); // tapers wider towards the rim
  return piece("Decor", label, dia, dia, h + (blanket ? 0.2 : 0), [
    K.turned(0, 0, 0, [[rad(0), 0], [rad(0.5), h * 0.5], [dia / 2, h]], c, wick),
    ...[0.2, 0.45, 0.7].map((f) => cy(0, h * f, 0, 2 * rad(f) + 0.008, 0.02, "#a8834f", { ...wick, bevel: 0.006 })),
    cy(0, h + 0.001, 0, dia - 0.04, 0.004, "#5a4429", { ...wick, bevel: 0 }),
    cy(0, h - 0.008, 0, dia + 0.004, 0.02, "#a8834f", { ...wick, bevel: 0.008 }), // rolled rim
    ...(blanket ? [cy(0.0, h + 0.03, 0, dia - 0.08, 0.1, "#d6cfc4", { ...K.FAB, m: true, bevel: 0.035 }), sp(0.0, h + 0.07, 0, dia * 0.55, "#e8e0d0", { ...K.FAB, m: true })] : []),
  ]);
};
const wineRack = (): Def => {
  const cols = 5;
  const rows = 5;
  const glass: K.Opt = { tex: "ceramic", rough: 0.1 };
  const bottles = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, k) => {
      const x = -0.24 + k * 0.12 + (r % 2 ? 0.06 : 0);
      const y = 0.16 + r * 0.17;
      return k === cols - 1 && r % 2 ? [] : [discZ(x, y, -0.02, 0.075, 0.27, "#2f5530", glass), discZ(x, y, 0.135, 0.032, 0.05, "#2f5530", glass), discZ(x, y, 0.158, 0.036, 0.012, "#e8e0d0", { ...K.MATT, detail: 2 })];
    }).flat(),
  ).flat();
  const W = { ...K.WOOD, m: true } as const;
  return piece("Kitchen & dining", `Wine rack, floor ${dims(0.6, 0.3)}`, 0.6, 0.3, 1.0, [
    ...[-1, 1].map((s) => b(s * 0.29, 0.5, 0, 0.02, 1.0, 0.3, WOOD, { ...W, bevel: 0.004 })),
    b(0, 0.99, 0, 0.6, 0.02, 0.3, WOOD, { ...W, bevel: 0.005 }),
    b(0, 0.02, 0, 0.6, 0.04, 0.3, WOOD, { ...W, bevel: 0.006 }),
    ...[0.08, 0.25, 0.42, 0.59, 0.76].map((y) => b(0, y, 0, 0.56, 0.012, 0.3, WOOD, { ...W, bevel: 0.002 })),
    ...bottles,
  ]);
};
const displayCabinet = (): Def => {
  const W = { ...K.WOOD, m: true } as const;
  const pane: K.Opt = { tex: "ceramic", rough: 0.08, bevel: 0, glass: true };
  const shelf: K.Opt = { tex: "ceramic", rough: 0.08, bevel: 0 };
  const items = [-0.25, -0.1, 0.05, 0.2].flatMap((x, i) => [
    K.turned(x, 0.9575, 0.02, K.vaseProfile(0.03, 0.16), i % 2 ? "#d9e6ee" : "#c8d6dc", K.CERAMIC),
    K.turned(x, 1.2075, 0, K.bowlProfile(0.04, 0.09), CREAM, K.CERAMIC),
    K.turned(x, 1.4575, 0, K.vaseProfile(0.05, 0.14), i % 2 ? "#4a6b8a" : "#b0645a", K.CERAMIC),
  ]);
  return piece("Living", `Display cabinet, glass doors ${dims(0.9, 0.4)}`, 0.9, 0.4, 1.8, [
    b(0, 0.35, -0.008, 0.9, 0.7, 0.384, GAP, { ...K.MATT, bevel: 0.004 }),
    ...[-1, 1].flatMap((s) => K.drawerFront(s * 0.223, 0.35, 0.185, 0.434, 0.664, WALNUT, { ...W, thick: 0.018, handle: "none" })),
    ...[-1, 1].map((s) => K.handleBar(s * 0.03, 0.35, 0.203, 0.14, "y", BRASS, BRASS_M)),
    ...[-1, 1].map((s) => b(s * 0.44, 1.25, 0, 0.022, 1.1, 0.4, WALNUT, { ...W, bevel: 0.004 })),
    b(0, 1.78, 0, 0.9, 0.044, 0.4, WALNUT, { ...W, bevel: 0.008 }),
    b(0, 0.71, 0, 0.9, 0.03, 0.4, WALNUT, { ...W, bevel: 0.006 }),
    b(0, 1.25, -0.19, 0.86, 1.08, 0.012, "#d8cfc0", { ...K.MATT, bevel: 0 }),
    ...[0.95, 1.2, 1.45].map((y) => b(0, y, 0, 0.86, 0.015, 0.36, GLASS, shelf)),
    b(0, 1.2, 0.195, 0.02, 1.1, 0.014, WALNUT, { ...W, bevel: 0.003 }),
    b(0, 1.77, 0.195, 0.86, 0.03, 0.014, WALNUT, { ...W, bevel: 0.003 }),
    b(0, 0.75, 0.195, 0.86, 0.03, 0.014, WALNUT, { ...W, bevel: 0.003 }),
    ...[-1, 1].map((s) => b(s * 0.22, 1.26, 0.198, 0.41, 0.98, 0.004, GLASS, pane)), // glass in the doors
    ...items,
    b(0, 1.805, 0.206, 0.94, 0.022, 0.012, WALNUT, { ...W, bevel: 0.004, detail: 1 }), // cornice lip
    ...[-1, 1].map((s) => b(s * 0.223, 0.35, 0.2, 0.31, 0.5, 0.004, WALNUT, { ...W, bevel: 0.002, detail: 1 })), // door panels
  ]);
};

export const STORAGE: Record<string, Def> = {
  dc_bookcase_tall_80: bookcase(`Bookcase, tall ${dims(0.8, 0.3)}`, 0.8, 0.3, 2.0, 5, WHITE, [0, 2, 3]),
  dc_bookcase_tall_120: bookcase(`Bookcase, tall wide ${dims(1.2, 0.32)}`, 1.2, 0.32, 2.0, 5, OAK, [0, 1, 3, 4]),
  dc_bookcase_low_120: bookcase(`Bookcase, low ${dims(1.2, 0.3)}`, 1.2, 0.3, 0.8, 2, WALNUT, [0]),
  dc_bookcase_ladder: ladderShelf(),
  dc_shelf_open_industrial: openShelf(),
  dc_wall_shelves_3: wallShelves(`Wall shelves, 3 rows ${dims(0.9, 0.22)}`, 0.9, 3, OAK),
  dc_wall_shelves_2: wallShelves(`Wall shelves, 2 rows ${dims(0.6, 0.22)}`, 0.6, 2, WHITE),
  dc_wall_shelf_single: wallShelves(`Wall shelf, single ${dims(0.6, 0.22)}`, 0.6, 1, WALNUT),
  dc_tv_unit_150: tvUnit(1.5),
  dc_tv_unit_180: tvUnit(1.8),
  dc_tv_unit_220: tvUnit(2.2),
  dc_sideboard_scandi_120: sideboard(`Sideboard, scandinavian ${dims(1.2, 0.4)}`, 1.2, "scandi"),
  dc_sideboard_scandi_160: sideboard(`Sideboard, scandinavian ${dims(1.6, 0.4)}`, 1.6, "scandi"),
  dc_sideboard_slat_180: sideboard(`Sideboard, slatted ${dims(1.8, 0.42)}`, 1.8, "slat"),
  dc_sideboard_classic_160: sideboard(`Sideboard, classic buffet ${dims(1.6, 0.45)}`, 1.6, "classic"),
  dc_sideboard_classic_200: sideboard(`Sideboard, classic buffet, long ${dims(2.0, 0.45)}`, 2.0, "classic"),
  dc_shoe_cabinet: shoeCabinet(),
  dc_hall_tree: hallTree(),
  dc_coat_rack_wall: coatRackWall(),
  dc_trunk: trunk(),
  dc_basket_40: basket(`Wicker basket ${dims(0.4, 0.4)}`, 0.4, 0.35, "#c9a46b", false),
  dc_basket_blanket: basket(`Basket with blankets ${dims(0.5, 0.5)}`, 0.5, 0.4, "#c9a46b", true),
  dc_basket_30: basket(`Small basket ${dims(0.3, 0.3)}`, 0.3, 0.25, "#d9bd84", false),
  dc_wine_rack: wineRack(),
  dc_display_cabinet: displayCabinet(),
};
