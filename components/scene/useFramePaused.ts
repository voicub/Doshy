"use client";
import { useSyncExternalStore } from "react";
import { IDLE_EVENT } from "@/lib/display";

function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener(IDLE_EVENT, onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener(IDLE_EVENT, onChange);
  };
}

/** True while nobody can see the 3D view: the tab is hidden, or the screensaver / dimmed display is up (KioskTouch sets `data-saver` on <html> and fires `housey:idle`). The scene stops drawing entirely then. */
export function useFramePaused(): boolean {
  return useSyncExternalStore(subscribe, () => document.hidden || document.documentElement.hasAttribute("data-saver"), () => false);
}
