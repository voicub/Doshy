import test from "node:test";
import assert from "node:assert/strict";
import { MIN_OPENING, OPENING_DEFAULTS, WALL_H, normalizeOpening, wallBoxes, withOpeningDims, projectOnWall, planBounds, roomAt, openingPoint, openingSwing } from "./geometry.ts";
import { doorSwing } from "./placement.ts";

test("door cuts a full-height gap and leaves a lintel", () => {
  const boxes = wallBoxes(4, [{ t: 0.5, width: 1, sill: 0, height: 2.1 }], 2.6);
  assert.deepEqual(boxes, [
    { s0: 0, s1: 1.5, y0: 0, y1: 2.6 },
    { s0: 1.5, s1: 2.5, y0: 2.1, y1: 2.6 },
    { s0: 2.5, s1: 4, y0: 0, y1: 2.6 },
  ]);
});

test("window leaves sill and lintel; cut-away height drops the lintel", () => {
  const tall = wallBoxes(4, [{ t: 0.5, width: 1, sill: 0.9, height: 1.2 }], 2.6);
  assert.equal(tall.length, 4);
  const low = wallBoxes(4, [{ t: 0.5, width: 1, sill: 0.9, height: 1.2 }], 0.9);
  assert.equal(low.length, 3); // sill 0..0.9 only
});

test("overlapping openings never produce negative-length boxes", () => {
  const boxes = wallBoxes(4, [
    { t: 0.5, width: 2, sill: 0, height: 2.1 },
    { t: 0.55, width: 2, sill: 0, height: 2.1 },
  ], 2.6);
  assert.ok(boxes.every((b) => b.s1 > b.s0));
});

test("projectOnWall clamps to wall ends", () => {
  const w = { id: "w", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, style: "plaster" as const };
  assert.equal(projectOnWall(w, { x: 9, y: 1 }).t, 1);
  assert.deepEqual(projectOnWall(w, { x: 2, y: 1 }), { t: 0.5, dist: 1 });
});

test("planBounds uses walls, then rooms; roomAt prefers the smaller room", () => {
  const room = (id: string, x: number, y: number, w: number, h: number) => ({ id, name: id, x, y, w, h, color: "#fff", floor: "wood" as const });
  const plan = { walls: [], openings: [], items: [], rooms: [room("big", 0, 0, 6, 4), room("small", 1, 1, 2, 2)] };
  assert.deepEqual(planBounds(plan), { x0: 0, y0: 0, x1: 6, y1: 4 });
  assert.equal(roomAt(plan, 2, 2)?.id, "small");
  assert.equal(roomAt(plan, 5, 3)?.id, "big");
  assert.equal(roomAt(plan, 9, 9), undefined);
});

test("a window uses its own sill and height, not a fixed one", () => {
  const boxes = wallBoxes(4, [{ t: 0.5, width: 1, sill: 0.3, height: 0.6 }], 2.6);
  const under = boxes.find((b) => b.s0 === 1.5 && b.y0 === 0)!;
  const over = boxes.find((b) => b.s0 === 1.5 && b.y0 > 0)!;
  assert.equal(under.y1, 0.3); // wall left below the sill
  assert.ok(Math.abs(over.y0 - 0.9) < 1e-9 && over.y1 === 2.6); // wall left above the window top
  // a high clerestory window leaves a tall sill and a thin lintel
  const high = wallBoxes(4, [{ t: 0.5, width: 1, sill: 1.6, height: 0.8 }], 2.6);
  assert.equal(high.find((b) => b.s0 === 1.5 && b.y0 === 0)!.y1, 1.6);
  assert.ok(Math.abs(high.find((b) => b.s0 === 1.5 && b.y0 > 0)!.y0 - 2.4) < 1e-9);
  // a window reaching the ceiling leaves no lintel at all
  assert.equal(wallBoxes(4, [{ t: 0.5, width: 1, sill: 0.9, height: 1.68 }], 2.58).filter((b) => b.s0 === 1.5).length, 1);
});

test("a door starting above the floor leaves a threshold under it", () => {
  const boxes = wallBoxes(4, [{ t: 0.5, width: 1, sill: 0.1, height: 2 }], 2.6);
  assert.equal(boxes.find((b) => b.s0 === 1.5 && b.y0 === 0)!.y1, 0.1);
});

test("normalizeOpening keeps every dimension physically possible", () => {
  const fit = (o: Partial<{ t: number; width: number; sill: number; height: number }>, len = 4) => normalizeOpening({ t: 0.5, width: 1, sill: 0.9, height: 1.2, ...o }, len);
  // the top may not pass the ceiling: raising the sill shrinks the height
  const raised = fit({ sill: 2.0, height: 1.2 });
  assert.ok(raised.sill + raised.height <= WALL_H + 1e-9);
  assert.ok(Math.abs(raised.height - (WALL_H - 2.0)) < 1e-9);
  // never below the floor, never thinner than the minimum
  assert.equal(fit({ sill: -3 }).sill, 0);
  assert.equal(fit({ width: 0 }).width, MIN_OPENING);
  assert.equal(fit({ height: 0 }).height, MIN_OPENING);
  // a window wider than its wall is cut down to the wall and centred
  const wide = fit({ width: 9 }, 2);
  assert.equal(wide.width, 2);
  assert.equal(wide.t, 0.5);
  // the opening may not hang off either end of the wall
  assert.ok(Math.abs(fit({ t: 0 }).t - 0.125) < 1e-9);
  assert.ok(Math.abs(fit({ t: 1 }).t - 0.875) < 1e-9);
  // garbage input falls back to sane numbers instead of NaN
  const bad = fit({ width: NaN, sill: NaN, height: NaN, t: NaN });
  assert.ok([bad.t, bad.width, bad.sill, bad.height].every(Number.isFinite));
  assert.deepEqual(fit({}), { t: 0.5, width: 1, sill: 0.9, height: 1.2 });
});

test("openings saved before sill and height existed get the old fixed dimensions", () => {
  assert.deepEqual(withOpeningDims({ type: "window" }), { type: "window", sill: 0.9, height: 1.2000000000000002 });
  assert.deepEqual(withOpeningDims({ type: "door" }), { type: "door", sill: 0, height: 2.1 });
  assert.deepEqual(withOpeningDims({ type: "window", sill: 0.4, height: 1.5 }), { type: "window", sill: 0.4, height: 1.5 });
  assert.equal(OPENING_DEFAULTS.window.sill + OPENING_DEFAULTS.window.height, 2.1);
});

test("window at sill 1.0 height 1.2 leaves a solid band below and a lintel above", () => {
  const boxes = wallBoxes(4, [{ t: 0.5, width: 1, sill: 1.0, height: 1.2 }], 2.6);
  assert.deepEqual(boxes.filter((b) => b.s0 === 1.5 && b.s1 === 2.5), [
    { s0: 1.5, s1: 2.5, y0: 0, y1: 1.0 },
    { s0: 1.5, s1: 2.5, y0: 2.2, y1: 2.6 },
  ]);
});

test("door taller than the wall leaves no lintel and clamps to the wall height", () => {
  assert.equal(wallBoxes(4, [{ t: 0.5, width: 1, sill: 0, height: 3 }], 2.6).length, 2);
  assert.equal(normalizeOpening({ t: 0.5, width: 1, sill: 0, height: 3 }, 4).height, WALL_H);
});

test("openingPoint finds the centre of an opening along its wall", () => {
  const plan = { walls: [{ id: "w", a: { x: 0, y: 2 }, b: { x: 4, y: 2 }, style: "plaster" as const }], openings: [], rooms: [], items: [] };
  assert.deepEqual(openingPoint(plan, { wallId: "w", t: 0.25 }), { x: 1, y: 2 });
  assert.equal(openingPoint(plan, { wallId: "gone", t: 0.5 }), undefined);
});

test("the 3D door leaf ends exactly where the 2D swing arc ends, for every wall direction, hinge end and swing side", () => {
  for (const [b, name] of [[{ x: 4, y: 0 }, "east"], [{ x: 0, y: 4 }, "south"], [{ x: -4, y: 0 }, "west"], [{ x: 0, y: -4 }, "north"], [{ x: 3, y: 2 }, "slanted"]] as const) {
    const wall = { id: "w", a: { x: 1, y: 1 }, b: { x: 1 + b.x, y: 1 + b.y }, style: "plaster" as const };
    const len = Math.hypot(b.x, b.y);
    const u = { x: b.x / len, y: b.y / len };
    const right = { x: -u.y, y: u.x }; // local +z in plan
    for (const hinge of ["start", "end"] as const) {
      for (const swing of ["left", "right"] as const) {
        const o = { t: 0.4, width: 0.9, hinge, swing };
        const { h, n } = openingSwing(o);
        const centre = { x: wall.a.x + u.x * o.t * len, y: wall.a.y + u.y * o.t * len };
        // leaf hinged at local x = h * width / 2, turned by phi = h * n * 90deg: its free end is at (x_h - h * w * cos(phi), n * w)
        const phi = h * n * (Math.PI / 2);
        const lx = (h * o.width) / 2 - h * o.width * Math.cos(phi);
        const lz = -h * -Math.sin(phi) * o.width;
        const hingeLocal = (h * o.width) / 2;
        const tip = { x: centre.x + u.x * lx + right.x * lz, y: centre.y + u.y * lx + right.y * lz };
        const hingePt = { x: centre.x + u.x * hingeLocal, y: centre.y + u.y * hingeLocal };
        const sw = doorSwing(o, wall);
        const tag = `${name} ${hinge}/${swing}`;
        assert.ok(Math.hypot(tip.x - sw.leafEnd.x, tip.y - sw.leafEnd.y) < 1e-9, `${tag}: leaf tip`);
        assert.ok(Math.hypot(hingePt.x - sw.hinge.x, hingePt.y - sw.hinge.y) < 1e-9, `${tag}: hinge point`);
      }
    }
  }
});

test("a door swings sideways, never along the wall", () => {
  assert.deepEqual(openingSwing({}), { h: -1, n: -1 });
  assert.deepEqual(openingSwing({ hinge: "end", swing: "right" }), { h: 1, n: 1 });
  assert.deepEqual(openingSwing({}, "right"), { h: -1, n: 1 });
});
