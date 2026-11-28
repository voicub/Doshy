import type { PointerEvent as RPE } from "react";
import { create } from "zustand";
import { addFenceLine, drawnPathFields } from "@/lib/lineDraw";
import { distinctPoints } from "@/lib/lineGeometry";
import { lightKindOf, pathKindOf } from "@/lib/lineKinds";
import { addLampsAlong } from "@/lib/lineLights";
import { activeLevelId, useStore } from "@/lib/store";
import type { Pt } from "@/lib/types";
import { uid } from "@/lib/uid";
import { useLinesUi } from "./linesUi";
import type { PlanPoint } from "./usePlanPoint";

/** The points of the line being clicked out with the Garden lines tool (never saved, never undone). */
type Draft = { points: Pt[]; set: (points: Pt[]) => void };
export const useLinesDraft = create<Draft>((set) => ({ points: [], set: (points) => set({ points }) }));

const draft = () => useLinesDraft.getState();
const ENDS_SNAP = 0.3; // a road or walkway point lands on the end of another path this close, so they join

/** Where a click lands: fences snap like walls (wall ends and the grid); everything else snaps to the grid and then to the ends of existing paths (Alt: free). */
export function linesPoint(point: PlanPoint, e: RPE): Pt {
  if (useLinesUi.getState().family === "fence") return point.wallPoint(e);
  const at = point.toPlan(e);
  if (e.altKey) return at;
  const raw = point.rawPt(e);
  let best: Pt | null = null;
  let bd = ENDS_SNAP;
  for (const p of useStore.getState().plan.paths ?? [])
    for (const q of [p.points[0], p.points[p.points.length - 1]]) {
      const d = Math.hypot(q.x - raw.x, q.y - raw.y);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
  return best ?? at;
}

/** Pointer down (or a finger lifting) with the tool: one more point on the line. */
export const linesDown = (at: Pt) => draft().set([...draft().points, at]);

/** Drop the line being drawn (the tool was left). */
export const linesCancel = () => draft().set([]);

/**
 * Finish the line (double-click, Enter, Esc, right click, the strip's Done): by family a road or walkway path, a chain of fence walls, or lamps along it.
 * Fewer than two distinct points make nothing. The tool then returns to Select, with the road or the first fence wall selected, as one undo step.
 */
export function linesFinish(gesture: { begin: () => void; end: () => void }) {
  const points = distinctPoints(draft().points);
  draft().set([]);
  if (points.length < 2) return;
  const ui = useLinesUi.getState();
  const store = useStore.getState();
  const level = activeLevelId(store);
  gesture.begin();
  if (ui.family === "road" || ui.family === "walkway") {
    const kind = pathKindOf(ui.pathKind);
    if (kind) store.addPath({ points, ...drawnPathFields(kind, ui.width, ui.options), ...(ui.smooth ? { smooth: true } : {}) }); // selects the path and returns to Select
  } else if (ui.family === "fence") {
    const made: string[] = [];
    const newId = () => {
      const id = uid();
      made.push(id);
      return id;
    };
    store.editPlan((p) => addFenceLine(p, points, ui.fence, level, newId));
    store.setTool("select");
    if (made[0]) store.select({ type: "wall", id: made[0] });
  } else {
    const kind = lightKindOf(ui.light);
    if (kind) store.editPlan((p) => addLampsAlong(p, points, { ...kind, spacing: ui.spacing }, { level, face: ui.face, newId: uid }));
    store.setTool("select");
  }
  gesture.end();
}
