import type { PointerEvent as RPE, RefObject } from "react";
import type { Tool } from "@/lib/store";
import type { View } from "@/lib/planView";
import type { GroundCtx } from "./groundTool";
import type { Gesture } from "./useGesture";
import type { PlanPoint } from "./usePlanPoint";

/** What the plan canvas's pointer handlers need to know about the editor at this render. */
export type PointerEnv = {
  svg: RefObject<SVGSVGElement | null>;
  tool: Tool;
  activeLevel: string;
  /** Metres per screen pixel. */
  px: number;
  /** How far from a wall a tap still lands on it (metres). */
  reach: number;
  g: Gesture;
  point: PlanPoint;
  viewRef: { current: View };
  /** Cleared whenever the user pans or zooms: the view then stops following the bars. */
  autoFrame: { current: boolean };
  setView: (v: View) => void;
};

/** One pointer event as the Garden tool sees it. */
export const groundCtx = ({ g, point }: PointerEnv, e: RPE): GroundCtx => ({
  at: point.toPlan(e),
  raw: point.rawPt(e),
  shift: e.shiftKey,
  alt: e.altKey,
  capture: () => point.capture(e),
  begin: g.begin,
  end: g.end,
});
