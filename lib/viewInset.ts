// Compact screens: panels (sheets) and tool bars cover part of the 3D canvas. These helpers work out the part that is still visible ("free area") so the camera can keep the
// selected piece in it. Pure; the node test runner loads this file directly.

export type Insets = { left: number; right: number; top: number; bottom: number };
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Rect = { left: number; top: number; right: number; bottom: number };

export const NO_INSETS: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

/** Which side of a `w` x `h` screen a panel covers: one spanning (nearly) the whole width is a bottom inset (from its top edge down), one on the right edge that does not is a right inset. Anything else covers nothing we steer around. */
export function insetOf(r: Rect, w: number, h: number): Insets {
  if (r.right - r.left <= 0 || r.bottom - r.top <= 0) return NO_INSETS;
  if (r.right - r.left >= w * 0.9) return { ...NO_INSETS, bottom: Math.max(0, Math.round(h - r.top)) };
  if (r.right >= w - 2) return { ...NO_INSETS, right: Math.round(w - r.left) };
  return NO_INSETS;
}

/** The largest inset on each side. */
export function mergeInsets(list: Insets[]): Insets {
  return list.reduce((m, i) => ({ left: Math.max(m.left, i.left), right: Math.max(m.right, i.right), top: Math.max(m.top, i.top), bottom: Math.max(m.bottom, i.bottom) }), NO_INSETS);
}

/** The visible rectangle of a `w` x `h` canvas. Never smaller than a quarter of the canvas, so a huge panel cannot push the scene away. */
export function freeArea(w: number, h: number, ins: Insets): Box {
  const x0 = Math.min(ins.left, w * 0.75);
  const y0 = Math.min(ins.top, h * 0.75);
  const x1 = Math.max(w - ins.right, x0 + w * 0.25);
  const y1 = Math.max(h - ins.bottom, y0 + h * 0.25);
  return { x0, y0, x1, y1 };
}

/** Where the canvas content moves (px) so that the centre of the free area shows what the centre of the whole canvas showed. */
export function contentShift(w: number, h: number, free: Box): { x: number; y: number } {
  return { x: (free.x0 + free.x1) / 2 - w / 2, y: (free.y0 + free.y1) / 2 - h / 2 };
}

/** How far (px) to pan the picture so the selected box is inside the free area: zero when it already is (within `margin`), otherwise the move that brings its centre to the centre of the free area. */
export function panToFree(sel: Box, free: Box, margin = 24): { x: number; y: number } {
  const inside = sel.x0 >= free.x0 + margin && sel.x1 <= free.x1 - margin && sel.y0 >= free.y0 + margin && sel.y1 <= free.y1 - margin;
  if (inside) return { x: 0, y: 0 };
  return { x: (free.x0 + free.x1) / 2 - (sel.x0 + sel.x1) / 2, y: (free.y0 + free.y1) / 2 - (sel.y0 + sel.y1) / 2 };
}
