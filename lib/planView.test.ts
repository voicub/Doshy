import assert from "node:assert/strict";
import test from "node:test";
import { FRAME_MIN_W, FRAME_PAD, REF_W, ZOOM_MAX, fitViewFree, growTo, rectOf, selBounds } from "./planView.ts";
import type { Plan } from "./types.ts";

const whole = (w: number, h: number) => ({ x0: 0, y0: 0, x1: w, y1: h });
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("with the whole canvas free the fit is the classic centred padded view", () => {
  const v = fitViewFree({ x0: 0, y0: 0, x1: 20, y1: 10 }, 1600, 900, whole(1600, 900));
  near(v.cx, 10);
  near(v.cy, 5);
  near(v.w, Math.max(20 + FRAME_PAD * 2, (10 + FRAME_PAD * 2) * (1600 / 900)));
});

test("a tall plan on a wide canvas is limited by its height", () => {
  const v = fitViewFree({ x0: 0, y0: 0, x1: 4, y1: 30 }, 800, 480, whole(800, 480));
  near(v.w, (30 + FRAME_PAD * 2) * (800 / 480));
});

test("a small plan is never framed tighter than the minimum width", () => {
  near(fitViewFree({ x0: 0, y0: 0, x1: 2, y1: 2 }, 800, 480, whole(800, 480)).w, FRAME_MIN_W);
});

test("the plan centre lands in the middle of the free area", () => {
  const b = { x0: 0, y0: 0, x1: 10, y1: 8 };
  const free = { x0: 0, y0: 44, x1: 420, y1: 368 }; // 800 x 480 with a side sheet and the bars
  const v = fitViewFree(b, 800, 480, free, 1.4);
  const r = rectOf(v, 800 / 480);
  const screenX = ((5 - r.x) / r.w) * 800;
  const screenY = ((4 - r.y) / r.h) * 480;
  near(screenX, 210, 1e-6);
  near(screenY, 206, 1e-6);
  // and the padded plan fits the free area
  assert.ok((10 + 2.8) / v.w * 800 <= 420 + 1e-6);
  assert.ok((8 + 2.8) / r.h * 480 <= 324 + 1e-6);
});

test("an empty plan keeps the default framing on the whole canvas and shifts into a smaller free area", () => {
  const a = fitViewFree(null, 1600, 1000, whole(1600, 1000));
  assert.deepEqual([a.cx, a.cy, a.w], [REF_W / 2, REF_W / 2 / 1.6, REF_W]);
  const b = fitViewFree(null, 800, 480, { x0: 0, y0: 0, x1: 400, y1: 480 });
  assert.ok(b.cx > a.cx);
  near(b.w, REF_W * 2); // REF_W metres now span the 400 px that are free
});

test("the zoom is capped", () => {
  assert.ok(fitViewFree({ x0: 0, y0: 0, x1: 500, y1: 500 }, 800, 480, whole(800, 480)).w <= ZOOM_MAX + 1e-9);
});

test("growTo keeps a view that already holds the bounds", () => {
  assert.equal(growTo({ cx: 5, cy: 5, w: 20 }, { x0: 1, y0: 1, x1: 9, y1: 9 }, 1.6, 0), null);
  assert.ok(growTo({ cx: 5, cy: 5, w: 20 }, { x0: 1, y0: 1, x1: 40, y1: 9 }, 1.6, 0));
});

const plan = {
  walls: [{ id: "w1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness: 0.1, style: "plaster" }],
  openings: [{ id: "o1", wallId: "w1", t: 0.5, width: 0.9, type: "door" }],
  rooms: [{ id: "r1", x: 1, y: 2, w: 3, h: 4, name: "Hall" }],
  items: [{ id: "i1", kind: "column", x: 5, y: 5, w: 0.4, d: 0.2, rot: 0 }],
  voids: [{ id: "v1", x: 6, y: 6, w: 1, h: 2 }],
  ground: [{ id: "g1", x: 0, y: 0, w: 2, h: 2, kind: "grass" }],
  paths: [{ id: "p1", points: [{ x: 0, y: 0 }, { x: 3, y: 1 }], width: 1, kind: "gravel" }],
} as unknown as Plan;

test("selBounds boxes each kind of selection and returns null for a missing one", () => {
  assert.deepEqual(selBounds(plan, { type: "room", id: "r1" }), { x0: 1, y0: 2, x1: 4, y1: 6 });
  const wall = selBounds(plan, { type: "wall", id: "w1" })!;
  assert.ok(wall.x0 < 0 && wall.x1 > 4);
  const door = selBounds(plan, { type: "opening", id: "o1" })!;
  near((door.x0 + door.x1) / 2, 2);
  assert.ok(selBounds(plan, { type: "item", id: "i1" }));
  assert.deepEqual(selBounds(plan, { type: "void", id: "v1" }), { x0: 6, y0: 6, x1: 7, y1: 8 });
  assert.ok(selBounds(plan, { type: "ground", id: "g1" }));
  const path = selBounds(plan, { type: "path", id: "p1" })!;
  assert.ok(path.x1 > 3 && path.y1 > 1);
  assert.equal(selBounds(plan, { type: "wall", id: "nope" }), null);
  assert.equal(selBounds(plan, null), null);
});
