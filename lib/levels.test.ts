import test from "node:test";
import assert from "node:assert/strict";
import { elevationOf, floorY, groundable, groundedWall, levelIdOf, levelsOf, newLevelId, nextElevation, onLevel, outsideRooms, sortedLevels } from "./levels.ts";
import { withDefaultLevels } from "./planOps.ts";
import { starterPlan } from "./starterPlan.ts";
import type { Plan } from "./types.ts";

const wall = (id: string, level?: string) => ({ id, a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, style: "plaster" as const, ...(level ? { level } : {}) });
const base: Plan = { walls: [wall("a"), wall("b", "L1"), wall("c", "missing")], openings: [], rooms: [], items: [] };

test("a legacy plan has one ground level at elevation 0", () => {
  assert.equal(levelsOf(base).length, 1);
  assert.equal(elevationOf(base, undefined), 0);
});

test("entities without a level, or with an unknown one, live on the first level", () => {
  const p: Plan = { ...base, levels: [{ id: "L0", name: "Ground floor", elevation: 1, height: 2.78 }, { id: "L1", name: "First floor", elevation: 3.78, height: 2.78 }] };
  assert.equal(levelIdOf(p, p.walls[0]), "L0");
  assert.equal(levelIdOf(p, p.walls[2]), "L0");
  assert.deepEqual(onLevel(p, "L0").walls.map((w) => w.id), ["a", "c"]);
  assert.deepEqual(onLevel(p, "L1").walls.map((w) => w.id), ["b"]);
});

test("a raised ground floor keeps its elevation and a new level stacks above the top one", () => {
  const p: Plan = { ...base, levels: [{ id: "L1", name: "First floor", elevation: 3.78, height: 2.78 }, { id: "L0", name: "Ground floor", elevation: 1, height: 2.78 }] };
  assert.equal(elevationOf(p, "L0"), 1);
  assert.deepEqual(sortedLevels(p).map((l) => l.id), ["L0", "L1"]);
  assert.equal(nextElevation(p), 3.78 + 2.78);
  assert.equal(newLevelId(p), "L2");
});

test("a free-standing item outside a raised building stands on the ground, everything on the building keeps the level floor", () => {
  const plan = withDefaultLevels(starterPlan());
  const lv = plan.levels![0].elevation;
  assert.ok(lv > 0.5, "the owner's flat is raised");
  assert.equal(floorY(plan, { kind: "x", x: 30, y: 30 }), 0, "a car on the open ground");
  assert.equal(floorY(plan, { kind: "x", x: 30, y: 30, elev: 0.8 }), lv, "lifted items stay in the building frame");
  assert.equal(floorY(plan, { x: 30, y: 30 }), lv, "walls, rooms and openings are never grounded");
  const offenders = plan.items.filter((it) => floorY(plan, it) !== lv);
  assert.deepEqual(offenders.map((i) => i.kind), [], "no piece of the starter flat drops to the ground");
  const room = plan.rooms.find((r) => !r.parent)!;
  assert.equal(outsideRooms(plan, plan.levels![0].id, room.x + room.w / 2, room.y + room.h / 2), false);
});

test("only unlifted items on the lowest level of a raised building can stand on the ground", () => {
  const plan = withDefaultLevels(starterPlan());
  const id = plan.levels![0].id;
  assert.equal(groundable(plan, id), true);
  assert.equal(groundable(plan, id, 0.3), false);
  assert.equal(groundable({ levels: [{ id: "L0", name: "G", elevation: 0, height: 2.78 }] }, "L0"), false, "nothing to drop to on a ground-level floor");
});

test("a garden fence stands on the ground of a raised building, unless it touches the building or the building is not raised", () => {
  const room = { id: "r", name: "Flat", x: 0, y: 0, w: 8, h: 6, color: "#fff", floor: "wood" as const };
  const fence = (a: [number, number], b: [number, number]) => ({ id: "f", a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, style: "fence_picket" as const });
  const raised: Plan = { walls: [], openings: [], items: [], rooms: [room], levels: [{ id: "L0", name: "Ground floor", elevation: 1, height: 2.78 }] };
  assert.equal(groundedWall(raised, fence([-3, -3], [11, -3])), true, "a boundary fence far from the flat");
  assert.equal(groundedWall(raised, fence([-3, 3], [11, 3])), false, "a fence running through the flat is part of its floor");
  assert.equal(groundedWall(raised, fence([-3, -3], [4, 3])), false, "one end inside the flat");
  assert.equal(groundedWall({ ...raised, levels: [{ id: "L0", name: "Ground floor", elevation: 0, height: 2.78 }] }, fence([-3, -3], [11, -3])), false, "nothing to drop to when the floor is on the ground");
});
