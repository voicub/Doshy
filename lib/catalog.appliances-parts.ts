import type { Part } from "./catalog";

// Shared helpers for the appliance catalogs (catalog.appliances*.ts). Coordinates follow lib/catalog.ts:
// metres, local to the footprint centre, y = part centre height, back = -z, front = +z.
import { b as pb, cy as pcy, sp as psp, type Opt, WOOD, PLASTIC, CERAMIC, STEEL as MSTEEL, CHROME as MCHROME, LACQUER } from "./partsKit.ts";
export type { Opt };

// Colour -> material class, so every appliance part gets a texture/roughness without repeating it on each line; explicit options win.
const AUTO: Record<string, Opt> = {
  "#b8bcc2": MSTEEL, "#8d9299": MSTEEL, "#cfd3d8": MCHROME, "#9aa0a6": MSTEEL,
  "#14171d": { tex: "plastic", rough: 0.08 }, "#0b0c0e": { tex: "plastic", rough: 0.08 }, "#0d0f12": { tex: "plastic", rough: 0.08 },
  "#f2f1ee": LACQUER, "#d4d3cf": LACQUER, "#eceeef": LACQUER, "#e6e8ea": LACQUER, "#e6e5e1": LACQUER, "#c4c7cb": MSTEEL,
};
const auto = (c: string, o?: Opt): Opt => ({ ...(AUTO[c.toLowerCase()] ?? PLASTIC), ...o });
export const b = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, o?: Opt) => pb(x, y, z, sx, sy, sz, c, auto(c, o));
export const cy = (x: number, y: number, z: number, dia: number, h: number, c: string, o?: Opt) => pcy(x, y, z, dia, h, c, auto(c, o));
export const sp = (x: number, y: number, z: number, dia: number, c: string, o?: Opt) => psp(x, y, z, dia, c, auto(c, o));
export { WOOD, CERAMIC };

export const PI2 = Math.PI / 2;
export const WHITE = "#f2f1ee";
export const SEAM = "#d4d3cf"; // door gap / panel line
export const STEEL = "#b8bcc2";
export const DSTEEL = "#8d9299";
export const GRAPHITE = "#3a3d42";
export const BLACK = "#1c1d20";
export const GLASS = "#14171d"; // black glass / switched-off screen
export const CHROME = "#cfd3d8";
export const LED = "#7ad1ff"; // glow parts are recoloured at run time; this is the idle tint

/** `n` short boxes around a circle in the x-y plane (a fan guard / grille rim) facing +z. */
export const ring = (x: number, y: number, z: number, dia: number, n: number, t: number, depth: number, c: string): Part[] =>
  Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n;
    const R = dia / 2 - t / 2;
    return b(x + R * Math.cos(a), y + R * Math.sin(a), z, 2 * R * Math.sin(Math.PI / n) * 1.04, t, depth, c, { r: [0, 0, a + PI2] });
  });

/** `bars` crossing blades through one centre that spin as one rotor about z (facing front) or y (facing up). Each bar is a diameter long. */
export const rotor = (x: number, y: number, z: number, len: number, wid: number, bars: number, rpm: number, axis: "y" | "z", c: string, thick = 0.006): Part[] =>
  Array.from({ length: bars }, (_, k) => {
    const a = (Math.PI * k) / bars;
    return axis === "z"
      ? b(x, y, z, len, wid, thick, c, { r: [0, 0, a], spin: { axis: "z", rpm } })
      : b(x, y, z, len, thick, wid, c, { r: [0, a, 0], spin: { axis: "y", rpm } });
  });

/** Four small feet under a body. */
export const feet = (w: number, d: number, h: number, c = BLACK, t = 0.04): Part[] =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05), t, h, c)));
