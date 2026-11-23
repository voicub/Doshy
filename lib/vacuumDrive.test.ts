import test from "node:test";
import assert from "node:assert/strict";
import { SPEED, livePosition, modeOf, reportedPosition, startDrive, stepDrive, stepLive, type Drive, type Mode } from "./vacuumDrive.ts";
import { TEMPLATES } from "./templates.ts";
import { buildWorld, cellOf, type World } from "./vacuumPath.ts";
import type { Item } from "./types.ts";

function world(): World {
  const plan = TEMPLATES.find((t) => t.id === "two-bedroom")!.build();
  const room = plan.rooms.find((r) => r.name.startsWith("Living"))!;
  const vac: Item = { id: "v", kind: "ap_robot_vacuum", x: room.x + room.w / 2, y: room.y + room.h / 2, rot: 0, w: 0.34, d: 0.34, h: 0.09, level: room.level };
  return buildWorld(plan, vac)!;
}

/** Drive for `seconds` in `mode`, checking the robot stays on free floor; returns the distance travelled. */
function run(d: Drive, w: World, mode: Mode, seconds: number): number {
  let travelled = 0;
  for (let t = 0; t < seconds; t += 0.05) {
    const { x, y } = d;
    stepDrive(d, w, mode, 0.05);
    travelled += Math.hypot(d.x - x, d.y - y);
    const c = cellOf(w.grid, d);
    const atPark = Math.hypot(d.x - w.park.x, d.y - w.park.y) < 0.3;
    assert.ok(atPark || (c >= 0 && w.grid.free[c]), `${mode}: robot left the floor at ${d.x.toFixed(2)},${d.y.toFixed(2)}`);
  }
  return travelled;
}

test("HA vacuum states map to what the robot does", () => {
  assert.equal(modeOf("cleaning"), "cleaning");
  assert.equal(modeOf("returning"), "returning");
  assert.equal(modeOf("docked"), "docked");
  assert.equal(modeOf("paused"), "paused");
  assert.equal(modeOf("error"), "error");
  assert.equal(modeOf("idle"), "idle");
  assert.equal(modeOf("unavailable"), "off");
  assert.equal(modeOf(undefined), "off");
});

test("docked robot sits on its parking spot", () => {
  const w = world();
  const d = startDrive(w, "docked", 0);
  assert.deepEqual([d.x, d.y], [w.park.x, w.park.y]);
  assert.equal(run(d, w, "docked", 2), 0);
});

test("cleaning, then returning, then docked: it drives at the scaled speed, never leaves the floor and ends parked", () => {
  const w = world();
  const d = startDrive(w, "docked", 0);
  const away = run(d, w, "cleaning", 20);
  assert.ok(Math.abs(away - SPEED * 20) < SPEED, `drove ${away.toFixed(1)} m in 20 s`);
  assert.ok(Math.hypot(d.x - w.park.x, d.y - w.park.y) > 1, "it left the dock");
  run(d, w, "returning", 120);
  assert.ok(Math.hypot(d.x - w.park.x, d.y - w.park.y) < 1e-6, "back on the dock");
  assert.equal(d.route, null);
  assert.equal(run(d, w, "docked", 3), 0);
});

test("pausing stops where it is and cleaning resumes from there", () => {
  const w = world();
  const d = startDrive(w, "docked", 0);
  run(d, w, "cleaning", 10);
  const at = { x: d.x, y: d.y };
  assert.equal(run(d, w, "paused", 5), 0);
  assert.deepEqual({ x: d.x, y: d.y }, at);
  assert.ok(run(d, w, "cleaning", 2) > 1);
});

test("an error stops the robot", () => {
  const w = world();
  const d = startDrive(w, "docked", 0);
  run(d, w, "cleaning", 6);
  assert.equal(run(d, w, "error", 5), 0);
});

test("a finished lap starts over while the vacuum still reports cleaning", () => {
  const w = world();
  const d = startDrive(w, "docked", 0);
  run(d, w, "cleaning", (w.clean.len / SPEED) * 1.05);
  assert.ok(d.route && d.kind === "clean");
});

test("returning from anywhere on the floor reaches the dock", () => {
  const w = world();
  const d = startDrive(w, "returning", 5_000);
  assert.ok(d.route && d.kind === "go");
  run(d, w, "returning", 200);
  assert.ok(Math.hypot(d.x - w.park.x, d.y - w.park.y) < 1e-6);
});

test("reduced motion: a fixed progress point along the lap, the same each time", () => {
  const w = world();
  const a = startDrive(w, "cleaning", 600_000, true);
  const b = startDrive(w, "cleaning", 600_000, true);
  assert.deepEqual([a.x, a.y], [b.x, b.y]);
  assert.ok(Math.hypot(a.x - w.park.x, a.y - w.park.y) > 0.5);
});

test("positions the vacuum reports become plan positions through the calibration", () => {
  assert.deepEqual(reportedPosition({ x: 120, y: 340 }), { x: 120, y: 340 });
  assert.deepEqual(reportedPosition({ position: { x: 1, y: 2 } }), { x: 1, y: 2 });
  assert.deepEqual(reportedPosition({ position: [3, 4] }), { x: 3, y: 4 });
  assert.equal(reportedPosition({ friendly_name: "Robo" }), null);
  assert.equal(livePosition({ friendly_name: "Robo" }, undefined), null);
  assert.deepEqual(livePosition({ x: 1000, y: 2000 }, undefined), { x: 1000, y: 2000 });
  assert.deepEqual(livePosition({ x: 1000, y: 2000 }, { calScale: 0.001, calX: 2, calY: 1 }), { x: 3, y: 3 });
});

test("a reported position is followed smoothly, a far jump snaps", () => {
  const w = world();
  const d = startDrive(w, "docked", 0);
  const start = { x: d.x, y: d.y };
  stepLive(d, { x: start.x + 1, y: start.y }, 0.05);
  assert.ok(d.x > start.x && d.x < start.x + 1);
  stepLive(d, { x: start.x + 50, y: start.y }, 0.05);
  assert.equal(d.x, start.x + 50);
});
