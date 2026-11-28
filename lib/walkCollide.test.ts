import test from "node:test";
import assert from "node:assert/strict";
import { WALK_RADIUS, blocksWalker, buildWalkWorld, floorAt, isFree, nearestFree, solidSpans, standAt, stepWalker, type Walker, type WalkWorld } from "./walkCollide.ts";
import { CATALOG } from "./catalog.ts";
import type { Item, Opening, Plan, Room, Wall } from "./types.ts";

const wall = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<Wall> = {}): Wall => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, style: "plaster", ...extra });
const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({ id, name: id, x, y, w, h, color: "#fff", floor: "wood", ...extra });
const opening = (id: string, wallId: string, type: "door" | "window", extra: Partial<Opening> = {}): Opening => ({ id, wallId, t: 0.5, width: 0.9, type, sill: type === "door" ? 0 : 0.9, height: type === "door" ? 2.1 : 1.2, ...extra });
const item = (id: string, kind: string, x: number, y: number, extra: Partial<Item> = {}): Item => {
  const d = CATALOG[kind];
  return { id, kind, x, y, rot: 0, w: d.w, d: d.d, h: d.h, ...extra };
};
const plan = (p: Partial<Plan>): Plan => ({ walls: [], openings: [], rooms: [room("r", 0, 0, 10, 10)], items: [], ...p });
const at = (w: WalkWorld, x: number, y: number, level = "L0"): Walker => {
  const s = standAt(w, level, x, y);
  assert.ok(s, `no floor at ${x},${y}`);
  return s;
};
/** Walk in small frames (as the app does) toward a direction and return where the walker ends. */
const walk = (w: WalkWorld, from: Walker, dx: number, dy: number, frames = 1): Walker => {
  let s = from;
  for (let i = 0; i < frames; i++) s = stepWalker(w, s, dx, dy);
  return s;
};
const near = (a: number, b: number, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test("a wall stops a walker one radius and half its thickness short, and they slide along it", () => {
  const w = buildWalkWorld(plan({ walls: [wall("w", 0, 5, 10, 5)] }));
  const end = walk(w, at(w, 5, 4), 1, 1);
  near(end.y, 5 - WALK_RADIUS - 0.06);
  assert.ok(end.x > 5.9, "the part of the move along the wall is kept");
});

test("a thick wall (a column) is as wide as it says", () => {
  const w = buildWalkWorld(plan({ walls: [wall("w", 0, 5, 10, 5, { thickness: 0.4 })] }));
  near(walk(w, at(w, 5, 4), 0, 1).y, 5 - WALK_RADIUS - 0.2);
});

test("a door lets a walker through; a window or a door raised above a step does not", () => {
  const through = (o: Opening) => {
    const w = buildWalkWorld(plan({ walls: [wall("w", 0, 5, 10, 5)], openings: [o] }));
    return walk(w, at(w, 5, 4), 0, 2.5, 5).y;
  };
  assert.ok(through(opening("d", "w", "door")) > 6, "a door");
  assert.ok(through(opening("a", "w", "door", { width: 1.4, style: "arch" })) > 6, "an arch");
  assert.ok(through(opening("s", "w", "door", { style: "slidingGlass" })) > 6, "a sliding door");
  assert.ok(through(opening("n", "w", "window")) < 5, "a window");
  assert.ok(through(opening("h", "w", "door", { sill: 0.6 })) < 5, "a door with a high sill");
});

test("a narrow door still lets a walker through when they aim for it, and the jamb stops one who does not", () => {
  const w = buildWalkWorld(plan({ walls: [wall("w", 0, 5, 10, 5)], openings: [opening("d", "w", "door", { width: 0.8 })] }));
  assert.ok(walk(w, at(w, 5, 4), 0, 2.5, 5).y > 6);
  assert.ok(walk(w, at(w, 5.7, 4), 0, 2.5, 5).y < 5); // 0.7 m off the middle of a 0.8 m door: the wall
});

test("solid spans leave out only the openings a person can walk through", () => {
  const wl = wall("w", 0, 0, 10, 0);
  const spans = solidSpans(wl, [opening("d", "w", "door", { t: 0.3, width: 1 }), opening("n", "w", "window", { t: 0.7 }), opening("x", "other", "door")]);
  assert.deepEqual(spans.map((s) => [Math.round(s.s0 * 100) / 100, Math.round(s.s1 * 100) / 100]), [[0, 2.5], [3.5, 10]]);
});

test("furniture blocks by its footprint, turned with the piece", () => {
  const sofa = (rot: number) => buildWalkWorld(plan({ items: [item("s", "dc_sofa_modern_2", 3, 3, { rot })] })); // 1.6 x 0.9
  const stop = (w: WalkWorld) => walk(w, at(w, 3, 0.5), 0, 4, 4).y;
  near(stop(sofa(0)), 3 - 0.45 - WALK_RADIUS);
  near(stop(sofa(90)), 3 - 0.8 - WALK_RADIUS);
});

test("a walker slides along a sofa instead of sticking to it", () => {
  const w = buildWalkWorld(plan({ items: [item("s", "dc_sofa_modern_2", 3, 3)] }));
  const end = walk(w, at(w, 1.5, 2), 0.6, 0.4, 1);
  assert.ok(end.x > 1.5 + 0.3, "the sideways part of the move survives");
});

test("rugs, ceiling lights, wall pieces and small things do not block", () => {
  for (const kind of ["rug", "door_mat", "ceiling_light", "kt_ceiling_led_panel"]) {
    const w = buildWalkWorld(plan({ items: [item("i", kind, 3, 3)] }));
    assert.ok(walk(w, at(w, 3, 1), 0, 4, 4).y > 4.5, kind);
  }
  assert.equal(blocksWalker({ w: 1, d: 1, h: 0.9, elev: 1.2 }, CATALOG.dc_sofa_modern_2), false, "lifted");
  assert.equal(blocksWalker({ w: 0.1, d: 0.1, h: 0.9 }, CATALOG.dc_sofa_modern_2), false, "tiny");
  assert.equal(blocksWalker({ w: 2, d: 1, h: 0.9 }, CATALOG.dc_sofa_modern_2), true);
});

test("a tree blocks by its trunk, not its crown", () => {
  const w = buildWalkWorld(plan({ items: [item("t", "tree_round", 5, 5)] }));
  near(walk(w, at(w, 3, 5), 3, 0, 4).x, 5 - 0.2 - WALK_RADIUS);
  assert.ok(isFree(w, "L0", 5 - 0.7, 5), "inside the crown, beside the trunk");
});

test("a corner holds: pushing hard into it does not get through either wall", () => {
  const w = buildWalkWorld(plan({ walls: [wall("a", 0, 5, 5, 5), wall("b", 5, 0, 5, 5)] }));
  const end = walk(w, at(w, 4, 4), 0.5, 0.5, 20);
  assert.ok(end.x < 5 - 0.3 && end.y < 5 - 0.3, `${end.x},${end.y}`);
});

test("a very long single move (a slow frame) cannot jump through a thin wall", () => {
  const w = buildWalkWorld(plan({ walls: [wall("w", 0, 5, 10, 5)] }));
  assert.ok(stepWalker(w, at(w, 5, 4), 0, 4).y < 5);
});

test("an upper storey has floor only inside its rooms: no walking off a balcony-less edge", () => {
  const p = plan({
    levels: [{ id: "L0", name: "Ground", elevation: 0, height: 2.78 }, { id: "L1", name: "Up", elevation: 2.78, height: 2.78 }],
    rooms: [room("g", 0, 0, 10, 10), room("u", 0, 0, 4, 4, { level: "L1" })],
  });
  const w = buildWalkWorld(p);
  const end = walk(w, at(w, 3.5, 2, "L1"), 3, 0, 4);
  assert.ok(end.x <= 4 + 0.26, `${end.x}`);
  near(end.h, 2.78, 1e-9);
});

test("the garden is walkable on the ground floor, up to a limit", () => {
  const w = buildWalkWorld(plan({ rooms: [room("r", 0, 0, 4, 4)] }));
  assert.equal(floorAt(w, "L0", 8, 2), 0);
  const end = walk(w, at(w, 2, 2), 100, 0, 3);
  assert.ok(end.x > 20 && end.x < 30, `${end.x}`);
});

test("stairs lead up to the next storey and back down, one continuous climb", () => {
  const p = plan({
    levels: [{ id: "L0", name: "Ground", elevation: 0, height: 2.78 }, { id: "L1", name: "Up", elevation: 2.78, height: 2.78 }],
    rooms: [room("g", 0, 0, 10, 10), room("u", 0, 0, 10, 10, { level: "L1" })],
    items: [item("st", "stairs_straight_closed", 5, 5)], // 0.9 x 3.9, foot at the front (+y), climbing toward -y
  });
  const w = buildWalkWorld(p);
  let s = at(w, 5, 8);
  let top = -1;
  const heights: number[] = [];
  for (let i = 0; i < 140 && (s.level === "L0" || s.ramp); i++) {
    s = stepWalker(w, s, 0, -0.05);
    heights.push(s.h);
    if (s.ramp) top = Math.max(top, s.h);
  }
  assert.equal(s.level, "L1");
  assert.equal(s.ramp, null);
  near(s.h, 2.78, 1e-9);
  assert.ok(top > 2, "the floor rose while on the stairs");
  assert.ok(heights.every((h, i) => i === 0 || h >= heights[i - 1] - 1e-9), "never downhill on the way up");
  for (let i = 0; i < 160 && (s.level === "L1" || s.ramp); i++) s = stepWalker(w, s, 0, 0.05);
  assert.equal(s.level, "L0");
  assert.equal(s.ramp, null);
  near(s.h, 0, 1e-9);
});

test("the staircase is solid from the side: it can only be entered at its foot", () => {
  const p = plan({
    levels: [{ id: "L0", name: "Ground", elevation: 0, height: 2.78 }, { id: "L1", name: "Up", elevation: 2.78, height: 2.78 }],
    rooms: [room("g", 0, 0, 10, 10), room("u", 0, 0, 10, 10, { level: "L1" })],
    items: [item("st", "stairs_straight_closed", 5, 5)],
  });
  const w = buildWalkWorld(p);
  const end = walk(w, at(w, 2, 5), 0.2, 0, 20);
  assert.equal(end.ramp, null);
  assert.ok(end.x < 5 - 0.45, `${end.x}`);
});

test("a raised floor is left by its front steps, and not at all without them", () => {
  const raised = [{ id: "L0", name: "Ground", elevation: 1, height: 2.78 }];
  const shell = [wall("n", 0, 0, 6, 0), wall("e", 6, 0, 6, 4), wall("s", 6, 4, 0, 4), wall("w", 0, 4, 0, 0)];
  const out = (withDoor: boolean) => {
    const w = buildWalkWorld(plan({ levels: raised, building: { type: "house", entry: "stairs" }, rooms: [room("r", 0, 0, 6, 4)], walls: shell, openings: withDoor ? [opening("d", "s", "door", { t: 0.5 })] : [] }));
    const path: Walker[] = [];
    let s = at(w, 3, 3);
    for (let i = 0; i < 160; i++) path.push((s = stepWalker(w, s, 0, 0.05)));
    return { w, s, path };
  };
  const { s, path } = out(true);
  assert.ok(s.y > 6.5, `${s.y}`);
  near(s.h, 0, 1e-9);
  assert.ok(path.some((p) => p.ramp !== null && p.h > 0.2 && p.h < 0.9), "went down the steps");
  assert.ok(out(false).s.y < 4, "no door, no way out");
});

test("a flat entered from the building's hallway walks out onto the corridor at the flat's own height, and stops at its far wall", () => {
  const raised = [{ id: "L0", name: "Ground", elevation: 1, height: 2.78 }];
  const shell = [wall("n", 0, 0, 6, 0), wall("e", 6, 0, 6, 4), wall("s", 6, 4, 0, 4), wall("w", 0, 4, 0, 0)];
  const w = buildWalkWorld(plan({ levels: raised, building: { type: "apartment", entry: "hallway" }, rooms: [room("r", 0, 0, 6, 4)], walls: shell, openings: [opening("d", "s", "door", { t: 0.5 })] }));
  assert.ok(w.hall, "the corridor is part of the world");
  const path: Walker[] = [];
  let s = at(w, 3, 3);
  for (let i = 0; i < 120; i++) path.push((s = stepWalker(w, s, 0, 0.05)));
  assert.ok(s.y > 4.5 && s.y < 8, `out of the door but no further than the corridor: ${s.y}`);
  assert.ok(path.every((p) => p.h === 1 && p.ramp === null), "no drop to the ground, no steps");
});

test("the nearest free spot is outside a piece of furniture", () => {
  const w = buildWalkWorld(plan({ items: [item("s", "dc_sofa_modern_2", 3, 3)] }));
  assert.equal(isFree(w, "L0", 3, 3), false);
  const spot = nearestFree(w, "L0", 3, 3);
  assert.ok(spot && isFree(w, "L0", spot.x, spot.y));
  assert.ok(Math.hypot(spot.x - 3, spot.y - 3) < 1.5);
});
