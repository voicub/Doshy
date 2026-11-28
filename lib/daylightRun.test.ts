import test from "node:test";
import assert from "node:assert/strict";
import { buildScene, SAMPLE_LIFT } from "./daylightRay.ts";
import { drive, gridOf, heatPixels, legendMax, litCells, rampColor, roomRects, startRun, sunIntervals, sunSummary, type DayResult, type Run, type Scheduler } from "./daylightRun.ts";
import type { Opening, Plan, Room, Wall } from "./types.ts";

const wall = (id: string, ax: number, ay: number, bx: number, by: number): Wall => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, style: "plaster" });
const window: Opening = { id: "o", wallId: "s", t: 0.5, width: 2, type: "window", sill: 0.9, height: 1.2 };
const living: Room = { id: "r", name: "Living", x: 0, y: 0, w: 4, h: 4, color: "#fff", floor: "wood" };
const PLAN: Plan = { walls: [wall("n", 0, 0, 4, 0), wall("e", 4, 0, 4, 4), wall("s", 0, 4, 4, 4), wall("w", 0, 4, 0, 0)], openings: [window], rooms: [living], items: [] };

test("roomRects: a room and its alcoves, never a door-threshold strip; an alcove asks for its host", () => {
  const alcove: Room = { ...living, id: "a", parent: "r", x: 4, y: 0, w: 1, h: 1 };
  const strip: Room = { ...living, id: "t", parent: "r", x: 0, y: 4, w: 1, h: 0.2 };
  const rooms = [living, alcove, strip];
  assert.deepEqual(roomRects(rooms, living).map((r) => r.x + "," + r.w), ["0,4", "4,1"]);
  assert.deepEqual(roomRects(rooms, alcove), roomRects(rooms, living));
});

test("gridOf: at most N cells along the long side, square cells, an L-shaped room leaves holes", () => {
  const g = gridOf([{ x: 0, y: 0, w: 4, h: 2 }], 0.02, 8);
  assert.ok(g);
  assert.deepEqual([g.cols, g.rows, g.cell, g.cells], [8, 4, 0.5, 32]);
  const l = gridOf([{ x: 0, y: 0, w: 4, h: 2 }, { x: 0, y: 2, w: 2, h: 2 }], 0.02, 8);
  assert.ok(l);
  assert.deepEqual([l.cols, l.rows, l.cells], [8, 8, 48], "(4 x 2 + 2 x 2) m2 of 0.25 m2 cells");
  assert.equal(l.mask[0 * 8 + 7], 1, "top right is floor");
  assert.equal(l.mask[7 * 8 + 7], 0, "bottom right is outside the L");
  assert.equal(gridOf([{ x: 0, y: 0, w: 0, h: 3 }], 0, 8), null);
  assert.equal(gridOf([], 0, 8), null);
});

const SOUTH_45 = { minutes: 720, elevation: 45, azimuth: 180 };

test("litCells: the south window lights exactly the 4 x 2 block of cells hand-worked out (x 1..3, y 1.92..3.12 at 45 degrees)", () => {
  const grid = gridOf([living], SAMPLE_LIFT, 8);
  assert.ok(grid);
  const lit = litCells(buildScene(PLAN), grid, SOUTH_45, 0);
  // 0.5 m cells, centres 0.25, 0.75, ...: columns 1.25..2.75 are inside the window's 1..3, rows 2.25 and 2.75 cross the wall at 1.77 and 1.27 m (row 3.25: 0.77 m, row 1.75: 2.27 m)
  const expected = new Uint8Array(64);
  for (const row of [4, 5]) for (const col of [2, 3, 4, 5]) expected[row * 8 + col] = 1;
  assert.deepEqual(lit, expected);
  assert.equal(litCells(buildScene(PLAN), grid, { ...SOUTH_45, elevation: -3 }, 0).some((v) => v === 1), false, "below the horizon: dark");
});

test("a run adds up hours per cell and the lit share per sun position, in slices or in one go", () => {
  const grid = gridOf([living], SAMPLE_LIFT, 8);
  assert.ok(grid);
  const input = { scene: buildScene(PLAN), grid, samples: [SOUTH_45, { ...SOUTH_45, minutes: 730 }, { minutes: 740, elevation: 45, azimuth: 270 }], bearing: 0 };
  const whole = startRun(input);
  whole.step(99);
  assert.equal(whole.done, true);
  const r = whole.result();
  assert.deepEqual(r.steps, [{ minutes: 720, lit: 8 / 64 }, { minutes: 730, lit: 8 / 64 }, { minutes: 740, lit: 0 }], "the west sun meets the blank west wall");
  assert.ok(Math.abs(r.hours[4 * 8 + 2] - 20 / 60) < 1e-6, "two of the three sun positions, ten minutes each");
  assert.equal(r.hours[0], 0);
  assert.ok(Math.abs(r.maxHours - 20 / 60) < 1e-6);
  const sliced = startRun(input);
  sliced.step(1);
  assert.equal(sliced.done, false);
  assert.ok(Math.abs(sliced.progress - 1 / 3) < 1e-9);
  sliced.step(1);
  sliced.step(1);
  assert.deepEqual(sliced.result().hours, r.hours);
});

test("sunIntervals joins consecutive sunny positions, splits at a gap and at a dip under 10%", () => {
  const steps = [{ minutes: 690, lit: 0.05 }, { minutes: 700, lit: 0.2 }, { minutes: 710, lit: 0.5 }, { minutes: 720, lit: 0.1 }, { minutes: 730, lit: 0.09 }, { minutes: 740, lit: 0.3 }, { minutes: 760, lit: 0.4 }];
  assert.deepEqual(sunIntervals(steps), [{ from: 695, to: 725 }, { from: 735, to: 745 }, { from: 755, to: 765 }]);
  assert.deepEqual(sunIntervals([]), []);
});

test("sunSummary: one interval, several, a trace of sun, and none", () => {
  const afternoon = [{ minutes: 690, lit: 0.3 }, { minutes: 700, lit: 0.62 }, { minutes: 710, lit: 0.3 }];
  const one = sunSummary("Living room", afternoon, "June", "21 Jun");
  assert.match(one, /^Living room gets direct sun 11:25-11:55 in June \(peak 62% of the floor at 11:40\)$/);
  const two = sunSummary("Hall", [{ minutes: 420, lit: 0.5 }, { minutes: 430, lit: 0.5 }, { minutes: 900, lit: 0.2 }], "March", "20 Mar");
  assert.match(two, /direct sun 06:55-07:15 and 14:55-15:05 in March \(peak 50% of the floor at 07:00\)/);
  assert.match(sunSummary("Hall", [{ minutes: 420, lit: 0.5 }, { minutes: 600, lit: 0.5 }, { minutes: 900, lit: 0.5 }], "May", "1 May"), /direct sun 06:55-07:05, 09:55-10:05 and 14:55-15:05 in May/);
  assert.match(sunSummary("Study", [{ minutes: 720, lit: 0.06 }], "December", "21 Dec"), /only a little direct sun on 21 Dec \(at most 6% of the floor\)/);
  assert.equal(sunSummary("Study", [{ minutes: 720, lit: 0 }], "December", "21 Dec"), "Study gets no direct sun on 21 Dec");
  assert.equal(sunSummary("Study", [], "December", "21 Dec"), "Study gets no direct sun on 21 Dec", "polar night: no sun positions at all");
});

test("the colour scale starts dark blue, ends yellow, clamps, and the legend rounds the most sun hours up", () => {
  assert.deepEqual(rampColor(0), [0, 34, 78]);
  assert.deepEqual(rampColor(1), [255, 234, 70]);
  assert.deepEqual(rampColor(-3), rampColor(0));
  assert.deepEqual(rampColor(9), rampColor(1));
  assert.deepEqual(rampColor(0.5), [139, 135, 116], "halfway between the third and fourth stops");
  assert.equal(legendMax(7.2), 8);
  assert.equal(legendMax(8), 8);
  assert.equal(legendMax(0), 1);
});

const RESULT: DayResult = {
  grid: { x0: 0, y0: 0, cols: 2, rows: 2, cell: 1, z: 0, mask: Uint8Array.from([1, 1, 0, 1]), cells: 3 },
  hours: Float32Array.from([0, 4, 0, 2]),
  steps: [],
  maxHours: 4,
};

test("heat pixels: hours on the scale (shade stays visible), cells outside the room transparent, and the south-first flip", () => {
  const px = heatPixels(RESULT, "hours", null);
  assert.deepEqual([...px.slice(0, 4)], [0, 34, 78, 140], "no sun: dark blue, see-through");
  assert.deepEqual([...px.slice(4, 8)], [255, 234, 70, 215], "4 of 4 hours: yellow");
  assert.deepEqual([...px.slice(8, 12)], [0, 0, 0, 0], "outside the room");
  assert.deepEqual([...px.slice(12, 16)], [139, 135, 116, 215], "2 of 4 hours: the middle of the scale");
  const flipped = heatPixels(RESULT, "hours", null, true);
  assert.deepEqual([...flipped.slice(0, 8)], [...px.slice(8, 16)], "the second row comes first");
  assert.deepEqual([...flipped.slice(8, 16)], [...px.slice(0, 8)]);
});

test("heat pixels in 'right now' mode show lit cells yellow and the rest dark, whatever their hours", () => {
  const px = heatPixels(RESULT, "now", Uint8Array.from([0, 0, 0, 1]));
  assert.deepEqual([...px.slice(4, 8)], [0, 34, 78, 140], "4 sun hours in the day but in shade right now");
  assert.deepEqual([...px.slice(12, 16)], [255, 234, 70, 215]);
});

/** A hand-turned scheduler and a clock that only moves when the fake run does work. */
function fake() {
  const queue: (() => void)[] = [];
  const clock = { t: 0, cancelled: 0 };
  const sched: Scheduler = { now: () => clock.t, later: (fn) => { queue.push(fn); return () => { clock.cancelled++; queue.length = 0; }; } };
  let steps = 0;
  const run: Run = {
    step: (n) => { steps += n; clock.t += 3 * n; },
    get done() { return steps >= 10; },
    get progress() { return steps / 10; },
    result: () => RESULT,
  };
  return { queue, clock, sched, run, steps: () => steps };
}

test("drive: slices of about the budget (at least one step each), progress between them, one result at the end", () => {
  const f = fake();
  const progress: number[] = [];
  let done = 0;
  drive(f.run, f.sched, { budgetMs: 8, onProgress: (p) => progress.push(p), onDone: () => done++ });
  assert.equal(f.steps(), 0, "nothing runs until the scheduler calls back");
  while (f.queue.length) f.queue.shift()?.();
  assert.equal(f.steps(), 10, "3 ms per step, 8 ms budget: three steps a slice (the clock passes 8 ms on the third), the fourth slice finishes the run");
  assert.equal(done, 1);
  assert.deepEqual(progress, [0.3, 0.6, 0.9]);
});

test("drive: a zero budget still makes progress; cancelling stops everything, also what is already scheduled", () => {
  const f = fake();
  let done = 0;
  const cancel = drive(f.run, f.sched, { budgetMs: 0, onProgress: () => {}, onDone: () => done++ });
  f.queue.shift()?.();
  assert.equal(f.steps(), 1);
  const pending = f.queue[0];
  cancel();
  pending?.();
  assert.equal(f.steps(), 1, "a slice that was already scheduled does nothing after cancel");
  assert.equal(done, 0);
  assert.equal(f.clock.cancelled, 1);
});
