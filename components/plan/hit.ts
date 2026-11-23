/** A finger needs at least 44 css px: a transparent hit shape grows to that (in plan metres, `px` = metres per screen pixel) on touchscreens; with a mouse `base` is kept. The drawn look never changes. */
export const TOUCH_HIT = 44;
export const hitOf = (base: number, px: number, touch: number): number => (touch > 1 ? Math.max(base, TOUCH_HIT * px) : base);

