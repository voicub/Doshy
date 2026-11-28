// "Does it fit here?": a piece of furniture held over a plan, checked against the walls, the furniture already there, the walkway and the doors.
// The verdict is green (fits), amber (tight) or red (does not fit), with the one sentence that says why. Pure: the node test runner loads this file directly.
import { convexOverlap, polyGap, sectorPoly, type Gap, type Poly } from "./fitGeom.ts";
import { corners, doorSwing, wallSlab, type Footprint } from "./placement.ts";
import { formatGap } from "./measure.ts";
import type { Opening, Pt, Wall } from "./types.ts";

/** Walkway widths the chips offer (m). */
export const WALKWAYS = [0.6, 0.7, 0.8, 0.9] as const;
export const DEFAULT_WALKWAY = 0.8;
/** A gap narrower than this is a slot nobody walks into (dead space behind a wardrobe, a piece against a wall), not a passage: it is never "too tight". ponytail: one number for every room, make it a setting if someone needs to store a pram in a 15 cm slot. */
export const SLOT = 0.2;
/** A piece within this of a wall can be pulled flush against it. */
export const FLUSH_REACH = 0.05;

/** What stops a piece: a wall or a piece of furniture. */
export type Obstacle = { id: string; label: string; wall: boolean; poly: Poly };
/** The quarter disc an existing door sweeps, with the tag the plan shows for it ("D2"). */
export type DoorZone = { id: string; label: string; poly: Poly };
/** Doors on the piece itself: they open outward over a rectangle `depth` deep in front of it. */
export type Swing = { depth: number };

export type Verdict = {
  level: "ok" | "tight" | "blocked";
  text: string;
  /** The gap the verdict is about (the tight one, else the nearest): drawn as a line with its length. */
  gap: Gap | null;
  /** The area the piece's own doors need, when it has doors. */
  swing: Poly | null;
};

export type FitInput = { ghost: Footprint; obstacles: readonly Obstacle[]; doors: readonly DoorZone[]; walkway: number; swing: Swing | null };

/** Wall slabs as obstacles. */
export const wallObstacles = (walls: readonly Wall[]): Obstacle[] => walls.map((w) => ({ id: w.id, label: "wall", wall: true, poly: wallSlab(w) }));

/** The sector an open door sweeps: hinged at its hinge end, radius = its width, on its swing side (placement.ts `doorSwing`'s convention). */
export function doorSector(o: Pick<Opening, "t" | "width" | "hinge" | "swing">, w: Wall): Poly {
  const sw = doorSwing(o, w);
  const toJamb = { x: (sw.arcStart.x - sw.hinge.x) / o.width, y: (sw.arcStart.y - sw.hinge.y) / o.width };
  return sectorPoly(sw.hinge, toJamb, sw.normal, o.width);
}

/** Unit vector of the front of a piece turned `rot` degrees (placement.ts: the front is local +z). */
const frontOf = (rot: number): Pt => ({ x: -Math.sin((rot * Math.PI) / 180), y: Math.cos((rot * Math.PI) / 180) });

/** The rectangle in front of the piece its own doors sweep (generous: a rectangle, not two quarter discs). */
export function swingArea(f: Footprint, s: Swing): Poly {
  const n = frontOf(f.rot);
  const reach = f.d / 2 + s.depth / 2;
  return corners({ x: f.x + n.x * reach, y: f.y + n.y * reach, w: f.w, d: s.depth, rot: f.rot });
}

/** Do wardrobes, cabinets and cupboards open outward? Doors as wide as a double door (80 cm and up) are two leaves, so each swings half the width. */
export function defaultSwing(kind: string, label: string, w: number): Swing | null {
  if (!/wardrobe|cabinet|cupboard/i.test(`${kind} ${label}`)) return null;
  return { depth: w >= 0.8 ? w / 2 : w };
}

const near = (list: readonly Obstacle[], poly: Poly) => list.find((o) => convexOverlap(poly, o.poly));
const the = (o: Obstacle) => (o.wall ? "wall" : o.label);

/** The verdict for a piece standing at `ghost`. Order: overlap, blocks a door, its own doors blocked, too tight, fits. */
export function fitVerdict({ ghost, obstacles, doors, walkway, swing }: FitInput): Verdict {
  const poly = corners(ghost);
  const area = swing ? swingArea(ghost, swing) : null;
  const gaps = obstacles.map((o) => ({ o, g: polyGap(poly, o.poly) })).sort((a, b) => a.g.dist - b.g.dist);
  const nearest = gaps[0]?.g ?? null;
  const verdict = (level: Verdict["level"], text: string, gap: Gap | null = nearest): Verdict => ({ level, text, gap, swing: area });
  const hit = near(obstacles, poly);
  if (hit) return verdict("blocked", `Does not fit: it overlaps the ${the(hit)}`, null);
  const door = doors.find((d) => convexOverlap(poly, d.poly));
  if (door) return verdict("blocked", `Blocks the swing of door ${door.label}`, null);
  const stuck = area && near(obstacles, area);
  if (stuck) return verdict("blocked", `Its doors cannot open: the ${the(stuck)} is in the way`, null);
  const tight = gaps.find((x) => x.g.dist >= SLOT && x.g.dist < walkway);
  if (tight) return verdict("tight", `Too tight: ${formatGap(tight.g.dist)} to the ${the(tight.o)}`, tight.g);
  if (!gaps[0]) return verdict("ok", "Fits");
  const first = gaps[0];
  return verdict("ok", first.g.dist < 0.01 ? `Fits, against the ${the(first.o)}` : `Fits, ${formatGap(first.g.dist)} to the ${the(first.o)}`);
}

/** The piece pulled flush against a wall when it stands within `reach` of one (twice, for a corner); otherwise where it was. */
export function snapFlush(f: Footprint, walls: readonly Wall[], reach = FLUSH_REACH): Footprint {
  let at = f;
  for (let pass = 0; pass < 2; pass++) {
    let best: Gap | null = null;
    for (const w of walls) {
      const g = polyGap(corners(at), wallSlab(w));
      if (g.dist > 1e-6 && g.dist <= reach && (!best || g.dist < best.dist)) best = g;
    }
    if (!best) break;
    at = { ...at, x: at.x + best.to.x - best.from.x, y: at.y + best.to.y - best.from.y };
  }
  return at;
}
