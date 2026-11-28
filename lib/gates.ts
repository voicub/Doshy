import { wallHeight } from "./fences.ts";
import { WALL_H, wallLen } from "./geometry.ts";
import type { Opening, OpeningStyle, Wall } from "./types.ts";

export type GateKind = "garden" | "driveway";
/** The two gates the inspector offers on a fence: a walk-through gate, and a wide one a car fits through (same swing-gate look, just wider). */
export const GATE_KINDS: Record<GateKind, { label: string; style: OpeningStyle; width: number; height: number }> = {
  garden: { label: "Add a gate", style: "gate", width: 1.0, height: 1.2 },
  driveway: { label: "Add a driveway gate", style: "gate", width: 3.0, height: 1.4 },
};

const EPS = 1e-6;

/**
 * A new gate for a fence wall, as the opening to hand to the store: sill 0, never taller than the fence, centred on the wall or, when something
 * already hangs there, in the free stretch nearest the middle. Null when no free stretch is wide enough.
 */
export function gateFor(wall: Wall, openings: readonly Opening[], kind: GateKind): Omit<Opening, "id"> | null {
  const { style, width, height } = GATE_KINDS[kind];
  const len = wallLen(wall);
  const taken = openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => [o.t * len - o.width / 2, o.t * len + o.width / 2] as const)
    .sort((a, b) => a[0] - b[0]);
  const centres: number[] = [];
  let from = 0;
  const consider = (a: number, b: number) => {
    if (b - a >= width - EPS) centres.push(Math.min(Math.max(len / 2, a + width / 2), b - width / 2));
  };
  for (const [a, b] of taken) {
    consider(from, a);
    from = Math.max(from, b);
  }
  consider(from, len);
  const best = centres.sort((a, b) => Math.abs(a - len / 2) - Math.abs(b - len / 2))[0];
  if (best === undefined) return null;
  return { wallId: wall.id, type: "door", style, t: best / len, width, sill: 0, height: Math.min(height, wallHeight(wall, WALL_H)) };
}
