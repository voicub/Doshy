"use client";
import { useCallback, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";

const COMMIT_MS = 600; // a drag in the native colour picker is one undo step: it closes this long after the last change

/**
 * The native colour picker fires a change for every pixel of a drag. With `undoable` (the colour edits the plan) the whole drag joins one undo step that
 * closes `COMMIT_MS` after the last change, and `onSettled` then gets the final colour. `close` ends the step early (the picker lost focus).
 */
export function useColourDrag(onChange: (hex: string) => void, undoable: boolean | undefined, onSettled?: (hex: string) => void) {
  const timer = useRef<number | undefined>(undefined);
  const open = useRef(false);

  const close = useCallback(() => {
    clearTimeout(timer.current);
    if (open.current) {
      open.current = false;
      useStore.getState().endEdit();
    }
  }, []);
  useEffect(() => close, [close]);

  const drag = (hex: string) => {
    const s = useStore.getState();
    if (undoable && !open.current && !s.gesture) {
      s.beginEdit();
      open.current = true;
    }
    onChange(hex);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      close();
      onSettled?.(hex);
    }, COMMIT_MS);
  };
  return { drag, close };
}
