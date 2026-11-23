// The 2D plan editor's camera: a centre and a width in metres (the height follows from the canvas aspect). Pure; the node test runner loads this file directly.
import { areaCorners } from "./ground.ts";
import type { Bounds } from "./geometry.ts";
import type { Plan, Pt, Sel } from "./types.ts";
import type { Box } from "./viewInset.ts";

export const REF_W = 32; // an empty plan is framed this many metres wide
export const FRAME_PAD = 3.4; // room around the plan for the overall dimensions and axis bubbles
export const FRAME_PAD_TINY = 1.4; // a small screen cannot afford as much margin
export const FRAME_MIN_W = 16;
export const ZOOM_MIN = 3;
export const ZOOM_MAX = 120;

export type Frame = { x: number; y: number; w: number; h: number };
/** What the editor looks at: a centre and a width in metres; the height follows from the canvas aspect so pointer maths stays exact. */
export type View = { cx: number; cy: number; w: number };

export const rectOf = (v: View, aspect: number): Frame => {
  const h = v.w / aspect;
  return { x: v.cx - v.w / 2, y: v.cy - h / 2, w: v.w, h };
};

/** The view that shows `b` (padded, never tighter than FRAME_MIN_W wide) centred in `free`, the part of the `w` x `h` px canvas that nothing covers. `free` = the whole canvas gives the classic centred fit. */
export function fitViewFree(b: Bounds | null, w: number, h: number, free: Box, pad = FRAME_PAD): View {
  const freeW = Math.max(1, free.x1 - free.x0);
  const freeH = Math.max(1, free.y1 - free.y0);
  const bc = b ? { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } : { x: REF_W / 2, y: REF_W / 2 / 1.6 };
  const needW = b ? Math.max(FRAME_MIN_W, b.x1 - b.x0 + pad * 2) : REF_W;
  const needH = b ? b.y1 - b.y0 + pad * 2 : 0;
  const mpp = Math.min(ZOOM_MAX / w, Math.max(needW / freeW, needH / freeH)); // metres per px
  return { cx: bc.x - ((free.x0 + free.x1) / 2 - w / 2) * mpp, cy: bc.y - ((free.y0 + free.y1) / 2 - h / 2) * mpp, w: mpp * w };
}

/** The smallest view that keeps the current one and also holds `b` (with padding), or null when `b` already lies inside it (inset by `margin`). */
export function growTo(v: View, b: Bounds, aspect: number, margin: number): View | null {
  const f = rectOf(v, aspect);
  if (b.x0 >= f.x + margin && b.y0 >= f.y + margin && b.x1 <= f.x + f.w - margin && b.y1 <= f.y + f.h - margin) return null;
  const x0 = Math.min(f.x, b.x0 - FRAME_PAD);
  const y0 = Math.min(f.y, b.y0 - FRAME_PAD);
  const x1 = Math.max(f.x + f.w, b.x1 + FRAME_PAD);
  const y1 = Math.max(f.y + f.h, b.y1 + FRAME_PAD);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.min(ZOOM_MAX, Math.max(x1 - x0, (y1 - y0) * aspect)) };
}

const around = (pts: Pt[], pad: number): Bounds => ({
  x0: Math.min(...pts.map((p) => p.x)) - pad,
  y0: Math.min(...pts.map((p) => p.y)) - pad,
  x1: Math.max(...pts.map((p) => p.x)) + pad,
  y1: Math.max(...pts.map((p) => p.y)) + pad,
});

/** The plan-space box of the selected thing (what a sheet must not hide), or null when there is nothing to show. */
export function selBounds(plan: Plan, sel: Sel): Bounds | null {
  if (!sel) return null;
  const pad = 0.15;
  if (sel.type === "wall") {
    const w = plan.walls.find((x) => x.id === sel.id);
    return w ? around([w.a, w.b], pad) : null;
  }
  if (sel.type === "opening") {
    const o = plan.openings.find((x) => x.id === sel.id);
    const w = o && plan.walls.find((x) => x.id === o.wallId);
    if (!o || !w) return null;
    const c = { x: w.a.x + (w.b.x - w.a.x) * o.t, y: w.a.y + (w.b.y - w.a.y) * o.t };
    return around([c], Math.max(o.width / 2, pad));
  }
  if (sel.type === "item") {
    const it = plan.items.find((x) => x.id === sel.id);
    return it ? around([it], Math.max(it.w, it.d) / 2 + pad) : null;
  }
  if (sel.type === "room" || sel.type === "void") {
    const r = (sel.type === "room" ? plan.rooms : plan.voids ?? []).find((x) => x.id === sel.id);
    return r ? { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h } : null;
  }
  if (sel.type === "ground") {
    const g = plan.ground?.find((x) => x.id === sel.id);
    return g ? around(areaCorners(g), pad) : null;
  }
  const p = plan.paths?.find((x) => x.id === sel.id);
  return p && p.points.length ? around(p.points, p.width / 2 + pad) : null;
}
