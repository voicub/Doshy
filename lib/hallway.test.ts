import test from "node:test";
import assert from "node:assert/strict";
import { HALL_LEN, HALL_W, entrySteps, entryOf, hallwayOf, hallwayToPlan, type Hallway } from "./hallway.ts";
import { setEntryIn, setBuildingTypeIn, withDefaultLevels } from "./planOps.ts";
import { starterPlan } from "./starterPlan.ts";
import { entranceStairs, type Rect } from "./stairs.ts";
import type { Plan, Room } from "./types.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const overlap = (a: Rect, b: Rect) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-6;
const aabb = (h: Hallway): Rect => {
  const xs = h.outline.map((p) => p.x);
  const ys = h.outline.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

const room = (id: string, x: number, y: number, w: number, h: number): Room => ({ id, name: id, x, y, w, h, floor: "wood", color: "#fff" });
/** A flat 10 m wide, 3 m deep, with its front door in the middle of the north wall. */
const flat = (extra: Partial<Plan> = {}): Plan => ({
  walls: [
    { id: "n", a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, style: "plaster" },
    { id: "e", a: { x: 10, y: 0 }, b: { x: 10, y: 3 }, style: "plaster" },
    { id: "s", a: { x: 10, y: 3 }, b: { x: 0, y: 3 }, style: "plaster" },
    { id: "w", a: { x: 0, y: 3 }, b: { x: 0, y: 0 }, style: "plaster" },
  ],
  rooms: [room("hall", 0, 0, 10, 3)],
  items: [],
  levels: [{ id: "L0", name: "Parter inalt", elevation: 1, height: 2.78 }],
  building: { type: "apartment" },
  openings: [{ id: "d", wallId: "n", t: 0.5, width: 0.9, height: 2.1, sill: 0, type: "door" }],
  ...extra,
});

test("the entrance defaults by building type, and plans saved without it or with the old 'street' behave", () => {
  assert.equal(entryOf(undefined), "hallway");
  assert.equal(entryOf({ type: "apartment" }), "hallway");
  assert.equal(entryOf({ type: "house" }), "stairs");
  assert.equal(entryOf({ type: "apartment", entry: "street" }), "stairs"); // old name reads as stairs
  assert.equal(entryOf({ type: "house", entry: "street" }), "stairs");
  assert.equal(entryOf({ type: "house", entry: "hallway" }), "hallway");
  assert.equal(entryOf({ type: "apartment", entry: "door" }), "door");
  assert.ok(hallwayOf(flat())); // no `entry` field
  assert.equal(hallwayOf(flat({ building: { type: "apartment", entry: "street" } })), null);
  assert.equal(hallwayOf(flat({ building: { type: "house" } })), null);
});

test("the corridor lies outside the front door, centred, 7 m long and 1.8 m wide", () => {
  const h = hallwayOf(flat())!;
  assert.equal(h.openingId, "d");
  near(h.x, 5);
  near(h.y, 0);
  assert.deepEqual([h.nx, h.ny], [0, -1]); // the north wall faces -y
  near(h.x1 - h.x0, HALL_LEN);
  near(h.x0, -h.x1); // centred on the door
  near(h.depth, HALL_W);
  const box = aabb(h);
  near(box.w, HALL_LEN);
  near(box.h, HALL_W);
  near(box.x, 1.5);
  assert.ok(box.y + box.h <= -0.06 + 1e-9); // entirely outside the wall's outer face
  near(hallwayToPlan(h, 0, h.face + h.depth / 2).y, -(0.06 + HALL_W / 2)); // straight out from the door
  assert.equal(h.elevation, 1);
});

test("it stops at the facade ends and before a balcony, and gives up when the door is blocked", () => {
  const short = hallwayOf(flat({ walls: flat().walls.map((w) => (w.id === "n" ? { ...w, a: { x: 3, y: 0 }, b: { x: 7.5, y: 0 } } : w)) }))!;
  near(short.x1 - short.x0, 4.5 - 2 * 0.12); // the facade's length minus the two end walls
  const balcony = hallwayOf(flat({ rooms: [room("hall", 0, 0, 10, 3), room("Balcony", 7.5, -2, 3, 2)] }))!;
  assert.ok(balcony.x0 > -3.5 + 0.5); // local x runs west here, the balcony is on that side
  assert.ok(!overlap(aabb(balcony), { x: 7.5, y: -2, w: 3, h: 2 }));
  const blocked = flat({ walls: [...flat().walls, { id: "fence", a: { x: 3, y: -1 }, b: { x: 7, y: -1 }, style: "plaster" }] }); // a wall right across the door
  assert.equal(hallwayOf(blocked), null);
  assert.equal(entranceStairs(blocked).length, 1); // so the door keeps its steps
});

test("it never overlaps another wall of the level, and keeps the front door's neighbours out of its features", () => {
  const plan = flat({
    walls: [...flat().walls, { id: "wing", a: { x: 8.5, y: 0 }, b: { x: 8.5, y: -3 }, style: "plaster" }],
    openings: [...flat().openings, { id: "win", wallId: "n", t: 0.8, width: 1.2, height: 1.2, sill: 0.9, type: "window" }],
  });
  const h = hallwayOf(plan)!;
  const wing: Rect = { x: 8.5 - 0.06, y: -3, w: 0.12, h: 3 };
  assert.ok(!overlap({ x: h.shell.x, y: h.shell.y, w: h.shell.w, h: h.shell.h }, wing));
  const doorAt = h.spans.every(([a, b]) => b <= -0.45 || a >= 0.45);
  assert.ok(doorAt, "the front door's stretch of wall is never a free span");
  for (const f of h.features.filter((f) => f.wall === "near")) assert.ok(h.spans.some(([a, b]) => f.x >= a && f.x <= b));
});

test("the corridor carries a stairwell door, a lift and two or three neighbours' doors", () => {
  const h = hallwayOf(flat())!;
  const kinds = h.features.map((f) => f.kind);
  assert.ok(kinds.includes("stairwell") && kinds.includes("lift") && kinds.includes("window"));
  const neighbours = h.features.filter((f) => f.kind === "neighbour");
  assert.ok(neighbours.length >= 2 && neighbours.length <= 3);
  assert.equal(neighbours.filter((f) => f.mat).length, 1);
  for (const f of h.features.filter((f) => f.wall === "far")) assert.ok(f.x > h.x0 && f.x < h.x1);
});

test("the starter flat gets its corridor outside the hall's north door, clear of every room", () => {
  const plan = starterPlan();
  const h = hallwayOf(plan)!;
  assert.ok(h);
  assert.deepEqual([h.nx, h.ny], [0, -1]);
  const door = plan.openings.find((o) => o.id === h.openingId)!;
  near(door.width, 0.9);
  near(h.x, 4.04, 0.01);
  for (const r of plan.rooms) assert.ok(!overlap(aabb(h), r), r.name);
  assert.ok(entranceStairs(withDefaultLevels(plan)).some((s) => s.openingId === h.openingId)); // the raised flat's stairs option still has its steps
  assert.equal(entrySteps(plan).length, 0); // hallway: no steps at the corridor door
  assert.equal(hallwayOf(setEntryIn(plan, "stairs")), null);
  assert.equal(entrySteps(setEntryIn(plan, "stairs")).length, 1);
});

test("the three entrances: hallway has a corridor and no steps, stairs has steps, door has neither", () => {
  const plan = flat();
  const modes = (["hallway", "stairs", "door"] as const).map((entry) => {
    const p = { ...plan, building: { type: "apartment" as const, entry } };
    return [entry, !!hallwayOf(p), entrySteps(p).length] as const;
  });
  assert.deepEqual(modes, [["hallway", true, 0], ["stairs", false, 1], ["door", false, 0]]);
  const house = (entry?: "hallway" | "stairs" | "door") => ({ ...plan, building: { type: "house" as const, ...(entry ? { entry } : {}) } });
  assert.ok(!hallwayOf(house()) && entrySteps(house()).length === 1); // house default: stairs
  assert.ok(hallwayOf(house("hallway"))); // a house may choose the corridor too
  assert.equal(entrySteps(house("door")).length, 0);
  const ground = house(); // at ground level stairs make nothing
  ground.levels = [{ id: "L0", name: "Ground", elevation: 0, height: 2.78 }];
  assert.equal(entrySteps(ground).length, 0);
});

test("choosing the entrance is a plain building edit that never writes the old name", () => {
  const plan = flat();
  assert.equal(setEntryIn(plan, "hallway"), plan); // already the default
  const stairs = setEntryIn(plan, "stairs");
  assert.equal(stairs.building!.entry, "stairs");
  assert.equal(plan.building!.entry, undefined);
  assert.equal(setEntryIn(stairs, "stairs"), stairs);
  assert.equal(setEntryIn(stairs, "door").building!.entry, "door");
  assert.equal(setBuildingTypeIn(stairs, "house").building!.entry, "stairs");
  const old = { ...plan, building: { type: "apartment" as const, entry: "street" as const } }; // saved before the rename
  assert.equal(setEntryIn(old, "stairs"), old);
  assert.equal(setEntryIn(old, "door").building!.entry, "door");
});
