import assert from "node:assert/strict";
import { test } from "node:test";
import type { Trace } from "./designTypes.ts";
import { calibrate, dragTrace, fitToView, imageToPlan, imageWidthM, planToImage, straighten, traceCorners, turnedBy, withImageWidth } from "./traceGeom.ts";

const base: Trace = { resourceId: "trace-a", w: 1000, h: 600, x: 5, y: 3, scale: 0.01, rotation: 0, opacity: 0.5, locked: false };
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);
const nearPt = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-9) => {
  near(a.x, b.x, eps);
  near(a.y, b.y, eps);
};

test("the image centre sits at x,y and a pixel is `scale` metres", () => {
  nearPt(imageToPlan(base, { x: 500, y: 300 }), { x: 5, y: 3 });
  nearPt(imageToPlan(base, { x: 0, y: 0 }), { x: 0, y: 0 }); // 500 px * 0.01 = 5 m left of and 3 m above the centre
  nearPt(imageToPlan(base, { x: 1000, y: 600 }), { x: 10, y: 6 });
});

test("a clockwise quarter turn sends the image's right edge to the bottom of the plan (y points down)", () => {
  const t = { ...base, rotation: 90 };
  nearPt(imageToPlan(t, { x: 1000, y: 300 }), { x: 5, y: 8 }); // 5 m right of the centre -> 5 m below it
  nearPt(imageToPlan(t, { x: 500, y: 0 }), { x: 8, y: 3 }); // 3 m above the centre -> 3 m to the right
});

test("plan -> image undoes image -> plan for any turn, scale and position", () => {
  for (const rotation of [0, 17, 90, -135, 180]) {
    const t = { ...base, rotation, scale: 0.0123, x: -4.2, y: 7.7 };
    for (const p of [{ x: 0, y: 0 }, { x: 321, y: 45 }, { x: 1000, y: 600 }]) nearPt(planToImage(t, imageToPlan(t, p)), p, 1e-7);
  }
});

test("corners are the four image corners, turned about the centre", () => {
  const [tl, tr, br, bl] = traceCorners({ ...base, rotation: 180 });
  nearPt(tl, { x: 10, y: 6 });
  nearPt(tr, { x: 0, y: 6 });
  nearPt(br, { x: 0, y: 0 });
  nearPt(bl, { x: 10, y: 0 });
});

test("calibrating: 200 px that are 4 m long make a pixel 0.02 m, and the first point does not move", () => {
  const a = { x: 100, y: 100 };
  const b = { x: 300, y: 100 };
  const before = imageToPlan(base, a);
  const t = calibrate(base, a, b, 4);
  assert.ok(t);
  near(t.scale, 0.02);
  nearPt(imageToPlan(t, a), before);
  near(Math.hypot(imageToPlan(t, b).x - imageToPlan(t, a).x, imageToPlan(t, b).y - imageToPlan(t, a).y), 4);
});

test("calibrating a turned image still keeps the first point and gets the distance right", () => {
  const t0 = { ...base, rotation: 33 };
  const a = { x: 700, y: 450 };
  const b = { x: 120, y: 80 };
  const t = calibrate(t0, a, b, 6.5);
  assert.ok(t);
  nearPt(imageToPlan(t, a), imageToPlan(t0, a));
  const [pa, pb] = [imageToPlan(t, a), imageToPlan(t, b)];
  near(Math.hypot(pb.x - pa.x, pb.y - pa.y), 6.5, 1e-9);
  assert.equal(t.rotation, 33);
});

test("calibrating refuses what cannot work: the same point twice, no distance, a scale out of range", () => {
  const a = { x: 10, y: 10 };
  assert.equal(calibrate(base, a, a, 3), null);
  assert.equal(calibrate(base, a, { x: 50, y: 10 }, 0), null);
  assert.equal(calibrate(base, a, { x: 50, y: 10 }, NaN), null);
  assert.equal(calibrate(base, a, { x: 11, y: 10 }, 100), null); // 100 m per pixel
  assert.equal(calibrate(base, a, { x: 5000, y: 10 }, 0.01), null); // 0.000002 m per pixel
});

test("straightening: a line 10 degrees off level is turned back to level, and the first point stays put", () => {
  const t0 = { ...base, rotation: 10 };
  const a = { x: 200, y: 300 };
  const b = { x: 800, y: 300 }; // level in the image; on the plan it runs 10 degrees clockwise
  const t = straighten(t0, a, b);
  assert.ok(t);
  near(t.rotation, 0, 1e-9);
  nearPt(imageToPlan(t, a), imageToPlan(t0, a));
  near(imageToPlan(t, b).y, imageToPlan(t, a).y);
});

test("straightening picks the nearer axis: a line 80 degrees clockwise becomes upright, not level", () => {
  const t = straighten(base, { x: 100, y: 100 }, { x: 100 + Math.cos((80 * Math.PI) / 180) * 400, y: 100 + Math.sin((80 * Math.PI) / 180) * 400 });
  assert.ok(t);
  near(t.rotation, 10, 1e-9); // 80 + 10 = 90: upright
});

test("straightening an already level line changes nothing; two equal points give nothing", () => {
  const a = { x: 50, y: 50 };
  const same = straighten(base, a, { x: 400, y: 50 });
  assert.ok(same);
  near(same.rotation, 0);
  nearPt({ x: same.x, y: same.y }, { x: base.x, y: base.y });
  assert.equal(straighten(base, a, a), null);
});

test("image width: pixels times scale, and setting a width sets the scale", () => {
  near(imageWidthM(base), 10);
  const t = withImageWidth(base, 12.4);
  assert.ok(t);
  near(t.scale, 0.0124);
  assert.equal(withImageWidth(base, 0), null);
  assert.equal(withImageWidth(base, 5000), null);
});

test("turning by buttons wraps into (-180, 180] and keeps one decimal", () => {
  assert.equal(turnedBy({ ...base, rotation: 170 }, 90).rotation, -100);
  assert.equal(turnedBy({ ...base, rotation: 0.3 }, 0.1).rotation, 0.4);
  assert.equal(turnedBy({ ...base, rotation: -90 }, -90).rotation, 180);
});

test("fit to view: centred in the view, whole image inside it with the margin", () => {
  const view = { x: -10, y: -8, w: 20, h: 16 };
  const t = fitToView(base, view); // 1000 x 600 px: the width limits (20 * 0.9 / 1000 = 0.018), the height would allow 16 * 0.9 / 600 = 0.024
  near(t.scale, 0.018);
  nearPt({ x: t.x, y: t.y }, { x: 0, y: 0 });
  assert.equal(t.rotation, 0);
});

test("fit to view with a quarter turn uses the turned bounding box; without resizing only the centre moves", () => {
  const view = { x: 0, y: 0, w: 20, h: 10 };
  const turned = fitToView({ ...base, rotation: 90 }, view); // turned: 600 px wide, 1000 px tall -> the height limits: 10 * 0.9 / 1000
  near(turned.scale, 0.009);
  nearPt({ x: turned.x, y: turned.y }, { x: 10, y: 5 });
  const moved = fitToView(base, view, false);
  assert.equal(moved.scale, base.scale);
  nearPt({ x: moved.x, y: moved.y }, { x: 10, y: 5 });
});

test("dragging the body moves the image by what the pointer moved", () => {
  const t = dragTrace(base, "move", { x: 5, y: 3 }, { x: 6.234, y: 1.5 });
  nearPt({ x: t.x, y: t.y }, { x: 6.23, y: 1.5 }, 1e-9);
  assert.equal(t.scale, base.scale);
});

test("dragging a corner away from the centre scales by the ratio of the distances, towards it shrinks, past the limits stops", () => {
  const [c, from] = [{ x: 5, y: 3 }, { x: 9, y: 3 }]; // 4 m from the centre
  near(dragTrace(base, "scale", from, { x: 5, y: 9 }).scale, 0.015); // 6 m from the centre: x1.5
  near(dragTrace(base, "scale", from, { x: 6, y: 3 }).scale, 0.0025); // 1 m: x0.25
  assert.equal(dragTrace(base, "scale", from, { x: 5 + 4e6, y: 3 }).scale, 1);
  assert.equal(dragTrace(base, "scale", c, from), base); // grabbed exactly on the centre: nothing to compare with
});

test("dragging the turn knob turns by the angle swept about the centre, in 15 degree steps with Shift", () => {
  const [from, to] = [{ x: 8, y: 3 }, { x: 5, y: 6 }]; // east of the centre to south of it: a clockwise quarter turn on the plan
  near(dragTrace(base, "rotate", from, to).rotation, 90);
  const swept = { x: 5 + 3 * Math.cos(0.3), y: 3 + 3 * Math.sin(0.3) }; // 0.3 rad = 17.19 degrees past east
  near(dragTrace(base, "rotate", from, swept).rotation, 17.2, 1e-9);
  near(dragTrace(base, "rotate", from, swept, true).rotation, 15);
  near(dragTrace({ ...base, rotation: 170 }, "rotate", from, to).rotation, -100); // wraps
});
