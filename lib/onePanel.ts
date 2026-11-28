// On a small screen only one panel fits: opening another one closes the rest. Pure: the dashboard passes the set of open panels each render.

/** Every slide-over, sheet or card the dashboard can open. */
export type PanelKey = "menu" | "house" | "plans" | "stats" | "energy" | "inbox" | "media" | "calendar" | "roomSheet" | "left" | "catalog" | "device" | "camera" | "curtain";

/** The panel that was opened since the previous render, or null when nothing new opened. When several opened at once the last one in `open` wins. */
export function newestOpen(prev: ReadonlySet<PanelKey>, open: ReadonlySet<PanelKey>): PanelKey | null {
  let found: PanelKey | null = null;
  for (const k of open) if (!prev.has(k)) found = k;
  return found;
}

/** Everything open except `keep`: the panels to close so `keep` has the room to itself. */
export const othersOf = (open: ReadonlySet<PanelKey>, keep: PanelKey): PanelKey[] => [...open].filter((k) => k !== keep);
