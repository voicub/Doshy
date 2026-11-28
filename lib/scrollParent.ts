// The element a finger actually scrolls. Pure apart from the default style reader; the node test runner loads this file directly.

type Node = { parentElement: Node | null };

/**
 * The nearest ancestor of `el` that scrolls vertically, or null when only the page does. It is the `root` a "load more" IntersectionObserver needs: the observer measures the sentinel against
 * its root, so a root that does not scroll (the card grid of the compact catalog sheet, where the sheet scrolls and the grid is as tall as all its cards) says "visible" for every sentinel and
 * the whole list gets mounted at once. `overflow-y: auto | scroll` counts even when the content fits right now: it may not, a moment later.
 */
export function scrollParent<T extends Node>(el: T | null, overflowY: (e: T) => string = (e) => getComputedStyle(e as unknown as Element).overflowY): T | null {
  for (let p = el?.parentElement as T | null | undefined; p; p = p.parentElement as T | null) {
    const o = overflowY(p);
    if (o === "auto" || o === "scroll") return p;
  }
  return null;
}
