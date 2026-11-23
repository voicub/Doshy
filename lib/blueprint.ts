import { isOutdoorFloor } from "./materials.ts";
import { WALL_T, wallLen } from "./geometry.ts";
import { shellWalls } from "./fences.ts";
import type { Plan, Pt, Room, Wall } from "./types.ts";

/** Millimetre-paper rulings, finest first: every level is a set of lines `step` metres apart. */
const STEPS = [0.01, 0.05, 0.1, 0.5, 1, 5] as const;
const ALPHA = [0.1, 0.16, 0.22, 0.3, 0.38, 0.55] as const; // heavier lines for the coarser rulings, like printed graph paper
const FADE_FROM = 6; // a ruling appears when its lines are this many screen pixels apart ...
const FADE_SPAN = 12; // ... and is fully drawn this many pixels later

type GridLevel = { step: number; alpha: number };

/** Which rulings to draw at this zoom. `px` is metres per screen pixel. A level too dense to read is skipped, so zooming in reveals centimetres and then millimetre-paper detail. */
export function gridLevels(px: number): GridLevel[] {
  return STEPS.flatMap((step, i) => {
    const gap = step / px;
    return gap <= FADE_FROM ? [] : [{ step, alpha: ALPHA[i] * Math.min(1, (gap - FADE_FROM) / FADE_SPAN) }];
  });
}

/** 1:N printed at 96 dpi for a view where one screen pixel is `px` metres, rounded to a drawing scale an architect would use. */
export function scaleDenominator(px: number): number {
  const exact = (px * 1000) / 0.2646; // paper millimetres per metre of plan = 1 / (px size in m per mm of paper)
  const nice = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 5000];
  return nice.reduce((best, n) => (Math.abs(Math.log(n / exact)) < Math.abs(Math.log(best / exact)) ? n : best), nice[0]);
}

const mid = (w: Wall): Pt => ({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 });
const inRoom = (rooms: Room[], p: Pt) => rooms.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);

/** Unit normal of the wall pointing to its outside, or null when both faces (or neither) are inside a room. */
export function outsideNormal(plan: Pick<Plan, "rooms">, w: Wall, probe = 0.4): Pt | null {
  const len = wallLen(w);
  if (len < 1e-6) return null;
  const n = { x: -(w.b.y - w.a.y) / len, y: (w.b.x - w.a.x) / len };
  const m = mid(w);
  const front = inRoom(plan.rooms, { x: m.x + n.x * probe, y: m.y + n.y * probe });
  const back = inRoom(plan.rooms, { x: m.x - n.x * probe, y: m.y - n.y * probe });
  if (front === back) return null;
  return front ? { x: -n.x, y: -n.y } : n;
}

/** Axis positions: wall lines that are within `tol` of each other count as one grid line. */
function cluster(values: number[], tol: number): number[] {
  const out: number[][] = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && v - last[last.length - 1] <= tol) last.push(v);
    else out.push([v]);
  }
  return out.map((g) => g.reduce((s, v) => s + v, 0) / g.length);
}

/** Structural grid lines: x of every vertical wall and y of every horizontal one. */
export function wallAxes(walls: Wall[], tol = 0.3): { xs: number[]; ys: number[] } {
  const vertical = walls.filter((w) => Math.abs(w.a.x - w.b.x) < 1e-3 && wallLen(w) > 0.3);
  const horizontal = walls.filter((w) => Math.abs(w.a.y - w.b.y) < 1e-3 && wallLen(w) > 0.3);
  return { xs: cluster(vertical.map((w) => w.a.x), tol), ys: cluster(horizontal.map((w) => w.a.y), tol) };
}

/** Outer bounds of the walls, thickness included, or null without walls. */
export function wallBounds(walls: Wall[]): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!walls.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const w of walls) {
    const h = (w.thickness ?? WALL_T) / 2;
    x0 = Math.min(x0, w.a.x - h, w.b.x - h);
    y0 = Math.min(y0, w.a.y - h, w.b.y - h);
    x1 = Math.max(x1, w.a.x + h, w.b.x + h);
    y1 = Math.max(y1, w.a.y + h, w.b.y + h);
  }
  return { x0, y0, x1, y1 };
}

/** Floor area of a room including its child areas (alcoves, niches); door-threshold strips under 0.5 m² are wall thickness, not floor. */
export function roomArea(plan: Pick<Plan, "rooms">, room: Room): number {
  const kids = plan.rooms.filter((c) => c.parent === room.id && c.w * c.h >= 0.5);
  return room.w * room.h + kids.reduce((s, c) => s + c.w * c.h, 0);
}

/** Drawing tags "D1", "D2", "W1" ...: doors and windows numbered in wall order, then along each wall. */
export function openingTags(plan: Pick<Plan, "walls" | "openings">): Record<string, string> {
  const order = new Map(plan.walls.map((w, i) => [w.id, i]));
  const sorted = plan.openings
    .flatMap((o) => {
      const wallIndex = order.get(o.wallId);
      return wallIndex === undefined ? [] : [{ o, wallIndex }];
    })
    .sort((a, b) => a.wallIndex - b.wallIndex || a.o.t - b.o.t)
    .map((x) => x.o);
  const count = { door: 0, window: 0 };
  return Object.fromEntries(sorted.map((o) => [o.id, `${o.type === "door" ? "D" : "W"}${++count[o.type]}`]));
}

type PlanStats = { net: number; walls: number; rooms: number };

/** Areas for the title block: net floor area of the rooms, and the plan area the walls take up. */
export function planStats(plan: Pick<Plan, "rooms" | "walls">): PlanStats {
  const top = plan.rooms.filter((r) => !r.parent);
  return {
    rooms: top.length,
    net: top.filter((r) => !isOutdoorFloor(r.floor)).reduce((s, r) => s + roomArea(plan, r), 0), // gardens, paved yards and pools are not floor area
    walls: shellWalls(plan.walls).reduce((s, w) => s + wallLen(w) * (w.thickness ?? WALL_T), 0),
  };
}
