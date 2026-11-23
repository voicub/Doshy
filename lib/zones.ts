import { shellWalls } from "./fences.ts";
import { onLevel } from "./levels.ts";
import type { Room, Wall } from "./types.ts";

export type Rect = { x: number; y: number; w: number; h: number };

const GAP_MAX = 0.35; // widest wall thickness plus slack between two rooms that touch
const MIN_OPEN = 0.5; // metres of shared boundary without a wall for two rooms to count as one space
const LINE_TOL = 0.2; // how far a wall may sit from the midline of the gap and still be "in" it

/** Metres of `[lo, hi]` along one axis covered by walls running on the line `at` (walls on a line never overlap: they are merged). */
function covered(walls: Wall[], axis: "x" | "y", at: number, lo: number, hi: number): number {
  const along = axis === "x" ? "y" : "x"; // a vertical wall (constant x) is measured along y
  return walls.reduce((sum, w) => {
    if (Math.abs(w.a[axis] - at) > LINE_TOL || Math.abs(w.b[axis] - at) > LINE_TOL) return sum;
    const a = Math.min(w.a[along], w.b[along]);
    const b = Math.max(w.a[along], w.b[along]);
    return sum + Math.max(0, Math.min(b, hi) - Math.max(a, lo));
  }, 0);
}

/** Do two footprints touch across a gap with at least MIN_OPEN metres of it free of walls? */
function opens(walls: Wall[], f: Rect, g: Rect): boolean {
  const test = (axis: "x" | "y", size: "w" | "h", cross: "y" | "x", crossSize: "h" | "w"): boolean => {
    const gap = Math.max(g[axis] - (f[axis] + f[size]), f[axis] - (g[axis] + g[size])); // < 0 means they overlap on this axis
    if (gap > GAP_MAX || gap < -GAP_MAX) return false;
    const lo = Math.max(f[cross], g[cross]);
    const hi = Math.min(f[cross] + f[crossSize], g[cross] + g[crossSize]);
    if (hi - lo < MIN_OPEN) return false;
    const at = g[axis] >= f[axis] ? (f[axis] + f[size] + g[axis]) / 2 : (g[axis] + g[size] + f[axis]) / 2;
    return hi - lo - covered(walls, axis, at, lo, hi) >= MIN_OPEN;
  };
  return test("x", "w", "y", "h") || test("y", "h", "x", "w");
}

/**
 * Footprints of every room on `levelId` that shares one open space with `room` (no wall between them): the hall, living room and kitchen of a flat are one volume.
 * A room's footprint includes its child areas (door thresholds, alcoves). Always contains `room`'s own footprint(s).
 */
export function openZone(plan: Parameters<typeof onLevel>[0], levelId: string, room: Room): Rect[] {
  const { rooms, walls: all } = onLevel(plan, levelId);
  const walls = shellWalls(all); // a garden fence between two rooms does not close them off
  const top = rooms.filter((r) => !r.parent);
  const feet = (r: Room): Rect[] => [r, ...rooms.filter((c) => c.parent === r.id)].map(({ x, y, w, h }) => ({ x, y, w, h }));
  const start = top.find((r) => r.id === (room.parent ?? room.id)) ?? room;
  const zone = [start];
  for (let i = 0; i < zone.length; i++) {
    for (const other of top) {
      if (zone.includes(other)) continue;
      if (feet(zone[i]).some((f) => feet(other).some((g) => opens(walls, f, g)))) zone.push(other);
    }
  }
  return zone.flatMap(feet);
}
