// Where a floor plan image (`plan.trace`) sits on the plan: image pixels <-> plan metres, setting its scale from one known distance, straightening it,
// fitting it to the view. Pure. The node test runner loads this file directly: .ts import extensions.
import type { Trace } from "./designTypes.ts";
import { SCALE_RANGE, turnOf } from "./trace.ts";
import type { Pt } from "./types.ts";

/** What places an image: its size in pixels, the plan point of its centre, the turn (degrees clockwise) about the centre, metres per pixel. */
export type Placed = Pick<Trace, "w" | "h" | "x" | "y" | "scale" | "rotation">;
export type Rect = { x: number; y: number; w: number; h: number };

const RAD = Math.PI / 180;
const FILL = 0.9; // "fit to the view" leaves a tenth of the view as margin
const inRange = (scale: number) => scale >= SCALE_RANGE.min && scale <= SCALE_RANGE.max;

/** Plan metres of a point given in image pixels (origin: the image's top-left corner, y down). Mirrors the SVG transform translate(x y) rotate(rotation) scale(scale). */
export function imageToPlan(t: Placed, p: Pt): Pt {
  const dx = (p.x - t.w / 2) * t.scale;
  const dy = (p.y - t.h / 2) * t.scale;
  const [c, s] = [Math.cos(t.rotation * RAD), Math.sin(t.rotation * RAD)];
  return { x: t.x + dx * c - dy * s, y: t.y + dx * s + dy * c };
}

/** Image pixels of a plan point (the inverse of `imageToPlan`). */
export function planToImage(t: Placed, p: Pt): Pt {
  const [dx, dy] = [p.x - t.x, p.y - t.y];
  const [c, s] = [Math.cos(t.rotation * RAD), Math.sin(t.rotation * RAD)];
  return { x: (dx * c + dy * s) / t.scale + t.w / 2, y: (-dx * s + dy * c) / t.scale + t.h / 2 };
}

/** The four corners of the image on the plan: top-left, top-right, bottom-right, bottom-left. */
export const traceCorners = (t: Placed): [Pt, Pt, Pt, Pt] => [
  imageToPlan(t, { x: 0, y: 0 }),
  imageToPlan(t, { x: t.w, y: 0 }),
  imageToPlan(t, { x: t.w, y: t.h }),
  imageToPlan(t, { x: 0, y: t.h }),
];

/** How wide the image really is, in metres (before turning). */
export const imageWidthM = (t: Pick<Trace, "w" | "scale">): number => t.w * t.scale;

/** `next` moved so that the image point `at` stays exactly where it was on the plan under `before`. */
function holdPoint(before: Trace, next: Trace, at: Pt): Trace {
  const was = imageToPlan(before, at);
  const now = imageToPlan(next, at);
  return { ...next, x: next.x + was.x - now.x, y: next.y + was.y - now.y };
}

/** The scale that makes the image points `a` and `b` (pixels) `metres` apart; `a` stays where it is on the plan. Null when the two points coincide, the distance is not positive, or the result is outside the allowed scale. */
export function calibrate(t: Trace, a: Pt, b: Pt, metres: number): Trace | null {
  const px = Math.hypot(b.x - a.x, b.y - a.y);
  if (px < 1e-6 || !(metres > 0)) return null;
  const scale = metres / px;
  return Number.isFinite(scale) && inRange(scale) ? holdPoint(t, { ...t, scale }, a) : null;
}

/** The image turned the little it takes to make the line from `a` to `b` (pixels) level or upright on the plan, whichever is nearer; `a` stays where it is. Null for two equal points. */
export function straighten(t: Trace, a: Pt, b: Pt): Trace | null {
  const [pa, pb] = [imageToPlan(t, a), imageToPlan(t, b)];
  if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < 1e-9) return null;
  const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x) / RAD;
  const by = turnOf(Math.round(angle / 90) * 90 - angle);
  return holdPoint(t, { ...t, rotation: turnOf(t.rotation + by) }, a);
}

/** The scale that makes the image `widthM` metres wide, about its centre. Null when that is outside the allowed scale. */
export function withImageWidth(t: Trace, widthM: number): Trace | null {
  const scale = widthM / t.w;
  return Number.isFinite(scale) && inRange(scale) ? { ...t, scale } : null;
}

/** Turned `deg` more about its centre (rotation kept in (-180, 180], to 0.1 degree). */
export const turnedBy = (t: Trace, deg: number): Trace => ({ ...t, rotation: Math.round(turnOf(t.rotation + deg) * 10) / 10 });

/** Centred in `view`, and (with `resize`) scaled so the whole turned image just fits, leaving a margin. */
export function fitToView(t: Trace, view: Rect, resize = true): Trace {
  const next = { ...t, x: view.x + view.w / 2, y: view.y + view.h / 2 };
  if (!resize) return next;
  const [c, s] = [Math.abs(Math.cos(t.rotation * RAD)), Math.abs(Math.sin(t.rotation * RAD))];
  const [bw, bh] = [t.w * c + t.h * s, t.w * s + t.h * c]; // the turned image's bounding box, in pixels
  const scale = Math.min((view.w * FILL) / bw, (view.h * FILL) / bh);
  return { ...next, scale: Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, scale)) };
}

export type DragMode = "move" | "scale" | "rotate";
const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/**
 * The image after a drag from plan point `from` to `to`: `move` carries it along (to the centimetre), `scale` grows or shrinks it about its centre by how much
 * farther from the centre the pointer is, `rotate` turns it by the angle the pointer swept about the centre (`step`: in 15 degree steps).
 */
export function dragTrace(t0: Trace, mode: DragMode, from: Pt, to: Pt, step = false): Trace {
  if (mode === "move") return { ...t0, x: round(t0.x + to.x - from.x, 2), y: round(t0.y + to.y - from.y, 2) };
  const [d0, d1] = [Math.hypot(from.x - t0.x, from.y - t0.y), Math.hypot(to.x - t0.x, to.y - t0.y)];
  if (mode === "scale") {
    if (d0 < 1e-9) return t0;
    return { ...t0, scale: Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, Number((t0.scale * (d1 / d0)).toPrecision(5)))) };
  }
  const swept = (Math.atan2(to.y - t0.y, to.x - t0.x) - Math.atan2(from.y - t0.y, from.x - t0.x)) / RAD;
  const turn = step ? Math.round((t0.rotation + swept) / 15) * 15 : t0.rotation + swept;
  return { ...t0, rotation: round(turnOf(turn), 1) };
}
