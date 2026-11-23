import type { Wall, WallStyle } from "./types.ts";

/** Garden boundaries drawn with the wall tool: low, thin, never part of the building shell. */
export const FENCE_STYLES = ["fence_picket", "fence_wire", "fence_panel", "wall_stone", "wall_brick_low", "hedge"] as const satisfies readonly WallStyle[];
type FenceStyle = (typeof FENCE_STYLES)[number];

const DEFAULTS: Record<FenceStyle, { height: number; thickness: number }> = {
  fence_picket: { height: 1.0, thickness: 0.05 },
  fence_wire: { height: 1.2, thickness: 0.04 },
  fence_panel: { height: 1.8, thickness: 0.06 },
  wall_stone: { height: 0.9, thickness: 0.3 },
  wall_brick_low: { height: 0.6, thickness: 0.2 },
  hedge: { height: 1.4, thickness: 0.6 },
};

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

const POST_GAP = 2.2; // widest span between two posts
const POST: Record<"fence_picket" | "fence_wire" | "fence_panel", number> = { fence_picket: 0.07, fence_wire: 0.05, fence_panel: 0.09 };
const PICKET_PITCH = 0.12;
const PICKET_W = 0.07;
const WIRE_PITCH = 0.2;
const WIRE_D = 0.012;
const BOARD_PITCH = 0.15;

/**
 * The pieces of an open or boarded fence between `s0` and `s1` along the wall: posts, and the infill (pickets and rails, wire mesh, or boards).
 * Real gaps stay between pickets and wires, so a wire fence is see-through. Other styles (stone, brick, hedge) are solid volumes: no parts.
 */
export function fenceParts(style: WallStyle, s0: number, s1: number, h: number, t: number): { posts: Part[]; fill: Part[] } {
  const none = { posts: [], fill: [] };
  if (style !== "fence_picket" && style !== "fence_wire" && style !== "fence_panel") return none;
  const span = s1 - s0;
  if (!(span > 0.02) || !(h > 0.05)) return none;
  const p = POST[style];
  const n = Math.max(1, Math.ceil(span / POST_GAP));
  const posts: Part[] = Array.from({ length: n + 1 }, (_, i) => ({ x: s0 + (span * i) / n, y: (h + 0.05) / 2, z: 0, sx: p, sy: h + 0.05, sz: Math.max(p, t) }));
  const fill: Part[] = [];
  const inner0 = s0 + p / 2;
  const inner = span - p;
  if (inner <= 0) return { posts, fill };
  const rail = (y: number, d: number, sy = 0.04): Part => ({ x: s0 + span / 2, y, z: -t * 0.25, sx: inner, sy, sz: d });
  if (style === "fence_picket") {
    const count = Math.max(1, Math.floor(inner / PICKET_PITCH));
    const used = count * PICKET_PITCH;
    for (let i = 0; i < count; i++) fill.push({ x: inner0 + (inner - used) / 2 + (i + 0.5) * PICKET_PITCH, y: 0.04 + (h - 0.04) / 2, z: t * 0.3, sx: PICKET_W, sy: h - 0.04, sz: Math.max(0.015, t * 0.4) });
    fill.push(rail(h * 0.25, t * 0.5), rail(h * 0.75, t * 0.5));
  } else if (style === "fence_wire") {
    for (let y = 0.1; y <= h - 0.05; y += WIRE_PITCH) fill.push({ x: s0 + span / 2, y, z: 0, sx: inner, sy: WIRE_D, sz: WIRE_D });
    const count = Math.max(1, Math.floor(inner / WIRE_PITCH));
    for (let i = 0; i <= count; i++) fill.push({ x: inner0 + (inner * i) / count, y: 0.08 + (h - 0.13) / 2, z: 0, sx: WIRE_D, sy: h - 0.13, sz: WIRE_D });
    fill.push({ x: s0 + span / 2, y: h - 0.015, z: 0, sx: inner, sy: 0.03, sz: 0.04 });
  } else {
    const count = Math.max(1, Math.floor(inner / BOARD_PITCH));
    const pitch = inner / count;
    for (let i = 0; i < count; i++) fill.push({ x: inner0 + (i + 0.5) * pitch, y: 0.05 + (h - 0.05) / 2, z: 0, sx: pitch - 0.01, sy: h - 0.05, sz: Math.max(0.02, t * 0.6) });
    fill.push({ x: s0 + span / 2, y: h - 0.02, z: 0, sx: span, sy: 0.04, sz: t });
  }
  return { posts, fill };
}
