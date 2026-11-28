// Sun hours on a room's floor for one day: the floor is sampled on a grid, the sun every STEP_MIN minutes, and a time-sliced runner (so a Raspberry Pi's screen never freezes)
// fills in the answer. Also the plain-words summary, the colour scale and the pixels the 3D and plan overlays paint. Pure: no React, no browser globals.
import { planSun, clock, type SunSample } from "./daylight.ts";
import { relevantPanels, sunReaches, type SunScene } from "./daylightRay.ts";
import type { Room } from "./types.ts";

/** Minutes between two sun positions; also the time one sample stands for. */
export const STEP_MIN = 10;
/** A time of day counts as sunny for the summary when at least this share of the floor is lit. */
export const SUNNY_SHARE = 0.1;

type Rect = { x: number; y: number; w: number; h: number };

/** The floor of a room as rows of square cells. `mask` is 1 where a cell centre lies on the room's floor (an L-shaped room has holes in its bounding box). Row 0 is the north (smallest y). */
export type Grid = { x0: number; y0: number; cols: number; rows: number; cell: number; z: number; mask: Uint8Array; cells: number };

/** The rectangles of a room: the room, plus its alcoves (the parts that belong to it) that are floor, not door-threshold strips (the same 0.5 m2 rule as lib/blueprint.ts roomArea). */
export function roomRects(rooms: readonly Room[], room: Room): Rect[] {
  const host = room.parent ? (rooms.find((r) => r.id === room.parent) ?? room) : room;
  return [host, ...rooms.filter((r) => r.parent === host.id && r.w * r.h >= 0.5)];
}

/** Sample points of `rects` at height `z`: the long side of their bounding box gets at most `maxCells` cells. Null for a room with no area. */
export function gridOf(rects: readonly Rect[], z: number, maxCells: number): Grid | null {
  if (!rects.length || maxCells < 1) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const w = Math.max(...rects.map((r) => r.x + r.w)) - x0;
  const h = Math.max(...rects.map((r) => r.y + r.h)) - y0;
  if (!(w > 0) || !(h > 0)) return null;
  const cell = Math.max(w, h) / Math.floor(maxCells);
  const cols = Math.max(1, Math.ceil(w / cell - 1e-9));
  const rows = Math.max(1, Math.ceil(h / cell - 1e-9));
  const mask = new Uint8Array(cols * rows);
  let cells = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = x0 + (i + 0.5) * cell;
      const y = y0 + (j + 0.5) * cell;
      if (rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) {
        mask[j * cols + i] = 1;
        cells++;
      }
    }
  }
  return cells ? { x0, y0, cols, rows, cell, z, mask, cells } : null;
}

export type StepLit = { minutes: number; /** share of the floor in direct sun, 0..1 */ lit: number };
export type DayResult = {
  grid: Grid;
  /** Hours of direct sun per cell (row-major like the grid; 0 outside the mask). */
  hours: Float32Array;
  /** Per sun position of the day: the share of the floor that was lit. */
  steps: StepLit[];
  maxHours: number;
};

/** What the sun does to one cell at one moment: the centre of the cell. */
const centre = (g: Grid, index: number): [number, number] => [g.x0 + ((index % g.cols) + 0.5) * g.cell, g.y0 + (Math.floor(index / g.cols) + 0.5) * g.cell];

/** Which cells of the floor are in direct sun at one sun position (1 = lit, 0 = shade or outside the room). One cheap pass; the preview's "lit right now" uses it. */
export function litCells(scene: SunScene, grid: Grid, sun: { elevation: number; azimuth: number }, bearing: number): Uint8Array {
  const out = new Uint8Array(grid.mask.length);
  if (sun.elevation <= 0) return out;
  const dir = planSun(sun.azimuth, sun.elevation, bearing);
  const reach = (Math.hypot(grid.cols, grid.rows) * grid.cell) / 2; // the disc round the grid that every cell lies inside
  const panels = relevantPanels(scene.panels, grid.x0 + (grid.cols * grid.cell) / 2, grid.y0 + (grid.rows * grid.cell) / 2, reach, grid.z, dir);
  for (let k = 0; k < grid.mask.length; k++) {
    if (!grid.mask[k]) continue;
    const [x, y] = centre(grid, k);
    if (sunReaches(panels, scene.slabs, x, y, grid.z, dir)) out[k] = 1;
  }
  return out;
}

/** A day's computation in pieces: `step(n)` handles the next n sun positions. */
export type Run = { step: (n: number) => void; readonly done: boolean; readonly progress: number; result: () => DayResult };

export function startRun(input: { scene: SunScene; grid: Grid; samples: readonly SunSample[]; bearing: number }): Run {
  const { scene, grid, samples, bearing } = input;
  const counts = new Uint16Array(grid.mask.length);
  const steps: StepLit[] = [];
  let next = 0;
  const run: Run = {
    step(n) {
      for (let end = Math.min(samples.length, next + n); next < end; next++) {
        const s = samples[next];
        const lit = litCells(scene, grid, s, bearing);
        let on = 0;
        for (let k = 0; k < lit.length; k++) {
          counts[k] += lit[k];
          on += lit[k];
        }
        steps.push({ minutes: s.minutes, lit: on / grid.cells });
      }
    },
    get done() {
      return next >= samples.length;
    },
    get progress() {
      return samples.length ? next / samples.length : 1;
    },
    result() {
      const hours = Float32Array.from(counts, (c) => (c * STEP_MIN) / 60);
      return { grid, hours, steps, maxHours: hours.reduce((m, h) => Math.max(m, h), 0) };
    },
  };
  return run;
}

/** Where slices are scheduled: injectable, so tests run them by hand and the panel uses setTimeout. `later` returns a function that cancels the call. */
export type Scheduler = { now: () => number; later: (fn: () => void) => () => void };

/** Run it in slices of about `budgetMs` (at least one sun position each), reporting progress between slices. Returns the cancel function: nothing runs or is reported after it. */
export function drive(run: Run, sched: Scheduler, opts: { budgetMs: number; onProgress: (p: number) => void; onDone: (r: DayResult) => void }): () => void {
  let cancelNext = () => {};
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const start = sched.now();
    do run.step(1);
    while (!run.done && sched.now() - start < opts.budgetMs);
    if (run.done) return opts.onDone(run.result());
    opts.onProgress(run.progress);
    cancelNext = sched.later(tick);
  };
  cancelNext = sched.later(tick);
  return () => {
    stopped = true;
    cancelNext();
  };
}

// ---- the plain-words answer ----------------------------------------------------------------------------------------------------------------------

/** Runs of consecutive sun positions with at least `share` of the floor lit, as clock minutes (each sample stands for the STEP_MIN around it). */
export function sunIntervals(steps: readonly StepLit[], share = SUNNY_SHARE): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let last = -Infinity;
  for (const s of steps) {
    if (s.lit < share) continue;
    const joins = out.length > 0 && s.minutes - last === STEP_MIN;
    if (joins) out[out.length - 1].to = s.minutes + STEP_MIN / 2;
    else out.push({ from: s.minutes - STEP_MIN / 2, to: s.minutes + STEP_MIN / 2 });
    last = s.minutes;
  }
  return out;
}

const listOf = (parts: string[]) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`);

/** "Living room gets direct sun 11:30-15:00 in June (peak 62% of the floor at 13:10)", or what is true instead. `monthName` is "June", `dateLabel` "21 Dec". */
export function sunSummary(room: string, steps: readonly StepLit[], monthName: string, dateLabel: string): string {
  const peak = steps.reduce<StepLit | null>((best, s) => (!best || s.lit > best.lit ? s : best), null);
  if (!peak || peak.lit <= 0) return `${room} gets no direct sun on ${dateLabel}`;
  const pct = Math.round(peak.lit * 100);
  const intervals = sunIntervals(steps);
  if (!intervals.length) return `${room} gets only a little direct sun on ${dateLabel} (at most ${pct}% of the floor)`;
  const when = listOf(intervals.map((i) => `${clock(i.from / 60)}-${clock(i.to / 60)}`));
  return `${room} gets direct sun ${when} in ${monthName} (peak ${pct}% of the floor at ${clock(peak.minutes / 60)})`;
}

// ---- colours -------------------------------------------------------------------------------------------------------------------------------------

/** The cividis scale (dark blue to yellow): readable with every kind of colour blindness, and not red against green. */
const RAMP: readonly (readonly [number, number, number])[] = [
  [0, 34, 78],
  [59, 73, 108],
  [112, 113, 115],
  [166, 157, 117],
  [228, 207, 91],
  [255, 234, 70],
];

/** The colour at t (0 no sun .. 1 the most sun hours of the day), blended between the scale's stops. */
export function rampColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [RAMP[i], RAMP[i + 1]];
  const mix = (c: 0 | 1 | 2) => Math.round(a[c] + (b[c] - a[c]) * f);
  return [mix(0), mix(1), mix(2)];
}

/** The scale's top, in whole hours: the most any cell got, rounded up, never below 1. */
export const legendMax = (maxHours: number): number => Math.max(1, Math.ceil(maxHours - 1e-6));

export type HeatMode = "hours" | "now";

const SHADE_ALPHA = 140; // a cell with no sun at all stays visible as dark blue
const SUN_ALPHA = 215;

/**
 * RGBA pixels of the floor, one per cell (cells outside the room are transparent). "hours": each cell on the colour scale by its sun hours; "now": lit cells in the
 * scale's yellow, the rest dark blue. `flipRows` writes the south row first, which is what a texture on a floor quad (WebGL's v runs up) expects.
 */
export function heatPixels(result: DayResult, mode: HeatMode, lit: Uint8Array | null, flipRows = false): Uint8ClampedArray<ArrayBuffer> {
  const { grid, hours } = result;
  const top = legendMax(result.maxHours);
  const px = new Uint8ClampedArray(grid.cols * grid.rows * 4);
  for (let j = 0; j < grid.rows; j++) {
    const row = flipRows ? grid.rows - 1 - j : j;
    for (let i = 0; i < grid.cols; i++) {
      const k = j * grid.cols + i;
      if (!grid.mask[k]) continue;
      const sunny = mode === "now" ? lit?.[k] === 1 : hours[k] > 0;
      const t = mode === "now" ? (sunny ? 1 : 0) : hours[k] / top;
      const [r, g, b] = rampColor(t);
      const o = (row * grid.cols + i) * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = sunny ? SUN_ALPHA : SHADE_ALPHA;
    }
  }
  return px;
}
