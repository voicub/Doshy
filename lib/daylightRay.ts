// "Does the sun reach this floor point?" for the day-lighting preview: a 2.5D ray test against the walls of every level (with their glazing cut out), the ceilings and the
// roof's overhang, and the neighbouring buildings. Pure: no React, no browser globals.
//
// What the model is, and where it stops (ponytail: a ray per floor cell and sun position; upgrade to a real shadow map only if rooms need sub-centimetre edges):
//  * a wall is a thin vertical rectangle on its centre line, from its level's floor up by its height; its thickness and the window reveals are ignored;
//  * a window passes the sun over its whole clear area (the frame and bars are not shaded); a door passes it only when it is glass or an open passage;
//  * glass walls and see-through fences (wire, bars, rails) pass the sun, every other fence, wall and hedge stops it below its height;
//  * every roofed room has a flat ceiling at its storey's wall height; the roof of a house adds the eave's overhang to the top storey's ceiling (the pitched part above is ignored);
//  * neighbours are prisms (their eaves height plus half the roof) on flat ground: hills, trees and the city model's meshes are not shaded.
import { wallHeight, isFence, isSeeThroughFence } from "./fences.ts";
import { WALL_H } from "./geometry.ts";
import { elevationOf, groundedWall, levelIdOf, sortedLevels } from "./levels.ts";
import { roofFootprint, roofOf } from "./roof.ts";
import { eaves, type PlanBuilding } from "./siteMeshPlan.ts";
import type { Opening, Plan, Wall } from "./types.ts";
import type { SunDir } from "./daylight.ts";

/** Height above the floor slab's top the sun is sampled at (m). */
export const SAMPLE_LIFT = 0.02;

/** A clear part of a panel: metres along it from its start, and absolute heights. */
type Span = { s0: number; s1: number; z0: number; z1: number };
/** One vertical rectangle that may stop the sun: a wall, a fence, or one side of a neighbouring building. */
export type Panel = { ax: number; ay: number; dx: number; dy: number; len: number; z0: number; z1: number; clear: readonly Span[] };
/** A horizontal ceiling: the sun cannot cross height `z` inside any of the rectangles. */
type Slab = { z: number; rects: readonly { x0: number; y0: number; x1: number; y1: number }[] };
export type SunScene = { panels: readonly Panel[]; slabs: readonly Slab[] };

/** A building that is not the plan's: its outline in plan axes and the heights its walls cover. */
export type Neighbour = { ring: readonly (readonly [number, number])[]; bottom: number; top: number };

/** A neighbour from the surroundings data (see lib/siteMeshPlan.ts): its walls to the eaves, plus half the roof's rise. */
export function neighbourOf(b: Pick<PlanBuilding, "height" | "minHeight" | "roofHeight"> & Pick<Neighbour, "ring">): Neighbour {
  const { top, bottom } = eaves(b);
  return { ring: b.ring, bottom, top: top + Math.max(0, b.roofHeight || 0) / 2 };
}

/** Door looks that let the sun through: glass doors, and the open archway / passage (no leaf). Every other door is solid. */
const CLEAR_DOORS: Record<string, true> = { slidingGlass: true, french: true, sidelight: true, arch: true, passage: true };

/** Does the sun pass through this opening's clear area? Windows always do (even frosted or glass block: they only soften it); a door only when it is glazed or open. */
export const lets = (o: Pick<Opening, "type" | "style">): boolean => o.type === "window" || (!!o.style && CLEAR_DOORS[o.style] === true);

function panelOf(plan: Plan, w: Wall): Panel | null {
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  if (len < 1e-6 || w.style === "glass" || isSeeThroughFence(w.style)) return null;
  const z0 = isFence(w.style) && groundedWall(plan, w) ? 0 : elevationOf(plan, levelIdOf(plan, w));
  const z1 = z0 + wallHeight(w, WALL_H);
  const clear: Span[] = plan.openings
    .filter((o) => o.wallId === w.id && lets(o))
    .map((o) => {
      const mid = o.t * len;
      return { s0: mid - o.width / 2, s1: mid + o.width / 2, z0: z0 + o.sill, z1: z0 + o.sill + o.height };
    });
  return { ax: w.a.x, ay: w.a.y, dx: w.b.x - w.a.x, dy: w.b.y - w.a.y, len, z0, z1, clear };
}

/** The sides of a neighbour as solid panels (a ray that enters the prism crosses one of them below its top, so the sides are all it takes). */
function sidesOf(n: Neighbour): Panel[] {
  const out: Panel[] = [];
  for (let i = 0; i < n.ring.length; i++) {
    const [ax, ay] = n.ring[i];
    const [bx, by] = n.ring[(i + 1) % n.ring.length];
    const len = Math.hypot(bx - ax, by - ay);
    if (len > 1e-6) out.push({ ax, ay, dx: bx - ax, dy: by - ay, len, z0: n.bottom, z1: n.top, clear: [] });
  }
  return out;
}

/** Everything that can stop the sun, built once per plan (and surroundings). */
export function buildScene(plan: Plan, neighbours: readonly Neighbour[] = []): SunScene {
  const panels = [...plan.walls.map((w) => panelOf(plan, w)).filter((p): p is Panel => !!p), ...neighbours.flatMap(sidesOf)];
  const levels = sortedLevels(plan);
  const top = levels.at(-1)?.id;
  const overhang = roofOf(plan)?.overhang ?? 0;
  const slabs = levels.map((l) => {
    const grow = l.id === top ? overhang : 0;
    const rects = roofFootprint(plan, l.id).map((r) => ({ x0: r.x - grow, y0: r.y - grow, x1: r.x + r.w + grow, y1: r.y + r.h + grow }));
    return { z: l.elevation + WALL_H, rects };
  });
  return { panels, slabs: slabs.filter((s) => s.rects.length) };
}

/** Is the ray from (px, py, pz) toward the sun stopped by this panel? (Cross products: the ray is P + s*u, the panel A + t*e.) */
function blocked(p: Panel, px: number, py: number, pz: number, sun: SunDir): boolean {
  const den = sun.ux * p.dy - sun.uy * p.dx;
  if (Math.abs(den) < 1e-9) return false; // running along the panel: grazing, treated as passing
  const qx = p.ax - px;
  const qy = p.ay - py;
  const s = (qx * p.dy - qy * p.dx) / den;
  if (s <= 1e-6) return false;
  const t = (qx * sun.uy - qy * sun.ux) / den;
  if (t < 0 || t > 1) return false;
  const z = pz + s * sun.slope;
  if (z < p.z0 || z > p.z1) return false;
  const along = t * p.len;
  for (const c of p.clear) if (along >= c.s0 && along <= c.s1 && z >= c.z0 && z <= c.z1) return false;
  return true;
}

/** Does direct sunlight reach the point? `panels` is the scene's list, or the shorter list `relevantPanels` made for this sun. */
export function sunReaches(panels: readonly Panel[], slabs: readonly Slab[], px: number, py: number, pz: number, sun: SunDir): boolean {
  if (sun.slope <= 0) return false;
  for (const sl of slabs) {
    if (pz >= sl.z) continue;
    const s = (sl.z - pz) / sun.slope;
    const x = px + s * sun.ux;
    const y = py + s * sun.uy;
    if (sl.rects.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)) return false;
  }
  return !panels.some((p) => blocked(p, px, py, pz, sun));
}

/**
 * The panels that can matter for ANY point of a disc (centre cx, cy; radius r) at height pz: not behind the disc, not wholly beside the sun's strip over it, and not
 * entirely above or below where the rays can be when they get there. The same list serves every floor cell of one sun position.
 */
export function relevantPanels(panels: readonly Panel[], cx: number, cy: number, r: number, pz: number, sun: SunDir): Panel[] {
  return panels.filter((p) => {
    const ax = p.ax - cx;
    const ay = p.ay - cy;
    const bx = ax + p.dx;
    const by = ay + p.dy;
    const sa = ax * sun.ux + ay * sun.uy; // along the sun's direction
    const sb = bx * sun.ux + by * sun.uy;
    if (Math.max(sa, sb) < -r) return false;
    const pa = ax * sun.uy - ay * sun.ux; // across it
    const pb = bx * sun.uy - by * sun.ux;
    if (Math.min(pa, pb) > r || Math.max(pa, pb) < -r) return false;
    if (p.z1 < pz + Math.max(0, Math.min(sa, sb) - r) * sun.slope) return false; // the ray is already over its top when it gets there
    return p.z0 <= pz + (Math.max(sa, sb) + r) * sun.slope; // ... or still under its bottom
  });
}
