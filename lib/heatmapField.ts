// Heat map layers, pure part 2: turns sensor readings into a grid of values per level (inverse-distance weighting with a wall penalty), ready to upload as one small texture.
import type { HAState } from "./ha.ts";
import { isFence } from "./fences.ts";
import { groupAt, heatGroups, heatPoints, fromScale, rangeFor, toScale, type HeatMetric, type HeatPoint, type RoomReadings } from "./heatmap.ts";
import { levelsOf, onLevel } from "./levels.ts";
import type { Plan, Room, Wall } from "./types.ts";

/** Cells on the long side of a level (the short side is proportional). */
const RES = 128;
/** Every wall the straight line to a sensor crosses counts as this many extra metres: warmth does not bleed through walls, open-plan spaces still blend. */
const WALL_PENALTY = 3;
/** Softens 1/d^2 so a cell right on a sensor takes (almost exactly) that sensor's value. */
const SOFTEN = 0.01;
/** Space around the rooms so the edge cells have a row of neighbours to fade into. */
const PAD = 0.1;

export type RoomStat = {
  id: string;
  name: string;
  /** The room's value: the mean of its own sensors, or (no sensor) the interpolated mean over the room. Null when nothing could be worked out. */
  mean: number | null;
  /** No sensor in this room: its colour is borrowed from the neighbours. */
  estimated: boolean;
};

export type Field = {
  /** Texture size in cells. */
  w: number;
  h: number;
  /** Plan position (metres) of the grid's top-left corner and the size of one cell. Row j runs along plan y, column i along plan x. */
  x0: number;
  y0: number;
  cell: number;
  /** RGBA, w*h*4: R = value across the colour range (0..255), G = 255 where the room has no sensor (estimated), A = 255 inside a room, 0 outside. */
  data: Uint8Array;
  rooms: RoomStat[];
};

export type FieldOpts = {
  metric: HeatMetric;
  /** Colour range [low, high] in the metric's own unit (see `rangeFor`). */
  range: readonly [number, number];
  /** One flat value per room, no gradient (the cheap look for Eco). */
  flat?: boolean;
  res?: number;
};

type Walls = Float64Array;

/** The walls that stop warmth (fences and hedges do not) as flat ax, ay, bx, by quadruples. */
function blockingWalls(walls: readonly Wall[]): Walls {
  const solid = walls.filter((w) => !isFence(w.style));
  const out = new Float64Array(solid.length * 4);
  solid.forEach((w, i) => out.set([w.a.x, w.a.y, w.b.x, w.b.y], i * 4));
  return out;
}

/** How many walls the segment a-b properly crosses (same test as flows.ts `wallCrossings`, without allocating, with a bounding-box early out). */
function crossings(walls: Walls, ax: number, ay: number, bx: number, by: number): number {
  const lox = Math.min(ax, bx);
  const hix = Math.max(ax, bx);
  const loy = Math.min(ay, by);
  const hiy = Math.max(ay, by);
  let n = 0;
  for (let o = 0; o < walls.length; o += 4) {
    const cx = walls[o];
    const cy = walls[o + 1];
    const dx = walls[o + 2];
    const dy = walls[o + 3];
    if ((cx < lox && dx < lox) || (cx > hix && dx > hix) || (cy < loy && dy < loy) || (cy > hiy && dy > hiy)) continue;
    const o1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const o2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    if (!(o1 * o2 < 0)) continue;
    const o3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const o4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    if (o3 * o4 < 0) n++;
  }
  return n;
}

/** Distance as the heat sees it: straight line plus a penalty per wall in between. */
const reach = (walls: Walls, ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) + WALL_PENALTY * crossings(walls, ax, ay, bx, by);

/**
 * The value grid of one level. Cells outside every indoor room are masked out; rooms with no sensor are flagged `estimated` and take their neighbours' value.
 * Null when the level has no room or no usable reading. `points` outside every indoor room are ignored.
 */
export function buildField(points: readonly HeatPoint[], level: { rooms: readonly Room[]; walls: readonly Wall[] }, opts: FieldOpts): Field | null {
  const { metric, range, flat = false, res = RES } = opts;
  const groups = heatGroups(level.rooms);
  const pts = points.flatMap((p) => {
    const g = groupAt(groups, p.x, p.y);
    return g < 0 ? [] : [{ ...p, g, u: toScale(metric, p.value) }];
  });
  if (!groups.length || !pts.length) return null;
  const walls = blockingWalls(level.walls);

  const rects = groups.flatMap((g) => g.rects);
  const x0 = Math.min(...rects.map((r) => r.x)) - PAD;
  const y0 = Math.min(...rects.map((r) => r.y)) - PAD;
  const spanX = Math.max(...rects.map((r) => r.x + r.w)) + PAD - x0;
  const spanY = Math.max(...rects.map((r) => r.y + r.h)) + PAD - y0;
  const cell = Math.max(spanX, spanY) / res;
  const w = Math.max(1, Math.ceil(spanX / cell - 1e-9));
  const h = Math.max(1, Math.ceil(spanY / cell - 1e-9));

  // which room group each cell belongs to; smaller rooms are painted last so an inner room wins over a bigger one it overlaps
  const owner = new Int16Array(w * h).fill(-1);
  const bySize = groups.map((_, i) => i).sort((a, b) => groups[b].room.w * groups[b].room.h - groups[a].room.w * groups[a].room.h);
  for (const gi of bySize) {
    for (const r of groups[gi].rects) {
      const i0 = Math.max(0, Math.ceil((r.x - x0) / cell - 0.5));
      const i1 = Math.min(w - 1, Math.floor((r.x + r.w - x0) / cell - 0.5));
      const j0 = Math.max(0, Math.ceil((r.y - y0) / cell - 0.5));
      const j1 = Math.min(h - 1, Math.floor((r.y + r.h - y0) / cell - 0.5));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) owner[j * w + i] = gi;
    }
  }
  // the room a cell is in, or (for the one-cell ring around the rooms, which keeps the soft edge from fading to the wrong colour) the room next to it
  const near = new Int16Array(w * h).fill(-1);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let o = owner[j * w + i];
      for (let dj = -1; dj <= 1 && o < 0; dj++) {
        for (let di = -1; di <= 1 && o < 0; di++) {
          if (i + di >= 0 && i + di < w && j + dj >= 0 && j + dj < h) o = owner[(j + dj) * w + i + di];
        }
      }
      near[j * w + i] = o;
    }
  }

  const count = new Int32Array(groups.length);
  const sumV = new Float64Array(groups.length);
  const sumU = new Float64Array(groups.length);
  for (const p of pts) {
    count[p.g]++;
    sumV[p.g] += p.value;
    sumU[p.g] += p.u;
  }
  const u = new Float32Array(w * h);
  const cx = (i: number) => x0 + (i + 0.5) * cell;
  const cy = (j: number) => y0 + (j + 0.5) * cell;

  if (flat) {
    const measured = groups.map((_, i) => i).filter((i) => count[i]);
    const flatU = groups.map((g, gi) => {
      if (count[gi]) return sumU[gi] / count[gi];
      const mx = g.room.x + g.room.w / 2;
      const my = g.room.y + g.room.h / 2;
      let best = measured[0];
      let bestD = Infinity;
      for (const m of measured) {
        const d = reach(walls, mx, my, groups[m].room.x + groups[m].room.w / 2, groups[m].room.y + groups[m].room.h / 2);
        if (d < bestD) [best, bestD] = [m, d];
      }
      return sumU[best] / count[best];
    });
    for (let k = 0; k < u.length; k++) if (near[k] >= 0) u[k] = flatU[near[k]];
  } else {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (near[j * w + i] < 0) continue;
        let num = 0;
        let den = 0;
        for (const p of pts) {
          const d = reach(walls, cx(i), cy(j), p.x, p.y);
          const wt = 1 / (d * d + SOFTEN);
          num += wt * p.u;
          den += wt;
        }
        u[j * w + i] = num / den;
      }
    }
  }

  const lo = toScale(metric, range[0]);
  const span = toScale(metric, range[1]) - lo || 1;
  const data = new Uint8Array(w * h * 4);
  const cellSum = new Float64Array(groups.length);
  const cellN = new Int32Array(groups.length);
  for (let k = 0; k < u.length; k++) {
    if (near[k] < 0) continue;
    data[k * 4] = Math.round(Math.min(1, Math.max(0, (u[k] - lo) / span)) * 255);
    data[k * 4 + 1] = count[near[k]] ? 0 : 255;
    data[k * 4 + 3] = owner[k] >= 0 ? 255 : 0;
    if (owner[k] >= 0) {
      cellSum[owner[k]] += u[k];
      cellN[owner[k]]++;
    }
  }
  const rooms = groups.map<RoomStat>((g, gi) => ({
    id: g.room.id,
    name: g.room.name,
    estimated: !count[gi],
    mean: count[gi] ? sumV[gi] / count[gi] : cellN[gi] ? fromScale(metric, cellSum[gi] / cellN[gi]) : null,
  }));
  return { w, h, x0, y0, cell, data, rooms };
}

/**
 * The rooms to point out in "Where is it cold?": the `n` lowest and the `n` highest rooms that have a sensor of their own, lowest first / highest first.
 * With few rooms the two lists never share a room.
 */
export function roomExtremes(rooms: readonly RoomStat[], n = 2): { low: RoomStat[]; high: RoomStat[] } {
  const sorted = rooms.filter((r) => !r.estimated && r.mean !== null).sort((a, b) => (a.mean as number) - (b.mean as number));
  const high = sorted.slice(sorted.length - Math.min(n, Math.floor(sorted.length / 2))).reverse();
  return { low: sorted.slice(0, Math.min(n, Math.ceil(sorted.length / 2))), high };
}

// ---- the whole house ------------------------------------------------------------------------------------------------

export type HeatAnalysis = {
  /** Changes exactly when the picture would change (readings, rooms, walls, metric, mode). */
  key: string;
  metric: HeatMetric;
  flat: boolean;
  /** One shared colour range for every level, so the legend is true for all of them. */
  range: [number, number];
  /** Every sensor reported Fahrenheit: the legend speaks Fahrenheit. */
  fahrenheit: boolean;
  /** Per level id; null where the level has no reading to draw. */
  fields: Record<string, Field | null>;
  rooms: RoomStat[];
  /** Usable readings across the house. */
  count: number;
};

/** The same text for the same list object: plan arrays are replaced, never edited in place, so this is computed once per edit, not once per poll. */
const listKeys = new WeakMap<object, string>();
const keyOf = (list: object, make: () => string) => {
  let k = listKeys.get(list);
  if (k === undefined) listKeys.set(list, (k = make()));
  return k;
};

/** Text that differs whenever the readings differ (positions and snapped values), used to skip redrawing when nothing changed. */
export const readingsKey = (points: readonly HeatPoint[]): string => points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.value}`).join("|");

let last: HeatAnalysis | undefined;

/**
 * Everything a heat map shows, for the whole house. The scene (one mesh per level) and the legend both ask: the last answer is reused while the key is unchanged,
 * so the grids are rebuilt only when a reading, a room or a wall actually changed.
 */
export function analyseHeat(plan: Plan, states: Record<string, HAState>, metric: HeatMetric, flat: boolean, fallback?: RoomReadings): HeatAnalysis {
  const levels = levelsOf(plan);
  const perLevel = levels.map((l) => ({ id: l.id, points: heatPoints(plan, states, metric, l.id, fallback) }));
  const key = [
    metric,
    flat ? "flat" : "smooth",
    keyOf(plan.rooms, () => plan.rooms.map((r) => `${r.id}:${r.name}:${r.x},${r.y},${r.w},${r.h},${r.parent ?? ""},${r.level ?? ""},${r.floor}`).join(";")),
    keyOf(plan.walls, () => plan.walls.map((w) => `${w.a.x},${w.a.y},${w.b.x},${w.b.y},${w.style},${w.level ?? ""}`).join(";")),
    ...perLevel.map((l) => `${l.id}=${readingsKey(l.points)}`),
  ].join("#");
  if (last?.key === key) return last;

  const all = perLevel.flatMap((l) => l.points);
  const range = rangeFor(metric, all.map((p) => p.value));
  const fields: Record<string, Field | null> = {};
  for (const l of perLevel) fields[l.id] = buildField(l.points, onLevel(plan, l.id), { metric, range, flat });
  last = {
    key,
    metric,
    flat,
    range,
    fahrenheit: all.length > 0 && all.every((p) => p.f),
    fields,
    rooms: Object.values(fields).flatMap((f) => f?.rooms ?? []),
    count: all.length,
  };
  return last;
}
