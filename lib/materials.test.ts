import test from "node:test";
import assert from "node:assert/strict";
import {
  FLOORS, FLOOR_KINDS, PALETTE, WALLS, WALL_STYLES, contrast, faceLabels, faceTint, floorOf, isGlassWall, isOutdoorFloor, luminance, paintFloor, paintHit, paintItem,
  paintLevelWalls, paintRoomWalls, paintWall, paintWallId, parseHex, pickSurface, pushRecent, roomWalls, sampleHit, wallFaces, wallSides,
  type Brush,
} from "./materials.ts";
import type { FloorKind, Plan, Room, Wall } from "./types.ts";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<Wall> = {}): Wall => ({ id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster", ...extra });
const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({ id, name: id, x, y, w, h, color: FLOORS.wood.color, floor: "wood", ...extra });
/** A 4 x 3 room walled clockwise (so the right-hand face A of every wall looks into the room) with a garden to its east. */
const house = (): Plan => ({
  walls: [wall("n", 0, 0, 4, 0), wall("e", 4, 0, 4, 3), wall("s", 4, 3, 0, 3), wall("w", 0, 3, 0, 0), wall("fence", 8, 0, 8, 3)],
  openings: [],
  rooms: [room("living", 0, 0, 4, 3), room("garden", 4.06, 0, 3.9, 3, { floor: "grass", color: FLOORS.grass.color })],
  items: [{ id: "i", kind: "k", x: 1, y: 1, rot: 0, w: 1, d: 1, h: 1 }],
});
const wallOf = (p: Plan, id: string) => p.walls.find((w) => w.id === id)!;
const brush = (material: Brush["material"], color: string | null = null): Brush => ({ material, color });
const SAGE = "#a9b8a0";

// ---- colours ----

test("parseHex accepts 3 and 6 digit hex with or without #, and rejects the rest", () => {
  assert.equal(parseHex("#ABC"), "#aabbcc");
  assert.equal(parseHex("a9b8a0"), "#a9b8a0");
  assert.equal(parseHex("  #A9B8A0 "), "#a9b8a0");
  for (const bad of ["", "#12", "#12345", "#gggggg", "red", null, undefined]) assert.equal(parseHex(bad), null, String(bad));
});

test("contrast follows WCAG: black on white is 21, identical colours 1, order does not matter", () => {
  assert.ok(Math.abs(contrast("#000000", "#ffffff") - 21) < 1e-9);
  assert.equal(contrast("#a9b8a0", "#a9b8a0"), 1);
  assert.equal(contrast("#336699", "#ffffff"), contrast("#ffffff", "#336699"));
  assert.ok(luminance("#ffffff") > luminance("#777777") && luminance("#777777") > luminance("#000000"));
});

test("recent colours: newest first, no duplicates, capped, junk ignored", () => {
  let r: string[] = [];
  for (const c of ["#111111", "#222222", "#333333"]) r = pushRecent(r, c);
  assert.deepEqual(r, ["#333333", "#222222", "#111111"]);
  assert.deepEqual(pushRecent(r, "#222"), ["#222222", "#333333", "#111111"]); // moved to the front, not repeated
  assert.deepEqual(pushRecent(r, "nope"), r);
  assert.equal(pushRecent(Array.from({ length: 8 }, (_, i) => `#00000${i}`), "#ffffff").length, 8);
  assert.deepEqual(pushRecent(r, "#444444", 2), ["#444444", "#333333"]);
});

test("the palette has unique names and unique valid colours", () => {
  assert.equal(new Set(PALETTE.map((s) => s.name)).size, PALETTE.length);
  assert.equal(new Set(PALETTE.map((s) => s.c)).size, PALETTE.length);
  for (const s of PALETTE) assert.equal(parseHex(s.c), s.c, s.name);
});

// ---- catalog of materials ----

test("every floor and wall material is fully described", () => {
  for (const k of FLOOR_KINDS) {
    const d = FLOORS[k];
    assert.ok(d.label && parseHex(d.color) === d.color && d.tileM > 0 && d.rough >= 0 && d.rough <= 1 && d.metal >= 0 && d.metal <= 1, k);
  }
  for (const s of WALL_STYLES) {
    const d = WALLS[s];
    assert.ok(d.label && parseHex(d.color) === d.color && d.tileM > 0 && d.rough >= 0 && d.rough <= 1, s);
  }
  assert.equal(new Set(FLOOR_KINDS.map((k) => FLOORS[k].label)).size, FLOOR_KINDS.length);
  assert.equal(new Set(WALL_STYLES.map((s) => WALLS[s].label)).size, WALL_STYLES.length);
});

test("the original floors and walls keep the looks saved homes were drawn with", () => {
  // indoor floors 0.45, outdoor 0.85 (the roughness RoomFloor always used); wall tints brick #d9cfc3, plaster #f1efea; tile sizes as before
  for (const k of ["wood", "tile", "carpet"] as const) assert.equal(FLOORS[k].rough, 0.45);
  for (const k of ["brick", "grass"] as const) assert.equal(FLOORS[k].rough, 0.85);
  assert.equal(FLOORS.wood.color, "#d8bf94");
  assert.equal(WALLS.brick.color, "#d9cfc3");
  assert.equal(WALLS.plaster.color, "#f1efea");
  assert.deepEqual([FLOORS.brick.tileM, FLOORS.wood.tileM, FLOORS.tile.tileM, FLOORS.grass.tileM, FLOORS.carpet.tileM, WALLS.plaster.tileM], [0.6, 1.2, 0.6, 1.5, 1, 2]);
});

test("outdoor floors are the open-air surfaces; an unknown floor reads as wood", () => {
  for (const k of ["grass", "brick", "paving", "gravel", "sand", "deck", "asphalt", "water"] as const) assert.ok(isOutdoorFloor(k), k);
  for (const k of ["wood", "tile", "carpet", "marble", "concrete", "slate"] as const) assert.ok(!isOutdoorFloor(k), k);
  assert.equal(floorOf({ floor: "lava" as FloorKind }), "wood");
});

// ---- per-face resolution ----

test("a wall with no new fields has two identical faces in today's look", () => {
  const plain = wall("w", 0, 0, 3, 0);
  const [a, b] = wallFaces(plain);
  assert.deepEqual(a, { style: "plaster" });
  assert.deepEqual(b, a);
  assert.equal(faceTint(a), "#f1efea");
  const brick = wall("w", 0, 0, 3, 0, { style: "brick", color: "#b9695a" });
  assert.deepEqual(wallFaces(brick), [{ style: "brick", color: "#b9695a" }, { style: "brick", color: "#b9695a" }]);
  assert.equal(faceTint(wallFaces(wall("w", 0, 0, 3, 0, { style: "brick" }))[0]), "#d9cfc3");
});

test("face B is inherited whole, or fully its own (a B style without a colour is natural, not A's colour)", () => {
  const w = wall("w", 0, 0, 3, 0, { color: SAGE, styleB: "redbrick" });
  assert.deepEqual(wallFaces(w), [{ style: "plaster", color: SAGE }, { style: "redbrick" }]);
  assert.deepEqual(wallFaces(wall("w", 0, 0, 3, 0, { color: SAGE, colorB: "#112233" }))[1], { style: "plaster", color: "#112233" });
});

test("glass is glass on both faces", () => {
  const w = wall("w", 0, 0, 3, 0, { styleB: "glass" });
  assert.ok(isGlassWall(w));
  assert.deepEqual(wallFaces(w).map((f) => f.style), ["glass", "glass"]);
  assert.ok(!isGlassWall(wall("w", 0, 0, 3, 0)));
});

// ---- painting walls ----

test("painting one face leaves the other, and is stored only where the faces differ", () => {
  const w0 = wall("w", 0, 0, 3, 0);
  const w1 = paintWall(w0, "B", brush({ kind: "wall", id: "redbrick" }));
  assert.deepEqual(wallFaces(w1), [{ style: "plaster" }, { style: "redbrick" }]);
  assert.equal(w1.styleB, "redbrick");
  const w2 = paintWall(w1, "B", brush({ kind: "wall", id: "plaster" })); // painted back to match: no leftover face B
  assert.deepEqual(w2, w0);
  assert.equal(paintWall(w0, "both", brush({ kind: "wall", id: "plaster" })), w0); // nothing changed: the same object, so no undo step
});

test("painting a colour keeps the material; natural clears the colour", () => {
  const w = wall("w", 0, 0, 3, 0, { style: "brick" });
  const red = paintWall(w, "both", brush(null, "#b9695a"));
  assert.deepEqual(red, { ...w, color: "#b9695a" });
  assert.deepEqual(paintWall(red, "both", brush(null, null)), w);
});

test("a floor material does nothing to a wall; glass takes both faces; a new material replaces glass on both", () => {
  const w = wall("w", 0, 0, 3, 0);
  assert.equal(paintWall(w, "A", brush({ kind: "floor", id: "oak" })), w);
  const g = paintWall(w, "A", brush({ kind: "wall", id: "glass" }));
  assert.deepEqual(wallFaces(g).map((f) => f.style), ["glass", "glass"]);
  const back = paintWall(g, "B", brush({ kind: "wall", id: "stone" }));
  assert.deepEqual(wallFaces(back).map((f) => f.style), ["stone", "stone"]);
});

test("paint keeps the wall's other fields", () => {
  const w = wall("w", 0, 0, 3, 0, { thickness: 0.3, level: "L1" });
  const p = paintWall(w, "A", brush({ kind: "wall", id: "brick" }, SAGE));
  assert.equal(p.thickness, 0.3);
  assert.equal(p.level, "L1");
  assert.deepEqual(p.a, w.a);
});

// ---- which side is inside ----

test("a house wall knows which face looks in and which looks out; the garden counts as outside", () => {
  const plan = house();
  const north = wallSides(plan, wallOf(plan, "n")); // runs west to east, the room is to its south = its right = face A
  assert.equal(north.kind, "exterior");
  assert.equal(north.inside, "A");
  assert.equal(north.outside, "B");
  const east = wallSides(plan, wallOf(plan, "e")); // between the living room and the garden
  assert.equal(east.kind, "exterior");
  assert.equal(east.inside, "A");
  assert.equal(wallSides(plan, wallOf(plan, "fence")).kind, "free");
});

test("a reversed wall flips which face is inside", () => {
  const plan = { ...house(), walls: [wall("n", 4, 0, 0, 0)] };
  assert.equal(wallSides(plan, plan.walls[0]).inside, "B");
});

test("a wall between two rooms is interior and its faces are named after the rooms", () => {
  const plan: Plan = { walls: [wall("m", 3, 0, 3, 3)], openings: [], items: [], rooms: [room("kitchen", 0, 0, 2.94, 3), room("hall", 3.06, 0, 2, 3)] };
  const s = wallSides(plan, plan.walls[0]);
  assert.equal(s.kind, "interior");
  assert.deepEqual(faceLabels(s), { A: "kitchen", B: "hall" }); // walking south, the right-hand face looks west
});

test("outside walls brick and inside walls sage plaster: the whole-house paint", () => {
  let plan = house();
  plan = paintLevelWalls(plan, "L0", "outside", brush({ kind: "wall", id: "redbrick" }));
  plan = paintLevelWalls(plan, "L0", "inside", brush({ kind: "wall", id: "plaster" }, SAGE));
  for (const id of ["n", "e", "s", "w"]) {
    const [inside, outside] = wallFaces(wallOf(plan, id)); // clockwise walls: A is inside
    assert.deepEqual(inside, { style: "plaster", color: SAGE }, id);
    assert.deepEqual(outside, { style: "redbrick" }, id);
  }
  assert.deepEqual(wallFaces(wallOf(plan, "fence")).map((f) => f.style), ["redbrick", "redbrick"]); // a loose wall is outside on both faces
  assert.equal(paintLevelWalls(plan, "L0", "outside", brush({ kind: "wall", id: "redbrick" })), plan);
});

test("every wall of a level can be painted at once, other levels are left alone", () => {
  const plan: Plan = { ...house(), walls: [...house().walls, wall("up", 0, 0, 4, 0, { level: "L1" })], levels: [{ id: "ground", name: "G", elevation: 0, height: 2.8 }, { id: "L1", name: "1", elevation: 2.8, height: 2.8 }] };
  const out = paintLevelWalls(plan, "ground", "all", brush({ kind: "wall", id: "concrete" }));
  assert.ok(out.walls.filter((w) => w.id !== "up").every((w) => wallFaces(w).every((f) => f.style === "concrete")));
  assert.equal(wallOf(out, "up"), wallOf(plan, "up"));
});

// ---- rooms ----

test("walls around a room are found with the face that looks into it", () => {
  const plan = house();
  const around = roomWalls(plan, "living");
  assert.deepEqual(around.map((x) => x.wall.id).sort(), ["e", "n", "s", "w"]);
  assert.ok(around.every((x) => x.face === "A"));
  assert.deepEqual(roomWalls(plan, "garden").map((x) => x.wall.id).sort(), ["e", "fence"]);
});

test("painting a room's walls only touches the inside faces", () => {
  const base = house();
  const plan = paintRoomWalls(base, "living", brush({ kind: "wall", id: "stone" }, "#112233"));
  for (const id of ["n", "e", "s", "w"]) assert.deepEqual(wallFaces(wallOf(plan, id)), [{ style: "stone", color: "#112233" }, { style: "plaster" }], id);
  assert.equal(wallOf(plan, "fence"), wallOf(base, "fence")); // other walls are the very same objects
});

test("a floor is painted with a kind and a colour of its own; natural gives the kind's tint", () => {
  const plan = house();
  const marble = paintFloor(plan, "living", brush({ kind: "floor", id: "marble" }, "#c98d74"));
  assert.deepEqual([marble.rooms[0].floor, marble.rooms[0].color], ["marble", "#c98d74"]);
  const natural = paintFloor(marble, "living", brush({ kind: "floor", id: "slate" }));
  assert.deepEqual([natural.rooms[0].floor, natural.rooms[0].color], ["slate", FLOORS.slate.color]);
  const recolour = paintFloor(natural, "living", brush(null, "#445566"));
  assert.deepEqual([recolour.rooms[0].floor, recolour.rooms[0].color], ["slate", "#445566"]);
  assert.equal(paintFloor(plan, "living", brush({ kind: "wall", id: "brick" })), plan);
  assert.equal(paintFloor(plan, "living", brush({ kind: "floor", id: "wood" })), plan); // already wood in its natural colour
  assert.equal(paintFloor(plan, "missing", brush({ kind: "floor", id: "oak" })), plan);
});

test("clicking a room paints its floor, or its walls for a wall material or a colour-only brush set to walls", () => {
  const plan = house();
  const hit = { type: "room", id: "living" } as const;
  assert.equal(paintHit(plan, hit, brush(null, SAGE)).rooms[0].color, SAGE);
  assert.equal(paintHit(plan, hit, { ...brush(null, SAGE), roomWalls: true }).rooms[0].color, plan.rooms[0].color);
  assert.equal(wallOf(paintHit(plan, hit, { ...brush(null, SAGE), roomWalls: true }), "n").color, SAGE);
  assert.equal(wallOf(paintHit(plan, hit, brush({ kind: "wall", id: "brick" })), "n").style, "brick");
});

test("furniture takes a finish colour and gives it back", () => {
  const plan = house();
  const red = paintItem(plan, "i", "#b9695a");
  assert.equal(red.items[0].color, "#b9695a");
  assert.ok(!("color" in paintItem(red, "i", null).items[0]));
  assert.equal(paintItem(plan, "i", null), plan);
});

// ---- clicking and the eyedropper ----

test("a click finds the wall side nearest the pointer, else the room under it", () => {
  const plan = house();
  assert.deepEqual(pickSurface(plan, { x: 2, y: 0.1 }, 0.12), { type: "wall", id: "n", face: "A" }); // south of the north wall: inside
  assert.deepEqual(pickSurface(plan, { x: 2, y: -0.1 }, 0.12), { type: "wall", id: "n", face: "B" });
  assert.deepEqual(pickSurface(plan, { x: 2, y: 1.5 }, 0.12), { type: "room", id: "living" });
  assert.equal(pickSurface(plan, { x: 20, y: 20 }, 0.12), null);
});

test("the eyedropper picks up a floor or a wall face as a brush that paints the same thing back", () => {
  const plan = paintWallId(paintFloor(house(), "living", brush({ kind: "floor", id: "herringbone" }, "#7b5a3f")), "n", "B", brush({ kind: "wall", id: "redbrick" }));
  assert.deepEqual(sampleHit(plan, { type: "room", id: "living" }), { material: { kind: "floor", id: "herringbone" }, color: "#7b5a3f" });
  assert.deepEqual(sampleHit(plan, { type: "room", id: "garden" }), { material: { kind: "floor", id: "grass" }, color: null }); // its natural colour
  assert.deepEqual(sampleHit(plan, { type: "wall", id: "n", face: "B" }), { material: { kind: "wall", id: "redbrick" }, color: null });
  assert.equal(sampleHit(plan, { type: "wall", id: "gone", face: "A" }), null);
});

test("the paint bucket paints a pillar with the brush's colour (the column in a facade wins over the wall behind it) and the eyedropper reads it back", () => {
  const base = house();
  const plan: Plan = { ...base, items: [...base.items, { id: "col", kind: "column", x: 2, y: 0, rot: 0, w: 0.4, d: 0.4, h: 2.58 }] }; // on the north wall
  const hit = pickSurface(plan, { x: 2, y: 0 }, 0.12);
  assert.deepEqual(hit, { type: "pillar", id: "col" });
  const beside = pickSurface(plan, { x: 3, y: 0 }, 0.12);
  assert.ok(beside?.type === "wall" && beside.id === "n", "beside it the wall is picked as before");
  const painted = paintHit(plan, hit!, brush(null, "#3a3d44"));
  assert.equal(painted.items.find((i) => i.id === "col")!.color, "#3a3d44");
  assert.equal(wallOf(painted, "n").color, wallOf(plan, "n").color, "the wall is left alone");
  assert.deepEqual(sampleHit(painted, hit!), { material: null, color: "#3a3d44" });
  assert.ok(!("color" in paintHit(painted, hit!, brush(null, null)).items.find((i) => i.id === "col")!), "a natural brush takes the paint off again");
  assert.equal(paintHit(plan, hit!, brush(null, null)), plan, "nothing to change, no undo step");
});
