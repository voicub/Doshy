import type { Wall, WallStyle } from "./types.ts";

/** Garden boundaries drawn with the wall tool: low, thin, never part of the building shell. Picker order. */
export const FENCE_STYLES = [
  "fence_picket", "fence_panel", "fence_slat", "fence_wire", "fence_bar", "fence_iron", "fence_glass",
  "wall_stone", "wall_brick_low", "wall_block", "hedge", "fence_rail", "fence_electric", "fence_bamboo",
] as const satisfies readonly WallStyle[];
type FenceStyle = (typeof FENCE_STYLES)[number];

const DEFAULTS: Record<FenceStyle, { height: number; thickness: number }> = {
  fence_picket: { height: 1.0, thickness: 0.05 },
  fence_panel: { height: 1.8, thickness: 0.06 },
  fence_slat: { height: 1.5, thickness: 0.05 },
  fence_wire: { height: 1.2, thickness: 0.04 },
  fence_bar: { height: 1.1, thickness: 0.04 },
  fence_iron: { height: 1.4, thickness: 0.04 },
  fence_glass: { height: 1.1, thickness: 0.04 },
  wall_stone: { height: 0.9, thickness: 0.3 },
  wall_brick_low: { height: 0.6, thickness: 0.2 },
  wall_block: { height: 1.2, thickness: 0.2 },
  hedge: { height: 1.4, thickness: 0.6 },
  fence_rail: { height: 1.2, thickness: 0.06 },
  fence_electric: { height: 1.1, thickness: 0.03 },
  fence_bamboo: { height: 1.8, thickness: 0.05 },
};

/** Solid slabs drawn by the normal wall path (textured shell), not by FenceMesh. */
export const isSolidFence = (style: WallStyle): boolean => style === "wall_stone" || style === "wall_brick_low" || style === "wall_block";
/** Styles you can see through (the declutter fade skips them: nothing to look past). */
export const isSeeThroughFence = (style: WallStyle): boolean =>
  style === "glass" || style === "fence_wire" || style === "fence_glass" || style === "fence_bar" || style === "fence_iron" || style === "fence_electric" || style === "fence_rail";

export const isFence = (style: WallStyle | undefined): style is FenceStyle => !!style && (FENCE_STYLES as readonly string[]).includes(style);

/** Height (m) and thickness (m) a freshly drawn or freshly painted wall of this fence style gets. */
export const fenceDefaults = (style: FenceStyle): { height: number; thickness: number } => ({ ...DEFAULTS[style] });

/** How tall a wall stands: its own `height`, else the storey's wall height. */
export const wallHeight = (wall: Pick<Wall, "height">, storey: number): number => wall.height ?? storey;

/** The walls that make up the building: everything but fences, garden walls and hedges (area totals, bounds, enclosure, plinth, roof). */
export const shellWalls = <T extends Pick<Wall, "style">>(walls: T[]): T[] => walls.filter((w) => !isFence(w.style));

/**
 * A wall after its style changed from `prev` to `next` (same wall otherwise): going to or from a fence style swaps its height and thickness
 * for the new style's defaults. A plain wall that already has an explicit height keeps it when it becomes a fence; leaving fence style drops both.
 */
export function restyleWall(prev: Wall, next: Wall): Wall {
  if (prev.style === next.style || (!isFence(prev.style) && !isFence(next.style))) return next;
  if (!isFence(next.style)) {
    const { height: _h, thickness: _t, ...rest } = next;
    return rest;
  }
  if (!isFence(prev.style) && prev.height !== undefined) return next;
  return { ...next, ...fenceDefaults(next.style) };
}

/** One axis-aligned box in the wall's frame: x along the wall from its start (metres), y up from the ground, z across (+ = face A). Same fields as BoxSpec. */
export type Part = { x: number; y: number; z: number; sx: number; sy: number; sz: number };

type OpenStyle = "fence_picket" | "fence_wire" | "fence_panel" | "fence_slat" | "fence_bar" | "fence_iron" | "fence_glass" | "fence_rail" | "fence_electric" | "fence_bamboo";
/** Post width and widest span between two posts, per style (glass panels and bars want closer posts, a tape fence far wider ones). */
const POSTS: Record<OpenStyle, { w: number; gap: number }> = {
  fence_picket: { w: 0.07, gap: 2.2 },
  fence_wire: { w: 0.05, gap: 2.2 },
  fence_panel: { w: 0.09, gap: 2.2 },
  fence_slat: { w: 0.06, gap: 2.0 },
  fence_bar: { w: 0.04, gap: 1.8 },
  fence_iron: { w: 0.04, gap: 2.0 },
  fence_glass: { w: 0.05, gap: 1.6 },
  fence_rail: { w: 0.09, gap: 2.4 },
  fence_electric: { w: 0.035, gap: 3.0 },
  fence_bamboo: { w: 0.06, gap: 2.0 },
};
const isOpen = (s: WallStyle): s is OpenStyle => Object.hasOwn(POSTS, s);
const PICKET_PITCH = 0.12;
const PICKET_W = 0.07;
const WIRE_PITCH = 0.2;
const WIRE_D = 0.012;
const BOARD_PITCH = 0.15;
const MAX_ROWS = 60; // a very tall fence gets its slats spread, never thousands of them

export type FenceParts = {
  /** Posts: one draw call. */
  posts: Part[];
  /** Infill: pickets, wire, boards, bars, slats, glass panels. */
  fill: Part[];
  /** A second colour on top of the fill: iron finials, bamboo bindings. Empty on the plain styles and on the coarse (Eco) look. */
  extra: Part[];
};
const NONE = (): FenceParts => ({ posts: [], fill: [], extra: [] });

/** `n` equal rows between y0 and y1 (at most MAX_ROWS), as centre heights and the row pitch. */
function rows(y0: number, y1: number, pitch: number): { ys: number[]; step: number } {
  const n = Math.min(MAX_ROWS, Math.max(1, Math.round((y1 - y0) / pitch)));
  const step = (y1 - y0) / n;
  return { ys: Array.from({ length: n }, (_, i) => y0 + (i + 0.5) * step), step };
}

/** Vertical members spread evenly over [x0, x0 + inner], at about `pitch`, centred on their cell: never a short last gap. */
function uprights(x0: number, inner: number, pitch: number): { xs: number[]; step: number } {
  const n = Math.max(1, Math.floor(inner / pitch));
  const step = inner / n;
  return { xs: Array.from({ length: n }, (_, i) => x0 + (i + 0.5) * step), step };
}

/**
 * The pieces of an open or boarded fence between `s0` and `s1` along the wall: posts, the infill and (some styles) a second-colour trim.
 * Real gaps stay between pickets, bars and wires, so those fences are see-through. Solid styles (stone, brick, block, hedge) have no parts.
 * `coarse` (the Eco look) widens the pitch of pickets, bars and canes and drops the extras, to keep the part count low.
 */
export function fenceParts(style: WallStyle, s0: number, s1: number, h: number, t: number, coarse = false): FenceParts {
  if (!isOpen(style)) return NONE();
  const st = style;
  const span = s1 - s0;
  if (!(span > 0.02) || !(h > 0.05)) return NONE();
  const p = POSTS[st].w;
  const n = Math.max(1, Math.ceil(span / POSTS[st].gap));
  const posts: Part[] = Array.from({ length: n + 1 }, (_, i) => ({ x: s0 + (span * i) / n, y: (h + 0.05) / 2, z: 0, sx: p, sy: h + 0.05, sz: Math.max(p, t) }));
  const fill: Part[] = [];
  const extra: Part[] = [];
  const inner0 = s0 + p / 2;
  const inner = span - p;
  if (inner <= 0) return { posts, fill, extra };
  const cx = s0 + span / 2;
  const rail = (y: number, d: number, sy = 0.04): Part => ({ x: cx, y, z: -t * 0.25, sx: inner, sy, sz: d });
  const lo = Math.min(0.08, h * 0.2); // bottom and top of the infill
  const hi = h - Math.min(0.05, h * 0.1);
  const bar = (x: number, y0: number, y1: number, w: number, d: number): Part => ({ x, y: (y0 + y1) / 2, z: 0, sx: w, sy: y1 - y0, sz: d });
  if (st === "fence_picket") {
    const count = Math.max(1, Math.floor(inner / PICKET_PITCH));
    const used = count * PICKET_PITCH;
    for (let i = 0; i < count; i++) fill.push({ x: inner0 + (inner - used) / 2 + (i + 0.5) * PICKET_PITCH, y: 0.04 + (h - 0.04) / 2, z: t * 0.3, sx: PICKET_W, sy: h - 0.04, sz: Math.max(0.015, t * 0.4) });
    fill.push(rail(h * 0.25, t * 0.5), rail(h * 0.75, t * 0.5));
  } else if (st === "fence_wire") {
    for (let i = 0, y = 0.1; i < MAX_ROWS && y <= h - 0.05; i++, y += WIRE_PITCH) fill.push({ x: cx, y, z: 0, sx: inner, sy: WIRE_D, sz: WIRE_D });
    const count = Math.max(1, Math.floor(inner / WIRE_PITCH));
    for (let i = 0; i <= count; i++) fill.push({ x: inner0 + (inner * i) / count, y: 0.08 + (h - 0.13) / 2, z: 0, sx: WIRE_D, sy: h - 0.13, sz: WIRE_D });
    fill.push({ x: cx, y: h - 0.015, z: 0, sx: inner, sy: 0.03, sz: 0.04 });
  } else if (st === "fence_panel") {
    const count = Math.max(1, Math.floor(inner / BOARD_PITCH));
    const pitch = inner / count;
    for (let i = 0; i < count; i++) fill.push({ x: inner0 + (i + 0.5) * pitch, y: 0.05 + (h - 0.05) / 2, z: 0, sx: pitch - 0.01, sy: h - 0.05, sz: Math.max(0.02, t * 0.6) });
    fill.push({ x: cx, y: h - 0.02, z: 0, sx: span, sy: 0.04, sz: t });
  } else if (st === "fence_slat") {
    const { ys, step } = rows(lo, hi, coarse ? 0.18 : 0.1);
    for (const y of ys) fill.push({ x: cx, y, z: 0, sx: inner, sy: step * 0.72, sz: Math.max(0.02, t * 0.8) });
  } else if (st === "fence_bar") {
    const { xs } = uprights(inner0, inner, coarse ? 0.2 : 0.11);
    for (const x of xs) fill.push(bar(x, lo, hi, 0.02, 0.02));
    fill.push(rail(lo, 0.03, 0.04), rail(hi, 0.03, 0.05));
  } else if (st === "fence_iron") {
    const { xs } = uprights(inner0, inner, coarse ? 0.18 : 0.11);
    const top = hi - 0.03; // the finial sits on top of each bar
    for (const x of xs) fill.push(bar(x, lo, top, 0.016, 0.016));
    fill.push(rail(lo + 0.05, 0.02, 0.035), rail(hi - 0.14, 0.02, 0.035));
    if (!coarse) for (const x of xs) extra.push({ x, y: top, z: 0, sx: 0.035, sy: 0.07, sz: 0.035 });
  } else if (st === "fence_glass") {
    const w = span / n - p - 0.03; // one pane per post span, a small gap each side
    const y0 = Math.min(0.06, h * 0.2);
    if (w > 0.02) for (let i = 0; i < n; i++) fill.push({ x: s0 + ((i + 0.5) * span) / n, y: (y0 + h - 0.02) / 2, z: 0, sx: w, sy: h - 0.02 - y0, sz: 0.012 });
  } else if (st === "fence_rail") {
    const ys = h >= 1 ? [0.25, 0.55, 0.85] : [0.35, 0.8];
    for (const f of ys) fill.push({ x: cx, y: h * f, z: 0, sx: inner, sy: Math.min(0.1, h * 0.15), sz: Math.max(0.035, t * 0.6) });
  } else if (st === "fence_electric") {
    for (const f of [0.3, 0.62, 0.94]) fill.push({ x: cx, y: h * f, z: 0.03, sx: inner, sy: 0.02, sz: 0.01 });
  } else {
    const { xs, step } = uprights(inner0, inner, coarse ? 0.12 : 0.07);
    for (const x of xs) fill.push(bar(x, 0, h - 0.02, step - 0.015, coarse ? 0.06 : 0.045));
    if (!coarse) for (const f of [0.25, 0.75]) extra.push({ x: cx, y: h * f, z: 0.04, sx: inner, sy: 0.035, sz: 0.03 });
  }
  return { posts, fill, extra };
}
