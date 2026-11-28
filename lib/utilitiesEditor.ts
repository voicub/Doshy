import type { Item, Plan, Pt } from "./types.ts";
import { valveInfo, type UtilityLine } from "./utilities.ts";

export const utilityLinesOn = (plan: Plan, level: string): UtilityLine[] =>
  (plan.utilities ?? []).filter((l) => (l.level ?? plan.levels?.[0]?.id ?? "L0") === level);

export function projectUtilityPoint(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y;
  const den = dx * dx + dy * dy;
  const t = den ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / den)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Only the active level participates. Valves/corners win over a projection at the same distance. */
export function snapUtilityPoint(plan: Plan, level: string, raw: Pt, radius: number, grid: number, free = false, skip?: string): Pt {
  if (free) return raw;
  const same = (e: { level?: string }) => (e.level ?? plan.levels?.[0]?.id ?? "L0") === level;
  const lines = utilityLinesOn(plan, level).filter((l) => l.id !== skip);
  const walls = plan.walls.filter(same);
  const rooms = plan.rooms.filter(same);
  const valves = plan.items.filter((it: Item) => same(it) && valveInfo(it.kind));
  const ends = [...valves.map(({ x, y }) => ({ x, y })), ...lines.flatMap((l) => l.pts), ...walls.flatMap((w) => [w.a, w.b]), ...rooms.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h }])];
  const segments = [...walls.map((w) => [w.a, w.b]), ...lines.flatMap((l) => l.pts.slice(1).map((b, i) => [l.pts[i], b])), ...rooms.flatMap((r) => {
    const a = { x: r.x, y: r.y }, b = { x: r.x + r.w, y: r.y }, c = { x: r.x + r.w, y: r.y + r.h }, d = { x: r.x, y: r.y + r.h };
    return [[a, b], [b, c], [c, d], [d, a]];
  })];
  let best: Pt | undefined, distance = radius;
  for (const p of [...ends, ...segments.map(([a, b]) => projectUtilityPoint(raw, a, b))]) {
    const d = Math.hypot(p.x - raw.x, p.y - raw.y);
    if (d <= distance && (!best || d < distance - 0.002)) { best = p; distance = d; }
  }
  return best ?? (grid > 0 ? { x: Math.round(raw.x / grid) * grid, y: Math.round(raw.y / grid) * grid } : raw);
}

export function hitUtilityLine(lines: readonly UtilityLine[], p: Pt, radius: number): UtilityLine | undefined {
  let best: UtilityLine | undefined, distance = radius;
  for (const line of lines) for (let i = 1; i < line.pts.length; i++) {
    const q = projectUtilityPoint(p, line.pts[i - 1], line.pts[i]);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= distance) { best = line; distance = d; }
  }
  return best;
}
