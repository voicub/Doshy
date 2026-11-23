/** On-screen size (px) a pick target never shrinks below: mouse / touch. */
const MIN_HIT_PX = 28;
const MIN_HIT_PX_COARSE = 44;
/** Clicking again within this many px and ms of the first click cycles through what lies under the pointer. */
const CYCLE_PX = 6;
export const CYCLE_MS = 1500;
/** A press held this long (ms) without moving more than LONG_PRESS_PX opens the chooser. */
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_PX = 6;

/** Narrowest a real part of a piece may look on screen (px): a lamp pole or a chair leg stays clickable. */
const MIN_PART_PX = 12;
const MIN_PART_PX_COARSE = 22;

type Size3 = [number, number, number];

/** Metres that span the minimum hit size on screen, for an ortho camera whose `zoom` is pixels per metre. */
export const minProxySize = (zoom: number, coarse: boolean) => (coarse ? MIN_HIT_PX_COARSE : MIN_HIT_PX) / Math.max(zoom, 1e-6);

/** Metres that span the narrowest part width on screen. */
export const minPartWidth = (zoom: number, coarse: boolean) => (coarse ? MIN_PART_PX_COARSE : MIN_PART_PX) / Math.max(zoom, 1e-6);

/** Grow each axis of a box to at least `min` metres (the centre stays); a box that is already big on some axis is left alone, so large neighbours keep their shape. */
export const inflate = (size: Size3, min: number): Size3 => (Math.max(...size) >= min ? size : [Math.max(size[0], min), Math.max(size[1], min), Math.max(size[2], min)]);

export type Cycle = { index: number; ids: string[]; x: number; y: number; t: number; cycled: boolean };

/**
 * Which of the `ids` under the pointer (nearest first) a click at `point` at time `now` selects.
 * The same spot again, soon, with the same candidates, steps to the next one behind and wraps; anything else starts over at the nearest.
 */
export function nextCycle(prev: Cycle | null, ids: string[], point: { x: number; y: number }, now: number): Cycle {
  const same =
    !!prev &&
    ids.length > 1 &&
    now - prev.t <= CYCLE_MS &&
    Math.hypot(point.x - prev.x, point.y - prev.y) <= CYCLE_PX &&
    prev.ids.length === ids.length &&
    prev.ids.every((id, i) => id === ids[i]);
  if (!same || !prev) return { index: 0, ids, x: point.x, y: point.y, t: now, cycled: false };
  return { index: (prev.index + 1) % ids.length, ids, x: prev.x, y: prev.y, t: now, cycled: true };
}
