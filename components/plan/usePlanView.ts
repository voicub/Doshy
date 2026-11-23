import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { FRAME_PAD, FRAME_PAD_TINY, fitViewFree, growTo, rectOf, selBounds, type View } from "@/lib/planView";
import type { Sel } from "@/lib/types";
import { freeArea, panToFree, type Box } from "@/lib/viewInset";
import { useBarInsets, useFreeArea } from "../scene/edit/useFreeArea";
import { levelBounds, lvPlan } from "./levelPlan";
import type { PlanActions } from "./usePlanKeys";

const HINT_H = 40; // the edit strip's one-line hint covers this much of the bottom of the free area
const clearOfHint = (f: Box): Box => ({ ...f, y1: Math.max(f.y1 - HINT_H, f.y0 + (f.y1 - f.y0) / 2) });
const START_SIZE = { w: 1000, h: 625 }; // until the canvas has been measured
const GROW_MARGIN = 0.5; // metres of air a grown view keeps around the plan

type Args = {
  svg: RefObject<SVGSVGElement | null>;
  /** The editor's own actions; `finish` and `fit` run when the level changes. */
  live: MutableRefObject<PlanActions>;
  activeLevel: string;
  /** Compact screens (tiny and small classes): frame in what the bars leave free. */
  tiny: boolean;
  sel: Sel;
  /** A pointer gesture is open (drag, a wall or room being drawn, a garden tool in progress): the view must not move under it. */
  gestureActive: boolean;
  /** A wall, room, opening, pillar or stairs opening is being dragged. */
  dragActive: boolean;
};

/** The plan canvas's camera: its measured size, the view (centre and zoom), the free area between the bars, and the rules that keep the plan framed. */
export function usePlanView({ svg, live, activeLevel, tiny, sel, gestureActive, dragActive }: Args) {
  const [size, setSize] = useState(START_SIZE);
  const [view, setView] = useState<View>(() => fitViewFree(levelBounds(), START_SIZE.w, START_SIZE.h, { x0: 0, y0: 0, x1: START_SIZE.w, y1: START_SIZE.h }));
  const viewRef = useRef(view);
  viewRef.current = view;
  const autoFrame = useRef(true); // the view is still the one we framed ourselves: it follows the bars; any pan or zoom of the user's own turns this off
  const lastBounds = useRef(levelBounds());
  const bars = useBarInsets();
  const { free, panel } = useFreeArea(size.w, size.h);
  const barFree = useMemo(() => freeArea(size.w, size.h, bars), [size.w, size.h, bars]);

  const fit = () => {
    autoFrame.current = true;
    setView(fitViewFree(levelBounds(), size.w, size.h, tiny ? clearOfHint(free) : free, tiny ? FRAME_PAD_TINY : FRAME_PAD));
  };

  useEffect(() => {
    live.current.finish();
    live.current.fit();
  }, [activeLevel]);

  // Measure the canvas so the view always has the screen's aspect ratio: zoom and pan maths stay exact.
  useLayoutEffect(() => {
    const el = svg.current;
    if (!el) return;
    let first = true;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      setSize({ w, h });
      if (first) {
        first = false;
        setView(fitViewFree(levelBounds(), w, h, { x0: 0, y0: 0, x1: w, y1: h }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [svg]);

  // When the flat grows past the visible area (a room dragged outward), widen the view to include it. Never shrinks, and never touches a view the user zoomed into.
  const b = levelBounds();
  const boundsKey = b ? `${b.x0},${b.y0},${b.x1},${b.y1}` : "";
  useEffect(() => {
    if (gestureActive) return;
    const prev = lastBounds.current;
    lastBounds.current = b;
    if (!prev || !b) return;
    const a = size.w / size.h;
    if (growTo(viewRef.current, prev, a, 0)) return; // the previous bounds were not fully visible: the user is zoomed in
    const g = growTo(viewRef.current, b, a, GROW_MARGIN);
    if (g) setView(g);
    // keyed by the bounds' values (`b` is a new object every render), and only when no gesture is running
  }, [boundsKey, gestureActive]);

  // Small screens: frame the plan in what the bars leave free, and again when they change, until the user moves the view themselves.
  useEffect(() => {
    if (tiny && autoFrame.current) setView(fitViewFree(levelBounds(), size.w, size.h, clearOfHint(barFree), FRAME_PAD_TINY));
    // keyed by the free area's edges (`barFree` is a new object whenever the bars re-measure)
  }, [tiny, barFree.x0, barFree.y0, barFree.x1, barFree.y1, size.w, size.h]);

  // A sheet opened over the plan: pan so the selected wall, room, door or piece is not behind it.
  const selKey = sel ? `${sel.type}:${sel.id}` : "";
  const sheetOpen = panel.right > 0 || panel.bottom > 0;
  useEffect(() => {
    if (!tiny || !sheetOpen || !sel || dragActive) return;
    const sb = selBounds(lvPlan(), sel);
    if (!sb) return;
    const v = viewRef.current;
    const r = rectOf(v, size.w / size.h);
    const k = size.w / r.w; // px per metre
    const d = panToFree({ x0: (sb.x0 - r.x) * k, y0: (sb.y0 - r.y) * k, x1: (sb.x1 - r.x) * k, y1: (sb.y1 - r.y) * k }, free);
    if (!d.x && !d.y) return;
    autoFrame.current = false;
    setView({ ...v, cx: v.cx - d.x / k, cy: v.cy - d.y / k });
    // runs when the selection or the sheet changes, not on every drag or resize; keyed by the free area's edges
  }, [selKey, sheetOpen, free.x0, free.y0, free.x1, free.y1]);

  return { view, setView, viewRef, autoFrame, size, free, fit };
}
