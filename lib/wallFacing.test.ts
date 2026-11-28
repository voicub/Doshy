import test from "node:test";
import assert from "node:assert/strict";
import { wallCuts, wallOfItem, type WallCut } from "./wallFacing.ts";
import type { Item, Plan, Room, Wall } from "./types.ts";

const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({ id, name: id, x, y, w, h, floor: "wood", color: "#fff", ...extra });
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<Wall> = {}): Wall => ({ id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster", ...extra });
const plan = (rooms: Room[], walls: Wall[], extra: Partial<Plan> = {}): Plan => ({ rooms, walls, openings: [], items: [], ...extra }) as Plan;

/** The wall ids that are cut at an azimuth, sorted. */
const cutAt = (p: Plan, az: number, level = "L0", prev?: ReadonlyMap<string, WallCut>) => [...wallCuts(p, level, az, prev)].filter(([, c]) => c === "cut").map(([id]) => id).sort();

// a 4 x 4 room with its four walls on the outside, each drawn in the direction that gives the plan's usual normals
const square = plan(
  [room("A", 0, 0, 4, 4)],
  [wall("n", -0.06, -0.06, 4.06, -0.06), wall("e", 4.06, -0.06, 4.06, 4.06), wall("s", 4.06, 4.06, -0.06, 4.06), wall("w", -0.06, 4.06, -0.06, -0.06)],
);

test("a square room: from each isometric corner the two walls toward the camera are cut and the two behind stand", () => {
  assert.deepEqual(cutAt(square, 45), ["e", "s"]); // the default camera sits at (+x, +z): south and east
  assert.deepEqual(cutAt(square, 135), ["e", "n"]);
  assert.deepEqual(cutAt(square, 225), ["n", "w"]);
  assert.deepEqual(cutAt(square, 315), ["s", "w"]);
  assert.deepEqual(cutAt(square, -45), ["s", "w"], "a negative azimuth is the same direction");
});

test("an arbitrary azimuth cuts what faces the camera and walls seen nearly edge-on stand", () => {
  assert.deepEqual(cutAt(square, 0), ["s"], "looking straight from the south: east and west are edge-on");
  assert.deepEqual(cutAt(square, 5), ["s"], "sin 5 degrees is 0.09: still edge-on");
  assert.deepEqual(cutAt(square, 20), ["e", "s"]);
  assert.deepEqual(cutAt(square, 90), ["e"], "from the east: the south and north walls are edge-on");
  assert.deepEqual(cutAt(square, 180), ["n"]);
});

test("hysteresis: a wall on the threshold does not flip while the camera hovers", () => {
  const east = (az: number) => wallCuts(square, "L0", az).get("e");
  assert.equal(east(10), "cut", "0.17 is over the plain threshold 0.15 when there is nothing to remember");
  let m = wallCuts(square, "L0", 0);
  assert.equal(m.get("e"), "tall");
  m = wallCuts(square, "L0", 10, m); // 0.17: not over the 0.2 a standing wall needs
  assert.equal(m.get("e"), "tall");
  m = wallCuts(square, "L0", 12, m); // 0.21
  assert.equal(m.get("e"), "cut");
  m = wallCuts(square, "L0", 7, m); // 0.12: still over the 0.1 a cut wall needs to give up
  assert.equal(m.get("e"), "cut");
  m = wallCuts(square, "L0", 5, m); // 0.09
  assert.equal(m.get("e"), "tall");
});

test("the same Map comes back while no wall changes", () => {
  const a = wallCuts(square, "L0", 45);
  assert.equal(wallCuts(square, "L0", 46, a), a);
  assert.notEqual(wallCuts(square, "L0", 135, a), a);
});

test("rooms side by side: the wall between them is cut when either of its faces looks at the camera, and stands edge-on", () => {
  const two = plan(
    [room("A", 0, 0, 4, 4), room("B", 4.12, 0, 4, 4)],
    [wall("mid", 4.06, -0.06, 4.06, 4.06), wall("n", -0.06, -0.06, 8.18, -0.06), wall("s", 8.18, 4.06, -0.06, 4.06), wall("w", -0.06, 4.06, -0.06, -0.06), wall("e", 8.18, -0.06, 8.18, 4.06)],
  );
  assert.equal(wallCuts(two, "L0", 90).get("mid"), "cut", "seen face on");
  assert.equal(wallCuts(two, "L0", 270).get("mid"), "cut", "from the other side too");
  assert.equal(wallCuts(two, "L0", 45).get("mid"), "cut");
  assert.equal(wallCuts(two, "L0", 0).get("mid"), "tall", "edge-on: it hides nothing");
  assert.deepEqual(cutAt(two, 45), ["e", "mid", "s"]);
});

test("an L shape: the notch's outside walls face the camera from the notch side, the inside corner walls follow", () => {
  // A is 6 wide on top, B hangs under its left half; the notch lies right of B, under A
  const l = plan(
    [room("A", 0, 0, 6, 3), room("B", 0, 3.12, 3, 3)],
    [
      wall("a-n", -0.06, -0.06, 6.06, -0.06),
      wall("a-e", 6.06, -0.06, 6.06, 3.06),
      wall("a-s", 6.06, 3.06, -0.06, 3.06), // inner for the left half (A above B), outside for the right half (the notch below A)
      wall("b-e", 3.06, 3.06, 3.06, 6.18), // B's east wall faces the notch
      wall("b-s", 3.06, 6.18, -0.06, 6.18),
      wall("w", -0.06, 6.18, -0.06, -0.06),
    ],
  );
  assert.deepEqual(cutAt(l, 45), ["a-e", "a-s", "b-e", "b-s"]);
  assert.equal(wallCuts(l, "L0", 135).get("b-e"), "cut", "camera at (+x, -z): the notch wall looks at it");
  assert.equal(wallCuts(l, "L0", 225).get("b-e"), "tall", "from the west B's east wall is the back wall");
  assert.equal(wallCuts(l, "L0", 225).get("a-s"), "cut", "half inner (cut from this side), half the notch's outside turned away: a tie cuts");
});

test("only the storey being drawn is answered for; fences and other storeys are absent", () => {
  const levels = [{ id: "L0", name: "G", elevation: 0, height: 2.78 }, { id: "L1", name: "U", elevation: 2.78, height: 2.78 }];
  const two = plan(
    [room("A", 0, 0, 4, 4), room("U", 0, 0, 4, 4, { level: "L1" })],
    [...square.walls, wall("up-s", 4.06, 4.06, -0.06, 4.06, { level: "L1" }), wall("up-n", -0.06, -0.06, 4.06, -0.06, { level: "L1" }), wall("fence", 9, 0, 9, 4, { style: "fence_picket" })],
    { levels },
  );
  const ground = wallCuts(two, "L0", 45);
  assert.deepEqual([...ground.keys()].sort(), ["e", "n", "s", "w"]);
  const up = wallCuts(two, "L1", 45);
  assert.deepEqual([...up], [["up-s", "cut"], ["up-n", "tall"]]);
  assert.equal(wallCuts(two, "L2", 45).size, 0);
});

test("a wall with a terrace behind it counts as an outside wall; a free-standing wall is cut when seen face on", () => {
  const house = plan(
    [room("A", 0, 0, 4, 4), room("T", 4.12, 0, 3, 4, { floor: "deck" })],
    [wall("mid", 4.06, -0.06, 4.06, 4.06), wall("free", 20, 0, 24, 0)],
  );
  // A sits on the -normal side of "mid" (normal -x... the wall runs down, so its normal is -x), the terrace is outside: the outward face looks +x
  assert.equal(wallCuts(house, "L0", 90).get("mid"), "cut", "the terrace side faces a camera at +x");
  assert.equal(wallCuts(house, "L0", 270).get("mid"), "tall", "from the other side the house's own back wall stands");
  assert.equal(wallCuts(house, "L0", 0).get("free"), "cut");
  assert.equal(wallCuts(house, "L0", 90).get("free"), "tall");
});

test("a wall-mounted piece belongs to the wall it touches", () => {
  const p = plan([room("A", 0, 0, 4, 4)], square.walls);
  assert.equal(wallOfItem(p, { x: 2, y: 0.17, d: 0.1 }), "n");
  assert.equal(wallOfItem(p, { x: 3.9, y: 2, d: 0.1 }), "e");
  assert.equal(wallOfItem(p, { x: 2, y: 2, d: 0.1 }), undefined, "in the middle of the room");
  assert.equal(wallOfItem(p, { x: 2, y: 0.17, d: 0.1, level: "L9" }), "n", "an unknown level falls back to the first, like everything else");
});

const column = (id: string, x: number, y: number, kind = "column", extra: Partial<Item> = {}): Item => ({ id, kind, x, y, rot: 0, w: 0.4, d: 0.4, h: 2.58, ...extra });
const withColumns = (...items: Item[]): Plan => ({ ...square, items });

test("pillars: those on the camera's side of the building are cut at each isometric corner, those in the back half stand", () => {
  const p = withColumns(column("se", 3.5, 3.5), column("nw", 0.5, 0.5, "column_round"), column("ne", 3.5, 0.5), column("riser", 0.5, 3.5, "bt_water_column"), column("mid", 2, 2));
  const cutPillars = (az: number) => cutAt(p, az).filter((id) => !["n", "e", "s", "w"].includes(id));
  assert.deepEqual(cutPillars(45), ["se"]);
  assert.deepEqual(cutPillars(225), ["nw"]);
  assert.deepEqual(cutPillars(135), ["ne"]);
  assert.deepEqual(cutPillars(315), ["riser"]);
  assert.equal(wallCuts(p, "L0", 45).get("mid"), "tall", "the middle of the building is neither side");
  assert.equal(wallCuts(p, "L0", 45).get("nw"), "tall");
});

test("pillars have hysteresis too, and furniture and other storeys' pillars are not answered for", () => {
  const p = { ...withColumns(column("c", 3, 2), column("other", 3, 2, "column", { level: "L1" }), { id: "sofa", kind: "sofa", x: 3.5, y: 3.5, rot: 0, w: 1, d: 1, h: 0.8 }), levels: [{ id: "L0", name: "G", elevation: 0, height: 2.78 }, { id: "L1", name: "U", elevation: 2.78, height: 2.78 }] };
  const at = (az: number, prev?: ReadonlyMap<string, WallCut>) => wallCuts(p, "L0", az, prev);
  assert.equal(at(30).get("c"), "cut", "0.17 of the camera's direction is over the plain 0.15");
  let m = at(0);
  assert.equal(m.get("c"), "tall");
  m = at(30, m);
  assert.equal(m.get("c"), "tall", "not over the 0.2 a standing pillar needs");
  m = at(40, m);
  assert.equal(m.get("c"), "cut");
  m = at(33, m);
  assert.equal(m.get("c"), "cut", "still over the 0.1 a cut pillar needs to give up");
  m = at(15, m);
  assert.equal(m.get("c"), "tall");
  assert.equal(m.has("sofa"), false);
  assert.equal(m.has("other"), false);
});
