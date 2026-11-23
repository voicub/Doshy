import { shellWalls } from "./fences.ts";
import { levelIdOf } from "./levels.ts";
import { clamp } from "./mathUtil.ts";
import type { Opening, Plan, Pt, Room, Wall } from "./types";

export const WALL_H = 2.58;
export const WALL_CUT_H = 0.9;
export const WALL_T = 0.12;
const DOOR_H = 2.1;
const WIN_SILL = 0.9;
const WIN_TOP = 2.1;
/** Smallest opening dimension the editor allows (metres). */
export const MIN_OPENING = 0.2;
/** What a freshly placed door or window measures; the inspector then edits each value. */
export const OPENING_DEFAULTS = {
  door: { width: 0.9, sill: 0, height: DOOR_H },
  window: { width: 1.2, sill: WIN_SILL, height: WIN_TOP - WIN_SILL },
} as const;

export const snap = (v: number, g = 0.25) => Math.round(v / g) * g;
export const wallLen = (w: Wall) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);

/** Closest point on wall to p: t in 0..1 along the wall, dist from p. */
export function projectOnWall(w: Wall, p: Pt) {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len2, 0, 1);
  return { t, dist: Math.hypot(w.a.x + dx * t - p.x, w.a.y + dy * t - p.y) };
}

export type Box = { s0: number; s1: number; y0: number; y1: number };
export type OpeningDims = { t: number; width: number; sill: number; height: number };

/**
 * Clamp an opening to what physically fits in a wall of length `len` and height `wallH`:
 * it stays inside the wall, no smaller than MIN_OPENING, and its top never passes the ceiling.
 */
export function normalizeOpening<T extends OpeningDims>(o: T, len: number, wallH = WALL_H): T {
  const width = clamp(Number.isFinite(o.width) ? o.width : OPENING_DEFAULTS.door.width, Math.min(MIN_OPENING, len), Math.max(len, MIN_OPENING));
  const sill = clamp(Number.isFinite(o.sill) ? o.sill : 0, 0, wallH - MIN_OPENING);
  const height = clamp(Number.isFinite(o.height) ? o.height : DOOR_H, MIN_OPENING, wallH - sill);
  const half = len > 0 ? width / 2 / len : 0;
  const t = half >= 0.5 ? 0.5 : clamp(Number.isFinite(o.t) ? o.t : 0.5, half, 1 - half);
  return { ...o, width, sill, height, t };
}

/** Fill in dimensions for openings saved before doors and windows had their own height and sill. */
export function withOpeningDims<T extends { type: "door" | "window"; sill?: number; height?: number }>(o: T): T & { sill: number; height: number } {
  const d = OPENING_DEFAULTS[o.type];
  return { ...o, sill: o.sill ?? d.sill, height: o.height ?? d.height };
}

/** Solid segments of a wall (along-wall metres s, height y) after cutting each opening at its own sill and height. */
export function wallBoxes(len: number, openings: OpeningDims[], height: number): Box[] {
  const spans = openings
    .map((o) => ({ ...o, s0: Math.max(0, o.t * len - o.width / 2), s1: Math.min(len, o.t * len + o.width / 2) }))
    .sort((a, b) => a.s0 - b.s0);
  const out: Box[] = [];
  let cur = 0;
  for (const o of spans) {
    const s0 = Math.max(o.s0, cur);
    if (o.s1 <= s0) continue;
    if (s0 > cur) out.push({ s0: cur, s1: s0, y0: 0, y1: height });
    const gapLo = o.sill;
    const gapHi = o.sill + o.height;
    if (gapLo > 0) out.push({ s0, s1: o.s1, y0: 0, y1: Math.min(gapLo, height) });
    if (height > gapHi) out.push({ s0, s1: o.s1, y0: gapHi, y1: height });
    cur = o.s1;
  }
  if (cur < len) out.push({ s0: cur, s1: len, y0: 0, y1: height });
  return out;
}

export type Bounds = { x0: number; y0: number; x1: number; y1: number };

const boundsOf = (pts: Pt[]): Bounds | null => {
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};

export const roomBounds = (r: Room): Bounds => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });

/** The building: wall extent (fences and garden walls are not the building), else room extent, else furniture extent. Null for an empty plan. */
export function planBounds(plan: Plan): Bounds | null {
  return (
    boundsOf(shellWalls(plan.walls).flatMap((w) => [w.a, w.b])) ??
    boundsOf(plan.rooms.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }])) ??
    boundsOf(plan.items.map((i) => ({ x: i.x, y: i.y })))
  );
}

/** Smallest room containing the point (an inner room wins over a bigger one it overlaps). */
export function roomAt(plan: Plan, x: number, y: number): Room | undefined {
  return plan.rooms
    .filter((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
}

/** Plan position of an opening's centre on its wall, or undefined when its wall is gone. */
export function openingPoint(plan: Plan, o: Pick<Opening, "wallId" | "t">): Pt | undefined {
  const w = plan.walls.find((x) => x.id === o.wallId);
  return w ? { x: w.a.x + (w.b.x - w.a.x) * o.t, y: w.a.y + (w.b.y - w.a.y) * o.t } : undefined;
}

/**
 * Which jamb a door or casement hangs on and which way it opens, in the wall's local 3D frame (x along a -> b, +z = the "right" side
 * when walking a -> b in plan view). `h` is -1 for hinge "start", +1 for "end"; `n` is +1 for swing "right", -1 for "left".
 * `fallback` is the side used when the opening has no `swing` (the editor's default is "left").
 */
export function openingSwing(o: { hinge?: "start" | "end"; swing?: "left" | "right" }, fallback: "left" | "right" = "left"): { h: -1 | 1; n: -1 | 1 } {
  return { h: o.hinge === "end" ? 1 : -1, n: (o.swing ?? fallback) === "right" ? 1 : -1 };
}

/** Smallest room of `levelId` containing the point: like `roomAt` but ignores rooms on other storeys. */
export function roomAtLevel(plan: Plan, levelId: string, x: number, y: number): Room | undefined {
  return roomAt({ ...plan, rooms: plan.rooms.filter((r) => levelIdOf(plan, r) === levelId) }, x, y);
}
