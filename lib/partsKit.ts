// Small helpers for authoring catalog parts with the realism fields (bevel, tex, rough, metal, lathe, detail; see `Part` in catalog.ts).
// Pure data builders: every helper returns plain `Part` objects, so catalog files keep their shape and nothing here touches three.js.
// Coordinates are metres, local to the footprint centre; y is the part's centre height above the floor (a lathe's `y` is its BASE, see `turned`).
import type { Part } from "./catalog.ts";

export type Opt = Partial<Omit<Part, "p" | "s" | "c">>;

export const b = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, o?: Opt): Part => ({ p: [x, y, z], s: [sx, sy, sz], c, ...o });
/** Cylinder: diameter, height. */
export const cy = (x: number, y: number, z: number, dia: number, h: number, c: string, o?: Opt): Part => b(x, y, z, dia, h, dia, c, { ...o, shape: "cyl" });
export const sp = (x: number, y: number, z: number, dia: number, c: string, o?: Opt): Part => b(x, y, z, dia, dia, dia, c, { ...o, shape: "sph" });

// ---- material presets: spread into the options, `b(x, y, z, sx, sy, sz, c, { ...WOOD, m: true })` ------------------------------------------------
export const WOOD: Opt = { tex: "wood", rough: 0.55 };
export const LACQUER: Opt = { tex: "paint", rough: 0.3 }; // glossy painted fronts
export const MATT: Opt = { tex: "paint", rough: 0.85 }; // matt painted board, plaster
export const FAB: Opt = { tex: "fabric", rough: 0.95 };
export const LEATHER: Opt = { tex: "leather", rough: 0.55 };
export const FOAM: Opt = { tex: "foam", rough: 0.95 };
export const PLASTIC: Opt = { tex: "plastic", rough: 0.45 };
export const CERAMIC: Opt = { tex: "ceramic", rough: 0.18 };
export const STONE: Opt = { tex: "stone", rough: 0.35 };
export const RUBBER: Opt = { tex: "rubber", rough: 0.9 };
export const STEEL: Opt = { tex: "metal", metal: 1, rough: 0.38 }; // brushed stainless
export const CHROME: Opt = { tex: "metal", metal: 1, rough: 0.12 };
export const BLACK_METAL: Opt = { tex: "metal", metal: 0.85, rough: 0.45 }; // powder-coated frames
export const GLOSS: Opt = { rough: 0.08 }; // screens, lacquer: sharp reflections

/** A shape turned on a lathe, standing on `baseY`. `profile` = [radius, height] pairs from the base up, in metres; the part is sized to fit it exactly, so the profile is drawn as given. */
export function turned(x: number, baseY: number, z: number, profile: [number, number][], c: string, o?: Opt): Part {
  const dia = 2 * Math.max(...profile.map(([r]) => r));
  const h = Math.max(...profile.map(([, y]) => y));
  return b(x, baseY + h / 2, z, dia, h, dia, c, { ...o, shape: "lathe", lathe: profile });
}

/** Round leg or post, wider at the top (a turned leg when top and bottom differ much). */
export const taperedLeg = (x: number, z: number, h: number, topDia: number, botDia: number, c: string, o?: Opt): Part =>
  turned(x, 0, z, [[botDia / 2, 0], [botDia / 2, 0.01], [topDia / 2, h]], c, o);

/** Four tapered legs inset `inset` m from the corners of a w x d footprint. */
export const taperedLegs = (w: number, d: number, h: number, c: string, topDia = 0.05, botDia = 0.032, inset = 0.06, o?: Opt): Part[] =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * (w / 2 - inset), sz * (d / 2 - inset), h, topDia, botDia, c, o)));

/** Rounded seat or back cushion: a fabric box with a deep bevel (about 40% of its thinnest side, at most 7 cm). */
export const cushion = (x: number, y: number, z: number, w: number, h: number, d: number, c: string, o?: Opt): Part =>
  b(x, y, z, w, h, d, c, { ...FAB, bevel: Math.min(0.07, Math.min(w, h, d) * 0.4), ...o });

/** Scatter pillow: even softer, the bevel is about half its thickness. Pass `r` to tilt it against a backrest. */
export const pillow = (x: number, y: number, z: number, w: number, h: number, d: number, c: string, o?: Opt): Part => b(x, y, z, w, h, d, c, { ...FAB, bevel: h * 0.48, ...o });

/** A thin groove or seam line on a front face, trims level (detail 1): `sx`/`sy`/`sz` is its size, so a seam is e.g. (0.004, 0.3, 0.004). */
export const seam = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, o?: Opt): Part => b(x, y, z, sx, sy, sz, c, { bevel: 0, detail: 1, ...o });

/** Bar handle lying across a front (axis "x") or standing on it (axis "y"); `z` = the front face it is screwed to. Small details (detail 2). */
export const handleBar = (x: number, y: number, z: number, len: number, axis: "x" | "y", c = "#b8bcc2", o?: Opt): Part =>
  b(x, y, z + 0.012, axis === "x" ? len : 0.012, axis === "x" ? 0.012 : len, 0.012, c, { ...STEEL, bevel: 0.003, detail: 2, ...o });

/** Round knob on a front face (detail 2). */
export const knob = (x: number, y: number, z: number, dia = 0.03, c = "#b8bcc2", o?: Opt): Part => sp(x, y, z + dia / 2, dia, c, { ...CHROME, detail: 2, ...o });

/**
 * One drawer or door front on a face at depth `z` (the front's back plane), `thick` m deep, with a small gap around it (the caller passes the cell size: the gap is cut here).
 * Handle: "bar-x" (a pull across the top), "bar-y" (a vertical pull at the side), "knob" (centre), or "none" (push-to-open / handle-less).
 */
export function drawerFront(x: number, y: number, z: number, w: number, h: number, c: string, o: Opt & { handle?: "bar-x" | "bar-y" | "knob" | "none"; thick?: number; handleColor?: string } = {}): Part[] {
  const { handle = "none", thick = 0.018, handleColor, ...opt } = o;
  const gap = 0.004;
  const zf = z + thick / 2;
  const out = [b(x, y, zf, w - gap, h - gap, thick, c, { bevel: 0.004, ...opt })];
  const face = z + thick;
  if (handle === "bar-x") out.push(handleBar(x, y + h * 0.3, face, Math.min(0.16, w * 0.5), "x", handleColor));
  else if (handle === "bar-y") out.push(handleBar(x - w * 0.38, y, face, Math.min(0.16, h * 0.5), "y", handleColor));
  else if (handle === "knob") out.push(knob(x, y, face, 0.028, handleColor));
  return out;
}

/** Vertical profile of a bowl or cup: a half-ellipse of radius `r` and depth `h`, `n` rings. Drawn solid (the top is a lid you never see into at this scale). */
export const bowlProfile = (r: number, h: number, n = 6): [number, number][] => [
  [r * 0.45, 0],
  ...Array.from({ length: n }, (_, i): [number, number] => {
    const t = (i + 1) / n;
    return [r * (0.45 + 0.55 * Math.sin((t * Math.PI) / 2)), h * t];
  }),
];

/** Vase / bottle profile: foot, belly at 35% of the height, neck, lip. */
export const vaseProfile = (r: number, h: number, neck = 0.3): [number, number][] => [
  [r * 0.55, 0],
  [r * 0.8, h * 0.08],
  [r, h * 0.35],
  [r * 0.8, h * 0.62],
  [r * neck, h * 0.82],
  [r * neck * 1.15, h],
];

/** Lamp shade: a frustum, `botDia` wide at the bottom, `topDia` at the top, `h` tall, sitting on `baseY`. */
export const shade = (x: number, baseY: number, z: number, topDia: number, botDia: number, h: number, c: string, o?: Opt): Part =>
  turned(x, baseY, z, [[botDia / 2, 0], [topDia / 2, h]], c, o);

/** Round tabletop on a turned pedestal: top disc `dia` (thickness `top`), stem, foot. Total height `h`. */
export function roundTable(x: number, z: number, dia: number, h: number, c: string, o?: Opt & { top?: number; footDia?: number; legColor?: string }): Part[] {
  const { top = 0.03, footDia = dia * 0.45, legColor = c, ...opt } = o ?? {};
  return [
    cy(x, h - top / 2, z, dia, top, c, { ...WOOD, ...opt }),
    turned(x, 0, z, [[footDia / 2, 0], [footDia / 2, 0.02], [0.03, 0.06], [0.03, h - top]], legColor, { ...BLACK_METAL, ...opt }),
  ];
}

/** Material pass for catalogs that only need textures: per colour class (grey = metal, dark = plastic, rest = paint) plus a bevel proportional to the thinnest side. Never moves, resizes or reorders a part; explicit fields win. */
export function withMaterials(defs: Record<string, { parts: Part[] }>): void {
  for (const d of Object.values(defs)) {
    d.parts = d.parts.map((p) => {
      const n = parseInt(p.c.slice(1), 16);
      const [r, g, bl] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), light = (mx + mn) / 510, sat = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
      const m: Opt = p.glow ? { rough: 0.3 } : p.m ? { tex: "paint", rough: 0.4 } : light < 0.22 ? { tex: "plastic", rough: 0.45 } : sat < 0.14 && light > 0.3 ? { tex: "metal", metal: 0.9, rough: 0.4 } : sat > 0.35 && light < 0.3 ? { tex: "plastic", rough: 0.15 } : { tex: "paint", rough: 0.5 };
      const side = Math.min(...p.s);
      return { ...m, ...(p.shape || p.glow ? {} : { bevel: Math.min(0.02, Math.max(0.002, side * 0.15)) }), ...p };
    });
  }
}
