import test from "node:test";
import assert from "node:assert/strict";
import { firstLevelId } from "./levels.ts";
import { MAX_TRIP_S, WALK_MPS, advance, spotsIn, startWalk } from "./presenceWalk.ts";
import type { Plan, Pt, Room } from "./types.ts";
import { buildGrid, cellOf, pointAt, type Grid } from "./vacuumPath.ts";

const room = (id: string, x: number, w: number): Room => ({ id, name: id, x, y: 0, w, h: 4, floor: "wood", color: "#fff" });

/** Two rooms side by side, a wall between them and one door in it (0.9 m wide, centred 2 m along the wall). */
function twoRooms(wide: number): { plan: Plan; a: Room; b: Room; wallX: number } {
  const a = room("a", 0, wide);
  const b = room("b", wide + 0.12, wide);
  const wallX = wide + 0.06;
  const plan: Plan = {
    rooms: [a, b],
    items: [],
    walls: [{ id: "w", a: { x: wallX, y: 0 }, b: { x: wallX, y: 4 }, style: "plaster" }],
    openings: [{ id: "d", wallId: "w", t: 0.5, width: 0.9, type: "door", sill: 0, height: 2.1 }],
  };
  return { plan, a, b, wallX };
}

function gridOf(plan: Plan): Grid {
  const g = buildGrid(plan, firstLevelId(plan));
  assert.ok(g, "a grid");
  return g;
}

function spot(g: Grid, r: Room, id = "person.p"): Pt {
  const p = spotsIn(g, r, [id]).get(id);
  assert.ok(p, "a spot");
  return p;
}

test("people stand on free floor inside their room, keep apart, and stand in the same place every time", () => {
  const { plan, a } = twoRooms(4);
  const g = gridOf(plan);
  const ids = ["person.anna", "person.bob", "person.cleo"];
  const spots = spotsIn(g, a, ids);
  assert.deepEqual(spotsIn(g, a, [...ids].reverse()), spots);
  const list = [...spots.values()];
  assert.equal(list.length, ids.length);
  for (const p of list) {
    assert.ok(p.x > a.x && p.x < a.x + a.w && p.y > a.y && p.y < a.y + a.h, "inside the room");
    assert.equal(g.free[cellOf(g, p)], 1, "on free floor");
  }
  for (const [i, p] of list.entries()) for (const q of list.slice(i + 1)) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 0.6, "apart");
});

test("a spot keeps clear of the walls and the doorway", () => {
  const { plan, a, wallX } = twoRooms(4);
  const g = gridOf(plan);
  for (let k = 0; k < 40; k++) {
    const p = spot(g, a, `person.p${k}`);
    assert.ok(wallX - p.x > 0.3 && p.x > 0.3 && p.y > 0.3 && p.y < 3.7, `person.p${k} is away from the walls`);
  }
});

test("the walk to another room goes through the door, on free floor all the way", () => {
  const { plan, wallX } = twoRooms(4);
  const g = gridOf(plan);
  // a straight line between these two would cut through the wall far from the door (the door is at y 2)
  const w = startWalk(g, { x: 1, y: 0.6 }, { x: 6.5, y: 0.8 });
  assert.ok(w, "a route");
  let crossedAt: number | undefined;
  for (let s = 0; s <= w.route.len; s += 0.05) {
    const p = pointAt(w.route, s);
    assert.equal(g.free[cellOf(g, p)], 1, `free at ${s.toFixed(2)} m`);
    if (crossedAt === undefined && p.x > wallX) crossedAt = p.y;
  }
  assert.ok(crossedAt !== undefined && Math.abs(crossedAt - 2) <= 0.45, "crosses the wall inside the doorway");
});

test("no door, no walk: a room walled off gives no route (the avatar just appears)", () => {
  const { plan, a, b } = twoRooms(4);
  const g = gridOf({ ...plan, openings: [] });
  assert.equal(startWalk(g, spot(g, a), spot(g, b)), null);
});

test("a walk is about 1.1 m/s, and a long way is hurried so it never takes longer than the limit", () => {
  const { plan } = twoRooms(4);
  const short = startWalk(gridOf(plan), { x: 3, y: 2 }, { x: 5.2, y: 2 });
  assert.ok(short);
  assert.equal(short.speed, WALK_MPS);

  const far = twoRooms(20);
  const gf = gridOf(far.plan);
  const long = startWalk(gf, { x: 1, y: 2 }, { x: 39, y: 2 });
  assert.ok(long);
  assert.ok(long.route.len > MAX_TRIP_S * 1.1, "longer than the slow pace allows");
  let walk = long;
  for (let t = 0; t < MAX_TRIP_S; t += 0.1) walk = advance(walk, 0.1);
  assert.ok(walk.s >= walk.route.len - 1e-6, "arrived within the limit");
  assert.equal(advance(walk, 5).s, walk.route.len, "never past the end");
});

test("two spots a hair apart are not a walk", () => {
  const { plan } = twoRooms(4);
  assert.equal(startWalk(gridOf(plan), { x: 3, y: 2 }, { x: 3.1, y: 2 }), null);
});
