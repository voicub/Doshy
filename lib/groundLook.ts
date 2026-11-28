// How the garden's ground is dressed: which procedural surface each ground kind gets, how strongly the world-space variation (components/scene/groundMacro.ts) drifts
// its tone and hue, and the soft fringe around patios and paths. Pure, so the scale maths and the variety rules are tested without a browser.
import { FLOOR_SURFACE, type Surface } from "./shellLook.ts";
import type { FloorKind } from "./types.ts";

/**
 * Metres one macro-variation cell covers, broad to fine. None of them is a whole number of any ground tile (see GROUND_TILES_M), so the light and dark patches never line
 * up with the repeat of a texture: the repeat of the tile and the repeat of the patches drift apart instead of reinforcing each other.
 */
export const MACRO_SCALES_M = [23, 6.9, 1.35] as const;

type Macro = { tone: number; hue: number };

/** Tone (light/dark patches) and hue (warm/cool drift) strength per kind: a lawn varies most, a laid pattern the least (its joints already carry the structure), water not at all. */
const MACRO: Partial<Record<FloorKind, Macro>> = {
  grass: { tone: 0.95, hue: 0.5 },
  turf: { tone: 0.3, hue: 0.12 },
  gravel: { tone: 0.55, hue: 0.3 },
  sand: { tone: 0.45, hue: 0.3 },
  soil: { tone: 0.6, hue: 0.2 },
  mulch: { tone: 0.5, hue: 0.15 },
  asphalt: { tone: 0.35, hue: 0.05 },
  concrete: { tone: 0.4, hue: 0.1 },
  deck: { tone: 0.35, hue: 0.2 },
  paving: { tone: 0.3, hue: 0.15 },
  pavers_grey: { tone: 0.3, hue: 0.12 },
  pavers_sand: { tone: 0.3, hue: 0.12 },
  pavers_red: { tone: 0.3, hue: 0.12 },
  brick: { tone: 0.3, hue: 0.15 },
  cobble: { tone: 0.4, hue: 0.2 },
  flagstone: { tone: 0.4, hue: 0.25 },
  slabs: { tone: 0.4, hue: 0.25 },
  rubber: { tone: 0.2, hue: 0.05 },
};

export const macroOf = (kind: FloorKind): Macro | null => MACRO[kind] ?? null;

/** The procedural surface of a ground kind out of doors: outdoor concrete is stained and mottled, everything else is the room floor's own look. Undefined = no PBR look (flat voxel texture). */
export function groundSurface(kind: FloorKind): Surface | undefined {
  const s = FLOOR_SURFACE[kind];
  return s && kind === "concrete" ? { ...s, opts: { ...s.opts, outdoor: true } } : s;
}

/**
 * Brightness of a kind's old flat voxel texture (mean of its pixels in linear light) over the mean of the procedural map (ALBEDO_MEAN, 0.93): multiplied into the tint, the
 * new surface is as bright as the plan's ground always was, so a chosen colour and the season's palette keep their look; only the detail is new. Measured from the painters in
 * lib/textures.ts (a lawn's voxel texture averaged 0.58, the procedural map averages 0.93).
 */
const VOXEL_GAIN: Partial<Record<FloorKind, number>> = {
  grass: 0.62, turf: 0.71, gravel: 0.52, sand: 0.82, soil: 0.56, mulch: 0.31, asphalt: 0.74, water: 0.79, rubber: 0.73, deck: 0.62,
  paving: 0.58, pavers_grey: 0.56, pavers_sand: 0.56, pavers_red: 0.57, brick: 0.7, cobble: 0.41, flagstone: 0.54, slabs: 0.59, concrete: 0.67,
};

/** Tint multiplier of a ground area, path or lawn that now wears a procedural surface where it wore a voxel texture. */
export const groundGain = (kind: FloorKind): number => VOXEL_GAIN[kind] ?? 1;

/** Kinds a room floor (a terrace, a lawn room) has only just been given a procedural surface for: earlier it wore the voxel texture, so it takes the same gain. Kinds that already had one keep their look. */
const NEW_ON_ROOMS: readonly FloorKind[] = ["grass", "turf", "gravel", "sand", "soil", "mulch", "asphalt", "water", "rubber"];
export const roomGain = (kind: FloorKind): number => (NEW_ON_ROOMS.includes(kind) ? groundGain(kind) : 1);

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** `#rrggbb` with its linear-light colour multiplied by `gain` (what a texture of mean `gain` does to a tint on the GPU); gain 1 returns the colour as given. */
export function scaleColor(hex: string, gain: number): string {
  if (gain === 1 || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const out = [1, 3, 5].map((i) => {
    const c = toLinear(parseInt(hex.slice(i, i + 2), 16) / 255) * gain;
    return Math.round(Math.min(1, Math.max(0, toSrgb(c))) * 255).toString(16).padStart(2, "0");
  });
  return `#${out.join("")}`;
}

/** Every tile size (m) a ground kind can draw: what MACRO_SCALES_M must not be a multiple of. */
export const GROUND_TILES_M: readonly number[] = [...new Set(Object.keys(MACRO).map((k) => groundSurface(k as FloorKind)?.tile ?? 0).filter((t) => t > 0))];

/** The ring that shades the lawn around a patio, path or pond: how wide (m) and how dark at the edge. */
export const FRINGE = { width: 0.32, edge: 0.3 } as const;
