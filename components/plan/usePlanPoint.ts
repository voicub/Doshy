import type { PointerEvent as RPE, RefObject } from "react";
import { snapPillar } from "@/lib/pillars";
import { clamp } from "@/lib/mathUtil";
import type { View } from "@/lib/planView";
import type { Pt } from "@/lib/types";
import { lvPlan } from "./levelPlan";
import { gsnap, planGrid, type Ptr } from "./planPoint";

const LIMIT = 100; // the pointer is clamped to +-100 m, far outside any flat
const ENDPOINT_SNAP = 0.2; // a wall end being drawn or dragged snaps to an existing wall end this close
const FINGER_REACH_PX = 18; // a finger cannot hit a wall end exactly: it reaches this many px

export type PlanPoint = {
  capture: (e: RPE) => void;
  /** The exact pointer in plan metres. */
  rawPt: (e: RPE | PointerEvent) => Pt;
  /** The pointer snapped to the grid for the modifier keys (or the given grid). */
  toPlan: (e: RPE, grid?: number) => Pt;
  ptrOf: (e: RPE) => Ptr;
  wallPoint: (e: RPE, skip?: (q: Pt) => boolean) => Pt;
  pillarPoint: (e: RPE, p?: Pt) => Pt;
};

type Args = { svg: RefObject<SVGSVGElement | null>; viewRef: { current: View }; px: number; touch: number };

/** Turns pointer events into plan points: exact, grid-snapped, joined to wall ends, or placed as a pillar. */
export function usePlanPoint({ svg, viewRef, px, touch }: Args): PlanPoint {
  const capture = (e: RPE) => svg.current?.setPointerCapture(e.pointerId);
  const rawPt = (e: RPE | PointerEvent): Pt => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: viewRef.current.cx, y: viewRef.current.cy }; // not laid out: the view centre
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: clamp(p.x, -LIMIT, LIMIT), y: clamp(p.y, -LIMIT, LIMIT) };
  };
  const toPlan = (e: RPE, grid = planGrid(e)): Pt => {
    const p = rawPt(e);
    return { x: gsnap(p.x, grid), y: gsnap(p.y, grid) };
  };
  const ptrOf = (e: RPE): Ptr => ({ ...rawPt(e), shiftKey: e.shiftKey, altKey: e.altKey });
  /** Wall corners join exactly: a wall end being drawn or dragged locks onto a nearby wall end (not one in `skip`) unless Alt is held. */
  const wallPoint = (e: RPE, skip?: (q: Pt) => boolean): Pt => {
    if (!e.altKey) {
      const r = rawPt(e);
      let best: Pt | null = null;
      let bd = Math.max(ENDPOINT_SNAP, touch > 1 ? FINGER_REACH_PX * px : 0);
      for (const w of lvPlan().walls)
        for (const q of [w.a, w.b]) {
          const d = Math.hypot(q.x - r.x, q.y - r.y);
          if (d < bd && !skip?.(q)) {
            bd = d;
            best = q;
          }
        }
      if (best) return best;
    }
    return toPlan(e);
  };
  /** A pillar dragged or dropped here: on the grid, then locked onto wall ends and wall lines (Alt: exactly under the pointer). */
  const pillarPoint = (e: RPE, p: Pt = rawPt(e)): Pt => snapPillar(p, lvPlan().walls, planGrid(e), !e.altKey);
  return { capture, rawPt, toPlan, ptrOf, wallPoint, pillarPoint };
}
