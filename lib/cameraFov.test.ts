import test from "node:test";
import assert from "node:assert/strict";
import { FOV_PRESETS, fanArea, fovOf, fovPolygon, presetOf } from "./cameraFov.ts";
import type { Item, Plan } from "./types.ts";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster" as const });
/** A 6 x 4 m room walled in on all sides, with a 1 m window in the east wall. */
const room = (): Plan => ({
  walls: [wall("n", 0, 0, 6, 0), wall("e", 6, 0, 6, 4), wall("s", 6, 4, 0, 4), wall("w", 0, 4, 0, 0)],
  openings: [{ id: "win", wallId: "e", t: 0.5, width: 1, type: "window", sill: 0.9, height: 1.2 }],
  rooms: [],
  items: [],
});
/** Camera on the west wall looking east (front = +z, rot 270 turns it to point along +x). */
const cam = (params?: Item["params"]): Item => ({ id: "c", kind: "sec_cam_bullet", x: 0.2, y: 2, rot: 270, w: 0.07, d: 0.2, h: 0.14, params });

test("fov is clamped and presets are recognised", () => {
  assert.equal(presetOf(45, 9), "narrow");
  assert.equal(presetOf(46, 9), undefined);
  assert.deepEqual(fovOf({ kind: "x", params: { fov: 400, range: -3 } }), { fov: 170, range: 1 });
});

test("a camera sees a fan that grows with the angle and the range and points the way it faces", () => {
  const plan = room();
  const reach = FOV_PRESETS.map((p) => Math.max(...fovPolygon({ walls: [], openings: [], rooms: [], items: [] }, cam({ fov: p.fov, range: p.range })).map((q) => Math.hypot(q.x - 0.2, q.y - 2))));
  assert.ok(reach[0] < reach[1] && reach[1] < reach[2], "wide sees close, narrow sees far");
  const [wide, normal] = FOV_PRESETS.map((p) => fanArea(fovPolygon(plan, cam({ fov: p.fov, range: p.range }))));
  assert.ok(wide > 0 && normal > 0);
  const poly = fovPolygon(plan, cam({ fov: 60, range: 3 }));
  const mid = poly[Math.floor(poly.length / 2)];
  assert.ok(mid.x > 3 && Math.abs(mid.y - 2) < 0.2, "the middle ray goes east");
  for (const p of poly.slice(1)) assert.ok(Math.hypot(p.x - poly[0].x, p.y - poly[0].y) <= 3 + 1e-9);
});

test("walls stop the view; a window does not", () => {
  const plan = room();
  const far = fovPolygon(plan, cam({ fov: 20, range: 20 }));
  const mid = far[Math.floor(far.length / 2)];
  assert.ok(mid.x > 6.5, "straight through the window");
  const wide = fovPolygon(plan, cam({ fov: 170, range: 20 }));
  for (const p of wide) assert.ok((p.x >= -0.01 && p.x <= 6.01 && p.y >= -0.01 && p.y <= 4.01) || (p.x > 6 && Math.abs(p.y - 2) <= 0.6), `leaked through a wall at ${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  assert.ok(wide.some((p) => p.x > 6.1), "some rays pass the window");
  assert.ok(wide.filter((p) => p.x > 6.1).length < wide.length / 2, "most rays stop at the wall");
});
