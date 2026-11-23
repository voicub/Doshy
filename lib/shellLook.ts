// Which procedural PBR texture (components/scene/pbr.ts) dresses each wall style and floor kind, how many metres one tile covers and how strong its relief is.
// A style missing here keeps today's flat voxel texture at every quality tier (glass, fences, hedges, lawn, water, sand, gravel...).
import type { FloorKind, WallStyle } from "./types.ts";

type ShellTex = "plaster" | "brick" | "tile" | "woodfloor" | "wood" | "concrete" | "stone" | "carpet" | "paving" | "cobble" | "flagstone";
type ShellOpts = { cols?: number; rows?: number; stagger?: boolean; plankW?: number; formwork?: boolean };
export type Surface = {
  kind: ShellTex;
  /** Metres one texture tile covers (what the uvs divide by). */
  tile: number;
  opts?: ShellOpts;
  /** u and v swapped: the grain runs up the wall (vertical boards). */
  swap?: boolean;
  /** Relief strength of the normal map (1 = as authored). */
  bump?: number;
  /** Colour map is the striped wallpaper pattern (components/scene/shellMaterials.ts) instead of the PBR texture's own. */
  stripes?: true;
};

const s = (kind: ShellTex, tile: number, extra: Omit<Surface, "kind" | "tile"> = {}): Surface => ({ kind, tile, ...extra });

export const WALL_SURFACE: Partial<Record<WallStyle, Surface>> = {
  plaster: s("plaster", 1, { bump: 0.6 }),
  brick: s("brick", 0.9),
  redbrick: s("brick", 0.9),
  whitebrick: s("brick", 0.9, { bump: 0.8 }),
  concrete: s("concrete", 2, { opts: { formwork: true } }),
  woodv: s("wood", 1.2, { swap: true }),
  woodh: s("wood", 1.2),
  batten: s("wood", 1.2, { swap: true, bump: 1.4 }),
  stone: s("stone", 1.2),
  metro: s("tile", 0.6, { opts: { cols: 2, rows: 4, stagger: true } }),
  stripes: s("plaster", 1, { bump: 0.3, stripes: true }),
  wall_stone: s("stone", 1.2),
  wall_brick_low: s("brick", 0.9),
};

export const FLOOR_SURFACE: Partial<Record<FloorKind, Surface>> = {
  wood: s("woodfloor", 1.2, { opts: { plankW: 0.15, stagger: true } }),
  oak: s("woodfloor", 1.2, { opts: { plankW: 0.15, stagger: true } }),
  darkwood: s("woodfloor", 1.2, { opts: { plankW: 0.12, stagger: true } }),
  laminate: s("woodfloor", 1.2, { opts: { plankW: 0.2, stagger: true }, bump: 0.6 }),
  herringbone: s("woodfloor", 1.2, { opts: { plankW: 0.075, stagger: true } }),
  deck: s("woodfloor", 1.2, { opts: { plankW: 0.12, stagger: true }, bump: 1.3 }),
  tile: s("tile", 0.6, { opts: { cols: 2, rows: 2 } }),
  tilelarge: s("tile", 1.2, { opts: { cols: 2, rows: 2 } }),
  mosaic: s("tile", 0.4, { opts: { cols: 8, rows: 8 }, bump: 0.7 }),
  marble: s("tile", 1.2, { opts: { cols: 2, rows: 2 }, bump: 0.3 }),
  slate: s("tile", 1.2, { opts: { cols: 3, rows: 3 } }),
  vinyl: s("tile", 0.6, { opts: { cols: 2, rows: 2 }, bump: 0.4 }),
  terrazzo: s("stone", 1.2, { bump: 0.4 }),
  slabs: s("flagstone", 0.8),
  flagstone: s("flagstone", 0.8),
  cobble: s("cobble", 0.8),
  paving: s("paving", 0.8),
  pavers_grey: s("paving", 0.8),
  pavers_sand: s("paving", 0.8),
  pavers_red: s("paving", 0.8),
  brick: s("paving", 0.8),
  concrete: s("concrete", 2),
  polished: s("concrete", 2, { bump: 0.2 }),
  carpet: s("carpet", 1),
};
