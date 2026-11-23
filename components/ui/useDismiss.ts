"use client";
import { useEffect, useRef, type RefObject } from "react";

/** Calls `onAway` when a pointer goes down outside `root` (while `active`). `onAway` may change every render. */
export function useClickAway(root: RefObject<Element | null>, onAway: () => void, active = true) {
  const latest = useRef(onAway);
  useEffect(() => { latest.current = onAway; });
  useEffect(() => {
    if (!active) return;
    const away = (e: PointerEvent) => {
      if (e.target instanceof Node && root.current?.contains(e.target)) return;
      latest.current();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [root, active]);
}

/** Closes a floating card on a click outside it or on Escape. */
export function useDismiss(root: RefObject<Element | null>, onClose: () => void) {
  useClickAway(root, onClose);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
}
