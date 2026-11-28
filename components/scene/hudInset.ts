import type { Inset } from "@/lib/roomIsolate";

const COLUMN = 0.6; // a panel narrower than this share of the screen is a column at one side, a wider one is a row or sheet across it
const MAX_COVER = 0.6; // the HUD never gets more than this share of an axis: a small room that is whole beats a big one behind a panel
const WALL_CAPTION_PX = 72; // the wall display's caption strip (components/wall/wallDisplay.css)

/**
 * The part of the screen the HUD covers while a room is entered, measured from the panels themselves so every layout is right (regular, compact, a phone upright or sideways,
 * the device list docked at the side or sheeted up from the bottom): the room is then centred and fitted in what is left. Browser only; call it once the HUD has laid out.
 */
export function hudInset(width: number, height: number): Inset {
  const inset: Inset = { left: 0, right: 0, top: 0, bottom: 0 };
  // wall display: the HUD is hidden (its panels still have boxes), only the caption strip at the bottom is in the way
  if (document.documentElement.hasAttribute("data-wall")) return { ...inset, bottom: WALL_CAPTION_PX };
  /** Every panel that matches covers the edge `edgeOf` names for it, as deep as the panel reaches. */
  const cover = (selector: string, edgeOf: (r: DOMRect) => keyof Inset) => {
    for (const el of document.querySelectorAll(selector)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue; // not on screen in this layout
      const edge = edgeOf(r);
      const covered = { left: r.right, right: width - r.left, top: r.bottom, bottom: height - r.top }[edge];
      inset[edge] = Math.max(inset[edge], covered);
    }
  };
  const column = (r: DOMRect) => r.width <= width * COLUMN;
  cover(".rd-dock", (r) => (column(r) ? "right" : "bottom")); // the device list: a column at the right on a wide screen, a sheet over the bottom on a narrow one
  cover(".rail", (r) => (column(r) ? "left" : "bottom")); // the room strip: a column down the left edge, or a row of chips over the bottom when upright
  cover(".room-bar, .cstrip", () => "top"); // the bar naming the room, and the compact top strip
  cover(".cdock, .dock", () => "bottom"); // the mode bar
  const share = (a: number, b: number, size: number): [number, number] => {
    const k = Math.min(1, (size * MAX_COVER) / Math.max(1, a + b));
    return [a * k, b * k];
  };
  [inset.left, inset.right] = share(inset.left, inset.right, width);
  [inset.top, inset.bottom] = share(inset.top, inset.bottom, height);
  return inset;
}
