// Screen class for the compact layout. The app is used mostly on a 7 inch Raspberry Pi display (800x480 or 1024x600, touch, kiosk browser) and sometimes on a phone,
// so every region of the interface has a compact form. One place decides which: `classify`. `components/ViewportClass.tsx` writes the result as attributes on <html>
// and stylesheets/components read those (`html[data-vp="tiny"] .x { ... }`) instead of scattering media queries. Pure; the node test runner loads this file directly.

/** tiny: 800x480-class displays and phones (shorter side <= 520 css px). small: 1024x600-class (shorter side <= 700, or width <= 1100). regular: everything bigger. */
export type Vp = "tiny" | "small" | "regular";
export type Orientation = "landscape" | "portrait";
/** What the owner chose in the display settings: "auto" follows the screen, the others force one layout. */
export type LayoutChoice = "auto" | "compact" | "regular";

export const LAYOUT_KEY = "housey-layout";
const TINY_SIDE = 520;
const SMALL_SIDE = 700;
const SMALL_WIDE = 1100;

export type Screen = { width: number; height: number; coarse: boolean; kiosk: boolean };

export function classify(width: number, height: number, choice: LayoutChoice = "auto"): Vp {
  if (choice === "regular") return "regular";
  const side = Math.min(width, height);
  if (side <= TINY_SIDE) return "tiny";
  if (choice === "compact") return "small";
  if (side <= SMALL_SIDE || width <= SMALL_WIDE) return "small";
  return "regular";
}

export const orientationOf = (width: number, height: number): Orientation => (height > width ? "portrait" : "landscape");

/** The attributes written on <html>: data-vp, data-orient, data-coarse ("1" when the primary pointer is touch), data-kiosk ("1" in a kiosk / installed-app window or with ?kiosk=1). */
export function attrsOf(s: Screen, choice: LayoutChoice = "auto"): Record<"data-vp" | "data-orient" | "data-coarse" | "data-kiosk", string> {
  return {
    "data-vp": classify(s.width, s.height, choice),
    "data-orient": orientationOf(s.width, s.height),
    "data-coarse": s.coarse ? "1" : "0",
    "data-kiosk": s.kiosk ? "1" : "0",
  };
}

export const isLayoutChoice = (v: unknown): v is LayoutChoice => v === "auto" || v === "compact" || v === "regular";
