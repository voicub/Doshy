"use client";
// The theme's colours as plain strings for code that cannot use CSS variables: the 3D scene (clear colour, studio floor) and canvases. They are read from the computed CSS variables of <html>
// ONCE per theme change (never per frame): the hook re-renders only when the theme, the status palette or the accent changes.
import { useSyncExternalStore } from "react";
import { NEON_COLORS, type ThemeColors } from "./theme";
import { parseChannels, toHex } from "./themeColor.ts";

const ATTRS = ["data-theme", "data-scheme", "data-status", "style"] as const;
let cache: { key: string; value: ThemeColors } = { key: "", value: NEON_COLORS };

function read(): ThemeColors {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const get = (name: string, fallback: string): string => {
    const v = cs.getPropertyValue(name).trim();
    return v.startsWith("#") ? v : fallback;
  };
  const panel = parseChannels(cs.getPropertyValue("--panel-rgb"));
  return {
    scheme: root.getAttribute("data-scheme") === "light" ? "light" : "dark",
    bg: get("--bg", NEON_COLORS.bg), panel: panel ? toHex(panel) : NEON_COLORS.panel, text: get("--text", NEON_COLORS.text), textDim: get("--text-dim", NEON_COLORS.textDim),
    accent: get("--accent", NEON_COLORS.accent), ok: get("--ok", NEON_COLORS.ok), warn: get("--warn", NEON_COLORS.warn), bad: get("--bad", NEON_COLORS.bad),
    sceneBackdrop: get("--scene-backdrop", NEON_COLORS.sceneBackdrop), studioCentre: get("--studio-centre", NEON_COLORS.studioCentre),
    studioMid: get("--studio-mid", NEON_COLORS.studioMid), studioLine: get("--studio-line", NEON_COLORS.studioLine),
    haloStrength: Math.min(1, Math.max(0, parseFloat(cs.getPropertyValue("--halo-a")) || NEON_COLORS.haloStrength)),
  };
}

function snapshot(): ThemeColors {
  const root = document.documentElement;
  const key = ATTRS.map((a) => root.getAttribute(a) ?? "").join("|");
  if (key !== cache.key) cache = { key, value: read() };
  return cache.value; // the same object until the theme changes: useSyncExternalStore needs a stable snapshot
}

function subscribe(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: [...ATTRS] });
  return () => mo.disconnect();
}

export function useThemeColors(): ThemeColors {
  return useSyncExternalStore(subscribe, snapshot, () => NEON_COLORS);
}
