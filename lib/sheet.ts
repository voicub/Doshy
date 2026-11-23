// Bottom-sheet states on compact portrait screens: "peek" leaves the canvas visible, "full" is for long forms. Pure; the node test runner loads this file directly.

export type SheetState = "peek" | "full";
export const TAP_PX = 8; // a press that moves less than this is a tap on the handle
export const SWIPE_PX = 40; // a drag this long changes the state
const DISMISS_PX = 90; // dragging a peeking sheet down this far closes it

/** What a handle gesture does: `dy` is the finger's vertical move in px (negative = up). A tap toggles, a swipe up opens fully, a swipe down shrinks (and a long one closes a peeking sheet). */
export function afterDrag(state: SheetState, dy: number): SheetState | "close" {
  if (Math.abs(dy) < TAP_PX) return state === "peek" ? "full" : "peek";
  if (dy <= -SWIPE_PX) return "full";
  if (dy >= DISMISS_PX && state === "peek") return "close";
  if (dy >= SWIPE_PX) return "peek";
  return state;
}
