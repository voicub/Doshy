import test from "node:test";
import assert from "node:assert/strict";
import { planSun } from "./daylight.ts";
import { buildScene, lets, neighbourOf, relevantPanels, sunReaches, SAMPLE_LIFT, type Neighbour } from "./daylightRay.ts";
import type { Opening, Plan, Wall } from "./types.ts";

// A 4 x 4 m room (0..4 both ways), walls on its edges, the south wall at y = 4. A window 2 m wide (x 1..3) sits in it, sill 0.9, top 2.1.
const wall = (id: string, ax: number, ay: number, bx: number, by: number, over: Partial<Wall> = {}): Wall => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, style: "plaster", ...over });
const opening = (over: Partial<Opening> = {}): Opening => ({ id: "o", wallId: "s", t: 0.5, width: 2, type: "window", sill: 0.9, height: 1.2, ...over });
const SHELL = [wall("n", 0, 0, 4, 0), wall("e", 4, 0, 4, 4), wall("s", 0, 4, 4, 4), wall("w", 0, 4, 0, 0)];
const room = { id: "r", name: "Living", x: 0, y: 0, w: 4, h: 4, color: "#fff", floor: "wood" as const };
const plan = (over: Partial<Plan> = {}): Plan => ({ walls: SHELL, openings: [opening()], rooms: [room], items: [], ...over });

const FLOOR = SAMPLE_LIFT;
const south = (elevation: number) => planSun(180, elevation, 0); // sun due south: plan +y
/** Is the floor point (x, y) of the single storey in the sun? */
const lit = (p: Plan, x: number, y: number, sun = south(45), neighbours: Neighbour[] = []) => {
  const scene = buildScene(p, neighbours);
  return sunReaches(scene.panels, scene.slabs, x, y, FLOOR, sun);
};

test("a south window lights a band of floor whose depth follows the sun's height (45 degrees: 4 - y in the window's 0.9..2.1 span)", () => {
  // the ray from (x, y) crosses the south wall (y = 4) at height 0.02 + (4 - y): inside the window for y from 1.92 to 3.12
  assert.equal(lit(plan(), 2, 2.5), true, "crosses at 1.52 m");
  assert.equal(lit(plan(), 2, 3.1), true, "crosses at 0.92 m, just above the sill");
  assert.equal(lit(plan(), 2, 3.15), false, "crosses at 0.87 m: hits the wall under the sill");
  assert.equal(lit(plan(), 2, 1.95), true, "crosses at 2.07 m, just under the lintel");
  assert.equal(lit(plan(), 2, 1.9), false, "crosses at 2.12 m: hits the wall over the window");
  assert.equal(lit(plan(), 0.5, 2.5), false, "beside the window: the wall is in the way");
  assert.equal(lit(plan(), 3.5, 2.5), false);
});

test("a lower sun reaches deeper into the room: at 30 degrees the band runs from y = 0.40 to 2.48", () => {
  const low = south(30);
  assert.equal(lit(plan(), 2, 2.4, low), true);
  assert.equal(lit(plan(), 2, 2.55, low), false, "0.02 + 1.45 * tan 30 = 0.86 m: under the sill");
  assert.equal(lit(plan(), 2, 0.5, low), true, "0.02 + 3.5 * tan 30 = 2.04 m: just under the lintel");
  assert.equal(lit(plan(), 2, 0.3, low), false, "2.15 m: over the window");
});

test("the sun over the south wall's top is stopped by the ceiling, not let into the room", () => {
  // from (2, 1) at 45 degrees the ray is at 3.02 m when it crosses the wall, above its 2.58 m top; it meets the ceiling plane at y = 3.56, inside the room
  assert.equal(lit(plan(), 2, 1), false);
});

test("sun at or below the horizon never reaches the floor", () => {
  assert.equal(lit(plan(), 2, 2.5, planSun(180, 0, 0)), false);
  assert.equal(lit(plan(), 2, 2.5, planSun(180, -20, 0)), false);
});

test("the plan's bearing turns the sun with it: a plan turned a quarter lets the west sun in through the same window", () => {
  const scene = buildScene(plan());
  const west = planSun(270, 45, 90); // plan up faces east, so the plan's south wall faces west
  assert.equal(sunReaches(scene.panels, scene.slabs, 2, 2.5, FLOOR, west), true);
  assert.equal(sunReaches(scene.panels, scene.slabs, 2, 2.5, FLOOR, planSun(270, 45, 0)), false, "unturned, the west sun hits the blank west wall");
});

test("a solid door stops the sun, a glass door and an open archway let it through", () => {
  const door = (style?: Opening["style"]) => plan({ openings: [opening({ type: "door", sill: 0, height: 2.1, width: 1, style })] });
  assert.equal(lit(door(), 2, 2.5), false, "plain door");
  assert.equal(lit(door("single"), 2, 2.5), false);
  assert.equal(lit(door("garageSectional"), 2, 2.5), false);
  for (const style of ["french", "slidingGlass", "sidelight", "arch", "passage"] as const) assert.equal(lit(door(style), 2, 2.5), true, style);
  assert.equal(lit(door("french"), 3.4, 2.5), false, "beside the 1 m wide glass door the wall still stops it");
  assert.equal(lets({ type: "window", style: "glassBlock" }), true);
});

test("a glass wall lets the sun through and a plaster wall does not", () => {
  const glass = plan({ walls: [...SHELL.filter((w) => w.id !== "s"), wall("s", 0, 4, 4, 4, { style: "glass" })], openings: [] });
  assert.equal(lit(glass, 0.5, 3.8), true);
  assert.equal(lit(plan({ openings: [] }), 0.5, 3.8), false);
});

test("an interior wall with no opening shades the cells behind it, the cells in front of it stay lit", () => {
  const split = plan({ walls: [...SHELL, wall("i", 0, 2, 4, 2)] });
  assert.equal(lit(split, 2, 3, south(45)), true, "south of the partition: 0.02 + 1 = 1.02 m at the window");
  assert.equal(lit(plan(), 2, 1.5, south(30)), true, "without the partition: 0.02 + 2.5 * tan 30 = 1.46 m at the window");
  assert.equal(lit(split, 2, 1.5, south(30)), false, "with it: the ray is 0.31 m high at y = 2, under the partition's top");
});

test("a fence stops the sun only below its height; a see-through fence never does", () => {
  const withFence = (over: Partial<Wall>) => plan({ walls: [...SHELL, wall("f", -2, 6, 6, 6, { style: "fence_picket", ...over })] });
  // from (2, 0.5) at 15 degrees the ray is 0.96 m high at the window and 1.49 m high when it crosses the fence at y = 6
  const low = south(15);
  assert.equal(lit(withFence({ height: 1 }), 2, 0.5, low), true, "1 m fence: the ray passes over it");
  assert.equal(lit(withFence({ height: 2 }), 2, 0.5, low), false, "2 m fence: in the way");
  assert.equal(lit(withFence({ height: 2, style: "fence_iron" }), 2, 0.5, low), true, "railings let the sun through");
  assert.equal(lit(withFence({ height: 2, a: { x: 7, y: 6 }, b: { x: 9, y: 6 } }), 2, 0.5, low), true, "a fence that is not between the room and the sun");
});

test("a neighbouring building shades the room when it is taller than the ray where it stands, and not when it is lower or on the far side", () => {
  const block = (y0: number, y1: number, height: number, roofHeight = 0) => neighbourOf({ ring: [[-5, y0], [9, y0], [9, y1], [-5, y1]], height, minHeight: 0, roofHeight });
  // from (2, 2) at 30 degrees: 1.17 m at the window; the ray is 0.02 + 8 * tan 30 = 4.64 m high above y = 10
  const sun = south(30);
  assert.equal(lit(plan(), 2, 2, sun), true, "nothing there");
  assert.equal(lit(plan(), 2, 2, sun, [block(10, 14, 8)]), false, "8 m block");
  assert.equal(lit(plan(), 2, 2, sun, [block(10, 14, 3, 2)]), true, "eaves 3 m + half of a 2 m roof = 4 m, under the ray");
  assert.equal(lit(plan(), 2, 2, sun, [block(10, 14, 3, 5)]), false, "eaves 3 m + half of a 5 m roof = 5.5 m, over the ray");
  assert.equal(lit(plan(), 2, 2, sun, [block(-14, -10, 30)]), true, "tall, but behind the room");
  assert.equal(neighbourOf({ ring: [], height: 6, minHeight: 0, roofHeight: 3 }).top, 7.5);
});

test("a lifted building lets a low ray pass underneath but a standing one stops it", () => {
  const sun = south(20);
  const ring = [[-5, 10], [9, 10], [9, 14], [-5, 14]] as const;
  // from (2, 0.5): 1.29 m at the window, 3.48 m high over y = 10 and 4.93 m over y = 14, all under a 6 m underside
  assert.equal(lit(plan(), 2, 0.5, sun, [neighbourOf({ ring, height: 12, minHeight: 6, roofHeight: 0 })]), true);
  assert.equal(lit(plan(), 2, 0.5, sun, [neighbourOf({ ring, height: 12, minHeight: 0, roofHeight: 0 })]), false);
});

test("a wall on an upper level shades a ground-floor window below it", () => {
  const levels = [{ id: "L0", name: "Ground", elevation: 0, height: 2.78 }, { id: "L1", name: "Up", elevation: 2.78, height: 2.78 }];
  const shaded = plan({ levels, walls: [...SHELL, wall("up", -2, 5, 6, 5, { level: "L1" })] });
  // from (2, 2.12) at 45 degrees: 1.9 m at the window, 2.9 m high at y = 5: inside the upper wall's 2.78..5.36 m
  assert.equal(lit(plan({ levels }), 2, 2.12), true, "without the upper wall");
  assert.equal(lit(shaded, 2, 2.12), false);
});

test("a house roof's overhang shades a high sun in the window but not a low one", () => {
  const house = (overhang: number) => plan({ building: { type: "house", roof: { type: "gable", pitch: 30, overhang } } });
  // 70 degrees from (2, 3.46): 1.5 m high at the window, reaches the 2.58 m eave 0.39 m outside the wall
  const high = south(70);
  assert.equal(lit(plan({ building: { type: "apartment" } }), 2, 3.46, high), true, "no roof: lit");
  assert.equal(lit(house(0.1), 2, 3.46, high), true, "a 0.1 m overhang is too short to reach it");
  assert.equal(lit(house(1), 2, 3.46, high), false, "a 1 m overhang covers it");
  // 30 degrees from (2, 0.744): 1.9 m high at the window, reaches the 2.58 m eave 1.18 m outside the wall: past a 1 m overhang, inside 1.5 m (the most a roof has)
  assert.equal(lit(house(1), 2, 0.744, south(30)), true);
  assert.equal(lit(house(1.5), 2, 0.744, south(30)), false, "a 1.5 m overhang does reach");
});

test("relevantPanels drops what cannot matter and keeps what can, without changing any answer", () => {
  const scene = buildScene(plan(), [neighbourOf({ ring: [[-5, 10], [9, 10], [9, 14], [-5, 14]], height: 8, minHeight: 0, roofHeight: 0 }), neighbourOf({ ring: [[-5, -14], [9, -14], [9, -10], [-5, -10]], height: 8, minHeight: 0, roofHeight: 0 })]);
  const sun = south(30);
  const near = relevantPanels(scene.panels, 2, 2, 3, FLOOR, sun);
  assert.ok(near.length < scene.panels.length, "the block on the far side is dropped");
  assert.ok(near.some((p) => p.ay === 10 && p.dy === 0), "the block the sun is over is kept");
  for (const [x, y] of [[2, 2], [2, 0.6], [1.2, 1.8], [3.5, 2.4]]) {
    assert.equal(sunReaches(near, scene.slabs, x, y, FLOOR, sun), sunReaches(scene.panels, scene.slabs, x, y, FLOOR, sun), `${x},${y}`);
  }
});
