import { levelIdOf, onLevel } from "./levels.ts";
import { clamp } from "./mathUtil.ts";
import type { Item, Plan, Pt } from "./types.ts";

/** Friendly views of a camera: how wide it sees and how far. Item.params `fov` (degrees) and `range` (metres) hold the numbers. */
export const FOV_PRESETS = [
  { id: "wide", label: "Wide", fov: 110, range: 4 },
  { id: "normal", label: "Normal", fov: 80, range: 6 },
  { id: "narrow", label: "Narrow", fov: 45, range: 9 },
] as const;
export const FOV_MIN = 20;
export const FOV_MAX = 170;
export const RANGE_MIN = 1;
export const RANGE_MAX = 20;

/** The angle and range a camera is set to: its params, else the default of its kind (a ceiling dome sees wide, the others normal). */
export function fovOf(item: Pick<Item, "kind" | "params">): { fov: number; range: number } {
  const d = FOV_PRESETS[/dome/.test(item.kind) ? 0 : 1];
  const fov = item.params?.fov;
  const range = item.params?.range;
  return {
    fov: clamp(typeof fov === "number" && Number.isFinite(fov) ? fov : d.fov, FOV_MIN, FOV_MAX),
    range: clamp(typeof range === "number" && Number.isFinite(range) ? range : d.range, RANGE_MIN, RANGE_MAX),
  };
}

/** The preset a camera is set to, if its numbers match one. */
export const presetOf = (fov: number, range: number) => FOV_PRESETS.find((p) => p.fov === fov && p.range === range)?.id;

type Seg = [Pt, Pt];

/** Wall centre lines of a level with a gap at every door and window: a camera sees through those. */
function wallSegments(plan: Plan, levelId: string): Seg[] {
  const lv = onLevel(plan, levelId);
  return lv.walls.flatMap((w): Seg[] => {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (len < 1e-6) return [];
    const at = (s: number): Pt => ({ x: w.a.x + ((w.b.x - w.a.x) * s) / len, y: w.a.y + ((w.b.y - w.a.y) * s) / len });
    const cuts = lv.openings.filter((o) => o.wallId === w.id).map((o): [number, number] => [o.t * len - o.width / 2, o.t * len + o.width / 2]).sort((p, q) => p[0] - q[0]);
    const out: Seg[] = [];
    let lo = 0;
    for (const [a, b] of cuts) {
      if (a > lo) out.push([at(lo), at(a)]);
      lo = Math.max(lo, b);
    }
    if (lo < len) out.push([at(lo), at(len)]);
    return out;
  });
}

/** Distance along the ray `o + t * d` to the segment, or Infinity. */
function hit(o: Pt, d: Pt, [a, b]: Seg): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const den = d.x * ey - d.y * ex;
  if (Math.abs(den) < 1e-12) return Infinity;
  const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / den;
  const u = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : Infinity;
}

/**
 * The floor a camera sees, as a fan: the camera first, then one point per ray across its field of view, each stopped by the first wall
 * (doors and windows are see-through) or by the range. The camera faces its front (+z, plan direction (-sin rot, cos rot)).
 */
export function fovPolygon(plan: Plan, item: Item, rays = 32): Pt[] {
  const { fov, range } = fovOf(item);
  const rot = (item.rot * Math.PI) / 180;
  const face = Math.atan2(Math.cos(rot), -Math.sin(rot));
  const eye: Pt = { x: item.x - Math.sin(rot) * 0.05, y: item.y + Math.cos(rot) * 0.05 };
  const segs = wallSegments(plan, levelIdOf(plan, item));
  const out: Pt[] = [eye];
  for (let k = 0; k <= rays; k++) {
    const a = face + ((k / rays - 0.5) * fov * Math.PI) / 180;
    const d = { x: Math.cos(a), y: Math.sin(a) };
    const t = Math.min(range, ...segs.map((s) => hit(eye, d, s)));
    out.push({ x: eye.x + d.x * t, y: eye.y + d.y * t });
  }
  return out;
}

/** Floor area (m2) of a fan from `fovPolygon`. */
export function fanArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 1; i + 1 < poly.length; i++) a += ((poly[i].x - poly[0].x) * (poly[i + 1].y - poly[0].y) - (poly[i + 1].x - poly[0].x) * (poly[i].y - poly[0].y)) / 2;
  return Math.abs(a);
}
