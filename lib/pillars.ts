import { CATALOG, isPillar } from "./catalog.ts";
import { snapTo } from "./editMath.ts";
import { findLevel, SLAB_T } from "./levels.ts";
import type { Item, Plan, Pt, Wall } from "./types.ts";

/** What the Pillar tool can drop: a kind of the catalog (`Def.pillar`) at a chosen footprint (w and d in metres; absent = the def's own size). */
export type PillarPreset = { id: string; label: string; kind: string; w?: number; d?: number };

export const PILLAR_PRESETS: readonly PillarPreset[] = [
  { id: "sq30", label: "Square 30 cm", kind: "column", w: 0.3, d: 0.3 },
  { id: "sq40", label: "Square 40 cm", kind: "column", w: 0.4, d: 0.4 },
  { id: "rd30", label: "Round 30 cm", kind: "column_round", w: 0.3, d: 0.3 },
  { id: "rd40", label: "Round 40 cm", kind: "column_round", w: 0.4, d: 0.4 },
  { id: "wide", label: "Wide column 55 x 55", kind: "column" },
  { id: "riser", label: "Plumbing riser", kind: "bt_water_column" },
];

/** Round pillars are drawn as circles in the plan (the 3D part is a cylinder). Round stairs and other solid parts keep their rectangle. */
export const isRoundPillar = (kind: string) => !!CATALOG[kind]?.pillar && CATALOG[kind].parts[0]?.shape === "cyl";

/** Kind of the same pillar in the other shape: Square -> `column`, Round -> `column_round`. */
export const shapeKind = (round: boolean) => (round ? "column_round" : "column");

/** Smallest pillar side (m). */
export const MIN_PILLAR = 0.1;

/** Height of a pillar that spans its storey: the level's wall height (floor-to-floor minus the slab). */
export const fullHeight = (plan: Pick<Plan, "levels">, levelId: string | undefined) => Math.round((findLevel(plan, levelId).height - SLAB_T) * 100) / 100;

/**
 * Can this view select this item? Plan mode owns pillars (columns, risers) and nothing else of the items;
 * Furniture and Home Assistant modes own every item except pillars. Live selects nothing.
 */
export function viewPicksItem(view: string, kind: string): boolean {
  if (view === "plan") return isPillar(kind);
  return (view === "furniture" || view === "ha") && !isPillar(kind);
}

const END_REACH = 0.2; // a pillar this close to a wall end locks onto it
const LINE_REACH = 0.12; // ... and this close to a wall's centre line onto the line

/**
 * Where a pillar dragged or dropped near `p` lands: on the grid (`grid` 0 = free), then, when `walls` is on, locked onto the end of a wall
 * (a corner) or onto the centre line of a wall (a column in the facade) when one is within reach. Walls are the active level's.
 */
export function snapPillar(p: Pt, walls: Wall[], grid: number, lockWalls = true): Pt {
  const g = { x: snapTo(p.x, grid), y: snapTo(p.y, grid) };
  if (!lockWalls) return g;
  let best: Pt | null = null;
  let bd = END_REACH;
  for (const w of walls)
    for (const q of [w.a, w.b]) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) [best, bd] = [q, d];
    }
  if (best) return { x: best.x, y: best.y };
  bd = LINE_REACH;
  for (const w of walls) {
    const [dx, dy] = [w.b.x - w.a.x, w.b.y - w.a.y];
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) continue;
    const t = Math.min(1, Math.max(0, ((g.x - w.a.x) * dx + (g.y - w.a.y) * dy) / len2));
    const c = { x: w.a.x + dx * t, y: w.a.y + dy * t };
    const d = Math.hypot(c.x - g.x, c.y - g.y);
    if (d < bd) [best, bd] = [c, d];
  }
  return best ?? g;
}

/** Size of a pillar dragged by a corner handle: the pointer's offset from the centre in the pillar's own axes, doubled (the centre stays), snapped, never below the minimum. A round pillar stays a circle. */
export function resizePillar(centre: Pt, rot: number, p: Pt, grid: number, round: boolean): { w: number; d: number } {
  const a = (rot * Math.PI) / 180;
  const [dx, dy] = [p.x - centre.x, p.y - centre.y];
  const lx = Math.abs(dx * Math.cos(a) + dy * Math.sin(a));
  const ly = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
  const side = (v: number) => Math.max(MIN_PILLAR, snapTo(2 * v, grid));
  return round ? { w: side(Math.max(lx, ly)), d: side(Math.max(lx, ly)) } : { w: side(lx), d: side(ly) };
}

/** The plan with a pillar of `preset` added on `levelId` at `at`, as tall as the storey. */
export function addPillar(plan: Plan, levelId: string, preset: PillarPreset, at: Pt, id: string): Plan {
  const def = CATALOG[preset.kind];
  if (!def?.pillar) return plan;
  const item: Item = { id, kind: preset.kind, x: at.x, y: at.y, rot: 0, w: preset.w ?? def.w, d: preset.d ?? def.d, h: fullHeight(plan, levelId), level: levelId };
  return { ...plan, items: [...plan.items, item] };
}
