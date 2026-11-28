import type { FloorKind, GroundEdge, GroundPath, PavementSides, RoadMarks } from "./types.ts";

// What the Garden lines tool can draw. One gesture (click points, double-click to finish) makes one of four things, by family:
//   road, walkway -> a ground path (lib/ground.ts GroundPath) with road options;  fence -> a chain of garden walls (the styles of lib/fences.ts FENCE_STYLES, named in lib/materials.ts WALLS);
//   lights -> catalog lamps spaced evenly along the line (lib/lineLights.ts), each an ordinary item that can be linked to a light.
// This file is only the menu: what each kind is called and what it starts as. The drawing, the 3D look and the plan symbols live elsewhere.

export type LineFamily = "road" | "walkway" | "fence" | "lights";
export const LINE_FAMILIES: readonly { id: LineFamily; label: string }[] = [
  { id: "road", label: "Roads" },
  { id: "walkway", label: "Walkways" },
  { id: "fence", label: "Fences" },
  { id: "lights", label: "Lights" },
];

/** What a road or walkway starts as: its surface, width (and the range the width may take, metres) and road options. */
export type PathLook = {
  kind: FloorKind;
  width: number;
  min: number;
  max: number;
  marks?: RoadMarks;
  pavement?: PavementSides;
  edge?: GroundEdge;
  ends?: GroundPath["ends"];
  stones?: boolean;
};
export type PathKind = { family: "road" | "walkway"; id: string; label: string; look: PathLook };
/**
 * Lamps along a line: catalog kind `item`, `spacing` metres apart (adjustable within min..max), one at each end. `span` lamps (a string of festoon lights)
 * are centred between two stations and turned along the line instead of standing on them. `faces` lamps have an arm or a head that points to one side.
 */
export type LightKind = { family: "lights"; id: string; label: string; item: string; spacing: number; min: number; max: number; span?: true; faces?: true };

const road = (id: string, label: string, look: PathLook): PathKind => ({ family: "road", id, label, look });
const walk = (id: string, label: string, look: PathLook): PathKind => ({ family: "walkway", id, label, look });

export const PATH_KINDS: readonly PathKind[] = [
  road("road_street", "Street with pavements", { kind: "asphalt", width: 6.5, min: 3, max: 8, marks: "dashed", pavement: "both", ends: "flat" }),
  road("road_asphalt", "Asphalt road", { kind: "asphalt", width: 5, min: 3, max: 8, marks: "dashed", ends: "flat" }),
  road("road_lane", "Narrow lane", { kind: "asphalt", width: 3, min: 2.5, max: 5, marks: "none", ends: "flat" }),
  road("road_highway", "Two-way road, edge lines", { kind: "asphalt", width: 7, min: 5, max: 12, marks: "edges", ends: "flat" }),
  road("road_gravel", "Gravel track", { kind: "gravel", width: 3, min: 2, max: 6, ends: "flat" }),
  road("road_cobble", "Cobblestone street", { kind: "cobble", width: 5, min: 3, max: 8, edge: "kerb", pavement: "none", ends: "flat" }),
  road("road_dirt", "Dirt track", { kind: "soil", width: 2.5, min: 1.5, max: 5, ends: "flat" }),
  walk("walk_paved", "Paved footpath", { kind: "pavers_grey", width: 1.2, min: 0.6, max: 3 }),
  walk("walk_slabs", "Slab path", { kind: "slabs", width: 1, min: 0.6, max: 3 }),
  walk("walk_brick", "Brick path", { kind: "pavers_red", width: 1.2, min: 0.6, max: 3 }),
  walk("walk_concrete", "Concrete path", { kind: "concrete", width: 1.2, min: 0.6, max: 3, edge: "kerb" }),
  walk("walk_gravel", "Gravel path", { kind: "gravel", width: 1, min: 0.6, max: 3, edge: "steel" }),
  walk("walk_stones", "Stepping stones", { kind: "flagstone", width: 0.5, min: 0.3, max: 1.2, stones: true }),
  walk("walk_boards", "Wooden boardwalk", { kind: "deck", width: 1.4, min: 0.8, max: 3 }),
];

export const LIGHT_KINDS: readonly LightKind[] = [
  { family: "lights", id: "light_street", label: "Classic street light", item: "gd_street_classic", spacing: 12, min: 4, max: 40 },
  { family: "lights", id: "light_pole", label: "Modern street pole", item: "gd_street_modern", spacing: 18, min: 6, max: 50, faces: true },
  { family: "lights", id: "light_bollard", label: "Bollard light", item: "gd_bollard_slim", spacing: 4, min: 1.5, max: 20 },
  { family: "lights", id: "light_path", label: "Garden path light", item: "gd_path_mushroom", spacing: 2.5, min: 1, max: 10 },
  { family: "lights", id: "light_solar", label: "Solar stake light", item: "gd_path_solar", spacing: 2, min: 0.8, max: 10 },
  { family: "lights", id: "light_festoon", label: "String lights on posts", item: "gd_festoon_posts_5", spacing: 4.7, min: 4.7, max: 4.7, span: true },
];

export const pathKindOf = (id: string): PathKind | undefined => PATH_KINDS.find((k) => k.id === id);
export const lightKindOf = (id: string): LightKind | undefined => LIGHT_KINDS.find((k) => k.id === id);

/** The path fields a freshly drawn road or walkway of this kind carries (the ones left out stay at their defaults), at `width` metres clamped to the kind's range. */
export function pathFields(k: PathKind, width = k.look.width): Pick<GroundPath, "kind" | "width" | "marks" | "pavement" | "edge" | "ends" | "stones"> {
  const { kind, min, max, marks, pavement, edge, ends, stones } = k.look;
  return { kind, width: Math.min(max, Math.max(min, width)), ...(marks ? { marks } : {}), ...(pavement && pavement !== "none" ? { pavement } : {}), ...(edge ? { edge } : {}), ...(ends ? { ends } : {}), ...(stones ? { stones } : {}) };
}
