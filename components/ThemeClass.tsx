"use client";
import { useEffect } from "react";
import { applyTheme } from "@/lib/themeApply";
import { loadTheme, useTheme } from "@/lib/themeStore";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Keeps <html data-theme / data-scheme / data-status> and the accent in step with this device's choice (Display settings), follows the system while the choice is Auto,
 * and picks up a change made in another tab of the same device. The first paint is already right: an inline script in <head> (lib/theme.ts) applies the stored choice before anything is drawn.
 * Renders nothing.
 */
export default function ThemeClass() {
  const settings = useTheme((s) => s.settings);
  useEffect(() => {
    const apply = () => {
      const r = applyTheme(useTheme.getState().settings);
      useTheme.getState().applied(r.theme, r.accentError);
    };
    apply();
    if (settings.theme !== "auto") return;
    const queries = [matchMedia("(prefers-color-scheme: light)"), matchMedia("(prefers-contrast: more)")];
    for (const q of queries) q.addEventListener("change", apply);
    return () => { for (const q of queries) q.removeEventListener("change", apply); };
  }, [settings]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === THEME_STORAGE_KEY) useTheme.getState().set(loadTheme()); };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);
  return null;
}
