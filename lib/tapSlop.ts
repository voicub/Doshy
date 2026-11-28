// How far a press may wander and still count as a tap (or a long press). Pure; the node test runner loads this file directly.

/**
 * Chromium itself turns a touch that stays within about 15 px into a click, and a finger on a cheap touch panel jitters well beyond the 6 px that suited a mouse. A custom handler stricter
 * than the browser throws away taps the browser accepted (a toggle that "does nothing", a long press that never opens its card), so a finger gets the browser's allowance. A pen sits between.
 */
const SLOP_PX: Record<string, number> = { touch: 15, pen: 10 };
const MOUSE_SLOP_PX = 6;

/** The slop, in css px, for a pointer of this `PointerEvent.pointerType`. "mouse" and anything unknown get `mousePx`, which a caller with its own long-standing mouse value keeps. */
export const tapSlopPx = (pointerType: string, mousePx = MOUSE_SLOP_PX): number => SLOP_PX[pointerType] ?? mousePx;

/** True while a press that moved (`dx`, `dy`) from where it began is still a tap, not a drag. */
export const withinTapSlop = (dx: number, dy: number, pointerType: string, mousePx = MOUSE_SLOP_PX): boolean => Math.hypot(dx, dy) <= tapSlopPx(pointerType, mousePx);
