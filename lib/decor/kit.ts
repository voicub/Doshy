import type { Category, Def, Part } from "../catalog.ts";
import { FLOOR_T } from "../partKit.ts";

// Shared helpers for the decor catalog files. Same conventions as lib/catalog.home-office.ts:
// local coords in metres, centred on the footprint, y = part centre height, front = +z.
import { b, cy, sp, type Opt } from "../partsKit.ts";
export { b, cy, sp };
export type { Opt };
/** Cylinder lying along z (axis towards the viewer): a disc seen from the front, a rod running front to back. */
export const discZ = (x: number, y: number, z: number, dia: number, len: number, c: string, o?: Opt) => cy(x, y, z, dia, len, c, { ...o, r: [Math.PI / 2, 0, 0] });
/** Cylinder lying along x. */
export const rodX = (x: number, y: number, z: number, dia: number, len: number, c: string, o?: Opt) => cy(x, y, z, dia, len, c, { ...o, r: [0, 0, Math.PI / 2] });

export const PI = Math.PI;
export const PI2 = Math.PI / 2;

export const WOOD = "#b98a55";
export const OAK = "#c9a26b";
export const BIRCH = "#e0c79a";
export const WALNUT = "#6b4a35";
export const DARKWOOD = "#3b2f2a";
export const WHITE = "#f2f1ee";
export const CREAM = "#e8e0d0";
export const GREY = "#8d9299";
export const LGREY = "#c8cbcf";
export const DGREY = "#3a3d42";
export const BLACK = "#1c1d20";
export const METAL = "#b8bcc2";
export const BRASS = "#c8a24a";
export const LEATHER = "#7a4a2e";
export const LEAF1 = "#3f6b3a";
export const LEAF2 = "#4d7d3d";
export const LEAF3 = "#2f5530";
export const TERRA = "#b8683f";
export const GLASS = "#bcd9e4";
export const WARM = "#fff0c8";
export const BOOKC = ["#b7503c", "#4a6b8a", "#d9a02c", "#5b7a5e", "#e8e0d0", "#7a5a8a"];

export const cm = (n: number) => Math.round(n * 100);
export const dims = (w: number, d: number) => `${cm(w)} x ${cm(d)}`;
export const piece = (cat: Category, label: string, w: number, d: number, h: number, parts: Part[], extra: Partial<Def> = {}): Def => ({
  label, brand: "Generic", cat, w, d, h, parts, ...extra,
});
/** Four legs at the corners of a w x d footprint. */
export const legs = (w: number, d: number, h: number, c: string, t = 0.05, inset = 0.05, round = false): Part[] =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) => (round
    ? cy(sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset), t, h, c)
    : b(sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset), t, h, t, c))));

/** Row of upright books along +x standing on y; heights vary. */
export const books = (x0: number, y: number, z: number, n: number, depth: number, hmax: number, t = 0.04): Part[] =>
  Array.from({ length: n }, (_, i) => {
    const h = hmax * (0.72 + (0.28 * ((i * 7) % 4)) / 3);
    return b(x0 + i * (t + 0.004), y + h / 2, z, t, h, depth, BOOKC[i % BOOKC.length]);
  });

/** Pot with a rim, soil and a lip: base of every plant. */
export const pot = (x: number, z: number, dia: number, h: number, c: string, m = false): Part[] => [
  cy(x, h / 2, z, dia, h, c, m ? { m: true } : undefined),
  cy(x, h + 0.004, z, dia * 0.86, 0.012, "#3d2e22"),
];

/** A leaf: a thin box tilted about x then turned about y so it radiates out from (x, y, z). */
export const leaf = (x: number, y: number, z: number, len: number, wid: number, turn: number, tilt: number, c: string): Part =>
  b(x, y, z, wid, 0.012, len, c, { r: [tilt, turn, 0] });

/** A round rod of diameter t from (bx, 0, bz) up to (tx, h, tz): legs of tripods and easels. Tilt is approximate (fine for small angles). */
export const strut = (bx: number, bz: number, tx: number, tz: number, h: number, t: number, c: string, o?: Opt): Part =>
  cy((bx + tx) / 2, h / 2, (bz + tz) / 2, t, Math.hypot(h, tx - bx, tz - bz), c, { ...o, r: [Math.atan((tz - bz) / h), 0, -Math.atan((tx - bx) / h)] });

/** A thin straight bar between two points in the x-y plane (z fixed): wires and arcs. */
export const wire = (x0: number, y0: number, x1: number, y1: number, z: number, t: number, c: string, o?: Opt): Part =>
  b((x0 + x1) / 2, (y0 + y1) / 2, z, Math.hypot(x1 - x0, y1 - y0), t, t, c, { ...o, r: [0, 0, Math.atan2(y1 - y0, x1 - x0)] });

/** Half-sizes of the axis-aligned box around a part after its Euler XYZ turn (R = Rx * Ry * Rz, as three.js applies `r`). */
export function halfExtent(p: Part): [number, number, number] {
  const [rx, ry, rz] = p.r ?? [0, 0, 0];
  const [a, b, c] = [Math.cos(rx), Math.cos(ry), Math.cos(rz)];
  const [d, e, f] = [Math.sin(rx), Math.sin(ry), Math.sin(rz)];
  const R = [
    [b * c, -b * f, e],
    [d * e * c + a * f, -d * e * f + a * c, -d * b],
    [-a * e * c + d * f, a * e * f + d * c, a * b],
  ];
  return [0, 1, 2].map((i) => (Math.abs(R[i][0]) * p.s[0] + Math.abs(R[i][1]) * p.s[1] + Math.abs(R[i][2]) * p.s[2]) / 2) as [number, number, number];
}

/** Grows the footprint and height (to the next centimetre) so every part fits: plants spread wherever their leaves fall. */
export const fit = (def: Def): Def => {
  const ext = def.parts.map((p) => ({ p, h: halfExtent(p) }));
  const up = (v: number) => Math.ceil(v * 100 - 1e-6) / 100;
  return {
    ...def,
    w: Math.max(def.w, up(2 * Math.max(...ext.map(({ p, h }) => Math.abs(p.p[0]) + h[0])))),
    d: Math.max(def.d, up(2 * Math.max(...ext.map(({ p, h }) => Math.abs(p.p[2]) + h[2])))),
    h: Math.max(def.h, up(Math.max(...ext.map(({ p, h }) => p.p[1] + h[1])))),
  };
};

/** The floor slab is 6 cm thick (RoomFloor) and everything lower than its top is buried: flat pieces (rugs, mats, strips) are lifted onto it.
 *  Unlike `raise` in lib/partKit.ts the def's `h` stays (<= 5 cm) so the piece is still placed as flat (walls never block a rug). */
export const onSlab = (d: Def): Def => ({ ...d, parts: d.parts.map((p) => ({ ...p, p: [p.p[0], p.p[1] + FLOOR_T, p.p[2]] as [number, number, number] })) });
