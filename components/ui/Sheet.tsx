"use client";
import { useEffect, useId, useRef, useState, type PointerEvent, type RefObject } from "react";
import { insetOf } from "@/lib/viewInset";
import { afterDrag, TAP_PX, type SheetState } from "@/lib/sheet";
import { useInsets } from "../scene/edit/insetStore";
import { isTypingTarget } from "./isTypingTarget";
import "./sheet.css";

/** Panels that turn into sheets on compact screens (sheet.css styles the same list). A panel can opt in with the `sheet` class. */
const SHEET = ".drawer, .inspector, .flow-panel, .sheet";

/** Pointer handlers of the drag handle. */
type SheetGrabProps = { onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void; onPointerUp: (e: PointerEvent<HTMLButtonElement>) => void; onPointerCancel: () => void };

/**
 * Compact screens (data-vp tiny and small): the editing panels are bottom sheets in portrait (peek = the canvas stays visible, full = long forms) and a right-hand side sheet in landscape.
 * `HudPanel` calls this for every panel; on bigger screens nothing changes. Returns the sheet state for `data-sheet`, a ref for the panel and the handle's props.
 */
export function useSheet(onClose?: () => void): { ref: RefObject<HTMLElement | null>; state: SheetState; grab: SheetGrabProps } {
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  const [state, setState] = useState<SheetState>("peek");
  const from = useRef<number | null>(null);
  const tiny = () => document.documentElement.dataset.vp !== "regular" && !!ref.current?.matches(SHEET);

  // tell the 3D view how much of the canvas this panel covers, so the scene stays in what is left
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (!tiny()) return useInsets.getState().clear(id);
      const r = el.getBoundingClientRect();
      useInsets.getState().report(id, insetOf(r, innerWidth, innerHeight));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    addEventListener("resize", measure);
    measure();
    const t = setTimeout(measure, 350); // after the slide-in
    return () => {
      ro.disconnect();
      clearTimeout(t);
      removeEventListener("resize", measure);
      useInsets.getState().clear(id);
    };
  }, [id, state]);

  // Esc closes a sheet (an on-screen keyboard has no Esc, but a keyboard on a Pi does)
  useEffect(() => {
    if (!onClose) return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || !tiny()) return;
      if (isTypingTarget(e.target)) return;
      onClose();
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [onClose]);

  const grab = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      from.current = e.clientY;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      if (from.current === null) return;
      const dy = e.clientY - from.current;
      from.current = null;
      const next = afterDrag(state, Math.abs(dy) < TAP_PX ? 0 : dy);
      if (next === "close") onClose?.();
      else setState(next);
    },
    onPointerCancel: () => void (from.current = null),
  };
  return { ref, state, grab };
}

/** The drag handle at the top of a sheet. Only portrait compact screens show it (sheet.css); a tap or a swipe makes the sheet bigger or smaller. */
export function SheetGrab({ state, grab }: { state: SheetState; grab: SheetGrabProps }) {
  return (
    <button type="button" className="sheet-grab" aria-label={state === "full" ? "Make this panel smaller" : "Make this panel bigger"} aria-expanded={state === "full"} {...grab}>
      <i aria-hidden />
    </button>
  );
}
