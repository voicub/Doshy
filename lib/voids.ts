import { CATALOG } from "./catalog.ts";
import { findLevel, levelIdOf, sortedLevels } from "./levels.ts";
import type { Item, Level, Plan, Pt, SlabVoid } from "./types.ts";

/** Room left around a stair footprint in the floor it climbs through (m). */
export const STAIR_CLEARANCE = 0.05;
/** A hole is kept this far inside its floor rectangle so it never touches the outline (the triangulator needs a real hole). */
const EDGE_GAP = 0.002;
const MIN_AREA = 1e-4;
const DEG = Math.PI / 180;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const levelAbove = (plan: Pick<Plan, "levels">, levelId: string): Level | undefined => {
  const ls = sortedLevels(plan);
  return ls[ls.findIndex((l) => l.id === levelId) + 1];
};
export const levelBelow = (plan: Pick<Plan, "levels">, levelId: string): Level | undefined => {
  const ls = sortedLevels(plan);
  return ls[ls.findIndex((l) => l.id === levelId) - 1];
};

/** Voids that cut the floor of a level. The lowest level lies on the ground: nothing is below it to look into, so its voids do nothing. */
export function activeVoids(plan: Plan, levelId: string): SlabVoid[] {
  if (!levelBelow(plan, levelId)) return [];
  return (plan.voids ?? []).filter((v) => levelIdOf(plan, v) === levelId);
}

/** The four corners of a void in plan metres (turned about its centre). */
export function voidCorners(v: Pick<SlabVoid, "x" | "y" | "w" | "h" | "rot">): Pt[] {
  const c = { x: v.x + v.w / 2, y: v.y + v.h / 2 };
  const [cos, sin] = [Math.cos((v.rot ?? 0) * DEG), Math.sin((v.rot ?? 0) * DEG)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const [lx, ly] = [(sx * v.w) / 2, (sy * v.h) / 2];
    return { x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos };
  });
}

// ---- hole geometry for the slab and floor of a level ----

type Rect = { x: number; y: number; w: number; h: number };

/** Sutherland-Hodgman: the part of a convex polygon on the inner side of the line `n . p >= c`. */
function clipHalf(poly: Pt[], n: Pt, c: number): Pt[] {
  const side = (p: Pt) => n.x * p.x + n.y * p.y - c;
  return poly.flatMap((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const [sp, sq] = [side(p), side(q)];
    const cut = sp * sq < 0 ? [{ x: p.x + ((q.x - p.x) * sp) / (sp - sq), y: p.y + ((q.y - p.y) * sp) / (sp - sq) }] : [];
    return sp >= 0 ? [p, ...cut] : cut;
  });
}

const areaOf = (p: Pt[]) => Math.abs(p.reduce((a, q, i) => a + q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y, 0)) / 2;

/** Do two convex polygons share area (touching edges do not count)? Separating-axis test. */
function overlaps(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const q = poly[(i + 1) % poly.length];
      const n = { x: q.y - poly[i].y, y: poly[i].x - q.x };
      const proj = (s: Pt[]) => s.map((p) => n.x * p.x + n.y * p.y);
      const [pa, pb] = [proj(a), proj(b)];
      if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
    }
  }
  return true;
}

/** Convex hull (monotone chain). */
function hull(pts: Pt[]): Pt[] {
  const s = [...pts].sort((p, q) => p.x - q.x || p.y - q.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(s), ...half([...s].reverse())];
}

/**
 * The holes a floor rectangle gets from a level's voids: each void clipped to the rectangle (and kept a hair inside it), nothing smaller than a
 * sliver. Voids that overlap each other become one hole.
 * ponytail: overlapping holes merge to their convex hull, so an L made of two crossing voids loses its notch. Exact union if that ever matters.
 */
export function holesIn(rect: Rect, voids: Pick<SlabVoid, "x" | "y" | "w" | "h" | "rot">[]): Pt[][] {
  const [x0, y0, x1, y1] = [rect.x + EDGE_GAP, rect.y + EDGE_GAP, rect.x + rect.w - EDGE_GAP, rect.y + rect.h - EDGE_GAP];
  let holes = voids
    .map((v) => [{ x: 1, y: 0, c: x0 }, { x: -1, y: 0, c: -x1 }, { x: 0, y: 1, c: y0 }, { x: 0, y: -1, c: -y1 }].reduce((poly, e) => (poly.length ? clipHalf(poly, e, e.c) : poly), voidCorners(v)))
    .filter((p) => p.length >= 3 && areaOf(p) > MIN_AREA);
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < holes.length && !merged; i++) {
      for (let j = i + 1; j < holes.length && !merged; j++) {
        if (!overlaps(holes[i], holes[j])) continue;
        holes = [...holes.filter((_, k) => k !== i && k !== j), hull([...holes[i], ...holes[j]])];
        merged = true;
      }
    }
  }
  return holes;
}

// ---- stairs ----

const stairOf = (it: Pick<Item, "kind">) => CATALOG[it.kind]?.stair;

/** How tall a newly placed item of `kind` on `levelId` is: a stair spans the real storey (to the level above, or from the level below for a basement stair). */
export function placedHeight(plan: Plan, levelId: string, kind: string): number {
  const def = CATALOG[kind];
  const here = findLevel(plan, levelId);
  const other = def.stair === "up" ? levelAbove(plan, here.id) : def.stair === "down" ? levelBelow(plan, here.id) : undefined;
  return other ? r3(Math.abs(other.elevation - here.elevation)) : def.h;
}

/** The hole a stair item cuts, or none: up-stairs open the level above, basement stairs their own floor (when a level lies below). */
export function autoVoidFor(plan: Plan, item: Item): SlabVoid | undefined {
  const stair = stairOf(item);
  if (stair !== "up" && stair !== "down") return undefined;
  const own = levelIdOf(plan, item);
  const target = stair === "up" ? levelAbove(plan, own) : levelBelow(plan, own) && findLevel(plan, own);
  if (!target) return undefined;
  const c = STAIR_CLEARANCE;
  return {
    id: `auto:${item.id}`,
    x: r3(item.x - item.w / 2 - c),
    y: r3(item.y - item.d / 2 - c),
    w: r3(item.w + 2 * c),
    h: r3(item.d + 2 * c),
    ...(item.rot % 360 ? { rot: item.rot } : {}),
    name: "Stairs opening",
    level: target.id,
    auto: item.id,
  };
}

const sameVoid = (a: SlabVoid, b: SlabVoid) => a.id === b.id && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.rot === b.rot && a.level === b.level && a.auto === b.auto;

/**
 * Keep the derived stair holes in step with the stairs: one per stair item, regenerated from its position, size, turn and level, so it follows the
 * stair when it moves or turns and goes when the stair (or its level) goes. Hand-drawn voids are untouched. Same plan object when nothing changes.
 */
export function withAutoVoids(plan: Plan): Plan {
  const have = plan.voids ?? [];
  const old = have.filter((v) => v.auto);
  const want = plan.items.flatMap((it) => autoVoidFor(plan, it) ?? []);
  if (old.length === want.length && old.every((v, i) => sameVoid(v, want[i]))) return plan;
  const voids = [...have.filter((v) => !v.auto), ...want];
  return { ...plan, voids: voids.length ? voids : undefined };
}

/** Turn a hand-drawn void a quarter turn about its centre: the patch to apply (width and depth swap, the centre stays). */
export const turnVoid = (v: Pick<SlabVoid, "x" | "y" | "w" | "h">): Pick<SlabVoid, "x" | "y" | "w" | "h"> => ({ x: r3(v.x + v.w / 2 - v.h / 2), y: r3(v.y + v.h / 2 - v.w / 2), w: v.h, h: v.w });
