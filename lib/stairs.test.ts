import test from "node:test";
import assert from "node:assert/strict";
import { LANDING_D, MAX_RISER, TREAD, buildingRects, entranceStairs, exposedEdges, isOpenAir, stairBlocks, stairCount, stairHandrails } from "./stairs.ts";
import type { Plan, Room } from "./types.ts";

test("a metre of rise takes six risers, none taller than 0.17 m", () => {
  assert.equal(stairCount(1), 6);
  assert.equal(stairCount(0), 0);
  assert.equal(stairCount(0.17), 1);
  for (const e of [0.3, 0.8, 1, 1.4, 2.78]) assert.ok(e / stairCount(e) <= MAX_RISER + 1e-9);
});

test("stair blocks descend one riser per tread and the last tread is one riser high", () => {
  const n = stairCount(1);
  const { blocks, riser } = stairBlocks(1, n);
  assert.equal(blocks.length, n); // landing + (n - 1) treads
  assert.equal(blocks[0].s1, LANDING_D);
  assert.ok(Math.abs(blocks[0].top - 0.98) < 1e-9);
  assert.ok(Math.abs(blocks.at(-1)!.top - riser) < 1e-9);
  for (let i = 2; i < blocks.length; i++) {
    assert.ok(Math.abs(blocks[i].s0 - blocks[i - 1].s1) < 1e-9);
    assert.ok(Math.abs(blocks[i].s1 - blocks[i].s0 - TREAD) < 1e-9);
    assert.ok(blocks[i].top < blocks[i - 1].top);
  }
});

test("handrail runs from the landing down to the foot of the stair", () => {
  const n = stairCount(1);
  const { rails, posts } = stairHandrails(1, n);
  assert.equal(rails.length, 2);
  assert.ok(rails[1].y1 < rails[1].y0);
  assert.ok(posts.length >= 3);
});

test("the outline of two touching rectangles hides the shared border", () => {
  const e = exposedEdges([{ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 }]);
  const length = e.reduce((s, k) => s + Math.hypot(k.x1 - k.x0, k.y1 - k.y0), 0);
  assert.ok(Math.abs(length - 12) < 1e-9); // 4 x 2 outline = 12, not 16
  assert.ok(!e.some((k) => k.x0 === 2 && k.x1 === 2));
});

test("the outline of an L shape follows its notch and every edge points away from the shape", () => {
  const e = exposedEdges([{ x: 0, y: 0, w: 4, h: 2 }, { x: 0, y: 2, w: 2, h: 2 }]);
  const length = e.reduce((s, k) => s + Math.hypot(k.x1 - k.x0, k.y1 - k.y0), 0);
  assert.ok(Math.abs(length - 16) < 1e-9);
  for (const k of e) {
    const mx = (k.x0 + k.x1) / 2 + k.nx * 0.05;
    const my = (k.y0 + k.y1) / 2 + k.ny * 0.05;
    const inside = (mx > 0 && mx < 4 && my > 0 && my < 2) || (mx > 0 && mx < 2 && my > 2 && my < 4);
    assert.ok(!inside);
  }
});

test("balconies and lawns are open air, so they get no plinth", () => {
  const room = (name: string, floor: Room["floor"]): Room => ({ id: name, name, x: 0, y: 0, w: 2, h: 2, floor, color: "#fff" });
  assert.ok(isOpenAir(room("Balcony", "tile")));
  assert.ok(isOpenAir(room("Yard", "grass")));
  assert.ok(!isOpenAir(room("Bedroom", "wood")));
  assert.equal(buildingRects([room("Balcony", "tile"), room("Bedroom", "wood")], 0.1).length, 1);
});

const room: Room = { id: "r", name: "Hall", x: 0, y: 0, w: 4, h: 3, floor: "wood", color: "#fff" };
const walls = [
  { id: "n", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, style: "plaster" as const },
  { id: "e", a: { x: 4, y: 0 }, b: { x: 4, y: 3 }, style: "plaster" as const },
  { id: "s", a: { x: 4, y: 3 }, b: { x: 0, y: 3 }, style: "plaster" as const },
  { id: "w", a: { x: 0, y: 3 }, b: { x: 0, y: 0 }, style: "plaster" as const },
];
const base = (levels: Plan["levels"]): Plan => ({
  walls,
  rooms: [room],
  items: [],
  levels,
  openings: [
    { id: "d", wallId: "n", t: 0.5, width: 0.9, height: 2.1, sill: 0, type: "door" },
    { id: "win", wallId: "e", t: 0.5, width: 1, height: 1.2, sill: 0, type: "window" },
  ],
});

test("an exterior door on a raised ground floor gets stairs that lead away from the building", () => {
  const specs = entranceStairs(base([{ id: "L0", name: "Ground floor", elevation: 1, height: 2.78 }]));
  assert.equal(specs.length, 1); // windows get none
  const s = specs[0];
  assert.equal(s.count, 6);
  assert.ok(Math.abs(s.nx) < 1e-9 && Math.abs(s.ny + 1) < 1e-9); // the north wall faces -y
  assert.ok(s.width > 0.9);
});

test("no stairs on an unraised plan or for doors between rooms", () => {
  assert.equal(entranceStairs(base(undefined)).length, 0);
  const inner = base([{ id: "L0", name: "G", elevation: 1, height: 2.78 }]);
  inner.rooms = [room, { ...room, id: "r2", name: "Office", y: -3 }];
  assert.equal(entranceStairs(inner).length, 0);
});
