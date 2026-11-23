"use client";
import { useRef, type PointerEvent } from "react";

/** A drag of at least this many css px, mostly toward the screen edge the sheet sits on, closes it. */
const SWIPE_PX = 64;

/** Pointer handlers for a sheet's header: swipe down (portrait, bottom sheet) or right (landscape, side sheet) closes it. Mouse drags count too; a plain tap does not. */
export default function useSwipeClose(onClose: () => void) {
  const from = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: PointerEvent) => { from.current = { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e: PointerEvent) => {
      const a = from.current;
      from.current = null;
      if (!a) return;
      const dx = e.clientX - a.x;
      const dy = e.clientY - a.y;
      const portrait = document.documentElement.getAttribute("data-orient") === "portrait";
      if (portrait ? dy > SWIPE_PX && dy > Math.abs(dx) : dx > SWIPE_PX && dx > Math.abs(dy)) onClose();
    },
    onPointerCancel: () => { from.current = null; },
  };
}
