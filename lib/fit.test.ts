import test from "node:test";
import assert from "node:assert/strict";
import { convexOverlap, polyGap, sectorPoly } from "./fitGeom.ts";
import { DEFAULT_WALKWAY, defaultSwing, doorSector, fitVerdict, snapFlush, swingArea, wallObstacles, type DoorZone, type FitInput, type Obstacle } from "./fit.ts";
import { corners } from "./placement.ts";
import type { Wall } from "./types.ts";

const wall = (id: string, ax: number, ay: number, bx: number, by: number): Wall => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, style: "plaster" });
// a closed 4 x 3 room of 12 cm walls: its inside is x 0.06..3.94, y 0.06..2.94
const walls = [wall("n", 0, 0, 4, 0), wall("e", 4, 0, 4, 3), wall("s", 4, 3, 0, 3), wall("w", 0, 3, 0, 0)];
const room = wallObstacles(walls);
const piece = (x: number, y: number, w = 1, d = 0.5, rot = 0) => ({ x, y, w, d, rot });
const run = (o: Partial<FitInput> & Pick<FitInput, "ghost">) => fitVerdict({ obstacles: room, doors: [], walkway: DEFAULT_WALKWAY, swing: null, ...o });
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("convex overlap: apart, touching and overlapping squares, any winding", () => {
  const a = corners(piece(0, 0, 2, 2, 0));
  assert.equal(convexOverlap(a, corners(piece(3, 0, 2, 2, 0))), false);
  assert.equal(convexOverlap(a, corners(piece(2, 0, 2, 2, 0))), false); // sharing an edge only touches
  assert.equal(convexOverlap(a, corners(piece(1.5, 0, 2, 2, 0))), true);
  assert.equal(convexOverlap([...a].reverse(), corners(piece(1.5, 0, 2, 2, 0))), true);
  assert.equal(convexOverlap(a, corners(piece(1.5, 1.5, 2, 2, 45))), true); // a turned square: the corner (1,1) is inside it, |dx|+|dy| = 1 < 1.414
  assert.equal(convexOverlap(a, corners(piece(3.1, 3.1, 2, 2, 45))), false);
});

test("the gap between two boxes is the shortest way across, with both end points", () => {
  const g = polyGap(corners(piece(0, 0, 2, 2, 0)), corners(piece(4.5, 0.5, 2, 2, 0)));
  close(g.dist, 2.5);
  close(g.from.x, 1);
  close(g.to.x, 3.5);
  const diag = polyGap(corners(piece(0, 0, 2, 2, 0)), corners(piece(4, 5, 2, 2, 0))); // corner to corner: (1,1) to (3,4)
  close(diag.dist, Math.hypot(2, 3));
});

test("a box turned 45 degrees is nearer to a wall by its corner", () => {
  // a 2 x 2 square turned 45 degrees has its corner sqrt(2) = 1.414 from its centre; centre 3 from the wall face x = 0
  const g = polyGap(corners(piece(3, 0, 2, 2, 45)), [{ x: 0, y: -5 }, { x: 0, y: 5 }, { x: -1, y: 5 }, { x: -1, y: -5 }]);
  close(g.dist, 3 - Math.SQRT2);
});

test("overlapping boxes have no gap", () => {
  assert.equal(polyGap(corners(piece(0, 0, 2, 2, 0)), corners(piece(1, 0, 2, 2, 0))).dist, 0);
});

test("in the middle of the room it fits, with the nearest wall named", () => {
  const v = run({ ghost: piece(2, 1.5) });
  assert.equal(v.level, "ok");
  assert.equal(v.text, "Fits, 119 cm to the wall"); // 1.25 - 0.06
  close(v.gap?.dist ?? -1, 1.19);
});

test("against a wall is fine, not tight", () => {
  const v = run({ ghost: piece(0.56, 1.5) });
  assert.equal(v.level, "ok");
  assert.equal(v.text, "Fits, against the wall");
});

test("a 14 cm slot beside a wall is dead space, not a path", () => {
  const v = run({ ghost: piece(0.7, 1.5) }); // x 0.2..1.2: 14 cm from the wall face at 0.06
  assert.equal(v.level, "ok");
  assert.equal(v.text, "Fits, 14 cm to the wall");
});

test("a gap you could squeeze into but not walk through is tight", () => {
  const v = run({ ghost: piece(0.96, 1.5) }); // 40 cm
  assert.equal(v.level, "tight");
  assert.equal(v.text, "Too tight: 40 cm to the wall");
  close(v.gap?.dist ?? -1, 0.4);
});

test("the walkway width decides: 65 cm is tight for 80 and fine for 60", () => {
  const ghost = piece(1.21, 1.5); // x 0.71..1.71: 65 cm from the west wall
  assert.equal(run({ ghost, walkway: 0.8 }).level, "tight");
  assert.equal(run({ ghost, walkway: 0.6 }).level, "ok");
});

test("a tight gap on one side counts even when another side is roomy", () => {
  const v = run({ ghost: piece(0.96, 1.5, 1, 0.5), walkway: 0.9 });
  assert.equal(v.level, "tight");
});

test("turning the piece changes the answer: 2 m long fits across, not down this 3 m room", () => {
  assert.equal(run({ ghost: piece(2, 1.5, 2, 0.5, 0) }).level, "ok");
  const turned = run({ ghost: piece(2, 1.5, 2, 0.5, 90) }); // now 0.5 wide, 2 long: y 0.5..2.5, 44 cm from the north and south walls
  assert.equal(turned.level, "tight");
  assert.equal(turned.text, "Too tight: 44 cm to the wall");
});

test("overlapping a wall or a piece of furniture does not fit", () => {
  assert.equal(run({ ghost: piece(0.06, 1.5) }).level, "blocked");
  assert.equal(run({ ghost: piece(0.06, 1.5) }).text, "Does not fit: it overlaps the wall");
  const sofa: Obstacle = { id: "s", label: "sofa", wall: false, poly: corners(piece(2, 1.5, 2, 1, 0)) };
  const v = run({ ghost: piece(2.2, 1.5), obstacles: [...room, sofa] });
  assert.equal(v.level, "blocked");
  assert.equal(v.text, "Does not fit: it overlaps the sofa");
});

test("a gap to furniture is named after the furniture", () => {
  const sofa: Obstacle = { id: "s", label: "sofa", wall: false, poly: corners(piece(1, 1.5, 1, 1, 0)) }; // x 0.5..1.5
  const v = run({ ghost: piece(2.35, 1.5, 0.7, 0.5, 0), obstacles: [...room, sofa] }); // x 2.0..2.7: 50 cm from the sofa
  assert.equal(v.level, "tight");
  assert.equal(v.text, "Too tight: 50 cm to the sofa");
});

test("an empty plan fits", () => {
  assert.equal(run({ ghost: piece(2, 1.5), obstacles: [] }).text, "Fits");
});

test("doors that open outward need the space in front of the piece", () => {
  const wardrobe = piece(2, 1.5, 1, 0.6, 0);
  const swing = { depth: 0.5 };
  const v = run({ ghost: wardrobe, swing });
  assert.equal(v.level, "ok");
  assert.ok(v.swing, "the swing area is reported so it can be drawn");
  // against the south wall its doors (in front = south) hit the wall; turned round they open into the room
  const stuck = run({ ghost: piece(2, 2.64, 1, 0.6, 0), swing }); // y 2.34..2.94: flush with the south wall
  assert.equal(stuck.level, "blocked");
  assert.equal(stuck.text, "Its doors cannot open: the wall is in the way");
  assert.equal(run({ ghost: piece(2, 2.64, 1, 0.6, 180), swing }).level, "ok");
});

test("the swing area is a rectangle as wide as the piece, in front of it", () => {
  const s = swingArea(piece(2, 1.5, 1, 0.6, 0), { depth: 0.5 });
  const xs = s.map((p) => p.x);
  const ys = s.map((p) => p.y);
  close(Math.min(...xs), 1.5);
  close(Math.max(...xs), 2.5);
  close(Math.min(...ys), 1.8);
  close(Math.max(...ys), 2.3);
});

test("a piece's own doors are stopped by furniture too", () => {
  const table: Obstacle = { id: "t", label: "table", wall: false, poly: corners(piece(2, 2.3, 1.5, 0.6, 0)) }; // y 2.0..2.6
  const v = run({ ghost: piece(2, 1.5, 1, 0.6, 0), swing: { depth: 0.5 }, obstacles: [...room, table] }); // doors need y 1.8..2.3
  assert.equal(v.text, "Its doors cannot open: the table is in the way");
});

test("the doors of wardrobes, cabinets and cupboards open; a double door swings half its width", () => {
  assert.deepEqual(defaultSwing("wardrobe_2", "Wardrobe", 1), { depth: 0.5 });
  assert.deepEqual(defaultSwing("x", "Bedside cabinet", 0.45), { depth: 0.45 });
  assert.deepEqual(defaultSwing("kitchen_cupboard", "Unit", 0.8), { depth: 0.4 });
  assert.equal(defaultSwing("sofa", "Sofa", 2), null);
});

// a door in the north wall, hinged at the west jamb, opening south into the room
const door = { t: 0.5, width: 0.9, hinge: "start" as const, swing: "right" as const };

test("an open door sweeps a quarter disc from its hinge", () => {
  const s = doorSector(door, walls[0]);
  close(s[0].x, 1.55);
  close(s[0].y, 0);
  close(s[1].x, 2.45); // the closed leaf's tip, at the other jamb
  close(s[1].y, 0);
  close(s[s.length - 1].x, 1.55); // the open leaf's tip
  close(s[s.length - 1].y, 0.9);
});

test("a piece in the way of an existing door blocks its swing", () => {
  const zone: DoorZone = { id: "d", label: "D2", poly: doorSector(door, walls[0]) };
  const v = run({ ghost: piece(2, 0.7, 0.5, 0.5), obstacles: [], doors: [zone] });
  assert.equal(v.level, "blocked");
  assert.equal(v.text, "Blocks the swing of door D2");
  assert.equal(run({ ghost: piece(3.2, 0.7, 0.5, 0.5), obstacles: [], doors: [zone] }).level, "ok"); // beside the sweep
  assert.equal(run({ ghost: piece(2, 1.3, 0.5, 0.5), obstacles: [], doors: [zone] }).level, "ok"); // past the leaf's reach (0.9 m)
});

test("a door that swings the other way does not mind a piece on the near side", () => {
  const out = { ...door, swing: "left" as const }; // opens north, outside the room
  const zone: DoorZone = { id: "d", label: "D2", poly: doorSector(out, walls[0]) };
  assert.equal(run({ ghost: piece(2, 0.7, 0.5, 0.5), obstacles: [], doors: [zone] }).level, "ok");
});

test("sector polygons are convex enough for the overlap test: a point in the sweep overlaps, one outside does not", () => {
  const s = sectorPoly({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, 1);
  assert.equal(convexOverlap(s, corners(piece(0.5, 0.5, 0.2, 0.2, 0))), true);
  assert.equal(convexOverlap(s, corners(piece(0.9, 0.9, 0.2, 0.2, 0))), false); // the corner of the square, outside the arc
});

test("a piece within 5 cm of a wall is pulled flush; further away it stays", () => {
  const near = snapFlush(piece(0.56 + 0.04, 1.5), walls);
  close(near.x, 0.56);
  close(near.y, 1.5);
  const far = snapFlush(piece(0.56 + 0.06, 1.5), walls);
  close(far.x, 0.62);
});

test("in a corner it is pulled flush to both walls", () => {
  const at = snapFlush(piece(0.56 + 0.03, 0.31 + 0.04), walls);
  close(at.x, 0.56);
  close(at.y, 0.31);
});
