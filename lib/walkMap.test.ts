import test from "node:test";
import assert from "node:assert/strict";
import { headingTip, inView, mapBounds, mapStairs, mapViewBox, mapWalls, roomNameAt } from "./walkMap.ts";
import { buildWalkWorld } from "./walkCollide.ts";
import { planBounds } from "./geometry.ts";
import { walkStart } from "./walkStart.ts";
import type { Opening, Plan, Room } from "./types.ts";

const room = (id: string, name: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({ id, name, x, y, w, h, color: "#fff", floor: "wood", ...extra });
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

const home: Plan = {
  walls: [{ id: "w", a: { x: 4, y: 0 }, b: { x: 4, y: 6 }, style: "plaster" }],
  openings: [{ id: "d", wallId: "w", t: 0.5, width: 1, type: "door", sill: 0, height: 2.1 } satisfies Opening],
  rooms: [room("hall", "Hall", 0, 0, 4, 6), room("liv", "Living & kitchen", 4, 0, 8, 6), room("alc", "Alcove", 10, 0, 2, 2, { parent: "liv" })],
  items: [],
  levels: [{ id: "L0", name: "Ground", elevation: 0, height: 2.78 }, { id: "L1", name: "Up", elevation: 2.78, height: 2.78 }],
};

test("the room under the feet is named, an alcove by its host, and none is outside", () => {
  assert.equal(roomNameAt(home, "L0", 2, 3), "Hall");
  assert.equal(roomNameAt(home, "L0", 7, 3), "Living & kitchen");
  assert.equal(roomNameAt(home, "L0", 11, 1), "Living & kitchen"); // the alcove is part of it
  assert.equal(roomNameAt(home, "L0", 30, 30), "Outside");
  assert.equal(roomNameAt(home, "L1", 2, 3), "Outside", "another storey has no room here");
});

test("the map fits the storey with padding and keeps the box's shape", () => {
  const b = mapBounds(home, "L0");
  assert.deepEqual(b, { x0: 0, y0: 0, x1: 12, y1: 6 });
  const wide = mapViewBox(b, 4 / 3, 1);
  near(wide.w / wide.h, 4 / 3);
  near(wide.x + wide.w / 2, 6);
  near(wide.y + wide.h / 2, 3);
  assert.ok(wide.w >= 14 && wide.h >= 8, "everything fits with its padding");
  const tall = mapViewBox({ x0: 0, y0: 0, x1: 4, y1: 20 }, 4 / 3, 0);
  near(tall.h, 20);
  near(tall.w, 20 * (4 / 3));
});

test("an empty storey falls back to the whole plan", () => {
  assert.deepEqual(mapBounds(home, "L1"), planBounds(home)); // the building's own extent (its walls)
});

test("the arrow's tip is ahead of the walker and turns clockwise", () => {
  const up = headingTip(5, 5, 0, 1);
  near(up.x, 5);
  near(up.y, 4);
  const right = headingTip(5, 5, Math.PI / 2, 1);
  near(right.x, 6);
  near(right.y, 5);
});

test("a point's place in the view is a clamped fraction of it", () => {
  const v = { x: 0, y: 0, w: 10, h: 5 };
  assert.deepEqual(inView(v, { x: 5, y: 2.5 }), { x: 0.5, y: 0.5 });
  assert.deepEqual(inView(v, { x: -3, y: 9 }), { x: 0, y: 1 });
});

test("the map's walls leave a door open", () => {
  const lines = mapWalls(home, "L0");
  assert.equal(lines.length, 2);
  const total = lines.reduce((s, l) => s + Math.hypot(l.x2 - l.x1, l.y2 - l.y1), 0);
  near(total, 5);
});

test("stairs show on the map as their four corners", () => {
  const p: Plan = { ...home, items: [{ id: "s", kind: "stairs_straight_closed", x: 2, y: 3, rot: 90, w: 0.9, d: 3.9, h: 2.78 }] };
  const [corners] = mapStairs(p, "L0");
  assert.equal(corners.length, 4);
  const xs = corners.map((c) => c.x);
  near(Math.max(...xs) - Math.min(...xs), 3.9); // turned a quarter: the long side runs along x
});

test("the walk starts in a chosen room, an alcove in its host, and falls back to some room", () => {
  const world = buildWalkWorld(home);
  const liv = walkStart(home, world, "liv");
  assert.ok(liv);
  assert.equal(roomNameAt(home, "L0", liv.walker.x, liv.walker.y), "Living & kitchen");
  const alc = walkStart(home, world, "alc");
  assert.ok(alc);
  assert.equal(roomNameAt(home, "L0", alc.walker.x, alc.walker.y), "Living & kitchen");
  const any = walkStart(home, world);
  assert.ok(any, "no front door, still somewhere to stand");
  assert.equal(walkStart({ ...home, rooms: [] }, buildWalkWorld({ ...home, rooms: [] })), null);
});
