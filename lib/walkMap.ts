// The walkthrough's small top-down map and room name. Pure: components/ui/WalkMiniMap.tsx draws what these return.
import { planBounds, roomAtLevel } from "./geometry.ts";
import { onLevel } from "./levels.ts";
import { solidSpans } from "./walkCollide.ts";
import { CATALOG } from "./catalog.ts";
import { clamp } from "./mathUtil.ts";
import type { Plan, Pt } from "./types.ts";

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type ViewBox = { x: number; y: number; w: number; h: number };

/** The name of the room under (x, y) on a storey: an alcove counts as its host, and nothing under the feet is "Outside". */
export function roomNameAt(plan: Plan, levelId: string, x: number, y: number): string {
  const r = roomAtLevel(plan, levelId, x, y);
  if (!r) return "Outside";
  return (r.parent ? plan.rooms.find((h) => h.id === r.parent) : undefined)?.name ?? r.name;
}

/** The extent of a storey's rooms and walls (m); the whole plan's when the storey is empty. */
export function mapBounds(plan: Plan, levelId: string): Box {
  const c = onLevel(plan, levelId);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of c.rooms) xs.push(r.x, r.x + r.w), ys.push(r.y, r.y + r.h);
  for (const w of c.walls) xs.push(w.a.x, w.b.x), ys.push(w.a.y, w.b.y);
  if (!xs.length) return planBounds(plan) ?? { x0: 0, y0: 0, x1: 10, y1: 10 };
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** The SVG view box (plan metres) that shows `b` with `pad` metres round it, widened one way so the box's aspect ratio (width / height) is kept and the plan is centred. */
export function mapViewBox(b: Box, aspect: number, pad: number): ViewBox {
  const [w, h] = [Math.max(b.x1 - b.x0, 1) + pad * 2, Math.max(b.y1 - b.y0, 1) + pad * 2];
  const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  const [vw, vh] = w / h >= aspect ? [w, w / aspect] : [h * aspect, h];
  return { x: cx - vw / 2, y: cy - vh / 2, w: vw, h: vh };
}

/** Where the arrow's tip is: `len` metres ahead of (x, y) when facing `yaw` (clockwise from plan up). */
export const headingTip = (x: number, y: number, yaw: number, len: number): Pt => ({ x: x + Math.sin(yaw) * len, y: y - Math.cos(yaw) * len });

export type MapLine = { x1: number; y1: number; x2: number; y2: number };
/** A storey's walls as lines, with the doors and passages left open (the same gaps a walker uses) so the map shows where you can go. */
export function mapWalls(plan: Plan, levelId: string): MapLine[] {
  const c = onLevel(plan, levelId);
  return c.walls.flatMap((w) => {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (len < 1e-6) return [];
    const [dx, dy] = [(w.b.x - w.a.x) / len, (w.b.y - w.a.y) / len];
    return solidSpans(w, c.openings).map((s) => ({ x1: w.a.x + dx * s.s0, y1: w.a.y + dy * s.s0, x2: w.a.x + dx * s.s1, y2: w.a.y + dy * s.s1 }));
  });
}

/** The corners of each staircase on a storey, so the map can show where the floor changes. */
export function mapStairs(plan: Plan, levelId: string): Pt[][] {
  return onLevel(plan, levelId).items.flatMap((it) => {
    if (!CATALOG[it.kind]?.stair) return [];
    const [c, s] = [Math.cos((it.rot * Math.PI) / 180), Math.sin((it.rot * Math.PI) / 180)];
    return [[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: it.x + ((sx * it.w) / 2) * c - ((sy * it.d) / 2) * s, y: it.y + ((sx * it.w) / 2) * s + ((sy * it.d) / 2) * c }))];
  });
}

/** `v` as a 0..1 fraction of the view box (the arrow is placed with CSS percentages, outside the SVG's own scaling). */
export const inView = (v: ViewBox, p: Pt): Pt => ({ x: clamp((p.x - v.x) / v.w, 0, 1), y: clamp((p.y - v.y) / v.h, 0, 1) });
