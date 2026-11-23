import type { Def, Part } from "./catalog";
import type { V3 } from "./mathUtil.ts";
import { b, cx, cy, sp, rod } from "./partKit.ts";

// Shared helpers for the Seasonal catalog files (same conventions as lib/catalog.home-office.ts: local coords centred on the footprint,
// y = part centre height, front = +z). Wall and ceiling pieces are modelled at their absolute height, like curtains.
export { b, cx, cy, sp, rod };

export const range = (n: number) => Array.from({ length: n }, (_, i) => i);
export const WARM = "#ffd9a0"; // colour a lit piece shows when its entity reports none (plain switch, brightness-only light)
export const BULB_OFF = "#e9dcb4"; // what a switched-off bulb looks like

export const GREEN = "#2f6b3a";
export const RED = "#b3262e";
export const GOLD = "#d4a93c";
export const SILVER = "#c7ccd1";
export const WHITE = "#f4f3f0";
export const BROWN = "#6b4a35";
export const WIRE = "#2a2c2f";
export const TRUNK = "#5a3d2a";

/** A piece of the Seasonal category. */
export const sz = (label: string, w: number, d: number, h: number, parts: Part[], extra: Partial<Def> = {}): Def => ({ label, brand: "Generic", cat: "Seasonal", w, d, h, parts, ...extra });
/** The soft light a lit piece casts (`y` = height of the source, `k` scales it down for small pieces). */
export const lit = (y: number, color = WARM, k = 1): Pick<Def, "light"> => ({ light: { y, color, k } });

/** Small glowing bulb that twinkles while lit; `speed` 1 = fairy lights, 2 = candle flame. */
export const bulb = (x: number, y: number, z: number, s = 0.028, c = BULB_OFF, speed = 1): Part => ({ ...b(x, y, z, s, s * 1.2, s, c, { glow: true }), twinkle: speed });
export const globe = (x: number, y: number, z: number, dia = 0.05, c = BULB_OFF, speed = 1): Part => ({ ...sp(x, y, z, dia, c, { glow: true }), twinkle: speed });
/** Steadily glowing part (stars, windows, lantern bodies). */
export const glow = (p: Part): Part => ({ ...p, glow: true });
/** Flame of a candle or diya: glows and flickers. */
export const flame = (x: number, y: number, z: number, s = 0.02): Part => ({ ...b(x, y, z, s, s * 1.6, s, "#ffd27a", { glow: true }), twinkle: 2 });

/** Where a hanging swag is at fraction t (0..1) of its span: a parabola sagging `sag` below the line between its ends. */
export const swagAt = (x0: number, x1: number, y: number, sag: number, t: number): [number, number] => [x0 + (x1 - x0) * t, y - sag * 4 * t * (1 - t)];
/** A hanging swag drawn as `segs` straight rods. */
export const swag = (x0: number, x1: number, y: number, z: number, sag: number, segs: number, th: number, c: string, o?: { m?: true }): Part[] =>
  range(segs).map((i) => {
    const [ax, ay] = swagAt(x0, x1, y, sag, i / segs);
    const [ex, ey] = swagAt(x0, x1, y, sag, (i + 1) / segs);
    return rod([ax, ay, z], [ex, ey, z], th, c, o);
  });

/** Fairy lights along a swag: `n` bulbs spread over the span, each hanging `drop` below the wire. */
export const swagBulbs = (x0: number, x1: number, y: number, z: number, sag: number, n: number, mk: (x: number, y: number, z: number, i: number) => Part, drop = 0.03, from = 0): Part[] =>
  range(n).map((i) => {
    const [px, py] = swagAt(x0, x1, y, sag, (i + 0.5) / n);
    return mk(px, py - drop, z, from + i);
  });

/** Five-pointed-ish star from two crossed slabs (glowing): size = tip to tip. */
export const star = (x: number, y: number, z: number, size: number, c = "#ffe08a"): Part[] => [
  glow(b(x, y, z, size, size, size * 0.16, c)),
  glow(b(x, y, z, size, size, size * 0.16, c, { r: [0, 0, Math.PI / 4] })),
];

/** A wrapped present: box, ribbon cross and a bow. `ry` turns the whole thing about its own centre. */
export const gift = (x: number, y: number, z: number, sx: number, sy: number, sz_: number, col: string, rib: string, ry = 0): Part[] => {
  const r: V3 = [0, ry, 0];
  return [
    b(x, y, z, sx, sy, sz_, col, { r }),
    b(x, y, z, sx + 0.004, sy + 0.004, 0.028, rib, { r }),
    b(x, y, z, 0.028, sy + 0.004, sz_ + 0.004, rib, { r }),
    b(x, y + sy / 2 + 0.01, z, 0.028, 0.02, sz_ + 0.004, rib, { r }),
    b(x, y + sy / 2 + 0.01, z, sx + 0.004, 0.02, 0.028, rib, { r }),
    sp(x, y + sy / 2 + 0.03, z, Math.min(0.07, sx * 0.3), rib),
  ];
};

/** `n` blocks of alternating colour stacked on y (candy cane, barber pole). */
export const striped = (x: number, y0: number, z: number, dia: number, seg: number, n: number, c1: string, c2: string): Part[] =>
  range(n).map((i) => cy(x, y0 + seg * (i + 0.5), z, dia, seg, i % 2 ? c2 : c1));

/** Points on a circle of radius r in the xy plane (for wreaths, crescents, arcs), from angle a0 over `span` radians. */
export const arc = (cx: number, cyy: number, r: number, n: number, a0 = 0, span = Math.PI * 2): [number, number, number][] =>
  range(n).map((i) => {
    const a = a0 + (span * i) / (span >= Math.PI * 2 - 1e-6 ? n : n - 1);
    return [cx + r * Math.cos(a), cyy + r * Math.sin(a), a];
  });
