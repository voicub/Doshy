import type { Def, Part } from "./catalog";
import type { V3 } from "./mathUtil.ts";
import { b, type Opt } from "./partsKit.ts";
import { vegPart } from "./catalog.vegetation.ts";
import type { Species } from "./vegetation.ts";

// Shared helpers and colours for the outdoor catalogs (catalog.outdoor.ts, catalog.outdoor-furniture.ts). Conventions as lib/partKit.ts:
// local to the footprint centre, y = part centre height, front = +z. The material presets (WOOD, STEEL, STONE ...) come from lib/partsKit.ts;
// the plain colours of the same names are exported here as C_WOOD, C_STEEL, C_STONE.
export { WHITE, BLACK, DARK, GREY, LGREY, OAK, DECK, LEAF1, LEAF2, LEAF3, TRUNK, raise } from "./partKit.ts";
export { STEEL as C_STEEL, WOOD as C_WOOD, STONE as C_STONE } from "./partKit.ts";

export const WATER = "#43b0dc", COPING = "#d9d4c7", TERRA = "#b8643f", SOIL = "#4a3a2e", GLASS = "#c6edf4", RED = "#c84b4b", GOLD = "#d9a02c";
export const CREAM = "#e8dcc4", ROOFC = "#8c4a3e", FELT = "#3a3d42", SAND = "#e3cf9a", ROPE = "#c9b48a", PINK = "#e07aa6", POST = "#6b4a35";

/** Surface classes only this area uses (the rest are in partsKit). */
export const TILE: Opt = { tex: "ceramic", rough: 0.6 }; // roof tiles, terracotta
export const SOILM: Opt = { tex: "rubber", rough: 0.98 };
export const LEAFM: Opt = { tex: "paint", rough: 0.8 };
export const WATERM: Opt = { rough: 0.05, metal: 0.1 };
export const GLASSM: Opt = { rough: 0.05, bevel: 0 };
export const ALU: Opt = { tex: "metal", metal: 0.7, rough: 0.5 }; // painted aluminium and thin steel tube

export const def = (label: string, w: number, d: number, h: number, parts: Part[], extra: Partial<Pick<Def, "light" | "wall" | "solid">> = {}): Def => ({ label, brand: "Generic", cat: "Outdoor", w, d, h, parts, ...extra });
/** A plant of `species` in a w x h x d box centred at (x, z) whose base is at height y0. */
export const plantAt = (species: Species, w: number, h: number, d: number, x: number, z: number, seed = 0, y0 = 0): Part => ({ ...vegPart(species, w, h, d, seed), p: [x, y0 + h / 2, z] });
/** ellipsoid (sphere with separate x/y/z sizes) */
export const el = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, o?: Opt) => b(x, y, z, sx, sy, sz, c, { ...o, shape: "sph" });
/** n parts evenly round a circle of radius R (angle a measured from +x towards +z) */
export const ring = (n: number, R: number, f: (x: number, z: number, a: number, i: number) => Part | Part[], a0 = 0): Part[] =>
  Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * Math.PI * 2; return f(R * Math.cos(a), R * Math.sin(a), a, i); }).flat();
/** rotation that turns a part's local x axis (its thin side) radially outwards at ring angle a */
export const radial = (a: number): [number, number, number] => [0, -a, 0];

/** cylinder lying along x (wheels, drums, pipes): axis, diameter, length */
export const cx = (x: number, y: number, z: number, dia: number, len: number, c: string, o?: Opt) => b(x, y, z, dia, len, dia, c, { ...o, shape: "cyl", r: [0, 0, Math.PI / 2] });
/** cylinder lying along z */
export const cz = (x: number, y: number, z: number, dia: number, len: number, c: string, o?: Opt) => b(x, y, z, dia, len, dia, c, { ...o, shape: "cyl", r: [Math.PI / 2, 0, 0] });

/** square bar of thickness th from point a to point e (any direction): rails, rungs, slanted legs, blades. */
export const rod = (a: V3, e: V3, th: number, c: string, o?: Opt): Part => {
  const dx = e[0] - a[0], dy = e[1] - a[1], dz = e[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  return b((a[0] + e[0]) / 2, (a[1] + e[1]) / 2, (a[2] + e[2]) / 2, th, th, len, c, { ...o, r: [Math.atan2(-dy, dz), Math.atan2(dx, Math.hypot(dy, dz)), 0] });
};
/** round tube (a cylinder) of diameter dia from point a to point e: pipes, chains, tubular frames. */
export const pipe = (a: V3, e: V3, dia: number, c: string, o?: Opt): Part => {
  const dx = e[0] - a[0], dy = e[1] - a[1], dz = e[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  return b((a[0] + e[0]) / 2, (a[1] + e[1]) / 2, (a[2] + e[2]) / 2, dia, len, dia, c, { ...o, shape: "cyl", r: [Math.atan2(dz, dy), 0, Math.asin(-dx / len)] });
};

/** two roof panels meeting at a ridge along z: span w, depth d, eaves at y0, ridge at y0 + rise */
export const gable = (w: number, d: number, y0: number, rise: number, c: string, o?: Opt, t = 0.05): Part[] => {
  const hs = (w - 0.06) / 2, a = Math.atan2(rise, hs), L = Math.hypot(hs, rise);
  return [-1, 1].map((s) => b((s * hs) / 2, y0 + rise / 2, 0, L, t, d, c, { ...o, r: [0, 0, -s * a] }));
};
/** stepped triangle filling the gable end at depth z */
export const gend = (w: number, y0: number, rise: number, z: number, c: string, n = 3, t = 0.03, o?: Opt): Part[] => {
  const hs = (w - 0.06) / 2;
  return Array.from({ length: n }, (_, k) => b(0, y0 + ((k + 0.5) * rise) / n, z, 2 * hs * (1 - (k + 0.5) / n), rise / n, t, c, o));
};
/** single sloping roof panel, high at the back (-z), low at the front */
export const mono = (w: number, d: number, y0: number, rise: number, c: string, o?: Opt): Part => {
  const s = d - 0.06, a = Math.atan2(rise, s);
  return b(0, y0 + rise / 2, 0, w, 0.05, Math.hypot(s, rise), c, { ...o, r: [a, 0, 0] });
};
