import test from "node:test";
import assert from "node:assert/strict";
import { HANDLE_PX, HANDLE_PX_COARSE, gizmoAt, gizmoSizes, handleZoom, hitArrow, hitRing, ringRadius } from "./gizmoPick.ts";
import type { Ray } from "./pickRank.ts";

const N = Math.hypot(1, 1, 1);
const iso = (x: number, y: number, z: number): Ray => ({ o: { x: x + 30 / N, y: y + 30 / N, z: z + 30 / N }, d: { x: -1 / N, y: -1 / N, z: -1 / N } });
const down = (x: number, z: number): Ray => ({ o: { x, y: 20, z }, d: { x: 0, y: -1, z: 0 } });
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test("handle sizes are pixels over zoom: constant on screen, bigger for fingers", () => {
  const a = gizmoSizes(100, false);
  const b = gizmoSizes(50, false);
  near(a.band * 100, HANDLE_PX / 2);
  near(b.band * 50, HANDLE_PX / 2);
  near(gizmoSizes(100, true).band * 100, HANDLE_PX_COARSE / 2);
  assert.ok(b.arrowLen > a.arrowLen && b.arrowGap > a.arrowGap);
  assert.equal(handleZoom(100.4), 100);
  assert.equal(handleZoom(0), 1);
});

test("the ring keeps a pixel gap from tiny pieces and grows with big ones", () => {
  const s = gizmoSizes(100, false);
  const tiny = ringRadius(0.05, 0.05, s);
  assert.ok(tiny >= 0.22 + 0.035 - 1e-9);
  assert.ok(ringRadius(6, 4, s) > 3.6);
  const far = gizmoSizes(20, false); // zoomed out: 24 px is 1.2 m
  near(ringRadius(0.05, 0.05, far) - Math.hypot(0.05, 0.05) / 2, 1.2);
});

test("hitRing: inside the band yes, off the band no, behind the camera no", () => {
  const r = 1;
  assert.ok(hitRing(down(1, 0), 0, 0, 0.09, r, 0.1));
  assert.ok(hitRing(down(1.09, 0), 0, 0, 0.09, r, 0.1));
  assert.ok(!hitRing(down(1.2, 0), 0, 0, 0.09, r, 0.1));
  assert.ok(!hitRing(down(0, 0), 0, 0, 0.09, r, 0.1), "the middle of the ring is not the ring");
  assert.ok(!hitRing({ o: { x: 1, y: 20, z: 0 }, d: { x: 0, y: 1, z: 0 } }, 0, 0, 0.09, r, 0.1));
  assert.ok(!hitRing({ o: { x: 1, y: 1, z: 0 }, d: { x: 1, y: 0, z: 0 } }, 0, 0, 0.09, r, 0.1), "a level ray never meets the floor plane");
});

test("hitArrow: along the segment, at its ends within the radius, not beside it", () => {
  assert.ok(hitArrow(iso(0, 2.25, 0), 0, 2, 0, 0.5, 0.1));
  assert.ok(hitArrow(iso(0, 2.52, 0), 0, 2, 0, 0.5, 0.1), "just past the tip, within the radius");
  assert.ok(!hitArrow(iso(0, 2.8, 0), 0, 2, 0, 0.5, 0.1));
  assert.ok(!hitArrow(iso(0.6, 2.25, 0), 0, 2, 0, 0.5, 0.1));
  assert.ok(!hitArrow(iso(0, 3.5, 0), 0, 2, 0, 0.5, 0.1), "far above its tip");
  assert.ok(hitArrow(down(0.05, 0), 0, 2, 0, 0.5, 0.1), "from straight above the segment is a point: still within the radius");
  assert.ok(!hitArrow(down(0.3, 0), 0, 2, 0, 0.5, 0.1));
});

test("gizmoAt: the arrow wins where both are hit; the ring needs no neighbour", () => {
  const box = { x: 0, z: 0, y1: 1, lv: 0, w: 1, d: 1 };
  const s = gizmoSizes(100, false);
  const mid = box.y1 + s.arrowGap + s.arrowLen / 2;
  assert.equal(gizmoAt(iso(0, mid, 0), box, 100, false), "elev");
  const r = ringRadius(box.w, box.d, s);
  assert.equal(gizmoAt(down(r, 0), box, 100, false), "rotate");
  assert.equal(gizmoAt(down(0.5, 0.5), box, 100, false), null);
  // a finger grabs wider than a mouse
  const off = r + s.band + 0.03;
  assert.equal(gizmoAt(down(off, 0), box, 100, false), null);
  assert.equal(gizmoAt(down(off, 0), box, 100, true), "rotate");
});
