import type { Def, Part } from "../catalog";
import type { V3 } from "../mathUtil.ts";
import { vegPart } from "../catalog.vegetation.ts";
import type { Species } from "../vegetation.ts";
import { b, cy, sp } from "../partKit.ts";

// Shared helpers for the Garden category (lib/catalog.garden.ts and lib/garden/*.ts). Conventions as lib/partKit.ts:
// local coords centred on the footprint, y = part centre height, front = +z, `m` parts take the user's finish colour.
// Wall-mounted pieces are modelled at their absolute mounting height with `wall: true`, like curtains.
export * from "../partKit.ts";

export const range = (n: number) => Array.from({ length: n }, (_, i) => i);
export const PI = Math.PI;

export const WARM = "#ffd9a0"; // colour a lit light shows when its entity reports none
export const BULB_OFF = "#e9dcb4"; // what a switched-off bulb looks like
export const CREAM = "#e8dcc4", TERRA = "#b8643f", SOIL = "#4a3a2e", RED = "#c84b4b", GOLD = "#d9a02c", ROPE = "#c9b48a";
export const GLASS = "#c6edf4", COPING = "#d9d4c7", BRICK = "#9a5240", ROOFC = "#8c4a3e", FELT = "#3a3d42", WATER = "#43b0dc";
export const TEAK = "#a9774b", RATTAN = "#7a6048", SAND = "#e3cf9a", CORTEN = "#8a4b2c";

/** A piece of the Garden category. */
export const gd = (label: string, w: number, d: number, h: number, parts: Part[], extra: Partial<Def> = {}): Def => ({ label, brand: "Generic", cat: "Garden", w, d, h, parts, ...extra });
/** The light a lit piece casts (`y` = height of the source, `k` scales it down for small pieces: the pool and point light share it). */
export const lit = (y: number, color = WARM, k = 1): Pick<Def, "light"> => ({ light: { y, color, k } });

/** ellipsoid (sphere with separate x/y/z sizes) */
export const el = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, o?: { m?: true; glow?: true; r?: V3 }): Part => b(x, y, z, sx, sy, sz, c, { ...o, shape: "sph" });
/** n parts evenly round a circle of radius R (angle a measured from +x towards +z) */
export const ring = (n: number, R: number, f: (x: number, z: number, a: number, i: number) => Part | Part[], a0 = 0): Part[] =>
  range(n).flatMap((i) => { const a = a0 + (i / n) * PI * 2; return f(R * Math.cos(a), R * Math.sin(a), a, i); });
/** A procedural plant of `species` in a w x h x d box centred at (x, z) whose base is at height y0. */
export const plantAt = (species: Species, w: number, h: number, d: number, x: number, z: number, seed = 0, y0 = 0): Part => ({ ...vegPart(species, w, h, d, seed), p: [x, y0 + h / 2, z] });
export { vegPart };

/** two roof panels meeting at a ridge along z: span w, depth d, eaves at y0, ridge at y0 + rise */
export const gable = (w: number, d: number, y0: number, rise: number, c: string, o?: { m?: true }, t = 0.05): Part[] => {
  const hs = (w - 0.06) / 2, a = Math.atan2(rise, hs), L = Math.hypot(hs, rise);
  return [-1, 1].map((s) => b((s * hs) / 2, y0 + rise / 2, 0, L, t, d, c, { ...o, r: [0, 0, -s * a] }));
};
/** single sloping roof panel, high at the back (-z), low at the front */
export const mono = (w: number, d: number, y0: number, rise: number, c: string, o?: { m?: true }): Part => {
  const s = d - 0.06, a = Math.atan2(rise, s);
  return b(0, y0 + rise / 2, 0, w, 0.05, Math.hypot(s, rise), c, { ...o, r: [a, 0, 0] });
};

// ---------- lights ----------
/** Small glowing bulb (a box: cheap to draw); `tw` > 0 makes it shimmer while lit (1 = fairy-light pace, 2 = candle flicker). */
export const led = (x: number, y: number, z: number, s = 0.03, c = BULB_OFF, tw = 0): Part => ({ ...b(x, y, z, s, s, s, c, { glow: true }), ...(tw ? { twinkle: tw } : {}) });
/** Round glowing globe (festoon bulbs, orbs). */
export const globe = (x: number, y: number, z: number, dia: number, c = BULB_OFF, tw = 0): Part => ({ ...sp(x, y, z, dia, c, { glow: true }), ...(tw ? { twinkle: tw } : {}) });
/** Glowing flame of a candle, torch or fire bowl: flickers. */
export const flame = (x: number, y: number, z: number, s = 0.04): Part => ({ ...b(x, y, z, s, s * 1.6, s, "#ffd27a", { glow: true }), twinkle: 2 });
export const glow = (p: Part): Part => ({ ...p, glow: true });

/** `n` points spread evenly over the upper part of an ellipsoid shell (golden-angle spiral): the fairy lights of a lit bush. lo = lowest point as a fraction of the radius (-1 bottom .. 1 top). */
export const shellPoints = (cx: number, cyy: number, cz: number, rx: number, ry: number, rz: number, n: number, lo = -0.3): V3[] =>
  range(n).map((i) => {
    const u = lo + ((i + 0.5) / n) * (1 - lo); // height fraction, dense enough to wrap the whole shell
    const q = Math.sqrt(1 - u * u), a = i * 2.39996;
    return [cx + rx * q * Math.cos(a), cyy + ry * u, cz + rz * q * Math.sin(a)];
  });
/** A straight bar in the xy plane (wires, neon tubes) from (x0, y0) to (x1, y1) at depth z. */
export const seg2 = (x0: number, y0: number, x1: number, y1: number, z: number, th: number, c: string, o?: { glow?: true; m?: true }): Part =>
  b((x0 + x1) / 2, (y0 + y1) / 2, z, Math.hypot(x1 - x0, y1 - y0), th, th, c, { ...o, r: [0, 0, Math.atan2(y1 - y0, x1 - x0)] });

/** Height of a hanging wire at fraction t (0..1) of its span: a parabola sagging `sag` below the line between its ends (close enough to a catenary for a gentle sag). */
export const sagAt = (y: number, sag: number, t: number) => y - sag * 4 * t * (1 - t);
/** A hanging wire between x = -len/2 and +len/2 at hook height y, drawn as straight segments, with a bulb hanging from each of the `n` points. */
export const strand = (len: number, y: number, sag: number, z: number, n: number, bulb: (x: number, y: number, z: number, i: number) => Part, wire = "#2a2c2f", segs = Math.max(6, Math.round(len * 2))): Part[] => {
  const xAt = (t: number) => -len / 2 + len * t;
  const wires = range(segs).map((i) => seg2(xAt(i / segs), sagAt(y, sag, i / segs), xAt((i + 1) / segs), sagAt(y, sag, (i + 1) / segs), z, 0.012, wire));
  const bulbs = range(n).map((i) => {
    const t = (i + 0.5) / n;
    return bulb(xAt(t), sagAt(y, sag, t) - 0.07, z, i);
  });
  return [...wires, ...bulbs];
};

/** Tiny helper for the parts that swing in the wind: hangs from `pivot` (height, m) and swings +-deg about `axis` at `rpm` cycles/min. Give the def `wind: true`. */
export const swung = (p: Part, pivot: number, deg = 6, rpm = 14, axis: "x" | "z" = "x"): Part => ({ ...p, spin: { axis, rpm, swing: deg, pivot } });
/** A part that turns in the wind (windmill sails, pinwheels): give the def `wind: true`. */
export const turning = (p: Part, rpm = 20, axis: "x" | "y" | "z" = "z"): Part => ({ ...p, spin: { axis, rpm } });

export { b, cy, sp };
