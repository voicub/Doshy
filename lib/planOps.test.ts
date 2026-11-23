import test from "node:test";
import assert from "node:assert/strict";
import { addLevelTo, buildingExtent, createRoomWalls, doorSwingBlockers, hingeForHand, hingeHand, moveRoomWithContents, openingEnd, openingStart, outwardFacing, overlappingLevels, removeLevelFrom, resizeRoom, resizeWall, roomGroup, setBuildingTypeIn, setRoofIn, tFromEnd, tFromStart, typedItemPatch, updateLevelIn, wallSides, withDefaultLevels } from "./planOps.ts";
import { collisionWalls } from "./placement.ts";
import { starterPlan } from "./starterPlan.ts";
import { WALL_T, projectOnWall, wallLen } from "./geometry.ts";
import type { Item, Plan, Pt, Room, Wall } from "./types.ts";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): Wall => ({ id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster" });
const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({ id, name: id, x, y, w, h, color: "#fff", floor: "wood", ...extra });
const item = (id: string, x: number, y: number): Item => ({ id, kind: "k", x, y, rot: 0, w: 1, d: 1, h: 1 });

// two rooms side by side: A interior 0..3 x 0..3, B interior 3.12..6.12 x 0..3; walls on the centrelines 0.06 outside each interior
function twoRooms(): Plan {
  return {
    rooms: [room("A", 0, 0, 3, 3), room("B", 3.12, 0, 3, 3)],
    walls: [
      wall("An", -0.06, -0.06, 3.06, -0.06), wall("Aw", -0.06, -0.06, -0.06, 3.06), wall("As", -0.06, 3.06, 3.06, 3.06),
      wall("mid", 3.06, -0.06, 3.06, 3.06),
      wall("Bn", 3.06, -0.06, 6.18, -0.06), wall("Be", 6.18, -0.06, 6.18, 3.06), wall("Bs", 3.06, 3.06, 6.18, 3.06),
    ],
    openings: [{ id: "d", wallId: "Aw", t: 0.5, width: 0.9, type: "door", sill: 0, height: 2.1 }, { id: "w", wallId: "Be", t: 0.5, width: 1, type: "window", sill: 0.9, height: 1.2 }],
    items: [item("a1", 1, 1), item("b1", 4.5, 1.5)],
  };
}

test("moving a room carries its walls, doors, windows and furniture and leaves the neighbour's furniture", () => {
  const plan = twoRooms();
  const moved = moveRoomWithContents(plan, "B", 10, 2);
  const b = moved.rooms.find((r) => r.id === "B")!;
  assert.ok(Math.abs(b.x - 13.12) < 1e-9 && b.y === 2 && b.w === 3 && b.h === 3);
  assert.deepEqual(moved.rooms.find((r) => r.id === "A"), plan.rooms[0]);
  assert.deepEqual(moved.items.find((i) => i.id === "b1"), { ...plan.items[1], x: 14.5, y: 3.5 });
  assert.deepEqual(moved.items.find((i) => i.id === "a1"), plan.items[0]);
  for (const id of ["Bn", "Be", "Bs"]) {
    const was = plan.walls.find((w) => w.id === id)!;
    const now = moved.walls.find((w) => w.id === id)!;
    assert.deepEqual(now.a, { x: was.a.x + 10, y: was.a.y + 2 });
  }
  assert.deepEqual(moved.walls.find((w) => w.id === "An"), plan.walls[0]); // A's own outer walls stay
  // openings are attached to their wall, so they travel with it and keep their size
  assert.deepEqual(moved.openings, plan.openings);
});

test("moving a room moves its alcove too", () => {
  const plan = twoRooms();
  plan.rooms.push(room("B2", 6.12, 0, 1, 1, { parent: "B" }));
  plan.walls.push(wall("B2e", 7.2, -0.06, 7.2, 1.06));
  const moved = moveRoomWithContents(plan, "B", 1, 1);
  assert.equal(moved.rooms.find((r) => r.id === "B2")!.x, 7.12);
  assert.deepEqual(moved.walls.find((w) => w.id === "B2e")!.a, { x: 8.2, y: 0.94 });
});

test("moving an unknown room changes nothing", () => {
  const plan = twoRooms();
  assert.equal(moveRoomWithContents(plan, "nope", 1, 1), plan);
});

test("resizing a room moves its east and south walls and the corners they meet, not the other walls", () => {
  const plan = twoRooms();
  const bigger = resizeRoom(plan, "A", 3.5, 3.4);
  const r = bigger.rooms.find((x) => x.id === "A")!;
  assert.equal(r.w, 3.5);
  assert.equal(r.h, 3.4);
  // the shared east wall of A moved east by 0.5 along with the north/south wall corners that touch it
  assert.deepEqual(bigger.walls.find((w) => w.id === "mid")!.a, { x: 3.56, y: -0.06 });
  assert.deepEqual(bigger.walls.find((w) => w.id === "mid")!.b, { x: 3.56, y: 3.46 });
  assert.deepEqual(bigger.walls.find((w) => w.id === "An")!.b, { x: 3.56, y: -0.06 });
  assert.deepEqual(bigger.walls.find((w) => w.id === "As")!.b, { x: 3.56, y: 3.46 });
  // the west wall keeps its x and its north end; only its south end follows the new south wall
  assert.deepEqual(bigger.walls.find((w) => w.id === "Aw"), { ...plan.walls[1], b: { x: -0.06, y: 3.46 } });
  assert.deepEqual(bigger.items, plan.items);
});

test("shrinking and ignoring bad sizes", () => {
  const plan = twoRooms();
  const smaller = resizeRoom(plan, "A", 2.5, 3);
  assert.deepEqual(smaller.walls.find((w) => w.id === "mid")!.a.x, 2.56);
  for (const bad of [0, -1, NaN]) assert.equal(resizeRoom(plan, "A", bad, 3), plan);
  assert.equal(resizeRoom(plan, "nope", 3, 3), plan);
});

const ids = () => {
  let n = 0;
  return () => `n${++n}`;
};

test("createRoomWalls on a bare room adds four walls on the rectangle expanded by half a wall", () => {
  const plan: Plan = { rooms: [room("R", 0, 0, 3, 2)], walls: [], openings: [], items: [] };
  const out = createRoomWalls(plan, "R", ids());
  assert.equal(out.walls.length, 4);
  const xs = out.walls.flatMap((w) => [w.a.x, w.b.x]);
  const ys = out.walls.flatMap((w) => [w.a.y, w.b.y]);
  assert.ok(Math.abs(Math.min(...xs) + 0.06) < 1e-9 && Math.abs(Math.max(...xs) - 3.06) < 1e-9);
  assert.ok(Math.abs(Math.min(...ys) + 0.06) < 1e-9 && Math.abs(Math.max(...ys) - 2.06) < 1e-9);
  assert.deepEqual(new Set(out.walls.map((w) => w.id)).size, 4);
});

test("createRoomWalls skips edges that already have a wall and is idempotent", () => {
  const plan = twoRooms();
  const out = createRoomWalls(plan, "A", ids());
  assert.equal(out, plan); // A already has north, west, south and the shared east wall
  const open: Plan = { ...plan, walls: plan.walls.filter((w) => w.id !== "As") };
  const fixed = createRoomWalls(open, "A", ids());
  assert.equal(fixed.walls.length, open.walls.length + 1);
  assert.deepEqual(fixed.walls.at(-1), { id: "n1", a: { x: -0.06, y: 3.06 }, b: { x: 3.06, y: 3.06 }, style: "plaster" });
  assert.equal(createRoomWalls(fixed, "A", ids()), fixed);
});

test("createRoomWalls fills only the missing stretch of a partly walled edge", () => {
  const plan: Plan = { rooms: [room("R", 0, 0, 4, 2)], walls: [wall("part", -0.06, -0.06, 1.5, -0.06)], openings: [], items: [] };
  const out = createRoomWalls(plan, "R", ids());
  const north = out.walls.filter((w) => w.a.y === -0.06 && w.b.y === -0.06);
  assert.equal(north.length, 2);
  assert.deepEqual(north[1].a, { x: 1.5, y: -0.06 });
  assert.ok(Math.abs(north[1].b.x - 4.06) < 1e-9);
  assert.equal(createRoomWalls(plan, "nope"), plan);
});

test("resizeWall moves the b end along the wall and keeps openings at their distance from the a end", () => {
  const plan = twoRooms();
  const longer = resizeWall(plan, "As", 5);
  assert.deepEqual(longer.walls.find((w) => w.id === "As")!.b, { x: 4.94, y: 3.06 });
  assert.deepEqual(longer.walls.find((w) => w.id === "As")!.a, { x: -0.06, y: 3.06 });
  // diagonal walls keep their direction
  const diag: Plan = { ...plan, walls: [wall("d", 0, 0, 3, 4)], openings: [{ id: "o", wallId: "d", t: 0.2, width: 1, type: "window", sill: 0.9, height: 1.2 }] };
  const d = resizeWall(diag, "d", 10);
  assert.deepEqual(d.walls[0].b, { x: 6, y: 8 });
  assert.ok(Math.abs(d.openings[0].t - 0.1) < 1e-9); // centre stayed 1 m from the a end of a wall that doubled
  // shorter wall squeezes its opening to fit; invalid lengths change nothing
  const short = resizeWall(diag, "d", 0.6);
  assert.ok(short.openings[0].width <= 0.6 + 1e-9);
  for (const bad of [0, -2, NaN, 0.05]) assert.equal(resizeWall(diag, "d", bad), diag);
});

test("opening offsets from each end round-trip", () => {
  const o = { t: 0.4, width: 1 };
  assert.ok(Math.abs(openingStart(o, 5) - 1.5) < 1e-9);
  assert.ok(Math.abs(openingEnd(o, 5) - 2.5) < 1e-9);
  assert.ok(Math.abs(tFromStart(1.5, 1, 5) - 0.4) < 1e-9);
  assert.ok(Math.abs(tFromEnd(2.5, 1, 5) - 0.4) < 1e-9);
});

test("typed item coordinates are pushed out of walls, free ones pass through", () => {
  const walls = [wall("w", -1, 0, 1, 0)]; // horizontal wall on y=0
  const sofa: Item = { id: "s", kind: "sofa", x: 0, y: 2, rot: 0, w: 1, d: 1, h: 0.8 };
  const def = { h: 0.8 };
  const free = typedItemPatch(walls, sofa, def, { y: 1.5 });
  assert.deepEqual(free, { patch: { y: 1.5 }, moved: false });
  const hit = typedItemPatch(walls, sofa, def, { y: 0.1 });
  assert.equal(hit.moved, true);
  assert.ok((hit.patch.y ?? 0) >= 0.06 + 0.5 - 1e-6); // half wall + half depth
  assert.equal(hit.patch.x, 0);
  const rug = typedItemPatch(walls, { ...sofa, kind: "rug", h: 0.02 }, { h: 0.02 }, { y: 0 });
  assert.equal(rug.moved, false); // flat items may lie across walls
});

test("typing a coordinate on the far side of a wall stops at the wall instead of jumping through it", () => {
  const walls = [wall("w", -3, 0, 3, 0)];
  const sofa: Item = { id: "s", kind: "sofa", x: 0, y: 2, rot: 0, w: 1, d: 1, h: 0.8 };
  const out = typedItemPatch(walls, sofa, { h: 0.8 }, { y: -2 });
  assert.equal(out.moved, true);
  assert.ok(out.patch.y! > 0.5 && out.patch.y! < 0.7, `y=${out.patch.y}`);
});

// ---- detaching a room from its neighbours ----

const centre = (plan: Plan, o: Plan["openings"][number]): Pt => {
  const w = plan.walls.find((x) => x.id === o.wallId)!;
  return { x: w.a.x + (w.b.x - w.a.x) * o.t, y: w.a.y + (w.b.y - w.a.y) * o.t };
};
const distToWall = (w: Wall, p: Pt) => projectOnWall(w, p).dist;

/** Every point along the edges of the rectangles (except edges shared between rectangles of the group) lies on a wall. */
function enclosed(plan: Plan, rects: Room[]): string[] {
  const gaps: string[] = [];
  // solid items (structural columns) are part of the building: they close a gap as a wall does
  const covered = (p: Pt) => collisionWalls(plan).some((w) => distToWall(w, p) <= (w.thickness ?? WALL_T) / 2 + 0.02);
  for (const r of rects) {
    const edges: [string, Pt, Pt][] = [
      ["north", { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }],
      ["south", { x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h }],
      ["west", { x: r.x, y: r.y }, { x: r.x, y: r.y + r.h }],
      ["east", { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }],
    ];
    for (const [name, a, b] of edges) {
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05);
      for (let i = 1; i < n; i++) {
        const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
        const shared = rects.some((o) => o !== r && p.x >= o.x - 1e-6 && p.x <= o.x + o.w + 1e-6 && p.y >= o.y - 1e-6 && p.y <= o.y + o.h + 1e-6);
        if (!shared && !covered(p)) {
          gaps.push(`${r.name} ${name}`);
          break;
        }
      }
    }
  }
  return gaps;
}

const roomNamed = (plan: Plan, name: string) => plan.rooms.find((r) => r.name === name)!;
const inRect = (r: Room, i: Item) => i.x >= r.x && i.x <= r.x + r.w && i.y >= r.y && i.y <= r.y + r.h;

/** The checks every room move must pass: moved room enclosed, neighbours still enclosed, openings attached and not displaced, no stubs, furniture conserved. */
function assertCleanMove(before: Plan, after: Plan, name: string, dx: number, dy: number) {
  const mover = roomNamed(before, name);
  const group = roomGroup(before, mover);
  const movedGroup = roomGroup(after, roomNamed(after, name));
  assert.deepEqual(enclosed(after, movedGroup), enclosed(before, group), "moved room is open");
  for (const other of before.rooms.filter((r) => !group.includes(r) && !r.parent)) {
    const same = roomNamed(after, other.name);
    assert.deepEqual(enclosed(after, roomGroup(after, same)), enclosed(before, roomGroup(before, other)), `${other.name} was torn open`);
  }
  assert.equal(after.openings.length, before.openings.length);
  for (const o of before.openings) {
    const now = after.openings.find((x) => x.id === o.id)!;
    const wall = after.walls.find((w) => w.id === now.wallId);
    assert.ok(wall, "opening lost its wall");
    const was = centre(before, o);
    const at = centre(after, now);
    assert.ok(distToWall(wall, at) < 1e-6);
    const stayed = Math.hypot(at.x - was.x, at.y - was.y) < 0.1;
    const travelled = Math.hypot(at.x - was.x - dx, at.y - was.y - dy) < 0.1;
    assert.ok(stayed || travelled, `opening ${o.id} jumped to ${at.x.toFixed(2)},${at.y.toFixed(2)}`);
    assert.deepEqual({ w: now.width, h: now.height, s: now.sill, e: now.entity, type: now.type }, { w: o.width, h: o.height, s: o.sill, e: o.entity, type: o.type });
  }
  for (const w of after.walls) assert.ok(wallLen(w) > 0.05, "zero-length wall");
  assert.equal(after.items.length, before.items.length);
  for (const i of before.items) {
    const now = after.items.find((x) => x.id === i.id)!;
    const goes = group.some((r) => inRect(r, i));
    assert.ok(Math.abs(now.x - i.x - (goes ? dx : 0)) < 1e-9 && Math.abs(now.y - i.y - (goes ? dy : 0)) < 1e-9, `item ${i.kind} ${goes ? "should have moved" : "should have stayed"}`);
  }
}

test("the starter plan is enclosed to begin with (so the move checks mean something)", () => {
  const plan = starterPlan();
  for (const name of ["Office", "Bathroom", "Bedroom"]) assert.deepEqual(enclosed(plan, roomGroup(plan, roomNamed(plan, name))), [], name);
});

test("moving the Bathroom by (3, 2) carries its walls and leaves the Bedroom and Office closed", () => {
  const before = starterPlan();
  const after = moveRoomWithContents(before, roomNamed(before, "Bathroom").id, 3, 2);
  const bath = roomNamed(after, "Bathroom");
  assert.ok(Math.abs(bath.x - (roomNamed(before, "Bathroom").x + 3)) < 1e-9);
  assertCleanMove(before, after, "Bathroom", 3, 2);
  assert.ok(after.walls.length > before.walls.length, "the shared walls were split, not dragged away");
  const moved = before.items.filter((i) => inRect(roomNamed(before, "Bathroom"), i));
  assert.ok(moved.length >= 3);
});

test("moving the Bedroom with its alcove by (-1.5, 0.5) keeps every room closed, then moving back restores the rooms", () => {
  const before = starterPlan();
  const bed = roomNamed(before, "Bedroom");
  const after = moveRoomWithContents(before, bed.id, -1.5, 0.5);
  assertCleanMove(before, after, "Bedroom", -1.5, 0.5);
  assert.ok(Math.abs(roomNamed(after, "Bedroom alcove").x - (roomNamed(before, "Bedroom alcove").x - 1.5)) < 1e-9);
  const back = moveRoomWithContents(after, bed.id, 1.5, -0.5);
  for (const r of before.rooms) {
    const now = back.rooms.find((x) => x.id === r.id)!;
    assert.ok(Math.abs(now.x - r.x) < 1e-9 && Math.abs(now.y - r.y) < 1e-9, `${r.name} did not return`);
  }
  // furniture of another room that the bedroom was dropped on top of is picked up by it, so only check the rest
  const landedOn = (i: Item) => roomGroup(after, roomNamed(after, "Bedroom")).some((r) => inRect(r, i)) && !roomGroup(before, bed).some((r) => inRect(r, i));
  for (const i of before.items.filter((x) => !landedOn(x))) {
    const now = back.items.find((x) => x.id === i.id)!;
    assert.ok(Math.abs(now.x - i.x) < 1e-9 && Math.abs(now.y - i.y) < 1e-9, `${i.kind} did not return`);
  }
  assert.deepEqual(enclosed(back, roomGroup(back, roomNamed(back, "Bedroom"))), []);
});

test("every starter room can be moved without tearing any room open", () => {
  const before = starterPlan();
  for (const r of before.rooms.filter((x) => !x.parent)) {
    const after = moveRoomWithContents(before, r.id, 2.5, -1.25);
    assert.deepEqual(enclosed(after, roomGroup(after, roomNamed(after, r.name))), enclosed(before, roomGroup(before, r)), `${r.name} moved open`);
    for (const o of before.rooms.filter((x) => !x.parent && x.id !== r.id)) {
      // the hall/living pair is open to each other by design, every other neighbour must stay closed on its own walls
      const gaps = enclosed(after, roomGroup(after, roomNamed(after, o.name)));
      const was = enclosed(before, roomGroup(before, roomNamed(before, o.name)));
      assert.deepEqual(gaps, was, `${o.name} changed when ${r.name} moved`);
    }
    assert.equal(after.openings.length, before.openings.length);
  }
});

test("a wall the move splits keeps its id on its longest piece, and unrelated walls are untouched", () => {
  const before = starterPlan();
  const after = moveRoomWithContents(before, roomNamed(before, "Bathroom").id, 3, 2);
  const ids = after.walls.map((w) => w.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const w of before.walls) if (!after.walls.some((x) => x.id === w.id)) assert.fail(`wall ${w.id} disappeared`);
  const hallWall = before.walls.find((w) => w.a.x === w.b.x && w.a.x < 0)!;
  assert.deepEqual(after.walls.find((w) => w.id === hallWall.id), hallWall);
});

test("a move leaves a slanted wall alone unless both its ends are in the room", () => {
  const plan: Plan = { rooms: [room("R", 0, 0, 3, 3)], walls: [wall("s", 5, 5, 7, 6), wall("in", 0.5, 0.5, 2, 2.5)], openings: [], items: [] };
  const out = moveRoomWithContents(plan, "R", 1, 1);
  assert.deepEqual(out.walls[0], plan.walls[0]);
  assert.deepEqual(out.walls[1].a, { x: 1.5, y: 1.5 });
});

test("furniture inside the room moves even where another room overlaps it", () => {
  const plan: Plan = { rooms: [room("A", 0, 0, 4, 4), room("B", 1, 1, 1, 1)], walls: [], openings: [], items: [item("x", 1.5, 1.5), item("y", 3.5, 3.5), item("z", 6, 6)] };
  const out = moveRoomWithContents(plan, "A", 10, 0);
  assert.deepEqual(out.items.map((i) => i.x), [11.5, 13.5, 6]);
});

test("an exterior opening faces the compass direction of its outward side", () => {
  const base: Plan = { rooms: [room("R", 0, 0, 3, 3)], walls: [wall("n", -0.06, -0.06, 3.06, -0.06), wall("w", -0.06, 3.06, -0.06, -0.06), wall("mid", -0.06, 1.5, 3.06, 1.5)], openings: [], items: [] };
  const plan = { ...base, bearing: 156 };
  assert.deepEqual(outwardFacing(plan, "n", 0.5), { deg: 156, label: "SSE 156" }); // plan up
  assert.deepEqual(outwardFacing(plan, "w", 0.5), { deg: 66, label: "ENE 66" }); // plan left = bearing - 90, whichever way the wall is drawn
  assert.deepEqual(outwardFacing(base, "n", 0.5), { deg: 0, label: "N 0" });
  assert.equal(outwardFacing(plan, "mid", 0.5), null); // inside on both sides
  assert.equal(outwardFacing({ ...plan, rooms: [] }, "n", 0.5), null); // neither side is a room
  assert.equal(outwardFacing(plan, "nope", 0.5), null);
});

// ---- door swing ----

test("hinge hand is read standing on the swing side facing the door", () => {
  // west-to-east wall, swing left = north side: you stand north facing south, the west (start) end is on your right
  assert.equal(hingeHand({ hinge: "start", swing: "left" }), "right");
  assert.equal(hingeHand({}), "right"); // defaults
  assert.equal(hingeHand({ hinge: "end", swing: "left" }), "left");
  // swing right = south side: you face north, the west (start) end is on your left
  assert.equal(hingeHand({ hinge: "start", swing: "right" }), "left");
  assert.equal(hingeHand({ hinge: "end", swing: "right" }), "right");
  for (const hinge of ["start", "end"] as const) for (const swing of ["left", "right"] as const) assert.equal(hingeForHand(hingeHand({ hinge, swing }), swing), hinge);
});

test("wallSides names the room on each side of a wall in walking order", () => {
  const plan: Plan = { rooms: [room("North", 0, -3, 4, 3), room("South", 0, 0.12, 4, 3)], walls: [wall("w", 0, 0.06, 4, 0.06)], openings: [], items: [] };
  const s = wallSides(plan, "w", 0.5);
  assert.equal(s.left?.id, "North"); // west-to-east: left is smaller y
  assert.equal(s.right?.id, "South");
  assert.deepEqual(wallSides(plan, "nope", 0.5), { left: null, right: null });
});

test("a door swing is blocked by a floor item in its quarter disc only", () => {
  const w = wall("w", 0, 0, 4, 0);
  const door = { id: "d", wallId: "w", t: 0.5, width: 0.9, type: "door" as const, sill: 0, height: 2.04 };
  const chair = (id: string, x: number, y: number): Item => ({ id, kind: "kt_dining_chair_dark", x, y, rot: 0, w: 0.45, d: 0.45, h: 0.86 });
  const plan: Plan = { rooms: [], walls: [w], openings: [door], items: [chair("hit", 1.9, -0.5), chair("south", 1.9, 0.5), chair("far", 1.9, -2), chair("beyond", 3.5, -0.5)] };
  // hinge start (x 1.55), swing left (north): disc covers x 1.55..2.45, y -0.9..0
  assert.deepEqual(doorSwingBlockers(plan, door).map((i) => i.id), ["hit"]);
  // flipping the hinge to the other end mirrors the disc: x 1.55..2.45 still, the chair at 1.9 stays hit
  assert.deepEqual(doorSwingBlockers(plan, { ...door, swing: "right" }).map((i) => i.id), ["south"]);
  // items above or below the leaf do not block; a rug (flat) never does
  const high: Plan = { ...plan, items: [{ ...chair("up", 1.9, -0.5), elev: 2.2 }, { ...chair("rug", 1.9, -0.5), kind: "kt_rug_shag_black", h: 0.02 }] };
  assert.deepEqual(doorSwingBlockers(high, door), []);
  assert.deepEqual(doorSwingBlockers({ ...plan, openings: [] }, { ...door, wallId: "none" }), []);
});

// ---- levels ----

const twoStoreys = (): Plan => {
  const on = (level: string) => ({ level });
  return withDefaultLevels({
    rooms: [room("A0", 0, 0, 3, 3, on("L0")), room("A1", 0, 0, 3, 3, on("L1"))],
    walls: [wall("w0", -0.06, -0.06, 3.06, -0.06), wall("w0s", -0.06, 3.06, 3.06, 3.06), wall("w1", -0.06, -0.06, 3.06, -0.06), wall("w1s", -0.06, 3.06, 3.06, 3.06)].map((w, i) => ({ ...w, level: i < 2 ? "L0" : "L1" })),
    openings: [{ id: "o0", wallId: "w0", t: 0.5, width: 1, type: "window", sill: 0.9, height: 1.2, level: "L0" }, { id: "o1", wallId: "w1", t: 0.5, width: 1, type: "window", sill: 0.9, height: 1.2, level: "L1" }],
    items: [{ ...item("i0", 1, 1), level: "L0" }, { ...item("i1", 1, 1), level: "L1" }],
    levels: [{ id: "L0", name: "Ground", elevation: 0, height: 2.78 }, { id: "L1", name: "Upstairs", elevation: 2.78, height: 2.78 }],
  });
};

test("plans without levels get an apartment on a raised ground floor, complete plans are untouched", () => {
  const legacy: Plan = { rooms: [], walls: [], openings: [], items: [] };
  const p = withDefaultLevels(legacy);
  assert.deepEqual(p.building, { type: "apartment" });
  assert.equal(p.levels!.length, 1);
  assert.equal(p.levels![0].elevation, 1, "a raised ground floor");
  assert.equal(withDefaultLevels(p), p);
});

test("moving, resizing or walling a room on one level never touches the other level", () => {
  const plan = twoStoreys();
  const moved = moveRoomWithContents(plan, "A0", 5, 0);
  for (const kind of ["rooms", "walls", "items", "openings"] as const) {
    const other = (list: { level?: string }[]) => list.filter((e) => e.level === "L1");
    assert.deepEqual(other(moved[kind]), other(plan[kind]), `${kind} on L1 changed`);
  }
  assert.equal(moved.rooms.find((r) => r.id === "A0")!.x, 5);
  assert.equal(moved.items.find((i) => i.id === "i0")!.x, 6);
  assert.equal(moved.items.find((i) => i.id === "i1")!.x, 1);
  assert.ok(moved.walls.filter((w) => w.level === "L0").every((w) => w.a.x > 4));
  const resized = resizeRoom(plan, "A1", 4, 3);
  assert.deepEqual(resized.walls.filter((w) => w.level === "L0"), plan.walls.filter((w) => w.level === "L0"));
  assert.equal(resized.rooms.find((r) => r.id === "A0")!.w, 3);
  const bare: Plan = { ...plan, walls: [] };
  const walled = createRoomWalls(bare, "A1");
  assert.equal(walled.walls.length, 4);
  assert.ok(walled.walls.every((w) => w.level === "L1"));
});

test("a wall on another level does not count as covering an edge", () => {
  const plan = twoStoreys();
  // L0 and L1 have walls at the same coordinates; each level still gets its own east and west walls
  const out = createRoomWalls(plan, "A1");
  assert.equal(out.walls.filter((w) => w.level === "L1").length, 4);
  assert.equal(out.walls.filter((w) => w.level === "L0").length, 2);
});

test("duplicating a level remaps wall ids, openings and alcoves and sits on top by default", () => {
  const plan = twoStoreys();
  plan.rooms.push(room("alc", 3, 0, 1, 1, { level: "L0", parent: "A0", tempEntity: "sensor.t" }));
  plan.items[0].entity = "light.x";
  let n = 0;
  const { plan: out, id } = addLevelTo(plan, { copyFrom: "L0" }, () => `n${++n}`);
  assert.equal(id, "L2");
  const level = out.levels!.find((l) => l.id === id)!;
  assert.equal(level.elevation, 5.56);
  const walls = out.walls.filter((w) => w.level === id);
  assert.equal(walls.length, 2);
  assert.ok(walls.every((w) => !plan.walls.some((o) => o.id === w.id)));
  const op = out.openings.find((o) => o.level === id)!;
  assert.ok(walls.some((w) => w.id === op.wallId));
  assert.equal(op.width, 1);
  const alcove = out.rooms.find((r) => r.level === id && r.name === "alc")!;
  assert.equal(alcove.parent, out.rooms.find((r) => r.level === id && r.name === "A0")!.id);
  assert.equal(alcove.tempEntity, undefined);
  assert.equal(out.items.find((i) => i.level === id)?.entity, undefined);
  assert.equal(out.walls.length, plan.walls.length + 2);
  assert.equal(out.items.length, plan.items.length + 1);
  assert.deepEqual(out.walls.filter((w) => w.level === "L0"), plan.walls.filter((w) => w.level === "L0"));
  const bare = addLevelTo(plan, { name: "Cellar", elevation: -2.78, height: 9 });
  assert.deepEqual(bare.plan.levels!.at(-1), { id: "L2", name: "Cellar", elevation: -2.78, height: 4.5 });
});

test("removing a level takes its entities and never the last level", () => {
  const plan = twoStoreys();
  const out = removeLevelFrom(plan, "L1");
  assert.deepEqual(out.levels!.map((l) => l.id), ["L0"]);
  assert.ok([...out.walls, ...out.rooms, ...out.items, ...out.openings].every((e) => e.level === "L0"));
  assert.equal(out.openings.length, 1);
  assert.equal(removeLevelFrom(out, "L0"), out);
  assert.equal(removeLevelFrom(plan, "nope"), plan);
});

test("level edits are sanitised and building type switches", () => {
  const plan = twoStoreys();
  const out = updateLevelIn(plan, "L1", { name: "  ", elevation: NaN, height: 9 });
  assert.deepEqual(out.levels!.find((l) => l.id === "L1"), { id: "L1", name: "Upstairs", elevation: 2.78, height: 4.5 });
  assert.equal(updateLevelIn(plan, "x", { name: "q" }), plan);
  assert.equal(setBuildingTypeIn(plan, "house").building!.type, "house");
});

test("setting the roof keeps the building, and an unchanged roof returns the same plan", () => {
  const house = setBuildingTypeIn(twoStoreys(), "house");
  const hip = { type: "hip", pitch: 40, overhang: 0.2 } as const;
  const out = setRoofIn(house, hip);
  assert.deepEqual(out.building, { ...house.building, roof: hip });
  assert.equal(setRoofIn(out, { ...hip }), out);
  assert.deepEqual(house.building!.roof, undefined);
});

test("overlapping floors and total building height", () => {
  const lv = (id: string, elevation: number, height: number) => ({ id, name: id, elevation, height });
  assert.equal(overlappingLevels([lv("a", 0, 2.78), lv("b", 2.78, 2.78)]).length, 0);
  assert.deepEqual(overlappingLevels([lv("a", 0, 2.78), lv("b", 2, 2.78)]).map(([l, u]) => [l.id, u.id]), [["a", "b"]]);
  const e = buildingExtent([lv("c", -2.78, 2.78), lv("a", 0, 2.78), lv("b", 2.78, 2.78)]);
  assert.ok(Math.abs(e.height - 8.34) < 1e-9 && e.bottom === -2.78);
  assert.equal(buildingExtent([lv("p", 1, 2.78)]).height, 3.78);
});
