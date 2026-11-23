// Shared colours and small builders for the indoor base kinds (catalog.base-living / -dining / -decor). Runtime imports only ./partsKit.ts: no cycle with catalog.ts.
import type { Def, Part } from "./catalog.ts";
import { b, type Opt } from "./partsKit.ts";

export const WHITE = "#f2f1ee";
export const OAK = "#c9a26b";
export const BLACKBROWN = "#3b2f2a";
export const GREY = "#8d9299";
export const DARK = "#3a3d42";
export const METAL = "#b8bcc2";
export const FABRIC = "#8d9299";
export const CUSHION = "#a3a8ae";
export const SEAM = "#e6e4df";
export const LEAF2 = "#4d7d3d";
export const LEAF3 = "#2f5530";
export const ORANGE = "#b8742c";
export const CREAM = "#e8dcc4";
export const PI2 = Math.PI / 2;
export const BOOKC = ["#b7503c", "#4a6b8a", "#d9a02c", "#5b7a5e", "#e8e0d0", "#7a5a8a"];

/** Four square legs inset in the corners of a w x d footprint. */
export const legs = (w: number, d: number, h: number, c: string, t = 0.06, o?: Opt): Part[] =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2), t, h, t, c, o)));
/** Row of upright book blocks along +x standing on y, heights varied. */
export const bookRow = (x0: number, y: number, z: number, n: number, depth: number, hmax: number, t = 0.045): Part[] =>
  Array.from({ length: n }, (_, i) => {
    const h = hmax * (0.72 + (0.28 * ((i * 7) % 4)) / 3);
    return b(x0 + i * (t + 0.004), y + h / 2, z, t, h, depth, BOOKC[i % BOOKC.length], { tex: "paint", rough: 0.8, bevel: 0.003 });
  });

/** Gives every plain box/cylinder part that names no material the plaster/paint class (tiny seams, trims), so each material-bearing part carries a `tex`. */
export const finish = (defs: Record<string, Def>): Record<string, Def> =>
  Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, { ...d, parts: d.parts.map((p) => (p.tex || p.veg || p.shape === "sph" ? p : { ...p, tex: "paint" as const })) }]));
