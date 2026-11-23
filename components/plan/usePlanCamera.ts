import { useEffect, useRef, type MutableRefObject, type PointerEvent as RPE, type RefObject } from "react";
import { clamp } from "@/lib/mathUtil";
import { ZOOM_MAX, ZOOM_MIN, rectOf, type View } from "@/lib/planView";

const LONG_PRESS_MS = 1500; // a touch this recent makes the following contextmenu a long press, not a right click

type Camera = {
  svg: RefObject<SVGSVGElement | null>;
  viewRef: MutableRefObject<View>;
  /** Cleared whenever the user zooms or pans on their own: the view then stops following the bars. */
  autoFrame: MutableRefObject<boolean>;
  setView: (v: View) => void;
  /** A second finger arrived: end the gesture in progress first. */
  onPinchStart: () => void;
};

/** The view centred so that plan point (`px`, `py`) sits at fraction (`fx`, `fy`) of a canvas of `aspect`, at zoom `w`. */
const viewAround = (px: number, py: number, fx: number, fy: number, w: number, aspect: number): View => ({ cx: px - fx * w + w / 2, cy: py - fy * (w / aspect) + w / aspect / 2, w });

/**
 * Wheel zoom about the cursor and two-finger pinch zoom + pan for the plan canvas.
 * The pointer handlers go on the svg's capture phase, so children never react to a finger that is part of a pinch.
 */
export function usePlanCamera({ svg, viewRef, autoFrame, setView, onPinchStart }: Camera) {
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ v: View; d0: number; px: number; py: number } | null>(null);
  const lastTouch = useRef(0);

  // A non-passive listener, so the page does not scroll. Only refs and a state setter inside: mount once.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      autoFrame.current = false;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const v = viewRef.current;
      const a = box.width / box.height;
      const r = rectOf(v, a);
      const w = clamp(v.w * Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.03 : e.ctrlKey ? 0.01 : 0.0015)), ZOOM_MIN, ZOOM_MAX);
      const fx = (e.clientX - box.left) / box.width;
      const fy = (e.clientY - box.top) / box.height;
      setView(viewAround(r.x + fx * r.w, r.y + fy * r.h, fx, fy, w, a));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [svg, viewRef, autoFrame, setView]);

  const touchDown = (e: RPE) => {
    if (e.pointerType !== "touch") return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastTouch.current = Date.now();
    const box = svg.current?.getBoundingClientRect();
    if (touches.current.size === 2 && box) {
      onPinchStart();
      const [a, b] = [...touches.current.values()];
      const v = viewRef.current;
      const r = rectOf(v, box.width / box.height);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      pinch.current = { v, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, px: r.x + ((mx - box.left) / box.width) * r.w, py: r.y + ((my - box.top) / box.height) * r.h };
    }
    if (pinch.current) e.stopPropagation();
  };

  const touchMove = (e: RPE) => {
    if (e.pointerType !== "touch" || !touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    const box = svg.current?.getBoundingClientRect();
    if (!p || !box || touches.current.size < 2) return;
    e.stopPropagation();
    autoFrame.current = false;
    const [a, b] = [...touches.current.values()];
    const w = clamp((p.v.w * p.d0) / (Math.hypot(a.x - b.x, a.y - b.y) || 1), ZOOM_MIN, ZOOM_MAX);
    const fx = ((a.x + b.x) / 2 - box.left) / box.width;
    const fy = ((a.y + b.y) / 2 - box.top) / box.height;
    setView(viewAround(p.px, p.py, fx, fy, w, box.width / box.height));
  };

  const touchUp = (e: RPE) => {
    if (e.pointerType !== "touch") return;
    touches.current.delete(e.pointerId);
    if (!pinch.current) return;
    e.stopPropagation();
    if (touches.current.size < 2) pinch.current = null;
  };

  return {
    touchDown,
    touchMove,
    touchUp,
    /** Two fingers are down: the gesture is a pinch, not a tool action. */
    isPinching: () => pinch.current !== null,
    /** A finger is down or was moments ago, so a contextmenu event is a long press. */
    isTouching: () => touches.current.size > 0 || Date.now() - lastTouch.current < LONG_PRESS_MS,
  };
}
