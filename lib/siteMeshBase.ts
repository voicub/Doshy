// Colours and easing the site meshes share. Clamping, hashing and seeded randomness live in ./mathUtil.ts.
import { clamp } from "./mathUtil.ts";

export type RGB = [number, number, number];

export const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** #rgb / #rrggbb as linear RGB (what vertex colours want). */
function hexRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255)) as RGB;
}

export const hexOr = (h: string): RGB => hexRgb(h) ?? [0.5, 0.5, 0.5];

// the colour names OpenStreetMap uses most (the rest fall back to a plausible plaster / roof palette)
const NAMED: Record<string, string> = {
  white: "#ffffff", black: "#222222", grey: "#808080", gray: "#808080", lightgrey: "#d3d3d3", lightgray: "#d3d3d3", darkgrey: "#5a5a5a", darkgray: "#5a5a5a", silver: "#c0c0c0",
  red: "#b03a2e", darkred: "#7a2a22", maroon: "#6e2c2c", brown: "#8b5a3c", orange: "#d9822b", yellow: "#e8d36a", beige: "#e0d4b8", tan: "#d2b48c", khaki: "#c3b091", cream: "#f3ead3",
  green: "#5b8a4a", darkgreen: "#2f5a35", olive: "#7a7a3a", blue: "#4a6fa5", darkblue: "#2c3e63", navy: "#26345a", lightblue: "#a9c4de", pink: "#e4a6b4", purple: "#7a5a8a",
  ivory: "#f3efdc", salmon: "#e69a80", wheat: "#e5d3a8", terracotta: "#b5573a", sandybrown: "#d9a066", lightyellow: "#f2eab8", gold: "#c9a43a", turquoise: "#4aa8a0",
};

/** A colour as OpenStreetMap writes it (hex or a plain colour name) as linear RGB, or null when unknown. */
export function parseCssColor(s: string | undefined): RGB | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  return hexRgb(t) ?? hexRgb(NAMED[t.replace(/[\s_-]/g, "")] ?? "");
}
