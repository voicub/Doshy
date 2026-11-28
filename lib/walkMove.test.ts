import test from "node:test";
import assert from "node:assert/strict";
import { EYE_DEFAULT, EYE_MAX, EYE_MIN, PITCH_LIMIT, SPRINT_FACTOR, WALK_SPEED, approach, clampEye, headBob, joystickIntent, lookStep, wishVelocity, yawToward, type Vec } from "./walkMove.ts";
import { buildWalkWorld, standAt, stepWalker } from "./walkCollide.ts";
import type { Plan } from "./types.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test("facing up the plan, forward is -y and strafing right is +x", () => {
  const f = wishVelocity({ forward: 1, strafe: 0, sprint: false }, 0);
  near(f.x, 0);
  near(f.y, -WALK_SPEED);
  const r = wishVelocity({ forward: 0, strafe: 1, sprint: false }, 0);
  near(r.x, WALK_SPEED);
  near(r.y, 0);
  const east = wishVelocity({ forward: 1, strafe: 0, sprint: false }, Math.PI / 2); // turned a quarter clockwise: facing +x
  near(east.x, WALK_SPEED);
  near(east.y, 0);
});

test("a diagonal is no faster than straight ahead, and a sprint doubles the pace", () => {
  const d = wishVelocity({ forward: 1, strafe: 1, sprint: false }, 0.7);
  near(Math.hypot(d.x, d.y), WALK_SPEED);
  const s = wishVelocity({ forward: 1, strafe: 0, sprint: true }, 0.7);
  near(Math.hypot(s.x, s.y), WALK_SPEED * SPRINT_FACTOR);
});

test("velocity eases toward the wish at any frame rate", () => {
  const wish: Vec = { x: 0, y: -WALK_SPEED };
  const run = (dt: number) => {
    let v: Vec = { x: 0, y: 0 };
    for (let t = 0; t < 0.3 - 1e-9; t += dt) v = approach(v, wish, dt);
    return v;
  };
  near(run(1 / 60).y, run(1 / 30).y, 1e-6); // the same speed after the same time, whatever the frame rate
  assert.ok(Math.abs(run(1 / 60).y) > 0.5 * WALK_SPEED && Math.abs(run(1 / 60).y) < WALK_SPEED, "on its way, not a snap");
});

test("three seconds of walking forward in an open room covers about four metres", () => {
  const plan: Plan = { walls: [], openings: [], rooms: [{ id: "r", name: "r", x: 0, y: 0, w: 20, h: 20, color: "#fff", floor: "wood" }], items: [] };
  const world = buildWalkWorld(plan);
  const start = standAt(world, "L0", 10, 15);
  assert.ok(start);
  let w = start;
  let v: Vec = { x: 0, y: 0 };
  const dt = 1 / 60;
  for (let i = 0; i < 180; i++) {
    v = approach(v, wishVelocity({ forward: 1, strafe: 0, sprint: false }, 0), dt);
    w = stepWalker(world, w, v.x * dt, v.y * dt);
  }
  const walked = 15 - w.y;
  assert.ok(walked > 3.8 && walked < WALK_SPEED * 3, `${walked} m in 3 s`);
  near(w.x, 10);
  near(Math.hypot(v.x, v.y), WALK_SPEED, 0.01);
});

test("looking turns the right way, wraps the yaw and never goes over the top", () => {
  const a = lookStep({ yaw: 0, pitch: 0 }, 100, 0, 0.01);
  near(a.yaw, 1);
  const b = lookStep({ yaw: Math.PI - 0.1, pitch: 0 }, 100, 0, 0.01);
  assert.ok(b.yaw < 0 && b.yaw > -Math.PI, "wrapped round");
  assert.equal(lookStep({ yaw: 0, pitch: 0 }, 0, -1e6, 0.01).pitch, PITCH_LIMIT);
  assert.equal(lookStep({ yaw: 0, pitch: 0 }, 0, 1e6, 0.01).pitch, -PITCH_LIMIT);
});

test("the head bob is small, stops when standing still and is a whole step per stride", () => {
  near(headBob(3, 0), 0);
  let peak = 0;
  for (let d = 0; d < 2; d += 0.01) peak = Math.max(peak, Math.abs(headBob(d, WALK_SPEED)));
  assert.ok(peak > 0.005 && peak < 0.02, `${peak}`);
  near(headBob(0.75, WALK_SPEED), headBob(0, WALK_SPEED), 1e-9);
});

test("the eye height setting stays between 1.2 and 1.9 m and survives junk", () => {
  assert.equal(clampEye(1.0), EYE_MIN);
  assert.equal(clampEye(2.5), EYE_MAX);
  assert.equal(clampEye(1.7), 1.7);
  for (const junk of [undefined, NaN, "1.7", null]) assert.equal(clampEye(junk), EYE_DEFAULT);
});

test("the joystick has a dead zone, a graded push, and runs past its rim", () => {
  assert.deepEqual(joystickIntent(3, -3, 60), { forward: 0, strafe: 0, sprint: false });
  const up = joystickIntent(0, -60, 60);
  near(up.forward, 1);
  near(up.strafe, 0);
  assert.equal(up.sprint, false);
  const half = joystickIntent(0, -35, 60);
  assert.ok(half.forward > 0.2 && half.forward < 0.8);
  assert.equal(joystickIntent(80, 0, 60).sprint, true);
  assert.ok(joystickIntent(-40, 0, 60).strafe < 0, "left is negative");
});

test("yawToward looks at the target", () => {
  near(yawToward({ x: 0, y: 0 }, { x: 0, y: -5 }), 0); // up the plan
  near(yawToward({ x: 0, y: 0 }, { x: 5, y: 0 }), Math.PI / 2);
  near(Math.abs(yawToward({ x: 0, y: 0 }, { x: 0, y: 5 })), Math.PI);
});
