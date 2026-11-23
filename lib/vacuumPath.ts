import { CATALOG } from "./catalog.ts";
import { WALL_T } from "./geometry.ts";
import { levelIdOf, onLevel } from "./levels.ts";
import { classify } from "./placement.ts";
import { isOpenAir } from "./stairs.ts";
import type { Item, Opening, Plan, Pt, Wall } from "./types.ts";

// Pure planning for the robot vacuum: a 5 cm occupancy grid of one storey, boustrophedon coverage of the floor the robot can reach,
// and grid A* (string-pulled) for hops between rooms and the way home. Nothing here depends on React or three.js.

/** Radius of the robot body (m). */
export const ROBOT_R = 0.17;
export const CELL = 0.05;
/** Robot centre keeps this far from every obstacle: body radius plus a cell diagonal, so a point anywhere inside a free cell is still >= ROBOT_R away. */
const CLEARANCE = ROBOT_R + 0.03;
/** Reach of the body plus side brush: floor within this of the path counts as cleaned. */
const CLEAN_R = 0.22;
/** Distance between two lanes of the zig-zag (m): a little less than the body width so lanes overlap. */
export const LANE = 0.3;
const LANE_ROWS = Math.round(LANE / CELL);
const DOCK_APPROACH = CLEARANCE + 0.02;
/** Floor items raised more than this (a lamp on a desk) do not block the robot. */
const RAISED = 0.15;

const isDockKind = (kind: string) => /(vacuum|robot)_dock/.test(kind);
export const isVacuumKind = (kind: string) => /robot_vacuum/.test(kind) && !isDockKind(kind);

export type Grid = {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  /** the robot centre may be here */
  free: Uint8Array;
  /** inside an indoor room, or in a doorway between two */
  walk: Uint8Array;
  /** inside an obstacle itself (a wall, a piece of furniture) */
  raw: Uint8Array;
  /** in or next to a doorway: crossed, never cleaned lane by lane */
  door: Uint8Array;
};

type Obb = { cx: number; cy: number; ux: number; uy: number; hw: number; hh: number };

const obbDist = (o: Obb, x: number, y: number) => {
  const dx = x - o.cx;
  const dy = y - o.cy;
  return Math.hypot(Math.max(Math.abs(dx * o.ux + dy * o.uy) - o.hw, 0), Math.max(Math.abs(dy * o.ux - dx * o.uy) - o.hh, 0));
};

const rect = (cx: number, cy: number, rotDeg: number, w: number, d: number): Obb => {
  const r = (rotDeg * Math.PI) / 180;
  return { cx, cy, ux: Math.cos(r), uy: Math.sin(r), hw: w / 2, hh: d / 2 };
};

/** The solid parts of a wall in plan: its slab, cut at every door (windows stay solid). */
function wallObbs(w: Wall, doors: Opening[]): Obb[] {
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  if (len < 1e-6) return [];
  const t = w.thickness ?? WALL_T;
  const ux = (w.b.x - w.a.x) / len;
  const uy = (w.b.y - w.a.y) / len;
  const cuts = doors.map((o): [number, number] => [o.t * len - o.width / 2, o.t * len + o.width / 2]).sort((p, q) => p[0] - q[0]);
  const spans: [number, number][] = [];
  let lo = -t / 2;
  for (const [a, b] of cuts) {
    if (a > lo) spans.push([lo, a]);
    lo = Math.max(lo, b);
  }
  if (lo < len + t / 2) spans.push([lo, len + t / 2]);
  return spans.map(([a, b]) => ({ cx: w.a.x + (ux * (a + b)) / 2, cy: w.a.y + (uy * (a + b)) / 2, ux, uy, hw: (b - a) / 2, hh: t / 2 }));
}

/** Calls `fn(cellIndex, distance)` for every cell whose centre lies within `reach` of the box. */
function eachNear(g: Grid, o: Obb, reach: number, fn: (c: number, d: number) => void) {
  const ex = Math.abs(o.ux) * o.hw + Math.abs(o.uy) * o.hh + reach;
  const ey = Math.abs(o.uy) * o.hw + Math.abs(o.ux) * o.hh + reach;
  const i0 = Math.max(0, Math.floor((o.cx - ex - g.x0) / CELL));
  const i1 = Math.min(g.nx - 1, Math.floor((o.cx + ex - g.x0) / CELL));
  const j0 = Math.max(0, Math.floor((o.cy - ey - g.y0) / CELL));
  const j1 = Math.min(g.ny - 1, Math.floor((o.cy + ey - g.y0) / CELL));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const d = obbDist(o, g.x0 + (i + 0.5) * CELL, g.y0 + (j + 0.5) * CELL);
      if (d <= reach) fn(j * g.nx + i, d);
    }
}

/** Occupancy grid of one storey. `skip` leaves items out (the vacuum itself). Null when the level has no indoor room. */
export function buildGrid(plan: Plan, levelId: string, skip: (i: Item) => boolean = () => false): Grid | null {
  const lv = onLevel(plan, levelId);
  const rooms = lv.rooms.filter((r) => !isOpenAir(r));
  if (!rooms.length) return null;
  const x0 = Math.floor((Math.min(...rooms.map((r) => r.x)) - 0.3) / CELL) * CELL;
  const y0 = Math.floor((Math.min(...rooms.map((r) => r.y)) - 0.3) / CELL) * CELL;
  const nx = Math.ceil((Math.max(...rooms.map((r) => r.x + r.w)) + 0.3 - x0) / CELL) + 1;
  const ny = Math.ceil((Math.max(...rooms.map((r) => r.y + r.h)) + 0.3 - y0) / CELL) + 1;
  const n = nx * ny;
  const g: Grid = { x0, y0, nx, ny, free: new Uint8Array(n), walk: new Uint8Array(n), raw: new Uint8Array(n), door: new Uint8Array(n) };
  const blocked = new Uint8Array(n);

  for (const r of rooms) {
    const i0 = Math.max(0, Math.ceil((r.x - x0) / CELL - 0.5));
    const i1 = Math.min(nx - 1, Math.floor((r.x + r.w - x0) / CELL - 0.5));
    const j0 = Math.max(0, Math.ceil((r.y - y0) / CELL - 0.5));
    const j1 = Math.min(ny - 1, Math.floor((r.y + r.h - y0) / CELL - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g.walk[j * nx + i] = 1;
  }

  const solid = (o: Obb) =>
    eachNear(g, o, CLEARANCE, (c, d) => {
      blocked[c] = 1;
      if (d <= 0) g.raw[c] = 1;
    });

  const doorsOf = new Map<string, Opening[]>();
  const wallById = new Map(lv.walls.map((w) => [w.id, w]));
  for (const o of lv.openings) {
    const w = wallById.get(o.wallId);
    if (o.type !== "door" || !w) continue;
    doorsOf.set(o.wallId, [...(doorsOf.get(o.wallId) ?? []), o]);
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const t = w.thickness ?? WALL_T;
    const c = { cx: w.a.x + (w.b.x - w.a.x) * o.t, cy: w.a.y + (w.b.y - w.a.y) * o.t, ux: (w.b.x - w.a.x) / len, uy: (w.b.y - w.a.y) / len };
    eachNear(g, { ...c, hw: o.width / 2, hh: t / 2 + 0.02 }, 0, (k) => (g.walk[k] = 1));
    eachNear(g, { ...c, hw: o.width / 2 + 0.1, hh: t / 2 + 0.1 }, 0, (k) => (g.door[k] = 1));
  }
  for (const w of lv.walls) for (const o of wallObbs(w, doorsOf.get(w.id) ?? [])) solid(o);

  for (const it of lv.items) {
    const def = CATALOG[it.kind];
    if (!def || skip(it) || classify(def, it.kind) !== "floor" || (it.elev ?? 0) > RAISED) continue;
    solid(rect(it.x, it.y, it.rot, it.w, it.d));
  }
  for (const v of plan.voids ?? []) if (levelIdOf(plan, v) === levelId) solid(rect(v.x + v.w / 2, v.y + v.h / 2, v.rot ?? 0, v.w, v.h));

  for (let c = 0; c < n; c++) g.free[c] = g.walk[c] && !blocked[c] ? 1 : 0;
  return g;
}

const cellPt = (g: Grid, c: number): Pt => ({ x: g.x0 + ((c % g.nx) + 0.5) * CELL, y: g.y0 + (Math.floor(c / g.nx) + 0.5) * CELL });

/** Index of the cell under a point, or -1 outside the grid. */
export function cellOf(g: Grid, p: Pt): number {
  const i = Math.floor((p.x - g.x0) / CELL);
  const j = Math.floor((p.y - g.y0) / CELL);
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i;
}

/** Nearest cell of `mask` (default: free cells) within `maxR` metres of the point, or -1. */
export function nearestFree(g: Grid, p: Pt, maxR = 1, mask: Uint8Array = g.free): number {
  const ci = Math.floor((p.x - g.x0) / CELL);
  const cj = Math.floor((p.y - g.y0) / CELL);
  const R = Math.ceil(maxR / CELL);
  let best = -1;
  let bd = Infinity;
  for (let dj = -R; dj <= R; dj++)
    for (let di = -R; di <= R; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= g.nx || j >= g.ny || !mask[j * g.nx + i]) continue;
      const d = di * di + dj * dj;
      if (d < bd) (bd = d), (best = j * g.nx + i);
    }
  return best;
}

/** Cells connected to the free cell nearest `p` (4-neighbourhood). */
export function reachable(g: Grid, p: Pt): Uint8Array {
  const out = new Uint8Array(g.nx * g.ny);
  const s = nearestFree(g, p);
  if (s < 0) return out;
  const stack = [s];
  out[s] = 1;
  for (let c = stack.pop(); c !== undefined; c = stack.pop()) {
    const i = c % g.nx;
    const j = (c - i) / g.nx;
    for (const [di, dj] of N4) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= g.nx || b >= g.ny) continue;
      const k = b * g.nx + a;
      if (g.free[k] && !out[k]) (out[k] = 1), stack.push(k);
    }
  }
  return out;
}

const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

/** Straight segment lies in free cells (sampled every quarter cell, so it cannot clip a blocked cell's corner by more than ~1 cm). */
function los(g: Grid, a: Pt, b: Pt): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL / 4));
  for (let k = 1; k < steps; k++) {
    const c = cellOf(g, { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
    if (c < 0 || !g.free[c]) return false;
  }
  return true;
}

/** String pulling: drop every waypoint the robot can skip without leaving free space. */
function smooth(g: Grid, pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  let a = 0;
  while (a < pts.length - 1) {
    let b = a + 1;
    while (b + 1 < pts.length && los(g, pts[a], pts[b + 1])) b++;
    out.push(pts[b]);
    a = b;
  }
  return out;
}

/** Binary min-heap of [priority, cell]. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    let i = this.k.push(key) - 1;
    this.v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.v[0];
    const lk = this.k.pop();
    const lv = this.v.pop();
    if (lk !== undefined && lv !== undefined && this.k.length) {
      this.k[0] = lk;
      this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.k[a], this.k[b]] = [this.k[b], this.k[a]];
    [this.v[a], this.v[b]] = [this.v[b], this.v[a]];
  }
}

/** Shortest path between two points through free floor (8-connected grid A*, then string-pulled). Starts at `a`, ends at `b`; null when either is walled off. */
export function findPath(g: Grid, a: Pt, b: Pt): Pt[] | null {
  const s = nearestFree(g, a);
  const t = nearestFree(g, b);
  if (s < 0 || t < 0) return null;
  const n = g.nx * g.ny;
  const cost = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const ti = t % g.nx;
  const tj = Math.floor(t / g.nx);
  const h = (c: number) => {
    const dx = Math.abs((c % g.nx) - ti);
    const dy = Math.abs(Math.floor(c / g.nx) - tj);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const open = new Heap();
  cost[s] = 0;
  open.push(h(s), s);
  while (open.size) {
    const c = open.pop();
    if (done[c]) continue;
    done[c] = 1;
    if (c === t) break;
    const i = c % g.nx;
    const j = (c - i) / g.nx;
    for (const [di, dj, w] of N8) {
      const x = i + di;
      const y = j + dj;
      if (x < 0 || y < 0 || x >= g.nx || y >= g.ny) continue;
      const k = y * g.nx + x;
      if (!g.free[k] || done[k]) continue;
      if (di && dj && (!g.free[j * g.nx + x] || !g.free[y * g.nx + i])) continue; // no cutting a corner
      const nc = cost[c] + w;
      if (nc < cost[k]) (cost[k] = nc), (from[k] = c), open.push(nc + h(k), k);
    }
  }
  if (!done[t]) return null;
  const cells: number[] = [];
  for (let c = t; c >= 0; c = from[c]) cells.push(c);
  return [a, ...smooth(g, cells.reverse().map((c) => cellPt(g, c))), b];
}

// ---------- routes ----------

export type Route = { pts: Pt[]; cum: number[]; len: number };

export function makeRoute(pts: Pt[]): Route {
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-6);
  const cum = [0];
  for (let i = 1; i < clean.length; i++) cum.push(cum[i - 1] + Math.hypot(clean[i].x - clean[i - 1].x, clean[i].y - clean[i - 1].y));
  return { pts: clean, cum, len: cum[cum.length - 1] ?? 0 };
}

/** Index of the segment containing distance `s` along the route. */
export function segmentAt(r: Route, s: number): number {
  let lo = 0;
  let hi = Math.max(0, r.pts.length - 2);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (r.cum[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Position and unit direction at distance `s` along the route (clamped to its ends). */
export function pointAt(r: Route, s: number): { x: number; y: number; hx: number; hy: number } {
  if (r.pts.length < 2) return { x: r.pts[0]?.x ?? 0, y: r.pts[0]?.y ?? 0, hx: 1, hy: 0 };
  const k = segmentAt(r, Math.min(Math.max(s, 0), r.len));
  const a = r.pts[k];
  const b = r.pts[k + 1];
  const seg = r.cum[k + 1] - r.cum[k] || 1;
  const f = Math.min(Math.max((s - r.cum[k]) / seg, 0), 1);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, hx: (b.x - a.x) / seg, hy: (b.y - a.y) / seg };
}

// ---------- coverage ----------

type Stripe = { j: number; i0: number; i1: number };

const DISC: [number, number][] = (() => {
  const r = Math.ceil(CLEAN_R / CELL);
  const out: [number, number][] = [];
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.hypot(di, dj) * CELL <= CLEAN_R + 1e-9) out.push([di, dj]);
  return out;
})();

function stampDisc(g: Grid, mask: Uint8Array, i: number, j: number) {
  for (const [di, dj] of DISC) {
    const x = i + di;
    const y = j + dj;
    if (x >= 0 && y >= 0 && x < g.nx && y < g.ny) mask[y * g.nx + x] = 1;
  }
}

/** Floor the robot should clean: indoor, not under furniture or a wall, not a doorway, and within brush reach of a cell it can drive on. */
function needMask(g: Grid, reach: Uint8Array): Uint8Array {
  const out = new Uint8Array(g.nx * g.ny);
  for (let c = 0; c < out.length; c++) {
    if (!reach[c]) continue;
    out[c] = 1;
    const i = c % g.nx;
    const j = (c - i) / g.nx;
    const edge = N4.some(([di, dj]) => {
      const x = i + di;
      const y = j + dj;
      return x < 0 || y < 0 || x >= g.nx || y >= g.ny || !g.free[y * g.nx + x];
    });
    if (edge) stampDisc(g, out, i, j);
  }
  for (let c = 0; c < out.length; c++) if (!g.walk[c] || g.raw[c] || g.door[c]) out[c] = 0;
  return out;
}

function stampRoute(g: Grid, mask: Uint8Array, pts: Pt[]) {
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1] ?? a;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / CELL));
    for (let s = 0; s <= steps; s++) {
      const c = cellOf(g, { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
      if (c >= 0) stampDisc(g, mask, c % g.nx, Math.floor(c / g.nx));
    }
  }
}

/** Fraction of the cleanable floor (needMask) within brush reach of the path. */
export function coverage(g: Grid, reach: Uint8Array, pts: Pt[]): number {
  const need = needMask(g, reach);
  const done = new Uint8Array(need.length);
  stampRoute(g, done, pts);
  let n = 0;
  let d = 0;
  for (let c = 0; c < need.length; c++) if (need[c]) (n++, (d += done[c]));
  return n ? d / n : 1;
}

/** The drivable cell nearest (by squared cell distance) to (ci, cj) within brush reach, or -1; the first of equals in DISC order wins. */
function nearestDrivable(g: Grid, ok: (c: number) => unknown, ci: number, cj: number): number {
  let best = -1;
  let bd = Infinity;
  for (const [di, dj] of DISC) {
    const x = ci + di;
    const y = cj + dj;
    if (x < 0 || y < 0 || x >= g.nx || y >= g.ny || !ok(y * g.nx + x)) continue;
    const d = di * di + dj * dj;
    if (d < bd) (bd = d), (best = y * g.nx + x);
  }
  return best;
}

/** Straight lanes every LANE metres along x, then a gap-filling lane wherever the lattice missed floor that needs cleaning. */
function planStripes(g: Grid, reach: Uint8Array, need: Uint8Array): Stripe[] {
  const covered = new Uint8Array(need.length);
  const stripes: Stripe[] = [];
  const ok = (c: number) => reach[c] && !g.door[c];

  /** Lane through (i, j) over drivable floor; with `wanted` it stops where no uncleaned floor is left within brush reach. */
  const run = (i: number, j: number, wanted?: (i: number, j: number) => boolean): Stripe => {
    let i0 = i;
    let i1 = i;
    while (i0 > 0 && ok(j * g.nx + i0 - 1) && (!wanted || wanted(i0 - 1, j))) i0--;
    while (i1 < g.nx - 1 && ok(j * g.nx + i1 + 1) && (!wanted || wanted(i1 + 1, j))) i1++;
    return { j, i0, i1 };
  };
  const dirtyNear = (i: number, j: number) =>
    DISC.some(([di, dj]) => {
      const x = i + di;
      const y = j + dj;
      return x >= 0 && y >= 0 && x < g.nx && y < g.ny && need[y * g.nx + x] === 1 && !covered[y * g.nx + x];
    });
  const addStripe = (s: Stripe) => {
    stripes.push(s);
    for (let i = s.i0; i <= s.i1; i++) stampDisc(g, covered, i, s.j);
  };

  for (let j = LANE_ROWS >> 1; j < g.ny; j += LANE_ROWS)
    for (let i = 0; i < g.nx; i++) {
      if (!ok(j * g.nx + i)) continue;
      const s = run(i, j);
      addStripe(s);
      i = s.i1;
    }
  // fill whatever the lattice missed
  for (let c = 0; c < need.length; c++) {
    if (!need[c] || covered[c]) continue;
    const ci = c % g.nx;
    const cj = (c - ci) / g.nx;
    const best = nearestDrivable(g, ok, ci, cj);
    if (best < 0) {
      covered[c] = 1;
      continue;
    }
    addStripe(run(best % g.nx, Math.floor(best / g.nx), dirtyNear));
  }
  return stripes;
}

/** BFS over reachable floor from `cur` until an unused lane end turns up (its cell, or -1); `from` keeps the way back. `round` stamps `seen` so it needs no clearing. */
function bfsToLaneEnd(g: Grid, reach: Uint8Array, owner: Int32Array, used: Uint8Array, seen: Int32Array, from: Int32Array, cur: number, round: number): number {
  const queue = [cur];
  seen[cur] = round;
  from[cur] = -1;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    if (owner[c] >= 0 && !used[owner[c]]) return c;
    const i = c % g.nx;
    const j = (c - i) / g.nx;
    for (const [di, dj] of N4) {
      const x = i + di;
      const y = j + dj;
      if (x < 0 || y < 0 || x >= g.nx || y >= g.ny) continue;
      const k = y * g.nx + x;
      if (seen[k] === round || !reach[k]) continue;
      seen[k] = round;
      from[k] = c;
      queue.push(k);
    }
  }
  return -1;
}

/** Chain the lanes nearest-first over the real floor, each hop string-pulled, entering a lane at one end and leaving at the other. */
function chainStripes(g: Grid, reach: Uint8Array, stripes: Stripe[], start: Pt): Pt[] {
  const owner = new Int32Array(g.nx * g.ny).fill(-1);
  stripes.forEach((s, k) => {
    owner[s.j * g.nx + s.i0] = k;
    owner[s.j * g.nx + s.i1] = k;
  });
  const used = new Uint8Array(stripes.length);
  const seen = new Int32Array(g.nx * g.ny);
  const from = new Int32Array(g.nx * g.ny);
  let cur = nearestFree(g, start);
  const out: Pt[] = [start];
  if (cur < 0) return out;
  for (let round = 1; round <= stripes.length; round++) {
    const hit = bfsToLaneEnd(g, reach, owner, used, seen, from, cur, round);
    if (hit < 0) break;
    const hop: Pt[] = [];
    for (let c = hit; c >= 0; c = from[c]) hop.push(cellPt(g, c));
    out.push(...smooth(g, hop.reverse()).slice(1));
    const s = stripes[owner[hit]];
    used[owner[hit]] = 1;
    const hi = hit % g.nx;
    const far = s.j * g.nx + (hi === s.i0 ? s.i1 : s.i0);
    out.push(cellPt(g, far));
    cur = far;
  }
  return out;
}

/**
 * Boustrophedon coverage of everything reachable from `start`: straight lanes every LANE metres along x (a lane ends at a wall, a piece of furniture
 * or a doorway, so a room is finished lane by lane before the robot crosses its door), a gap-filling lane wherever the lattice missed floor
 * (strips along walls, thin bands), then the lanes are chained nearest-first over the real floor (BFS distance) with string-pulled hops.
 * Deterministic: the same grid and start always give the same path. Returns waypoints starting at `start`.
 */
function coveragePath(g: Grid, reach: Uint8Array, start: Pt): Pt[] {
  return chainStripes(g, reach, planStripes(g, reach, needMask(g, reach)), start);
}

// ---------- the world of one vacuum ----------

export type World = {
  grid: Grid;
  reach: Uint8Array;
  levelId: string;
  /** where the robot waits for the way to clear: in front of the dock */
  dock: Pt;
  /** the spot the robot sits on the dock (touching it) */
  park: Pt;
  /** direction from park to the dock body (the robot parks nose to the dock) */
  face: Pt;
  /** park -> dock -> every lane, once */
  clean: Route;
};

/** Everything the vacuum needs, or null when it has no indoor floor to roam. The robot starts from the nearest dock on its level, else from where it stands. */
export function buildWorld(plan: Plan, vac: Item): World | null {
  const levelId = levelIdOf(plan, vac);
  const grid = buildGrid(plan, levelId, (i) => isVacuumKind(i.kind));
  if (!grid) return null;
  const docks = onLevel(plan, levelId).items.filter((i) => isDockKind(i.kind));
  const dk = docks.sort((a, b) => Math.hypot(a.x - vac.x, a.y - vac.y) - Math.hypot(b.x - vac.x, b.y - vac.y))[0];
  let dock: Pt = { x: vac.x, y: vac.y };
  let park = dock;
  let face: Pt = { x: Math.sin((vac.rot * Math.PI) / 180), y: -Math.cos((vac.rot * Math.PI) / 180) };
  if (dk) {
    const r = (dk.rot * Math.PI) / 180;
    const front = { x: -Math.sin(r), y: Math.cos(r) };
    dock = { x: dk.x + front.x * (dk.d / 2 + DOCK_APPROACH), y: dk.y + front.y * (dk.d / 2 + DOCK_APPROACH) };
    park = { x: dk.x + front.x * (dk.d / 2 + ROBOT_R), y: dk.y + front.y * (dk.d / 2 + ROBOT_R) };
    face = { x: -front.x, y: -front.y };
  }
  const c = nearestFree(grid, dock, 1.5);
  if (c < 0) return null;
  const snapped = cellPt(grid, c);
  if (!dk) (dock = snapped), (park = snapped);
  else dock = snapped;
  const reach = reachable(grid, dock);
  const lanes = coveragePath(grid, reach, dock);
  return { grid, reach, levelId, dock, park, face, clean: makeRoute([park, ...lanes]) };
}

/** Way from anywhere on the floor to the parking spot, via the spot in front of the dock. Null when the robot is walled off. */
export function pathToPark(w: World, from: Pt): Pt[] | null {
  const p = findPath(w.grid, from, w.dock);
  return p && [...p, w.park];
}
