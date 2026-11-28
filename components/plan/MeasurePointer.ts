import { useEffect, useMemo, useRef, type PointerEvent as RPE } from "react";
import { snapPoint, snapPoints, type Snapped } from "@/lib/measureSnap";
import type { Plan, Pt } from "@/lib/types";
import { planGrid } from "./planPoint";

type Ev = RPE<SVGRectElement>;

export type LayerHandlers = {
  /** A finger acts when it lifts, at the lift point (so it can slide to adjust); a mouse acts on press. Drags (`drag`, `release`) always start on the press. */
  defer: boolean | ((p: Pt) => boolean);
  /** The pointer moved with nothing pressed (a mouse), or a finger that has not lifted yet. */
  hover?: (p: Pt, e: Ev) => void;
  press: (p: Pt, e: Ev) => void;
  drag?: (p: Pt, e: Ev) => void;
  release?: (p: Pt, e: Ev) => void;
  /** A second finger arrived or the browser took the pointer away: drop what was started. */
  cancel?: () => void;
  leave?: () => void;
};

/** The pointer in plan metres, through the SVG's own screen matrix (the same conversion usePlanPoint.rawPt does). Null before layout. */
function pointAt(e: Ev): Pt | null {
  const m = e.currentTarget.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

/** The handler props to spread onto the layer's <rect>. */
export type LayerPointer = {
  onPointerDown: (e: Ev) => void;
  onPointerMove: (e: Ev) => void;
  onPointerUp: (e: Ev) => void;
  onPointerCancel: (e: Ev) => void;
  onPointerLeave: () => void;
};

/**
 * Pointer handlers for a full-view transparent <rect> inside the plan SVG: a self-contained tool layer. The events stop here, so the plan's own tool handlers
 * do not also fire. Space and middle-button panning and pinch zoom are capture-phase handlers on the SVG and run first. A second finger cancels the first.
 */
export function useLayerPointer(h: LayerHandlers): LayerPointer {
  const live = useRef(h);
  live.current = h;
  const s = useRef({ fingers: new Set<number>(), deferred: null as number | null, pressed: false, dead: false });

  const onPointerDown = (e: Ev) => {
    if (e.button !== 0) return; // right and middle buttons keep their jobs (context menu, pan)
    e.stopPropagation();
    const p = pointAt(e);
    const st = s.current;
    if (!p) return;
    if (e.pointerType === "touch") {
      st.fingers.add(e.pointerId);
      if (st.fingers.size > 1) {
        st.dead = true; // a pinch: nothing is placed until every finger is up
        st.deferred = null;
        if (st.pressed) live.current.cancel?.();
        st.pressed = false;
        return;
      }
      st.dead = false;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const defer = typeof live.current.defer === "function" ? live.current.defer(p) : live.current.defer;
    if (e.pointerType === "touch" && defer) {
      st.deferred = e.pointerId;
      live.current.hover?.(p, e);
      return;
    }
    st.pressed = true;
    live.current.press(p, e);
  };

  const onPointerMove = (e: Ev) => {
    e.stopPropagation();
    const p = pointAt(e);
    const st = s.current;
    if (!p || st.dead) return;
    if (st.pressed) live.current.drag?.(p, e);
    else if (e.pointerType !== "touch" || st.deferred === e.pointerId) live.current.hover?.(p, e);
  };

  const finish = (e: Ev, cancelled: boolean) => {
    e.stopPropagation();
    const st = s.current;
    const p = pointAt(e);
    if (e.pointerType === "touch") st.fingers.delete(e.pointerId);
    if (!st.fingers.size) st.dead = false;
    if (st.deferred === e.pointerId) {
      st.deferred = null;
      if (!cancelled && !st.dead && p) live.current.press(p, e);
    } else if (st.pressed) {
      st.pressed = false;
      if (cancelled || !p) live.current.cancel?.();
      else live.current.release?.(p, e);
    }
  };

  return { onPointerDown, onPointerMove, onPointerUp: (e: Ev) => finish(e, false), onPointerCancel: (e: Ev) => finish(e, true), onPointerLeave: () => live.current.leave?.() };
}

const SNAP_PX = 10; // a mouse locks onto a corner this many screen pixels away
const SNAP_PX_TOUCH = 18; // a finger cannot aim better than this

/** A click's snap: corners, wall ends and room corners within a few pixels, else the grid (Shift: coarser), and Alt means exactly there. */
export function useSnap(plan: Plan, px: number, touch: number) {
  const pts = useMemo(() => snapPoints(plan.walls, plan.rooms), [plan.walls, plan.rooms]);
  return (raw: Pt, e: { altKey: boolean; shiftKey: boolean }): Snapped => snapPoint(raw, pts, { radius: Math.max(0.05, (touch > 1 ? SNAP_PX_TOUCH : SNAP_PX) * px), grid: planGrid(e), free: e.altKey });
}

type Keys = {
  /** Is something half done (a first point, a polygon, a held ghost)? Esc and the strip's Done drop it before they do anything else. */
  pending: () => boolean;
  cancel: () => void;
  /** Enter and the strip's Done: finish what is being drawn (close the polygon). True when it did something. */
  finish?: () => boolean;
};

const typing = (e: KeyboardEvent) => e.target instanceof Element && e.target.matches("input,select,textarea");

/**
 * Esc cancels a half-placed measure or annotation, Enter and the strip's Done (`housey:finish-draw`) finish it. They run before the plan's own keys (capture phase) and
 * stop there when they used the key; with nothing half done the plan's keys go on to leave the tool as usual.
 */
export function useFinishKeys(keys: Keys) {
  const live = useRef(keys);
  live.current = keys;
  useEffect(() => {
    const take = (e: Event) => {
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey) return;
      const k = live.current;
      if (e.key === "Escape" && k.pending()) {
        k.cancel();
        take(e);
      } else if (e.key === "Enter" && k.finish?.()) take(e);
    };
    const onDone = (e: Event) => {
      const k = live.current;
      if (k.finish?.()) take(e);
      else if (k.pending()) {
        k.cancel();
        take(e);
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("housey:finish-draw", onDone, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("housey:finish-draw", onDone, true);
    };
  }, []);
}
