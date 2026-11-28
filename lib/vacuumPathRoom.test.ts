import test from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES } from "./templates.ts";
import { lapInRoom } from "./vacuumPathRoom.ts";
import { retarget, startDrive, stepDrive } from "./vacuumDrive.ts";
import { buildWorld, cellOf, pointAt } from "./vacuumPath.ts";
import type { Item } from "./types.ts";

const plan = TEMPLATES.find((t) => t.id === "two-bedroom")!.build();
const living = plan.rooms.find((r) => r.name.startsWith("Living"))!;
const vac: Item = { id: "v", kind: "ap_robot_vacuum", x: living.x + living.w / 2, y: living.y + living.h / 2, rot: 0, w: 0.34, d: 0.34, h: 0.09, level: living.level };
const world = buildWorld(plan, vac)!;
const bigRooms = plan.rooms.filter((r) => !r.parent).sort((a, b) => b.w * b.h - a.w * a.h);

test("the room lap is a shorter lap that mostly lies inside the room", () => {
  const room = bigRooms.find((r) => lapInRoom(world, r))!;
  assert.ok(room, "some room is cleaned by the lap");
  const lap = lapInRoom(world, room)!;
  assert.ok(lap.len > 0 && lap.len < world.clean.len, "shorter than the whole lap");
  assert.deepEqual(lap.pts[0], world.park);
  const inRoom = (p: { x: number; y: number }) => p.x >= room.x - 0.06 && p.x <= room.x + room.w + 0.06 && p.y >= room.y - 0.06 && p.y <= room.y + room.h + 0.06;
  let inside = 0;
  const n = Math.floor(lap.len / 0.25);
  for (let i = 0; i <= n; i++) inside += inRoom(pointAt(lap, i * 0.25)) ? 1 : 0;
  assert.ok(inside / (n + 1) > 0.7, "most of the lap is in the room (the rest is the way there)");
});

test("a room the lap hardly touches keeps the whole lap", () => {
  assert.equal(lapInRoom(world, { x: 1000, y: 1000, w: 4, h: 4 }), null);
});

test("the robot drives the room lap on free floor and switches to it from where it stands", () => {
  const room = bigRooms.find((r) => lapInRoom(world, r))!;
  const lane = { ...world, clean: lapInRoom(world, room)! };
  const d = startDrive(world, "cleaning", 60_000);
  for (let t = 0; t < 20; t += 0.05) stepDrive(d, world, "cleaning", 0.05);
  retarget(d, lane);
  assert.equal(d.kind, "clean");
  for (let t = 0; t < 120; t += 0.05) {
    stepDrive(d, lane, "cleaning", 0.05);
    const c = cellOf(world.grid, d);
    const atPark = Math.hypot(d.x - world.park.x, d.y - world.park.y) < 0.3;
    // A* string pulling may brush a clearance cell by about a centimetre (lib/vacuumPath.ts `los`): never inside a wall or a piece of furniture, always in a room or doorway
    assert.ok(atPark || (c >= 0 && !world.grid.raw[c] && world.grid.walk[c]), `robot left the floor at ${d.x.toFixed(2)},${d.y.toFixed(2)}`);
  }
});

test("a robot that is not cleaning is not sent anywhere", () => {
  const room = bigRooms.find((r) => lapInRoom(world, r))!;
  const d = startDrive(world, "docked", 0);
  retarget(d, { ...world, clean: lapInRoom(world, room)! });
  assert.equal(d.route, null);
});
