"use client";
import { useEffect } from "react";
import { appliedScale, effectiveSize } from "@/lib/display";
import { useDisplay } from "@/lib/displayStore";
import { attrsOf, isLayoutChoice, LAYOUT_KEY, type LayoutChoice } from "@/lib/viewport";

/** The owner's layout choice (display settings), read from localStorage; "auto" when unset or invalid. */
export function readLayoutChoice(): LayoutChoice {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return isLayoutChoice(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

/**
 * Writes `data-vp`, `data-orient`, `data-coarse` and `data-kiosk` on <html> (see lib/viewport.ts) and refreshes them on resize, rotation, layout-choice (`housey:layout`) and interface-size changes.
 * The interface size (display settings) is the CSS variable `--ui-scale`, which zooms the HUD (`.chrome`, components/ui/displayScale.css); the layout class is picked from the screen as the zoomed HUD sees it. Renders nothing.
 */
export default function ViewportClass() {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const kiosk = /[?&]kiosk=1\b/.test(location.search) || matchMedia("(display-mode: fullscreen)").matches || matchMedia("(display-mode: standalone)").matches;
      const scale = appliedScale(useDisplay.getState().size, innerWidth, innerHeight);
      const { width, height } = effectiveSize(innerWidth, innerHeight, scale);
      const a = { ...attrsOf({ width, height, coarse: matchMedia("(pointer: coarse)").matches, kiosk }, readLayoutChoice()), "data-ui-size": useDisplay.getState().size };
      for (const [k, v] of Object.entries(a)) if (root.getAttribute(k) !== v) root.setAttribute(k, v);
      if (root.style.getPropertyValue("--ui-scale") !== String(scale)) root.style.setProperty("--ui-scale", String(scale));
    };
    apply();
    const unsub = useDisplay.subscribe(apply);
    addEventListener("resize", apply);
    addEventListener("orientationchange", apply);
    addEventListener("housey:layout", apply);
    return () => {
      unsub();
      removeEventListener("resize", apply);
      removeEventListener("orientationchange", apply);
      removeEventListener("housey:layout", apply);
    };
  }, []);
  return null;
}
