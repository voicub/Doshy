import test from "node:test";
import assert from "node:assert/strict";
import { ISO_CORNERS, solveRoomView, turnBetween, type RoomView, type RoomViewOpts } from "./roomView.ts";
import { frameRects, viewAxes, zoneOf, DEFAULT_ELEVATION } from "./roomIsolate.ts";
import type { Item, Opening, Plan, Room, Wall } from "./types.ts";

const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({ id, name: id, x, y, w, h, floor: "wood", color: "#fff", ...extra });
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<Wall> = {}): Wall => ({ id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster", ...extra });
const item = (id: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({ id, kind: "marker", x, y, rot: 0, w: 0.5, d: 0.5, h: 0.5, ...extra });
const door = (id: string, wallId: string, t: number): Opening => ({ id, wallId, t, width: 0.9, type: "door", sill: 0, height: 2.1 });
const windowIn = (id: string, wallId: string, t: number, width = 3): Opening => ({ id, wallId, t, width, type: "window", sill: 0.9, height: 1.2 });
/** The four walls of a rectangle, ids n s w e (plan y grows to the south). */
const box = (x: number, y: number, w: number, h: number): Wall[] => [wall("n", x, y, x + w, y), wall("s", x, y + h, x + w, y + h), wall("w", x, y, x, y + h), wall("e", x + w, y, x + w, y + h)];
const plan = (p: Partial<Plan>): Plan => ({ rooms: [], walls: [], openings: [], items: [], ...p }) as Plan;

const BASE: RoomViewOpts = { current: 45, cutaway: true, width: 1000, height: 700, pad: 1.5, minZoom: 10, maxZoom: 220 };
const solve = (p: Plan, id: string, o: Partial<RoomViewOpts> = {}) => solveRoomView(p, zoneOf(p, id, false)!, { ...BASE, ...o });
const at = (r: RoomView, azimuth: number) => r.scores.find((s) => s.azimuth === azimuth)!;

// a 6 x 4 m room, walls on all four sides
const R = room("R", 0, 0, 6, 4);
const hall = (items: Item[] = [], openings: Opening[] = []) => plan({ rooms: [R], walls: box(0, 0, 6, 4), items, openings });

test("turning takes the short way round, a half turn counts once", () => {
  assert.equal(turnBetween(45, 135), 90);
  assert.equal(turnBetween(350, 20), 30);
  assert.equal(turnBetween(20, 350), -30);
  assert.equal(turnBetween(45, 45), 0);
  assert.equal(Math.abs(turnBetween(45, 225)), 180);
});

test("an empty, even room keeps the camera where it is, even between the corners", () => {
  const r = solve(hall(), "R", { current: 100 });
  assert.equal(r.azimuth, 100);
  assert.equal(r.turn, 0);
  assert.equal(solve(hall(), "R").turn, 0);
});

test("equal views go to the nearest corner: the shortest rotation, either way round", () => {
  const sq = plan({ rooms: [room("S", 0, 0, 4, 4)], walls: box(0, 0, 4, 4) });
  const corners = { candidates: ISO_CORNERS };
  const up = solve(sq, "S", { ...corners, current: 100 });
  assert.equal(up.azimuth, 135);
  assert.equal(up.turn, 35);
  const down = solve(sq, "S", { ...corners, current: 350 });
  assert.equal(down.azimuth, 315);
  assert.equal(down.turn, -35);
});

test("the door side is turned to the camera: a door in the east wall is seen from the west", () => {
  const r = solve(hall([], [door("d", "e", 0.5)]), "R");
  assert.equal(at(r, 315).doors, 1);
  assert.equal(at(r, 45).doors < 0.5, true, "from the south-east the door is in the wall between you and the room");
  assert.ok(r.azimuth === 315 || r.azimuth === 225);
  assert.equal(r.azimuth, 315, "of the two west corners, the quarter turn beats the half turn");
  assert.equal(r.turn, -90);
});

test("a room at the plan corner is judged by its own walls: the neighbours' walls and furniture play no part", () => {
  const corner = plan({
    rooms: [room("A", 0, 0, 4, 4), room("B", 4.12, 0, 4, 4), room("C", 0, 4.12, 4, 4)],
    walls: [wall("n", -0.06, -0.06, 8.18, -0.06), wall("w", -0.06, -0.06, -0.06, 8.18), wall("e", 8.18, -0.06, 8.18, 4.06), wall("s", -0.06, 8.18, 4.06, 8.18), wall("mid", 4.06, -0.06, 4.06, 4.06), wall("h", -0.06, 4.06, 4.06, 4.06)],
    openings: [door("dAB", "mid", 0.5)],
    items: [item("lamp", 1, 1), item("tallB", 5, 2, { h: 2.2, w: 1, d: 2 }), item("tallC", 1, 5.5, { h: 2.2, w: 2, d: 1 })],
  });
  const r = solve(corner, "A");
  assert.equal(at(r, 45).items, 1);
  assert.equal(at(r, 225).items, 1);
  assert.equal(r.azimuth, 315, "the shared door wall (east) is the far side from the west");
  // alone or surrounded, the verdict is the same
  const alone = plan({ rooms: [room("A", 0, 0, 4, 4)], walls: corner.walls.filter((w) => ["n", "w", "mid", "h"].includes(w.id)), openings: corner.openings, items: [corner.items[0]] });
  assert.equal(solve(alone, "A").azimuth, r.azimuth);
});

test("furniture hugging the south and east walls: uncut, those walls hide it, so the camera leaves the south-east corner", () => {
  const p = hall([item("sofa", 5.6, 2, { w: 0.5, d: 1.6 }), item("bed", 3, 3.6, { w: 1.6, d: 0.5 })]);
  const stay = at(solve(p, "R", { cutaway: false }), 45);
  assert.equal(stay.items, 0);
  const r = solve(p, "R", { cutaway: false });
  assert.equal(r.azimuth, 135);
  assert.equal(r.turn, 90);
  assert.equal(at(r, 135).items, 0.5);
});

test("cut-away lowers the walls in front, so the same view scores better and a bed behind a low wall still shows from further back", () => {
  const p = hall([item("bed", 3, 2.6, { w: 1.6, d: 0.5 })]);
  const solid = at(solve(p, "R", { cutaway: false }), 45);
  const low = at(solve(p, "R", { cutaway: true }), 45);
  assert.ok(low.walls > solid.walls);
  assert.equal(solid.items, 0, "behind a full-height wall");
  assert.equal(low.items, 1, "1.4 m behind a 0.9 m wall the sight line clears it");
  assert.equal(at(solve(hall([item("bed", 3, 3.6, { w: 1.6, d: 0.5 })]), "R", { cutaway: true }), 45).items, 0, "right behind the low wall it is still hidden");
});

test("a window wall counts less than a solid wall as the wall in front", () => {
  const solidWalls = solve(hall(), "R", { cutaway: false });
  const withWindow = solve(hall([], [windowIn("w1", "s", 0.5)]), "R", { cutaway: false });
  // the camera at 45 (south-east) has the south and east walls in front, the one at 225 has the north and west
  assert.equal(at(solidWalls, 45).walls, at(solidWalls, 225).walls);
  assert.ok(at(withWindow, 45).walls > at(withWindow, 225).walls);
  assert.equal(withWindow.azimuth, 45, "so with the window in the wall in front, there is no reason to turn");
});

test("an L-shaped room: the notch decides what is hidden and what fills the screen", () => {
  // an arm 6 x 2 along the north and a leg 2 x 3 going south from its west end
  const l = (items: Item[]) =>
    plan({
      rooms: [room("A", 0, 0, 6, 2), room("B", 0, 2, 2, 3, { parent: "A" })],
      walls: [wall("a1", 0, 0, 6, 0), wall("a2", 6, 0, 6, 2), wall("a3", 6, 2, 2, 2), wall("a4", 2, 2, 2, 5), wall("a5", 2, 5, 0, 5), wall("a6", 0, 5, 0, 0)],
      items,
    });
  const empty = solve(l([]), "A");
  assert.ok(at(empty, 45).zoom > at(empty, 135).zoom, "along the diagonal the L is narrower on screen than across it");
  assert.equal(empty.azimuth, 45);
  // a device at the foot of the leg sits right behind the south wall seen from the south-east and south-west
  const dev = l([item("t", 1, 4.7, { entity: "light.t" })]);
  const r = solve(dev, "A");
  assert.equal(at(r, 45).items, 0);
  assert.equal(at(r, 315).items, 0);
  assert.equal(r.azimuth, 135);
  assert.equal(solve(dev, "A", { current: 225 }).azimuth, 225, "already facing it from the north-west: stay");
});

test("something standing on a table is not hidden by the table, a tall piece hides what is behind it", () => {
  const set = hall([item("table", 3, 2, { w: 1.2, d: 0.8, h: 0.75 }), item("lamp", 3, 2, { elev: 0.75, h: 0.3 })]);
  assert.equal(at(solve(set, "R"), 45).items, 1);
  const wardrobe = hall([item("war", 5.4, 2, { w: 0.6, d: 2, h: 2.2 }), item("box", 4.6, 2, { h: 0.4 })]);
  const r = solve(wardrobe, "R", { candidates: [45, 315] });
  assert.equal(at(r, 45).items, 0.5, "the box is in the wardrobe's shadow from the south-east ...");
  assert.equal(at(r, 315).items, 1, "... and in plain view from the south-west");
});

test("devices weigh more than plain furniture", () => {
  const p = hall([item("bed", 3, 3.7, { w: 1.6, d: 0.5, entity: "light.bed" }), item("rug", 3, 0.3, { w: 1.6, d: 0.5 })]);
  // from the south-east the bed (a device) is hidden by the south wall, the rug is in view; from the north-east it is the other way round
  const r = solve(p, "R", { candidates: [45, 135] });
  assert.ok(at(r, 135).items > at(r, 45).items);
  assert.equal(r.azimuth, 135);
});

test("framing: centred on the room's storey, and fitted into what the panels leave free", () => {
  const up = plan({
    rooms: [room("G", 0, 0, 6, 4), room("U", 0, 0, 6, 4, { level: "L1" })],
    walls: [...box(0, 0, 6, 4), ...box(0, 0, 6, 4).map((w) => ({ ...w, id: `u${w.id}`, level: "L1" }))],
    levels: [{ id: "L0", name: "Ground", elevation: 0, height: 2.78 }, { id: "L1", name: "Up", elevation: 2.78, height: 2.78 }],
  });
  const free = solve(up, "U");
  assert.ok(Math.abs(free.framing.target[1] - (2.78 + 1.39)) < 1e-9, "the upper storey, not the ground floor");
  assert.ok(Math.abs(free.framing.target[0] - 3) < 1e-6 && Math.abs(free.framing.target[2] - 2) < 1e-6, "its centre");
  const docked = solve(up, "U", { inset: { left: 0, right: 380, top: 0, bottom: 0 } });
  assert.ok(docked.framing.zoom < free.framing.zoom, "a narrower free area means a smaller room");
  const f = frameRects(zoneOf(up, "U", false)!.rects, BASE.width, BASE.height, { pad: BASE.pad, yLow: 2.78, yHigh: 5.56, minZoom: BASE.minZoom, maxZoom: BASE.maxZoom, axes: viewAxes(free.azimuth, DEFAULT_ELEVATION) });
  assert.deepEqual(free.framing, f, "the framing is the one frameRects gives for the chosen azimuth");
});

test("every candidate is scored once, best first, and the current view always competes", () => {
  const r = solve(hall(), "R", { current: 100, candidates: [100, 45, 45.2, 135] });
  assert.deepEqual(r.scores.map((s) => s.azimuth).sort((a, b) => a - b), [45, 100, 135], "45 and 45.2 are the same view");
  assert.ok(r.scores.every((s, i) => i === 0 || r.scores[i - 1].score >= s.score));
});
