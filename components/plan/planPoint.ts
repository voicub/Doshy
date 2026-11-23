import { WALL_H, normalizeOpening, projectOnWall, snap, wallLen } from "@/lib/geometry";
import { wallHeight } from "@/lib/fences";
import { swingFor } from "@/lib/placement";
import type { OpeningSize } from "@/lib/store";
import type { Opening, OpeningType, Pt, Wall } from "@/lib/types";

export const OPENING_SNAP_DIST = 0.5;

type Mods = { shiftKey: boolean; altKey: boolean };
/** Latest pointer position (unsnapped, in plan metres) with the modifier keys held at that moment. */
export type Ptr = Pt & Mods;
type OpeningGhost = { wallId: string; type: OpeningType; t: number; width: number; sill: number; height: number };

// Grids (metres): walls, rooms and openings snap to 0.05, Shift 0.25, Alt none.
export const planGrid = (m: Mods) => (m.altKey ? 0 : m.shiftKey ? 0.25 : 0.05);
export const gsnap = (v: number, g: number) => (g > 0 ? +snap(v, g).toFixed(4) : v);

/** The door or window that a click at this pointer would place: on the nearest wall (within `reach` metres), centre snapped along it, dimensions from the tool's defaults fitted to the wall. */
export function openingAt(type: OpeningType, p: Ptr, walls: Wall[], size: OpeningSize, reach = OPENING_SNAP_DIST): (Omit<Opening, "id"> & OpeningGhost) | null {
  const hit = walls
    .filter((w) => wallLen(w) > 0.01)
    .map((w) => ({ w, ...projectOnWall(w, p) }))
    .filter((h) => h.dist < reach)
    .sort((a, b) => a.dist - b.dist)[0];
  if (!hit) return null;
  const len = wallLen(hit.w);
  const o = normalizeOpening({ ...size, t: gsnap(hit.t * len, planGrid(p)) / len }, len, wallHeight(hit.w, WALL_H));
  // a door opens toward the pointer's side of the wall, hinged at the end nearer the pointer (Shift flips the hinge)
  const swing = type === "door" ? swingFor(hit.w, o.t, p, p.shiftKey) : {};
  return { wallId: hit.w.id, type, ...o, ...swing };
}
