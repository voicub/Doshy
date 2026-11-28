// Cut-away neighbours: how much of its height a building keeps by its distance from the plan.
import { WALL_CUT_H } from "./geometry.ts";
import { pointInShape, type Rect } from "./siteGeom.ts";
import { smooth } from "./siteMeshBase.ts";
import { rectDistance } from "./siteMeshGround.ts";
import type { XY } from "./siteTypes.ts";

/** With Cut-away on, a neighbour within this many metres of the plan is lowered all the way to the cut-wall height ... */
export const CUT_NEAR_M = 15;
/** ... and from this distance on it stands at its real height; in between it grows back smoothly. */
export const CUT_FAR_M = 45;

/** 0 up to CUT_NEAR_M (fully cut), 1 from CUT_FAR_M (untouched), smooth and rising in between. */
export const cutFactor = (distance: number): number => smooth((distance - CUT_NEAR_M) / (CUT_FAR_M - CUT_NEAR_M));

/** The share of its real height (above the ground) a building of `fullH` metres keeps while cut away, `distance` metres from the plan: WALL_CUT_H at most CUT_NEAR_M away. */
export function cutKeep(distance: number, fullH: number): number {
  const low = fullH > WALL_CUT_H ? WALL_CUT_H / fullH : 1;
  return low + (1 - low) * cutFactor(distance);
}

/** Distance (m) from the outline to a rectangle: 0 when they touch or one holds the other. */
export function ringRectDistance(ring: readonly XY[], rect: Rect): number {
  if (!ring.length) return Infinity;
  if (pointInShape([(rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2], ring, [])) return 0;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const at = (t: number) => rectDistance(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, rect);
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 40; k++) { // the distance to a convex set is convex along a line: a ternary search finds the nearest point of the edge
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (at(m1) < at(m2)) hi = m2;
      else lo = m1;
    }
    best = Math.min(best, at((lo + hi) / 2), at(0), at(1));
  }
  return best;
}

/**
 * Floats per vertex of a cut-away attribute: the height scale of the cut volume, the ground height, the walls' texture v at the ground, and the building's bearing
 * from the centre of the plan (radians, `bearingOf`, the camera azimuth's convention) for the automatic Cut-away.
 */
export const CUT_STRIDE = 4;

/**
 * Automatic Cut-away (Cut-away off): a neighbour is lowered only while it stands between the camera and the plan. `facingShare` is how much of its cut it takes:
 * 0 for one at the side or behind the plan, 1 for one on the camera's side, smooth in between. The shader mirrors it (siteShader.ts, FACE_FROM / FACE_TO).
 */
export const FACE_FROM = 0.1;
export const FACE_TO = 0.6;
export const facingShare = (bearing: number, azimuth: number): number => smooth((Math.cos(bearing - azimuth) - FACE_FROM) / (FACE_TO - FACE_FROM));

/** Bearing (radians round y from +z, like the camera azimuth) of `to` seen from `from`, both in plan metres. */
export const bearingOf = (from: XY, to: XY): number => Math.atan2(to[0] - from[0], to[1] - from[1]);

/** Centre of a rectangle. */
export const rectCentre = (r: Rect): XY => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
