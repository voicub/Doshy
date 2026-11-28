"use client";
import { useSyncExternalStore } from "react";
import { IDLE_EVENT } from "@/lib/display";
import { WALL_EVENT } from "@/lib/wall";

function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener(IDLE_EVENT, onChange);
  window.addEventListener(WALL_EVENT, onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener(IDLE_EVENT, onChange);
    window.removeEventListener(WALL_EVENT, onChange);
  };
}

/** True while nobody can see the 3D view: the tab is hidden, the screensaver / dimmed display is up (KioskTouch sets `data-saver` on <html> and fires `housey:idle`), or the wall display shows a full-screen card (`data-wall-still`, `housey:wall`). The scene stops drawing entirely then. */
export function useFramePaused(): boolean {
  return useSyncExternalStore(subscribe, () => document.hidden || ["data-saver", "data-wall-still"].some((a) => document.documentElement.hasAttribute(a)), () => false);
}
