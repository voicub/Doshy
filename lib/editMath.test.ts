import test from "node:test";
import assert from "node:assert/strict";
import type { Def } from "./catalog.ts";
import { ELEV_SNAPS, snapModule, angleAround, dragTarget, fitIso, grabOffset, itemExtent, itemGrid, rayPlane, rayVerticalPlane, ringRotation, snapAngle, snapElev, snapTo, surfaceHit } from "./editMath.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const none = { shiftKey: false, altKey: false };

test("a ray from the iso camera hits the floor plane where it points", () => {
  const d = { x: -1, y: -1, z: -1 };
  const p = rayPlane({ x: 10, y: 10, z: 10 }, d, 0)!;
  near(p.x, 0);
  near(p.y, 0);
  const lifted = rayPlane({ x: 10, y: 10, z: 10 }, d, 0.75)!;
  near(lifted.x, 0.75);
  near(lifted.y, 0.75);
});

test("rays parallel to the plane or pointing away miss it", () => {
  assert.equal(rayPlane({ x: 0, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }, 0), null);
  assert.equal(rayPlane({ x: 0, y: 5, z: 0 }, { x: 0, y: 1, z: 0 }, 0), null);
});

test("a ray meets a camera-facing vertical plane at the right height", () => {
  // camera looks along (-1,-1,-1); plane through plan (2,2) facing the camera (normal (1,1) in plan)
  const y = rayVerticalPlane({ x: 12, y: 12, z: 12 }, { x: -1, y: -1, z: -1 }, { x: 2, y: 2 }, { x: 0.7071, y: 0.7071 })!;
  near(y, 2, 1e-3);
  assert.equal(rayVerticalPlane({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }), null);
});

test("grab offset keeps the item under the same spot of the pointer", () => {
  const off = grabOffset({ x: 3.2, y: 1.1 }, { x: 3, y: 1 });
  const t = dragTarget({ x: 5.2, y: 2.1 }, off, 0.05);
  near(t.x, 5);
  near(t.y, 2);
  // free drag (grid 0) keeps the exact offset
  const free = dragTarget({ x: 5.237, y: 2.1 }, off, 0);
  near(free.x, 5.037);
});

test("grid steps: 5 cm, Shift 1 cm, Alt free", () => {
  assert.equal(itemGrid(none), 0.05);
  assert.equal(itemGrid({ shiftKey: true, altKey: false }), 0.01);
  assert.equal(itemGrid({ shiftKey: false, altKey: true }), 0);
  assert.equal(snapTo(1.234, 0.05), 1.25);
  assert.equal(snapTo(1.234, 0), 1.234);
});

test("angles are clockwise in plan view and wrap to 0..360", () => {
  near(angleAround({ x: 0, y: 0 }, { x: 1, y: 0 }), 0);
  near(angleAround({ x: 0, y: 0 }, { x: 0, y: 1 }), 90);
  near(angleAround({ x: 0, y: 0 }, { x: 0, y: -1 }), 270);
  assert.equal(snapAngle(-10, 15), 345);
  assert.equal(snapAngle(353, 15), 0);
  assert.equal(snapAngle(37, 15), 30);
  assert.equal(snapAngle(37.4, 1), 37);
});

test("ring rotation turns by the swept angle, not by the absolute pointer angle", () => {
  assert.equal(ringRotation(90, 10, 55, 15), 135);
  assert.equal(ringRotation(0, 10, 3, 15), 0);
  assert.equal(ringRotation(350, 0, 30, 15), 15);
});

test("elevation sticks to common heights, else 5 cm steps, never below the floor", () => {
  assert.equal(snapElev(0.77, none), 0.75);
  assert.equal(snapElev(-0.3, none), 0);
  assert.equal(snapElev(1.2, none), 1.2);
  assert.equal(snapElev(1.2, { shiftKey: false, altKey: true }), 1.2);
  assert.equal(snapElev(0.77, { shiftKey: false, altKey: true }), 0.77);
  for (const e of ELEV_SNAPS) assert.equal(snapElev(e, none), e);
  assert.equal(snapElev(9, none), 2.6);
});

test("pick box height follows the drawn parts, scaled and lifted", () => {
  const def: Def = { label: "Box", brand: "Generic", cat: "Living", w: 1, d: 1, h: 1, parts: [{ p: [0, 0.5, 0], s: [1, 1, 1], c: "#fff" }] };
  const e = itemExtent(def, { h: 2, elev: 0.5 });
  near(e.y0, 0.5);
  near(e.y1, 2.5);
  near(itemExtent(def, { h: 1 }, 0.4).y1, 0.4);
});

test("iso framing centres the plan and zooms out for a bigger plan, within the camera limits", () => {
  const small = fitIso({ x0: 0, y0: 0, x1: 4, y1: 4 }, 1200, 800);
  const big = fitIso({ x0: 0, y0: 0, x1: 20, y1: 12 }, 1200, 800);
  near(big.x, 10);
  near(big.z, 6);
  near(big.y, 1.1);
  assert.ok(big.zoom < small.zoom);
  assert.ok(big.zoom >= 10 && small.zoom <= 220);
});

const mod = (x: number, y: number, elev: number, w = 0.35, h = 0.35, d = 0.35, rot = 0) => ({ x, y, w, d, h, rot, elev });

test("a module snaps flush against the side of a neighbour of its family", () => {
  const s = snapModule(mod(1.74, 0.2, 1.3), [mod(1.4, 0.2, 1.3)]);
  near(s.x, 1.75);
  assert.ok(s.snapped);
  assert.ok(s.guides.length >= 1);
  near(snapModule(mod(1.06, 0.2, 1.3), [mod(1.4, 0.2, 1.3)]).x, 1.05);
});

test("a module stacks on top of and under a neighbour, edges aligned", () => {
  const up = snapModule(mod(1.43, 0.2, 1.62), [mod(1.4, 0.2, 1.3)]);
  near(up.elev, 1.65);
  near(up.x, 1.4);
  const under = snapModule(mod(1.4, 0.2, 0.92), [mod(1.4, 0.2, 1.3)]);
  near(under.elev, 0.95);
});

test("back planes go flush when the depths differ", () => {
  const s = snapModule(mod(1.75, 0.15, 1.3, 0.35, 0.35, 0.25), [mod(1.4, 0.175, 1.3)]);
  near(s.y, 0.125); // back edge at the neighbour back edge (0)
  near(s.x, 1.75);
});

test("beyond 6 cm, or with no neighbour, nothing snaps (except common mounting heights)", () => {
  const far = snapModule(mod(1.9, 0.2, 1.3), [mod(1.4, 0.2, 1.3)]);
  assert.equal(far.x, 1.9);
  const alone = snapModule(mod(2, 0.2, 1.1), []);
  assert.equal(alone.snapped, false);
  near(snapModule(mod(2, 0.2, 1.33), []).elev, 1.3);
});

test("the 0.35 m grid is relative to the nearest module, also for wider modules", () => {
  // anchor spans 1.0..1.7 (0.70 wide); a 0.35 module whose left edge is 3 cm off 2.05 (= 1.0 + 3 x 0.35) lands on it
  const s = snapModule(mod(2.2, 0.2, 2.0), [mod(1.35, 0.2, 1.3, 0.7, 0.7)]);
  near(s.x - 0.175, 2.05, 0.071);
  assert.ok(s.snapped);
});

test("modules rotated with their wall snap along the wall, and a lift moves height only", () => {
  const a = mod(0.2, 1.4, 1.3, 0.35, 0.35, 0.35, 90);
  const b = { ...mod(0.2, 1.74, 1.3, 0.35, 0.35, 0.35, 90) };
  const s = snapModule(b, [a]);
  near(s.y, 1.75);
  near(s.x, 0.2);
  const lift = snapModule(mod(1.4, 0.2, 1.64), [mod(1.4, 0.2, 1.3)], { axes: { u: false, n: false, v: true } });
  near(lift.elev, 1.65);
  near(lift.x, 1.4);
});

test("modules facing another way are ignored", () => {
  const s = snapModule(mod(1.74, 0.2, 1.3), [mod(1.4, 0.2, 1.3, 0.35, 0.35, 0.35, 90)]);
  assert.equal(s.x, 1.74);
});

test("surfaceHit: the floor plane inside the building, the ground plane outside it, no parallax either way", () => {
  const o = { x: 20, y: 20, z: 20 };
  const d = { x: -1, y: -1, z: -1 };
  const outside = (p: { x: number; y: number }) => p.x > 10; // a building up to x = 10, floor lifted 1 m
  const inside = surfaceHit(o, d, 1, 0, true, outside)!; // floor hit at (1, 1): inside
  assert.deepEqual([inside.p.x, inside.y], [1, 1]);
  const o2 = { x: 40, y: 20, z: 20 };
  const out = surfaceHit(o2, d, 1, 0, true, outside)!; // floor hit at (21, ...) is outside: re-hit the ground at y = 0
  near(out.p.x, 20);
  assert.equal(out.y, 0);
  const flat = surfaceHit(o2, d, 1, 0, false, outside)!; // not groundable: always the floor plane
  near(flat.p.x, 21);
  assert.equal(flat.y, 1);
  const lifted = surfaceHit(o2, d, 1, 0.5, true, outside)!; // a lifted item aims at ground + lift
  near(lifted.p.x, 20 + 0.5);
  assert.equal(surfaceHit(o, { x: 1, y: 0, z: 0 }, 1, 0, true, outside), null);
});
