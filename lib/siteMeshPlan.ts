// Buildings in plan axes: moved, cleaned, and chosen (which neighbours are drawn).
import { planBounds } from "./geometry.ts";
import { clamp } from "./mathUtil.ts";
import { pointInShape, polygonArea, polygonBounds, polygonCentroid, polygonOverlapsRect, signedArea, type Rect } from "./siteGeom.ts";
import { clean } from "./siteMeshBuf.ts";
import type { RoofShape, SiteBuilding, XY } from "./siteTypes.ts";
import type { Plan } from "./types.ts";

/** The building that holds the plan's flat is the owner's own block, which the plan already draws: not drawn unless this is true. */
const SHOW_HOST_BUILDING = false;
const MIN_AREA_M2 = 2;
/** Neighbours this close to (or inside) the plan's footprint are not drawn: their walls would cut through the flat or its garden. */
const HOST_MARGIN_M = 1.5;

export type PlanBuilding = {
  id: string;
  /** clockwise on screen (x east, z south); holes counter-clockwise */
  ring: XY[];
  holes: XY[][];
  height: number;
  minHeight: number;
  roof: RoofShape;
  roofHeight: number;
  roofColor?: string;
  wallColor?: string;
  kind: string;
};

/** The building moved into plan axes (`toPlan` = lib/geo.ts siteToPlan) and cleaned: no repeated points, outline clockwise, holes the other way. Null when it is no real polygon. */
export function planBuilding(b: SiteBuilding, toPlan: (p: XY) => XY): PlanBuilding | null {
  const outer = clean(b.ring.map(toPlan));
  if (!outer || polygonArea(outer) < MIN_AREA_M2) return null;
  const holes = (b.holes ?? []).map((h) => clean(h.map(toPlan))).filter((h): h is XY[] => !!h && polygonArea(h) > 0.5);
  const cw = (r: XY[]) => (signedArea(r) > 0 ? r : [...r].reverse());
  const ccw = (r: XY[]) => (signedArea(r) < 0 ? r : [...r].reverse());
  return { id: b.id, ring: cw(outer), holes: holes.map(ccw), height: b.height, minHeight: b.minHeight, roof: b.roof, roofHeight: b.roofHeight, roofColor: b.roofColor, wallColor: b.wallColor, kind: b.kind };
}

/** Wall height rules: metres from the ground to the eaves (never a sliver, never a skyscraper by a typo) and how far the walls are lifted (a bridge), always leaving two metres of wall. */
export function eaves(b: Pick<PlanBuilding, "height" | "minHeight">): { top: number; bottom: number } {
  const top = Number.isFinite(b.height) && b.height > 0 ? clamp(b.height, 2.4, 250) : 6;
  const bottom = Number.isFinite(b.minHeight) && b.minHeight > 0 ? clamp(b.minHeight, 0, top - 2) : 0;
  return { top, bottom };
}

/**
 * Everything the plan occupies, in plan axes: the building's walls, every level's rooms and the ground areas (patios, lawns, drives), turned as they are.
 * Null for an empty plan. Unlike `homeRect` it is not snapped: it is what a neighbour must not overlap.
 */
export function planFootprint(plan: Plan): Rect | null {
  const pts: XY[] = [];
  const b = planBounds(plan);
  if (b) pts.push([b.x0, b.y0], [b.x1, b.y1]);
  for (const r of plan.rooms) pts.push([r.x, r.y], [r.x + r.w, r.y + r.h]);
  for (const g of plan.ground ?? []) {
    const a = ((g.rot ?? 0) * Math.PI) / 180;
    const [hw, hh] = [g.w / 2, g.h / 2];
    const ex = Math.abs(hw * Math.cos(a)) + Math.abs(hh * Math.sin(a)); // half-extent of the turned rectangle
    const ey = Math.abs(hw * Math.sin(a)) + Math.abs(hh * Math.cos(a));
    pts.push([g.x + hw - ex, g.y + hh - ey], [g.x + hw + ex, g.y + hh + ey]);
  }
  return pts.length ? polygonBounds(pts) : null;
}

/** Is this a block the plan stands on or in? It holds the plan's home point(s) or touches its footprint (plus HOST_MARGIN_M): the plan draws the flat, so it is not drawn. */
export function isHostBuilding(b: Pick<PlanBuilding, "ring" | "holes">, footprint: Rect | null, homes: readonly XY[]): boolean {
  if (homes.some((p) => pointInShape(p, b.ring, b.holes))) return true;
  if (!footprint) return false;
  const m = HOST_MARGIN_M;
  const near = { x0: footprint.x0 - m, y0: footprint.y0 - m, x1: footprint.x1 + m, y1: footprint.y1 + m };
  const bb = polygonBounds(b.ring);
  if (bb.x1 < near.x0 || bb.x0 > near.x1 || bb.y1 < near.y0 || bb.y0 > near.y1) return false;
  return polygonOverlapsRect(b.ring, near);
}

/** The buildings to draw: not the host, within `radius` of `at`, the nearest `max`. */
export function selectBuildings(all: readonly PlanBuilding[], opts: { footprint: Rect | null; homes: readonly XY[]; at: XY; radius: number; max: number; showHost?: boolean }): PlanBuilding[] {
  const keep: { b: PlanBuilding; d: number }[] = [];
  for (const b of all) {
    if (!(opts.showHost ?? SHOW_HOST_BUILDING) && isHostBuilding(b, opts.footprint, opts.homes)) continue;
    const c = polygonCentroid(b.ring);
    const d = Math.hypot(c[0] - opts.at[0], c[1] - opts.at[1]);
    if (d <= opts.radius) keep.push({ b, d });
  }
  return keep.sort((p, q) => p.d - q.d).slice(0, opts.max).map((k) => k.b);
}
