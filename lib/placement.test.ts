import test from "node:test";
import assert from "node:assert/strict";
import { WALL_T } from "./geometry.ts";
import { classify, clearWalls, corners, hitsWall, mountOnWall, obstacleWalls, resolveWalls, settleItem, slideTo, snapToWalls, wallClearance, wallSlab, collisionWalls, doorSwing, swingFor, swingHitsFootprint } from "./placement.ts";
import type { Wall } from "./types.ts";

const wall = (x1: number, y1: number, x2: number, y2: number, id = `${x1},${y1}-${x2},${y2}`): Wall => ({ id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster" });
const H = WALL_T / 2;
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const box = (x: number, y: number, w = 1, d = 0.5, rot = 0) => ({ x, y, w, d, rot });

// a 6 x 4 room: wall centrelines on x=0, x=6, y=0, y=4
const room = [wall(0, 0, 6, 0), wall(6, 0, 6, 4), wall(6, 4, 0, 4), wall(0, 4, 0, 0)];

test("footprints follow the plan convention: rot turns clockwise, front faces +y at 0", () => {
  const c0 = corners(box(0, 0, 2, 1, 0));
  assert.deepEqual(c0.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]), [[-1, -0.5], [1, -0.5], [1, 0.5], [-1, 0.5]]);
  const xs = corners(box(0, 0, 2, 1, 90)).map((p) => Math.round(p.x * 100) / 100);
  assert.equal(Math.max(...xs), 0.5); // a 2 x 1 item turned a quarter is 1 wide, 2 deep
  assert.equal(Math.min(...xs), -0.5);
});

test("an item cannot be dragged into a wall: it stops flush against the wall face", () => {
  const stop = slideTo(box(3, 2), { x: -2, y: 2 }, room);
  near(stop.x, H + 0.5); // west wall face at 0.06, half the 1 m width
  near(stop.y, 2);
  const south = slideTo(box(3, 2), { x: 3, y: 9 }, room);
  near(south.y, 4 - H - 0.25); // half the 0.5 m depth
  assert.equal(hitsWall({ ...box(3, 2), ...stop }, room), false);
});

test("a fast drag far past a thin wall cannot jump through it", () => {
  const divider = [wall(3, -1, 3, 5)];
  const stop = slideTo(box(1, 2), { x: 8, y: 2 }, divider);
  near(stop.x, 3 - H - 0.5);
  // even when the pointer ends up exactly on the far side of the wall's centreline
  assert.ok(slideTo(box(1, 2), { x: 3.01, y: 2 }, divider).x < 3);
});

test("dragging diagonally into a wall slides along it", () => {
  const stop = slideTo(box(3, 2), { x: -3, y: 3.2 }, room);
  near(stop.x, H + 0.5);
  near(stop.y, 3.2); // the along-wall part of the drag is kept
});

test("a corner stops the item on both walls", () => {
  const stop = slideTo(box(3, 2), { x: -5, y: -5 }, room);
  near(stop.x, H + 0.5);
  near(stop.y, H + 0.25);
});

test("a rotated item is stopped by its rotated footprint, not its unrotated one", () => {
  const stop = slideTo(box(3, 2, 1, 0.5, 90), { x: -2, y: 2 }, room);
  near(stop.x, H + 0.25); // turned 90 degrees, the 0.5 m depth now faces the wall
});

test("touching a wall is not a collision, a 1 cm overlap is", () => {
  assert.equal(hitsWall(box(H + 0.5, 2), room), false);
  assert.equal(hitsWall(box(H + 0.49, 2), room), true);
  near(resolveWalls(box(H + 0.49, 2), room).x, H + 0.5);
});

test("an item left inside a wall by an old plan is pushed to the side its centre is on", () => {
  const out = resolveWalls(box(0.1, 2), room);
  near(out.x, H + 0.5);
  const other = resolveWalls(box(5.9, 2), room);
  near(other.x, 6 - H - 0.5);
});

test("snapping closes a small gap to a wall and ignores a large one", () => {
  const close = snapToWalls(box(0.06 + 0.5 + 0.09, 2), room);
  near(close.x, H + 0.5);
  const far = snapToWalls(box(0.06 + 0.5 + 0.4, 2), room);
  near(far.x, 0.06 + 0.5 + 0.4);
  // both opposite walls: a 1.63 m hall with a 0.4 m bench snaps to the nearer one only
  const hall = [wall(0, 0, 0, 5), wall(1.75, 0, 1.75, 5)];
  const bench = snapToWalls({ x: 0.06 + 0.2 + 0.05, y: 2, w: 1.3, d: 0.4, rot: 270 }, hall);
  near(bench.x, 0.06 + 0.2);
  assert.equal(bench.rot, 270);
});

test("snapping squares up a slightly crooked item but leaves a deliberate angle alone", () => {
  const crooked = snapToWalls({ x: 3, y: 0.06 + 0.25 + 0.05, w: 1, d: 0.5, rot: 8 }, room);
  assert.ok(Math.abs(crooked.rot) < 1e-6 || Math.abs(crooked.rot - 360) < 1e-6);
  near(crooked.y, H + 0.25, 1e-3);
  const angled = snapToWalls({ x: 3, y: 1.0, w: 1, d: 0.5, rot: 30 }, room);
  assert.equal(angled.rot, 30);
});

test("an item only snaps to a wall it actually faces along its length", () => {
  const stub = [wall(0, 0, 0, 1)]; // a short wall around y 0..1
  const beside = snapToWalls({ x: 0.06 + 0.5 + 0.05, y: 3, w: 1, d: 0.5, rot: 0 }, stub);
  near(beside.x, 0.06 + 0.5 + 0.05); // 2 m past the end of the stub: not beside it
});

test("wall-mounted items turn their back to the nearest wall and sit flush on it", () => {
  const south = mountOnWall({ x: 3, y: 4 - H - 0.3, w: 0.6, d: 0.35, rot: 0 }, room);
  assert.equal(Math.round(south.rot), 180);
  near(south.y, 4 - H - 0.175);
  const west = mountOnWall({ x: 0.06 + 0.4, y: 2, w: 1.4, d: 0.35, rot: 0 }, room);
  assert.equal(Math.round(west.rot), 270);
  near(west.x, H + 0.175);
  const east = mountOnWall({ x: 6 - H - 0.4, y: 2, w: 1, d: 0.1, rot: 0 }, room);
  assert.equal(Math.round(east.rot), 90);
  const north = mountOnWall({ x: 3, y: H + 0.4, w: 1, d: 0.1, rot: 123 }, room);
  assert.equal(Math.round(north.rot), 0);
  // far from every wall it stays where it is
  assert.deepEqual(mountOnWall({ x: 3, y: 2, w: 0.6, d: 0.35, rot: 0 }, [wall(0, 0, 0, 4)]), { x: 3, y: 2, rot: 0 });
});

test("settleItem: floor items are blocked and snapped, snapping can be switched off", () => {
  const snapped = settleItem(box(3, 2), { x: 0.06 + 0.5 + 0.08, y: 2 }, room, "floor");
  near(snapped.x, H + 0.5);
  const free = settleItem(box(3, 2), { x: 0.06 + 0.5 + 0.08, y: 2 }, room, "floor", false);
  near(free.x, 0.06 + 0.5 + 0.08); // Alt held: exactly where the pointer is
  const blocked = settleItem(box(3, 2), { x: -3, y: 2 }, room, "floor", false);
  near(blocked.x, H + 0.5); // but still never through the wall
});

test("settleItem: ceiling lights and rugs ignore walls entirely", () => {
  for (const cls of ["ceiling", "flat"] as const) {
    assert.deepEqual(settleItem(box(3, 2), { x: -1, y: -1 }, room, cls), { x: -1, y: -1, rot: 0 });
  }
});

test("classify sorts the catalog into floor, mounted, ceiling and flat", () => {
  assert.equal(classify({ h: 0.8 }, "lv_sideboard_oak_black"), "floor");
  assert.equal(classify({ h: 0.03 }, "lv_rug_grey_large"), "flat");
  assert.equal(classify({ h: 2.1, wall: true }, "kt_wall_unit"), "mounted");
  assert.equal(classify({ h: 2.6, wall: true }, "kt_ceiling_led_panel"), "ceiling");
  assert.equal(classify({ h: 2.6, wall: true }, "ceiling_light"), "ceiling");
  assert.equal(classify({ h: 2.6 }, "of_ceiling_round"), "ceiling"); // not every flush ceiling light carries the wall flag
});

test("rotating an item that sits flush against a wall pushes it clear of the wall", () => {
  const flush = { x: 3, y: H + 0.25, w: 2, d: 0.5, rot: 0 };
  const turned = clearWalls({ ...flush, rot: 90 }, room, "floor");
  near(turned.y, H + 1); // now 2 m deep: its centre moves out 1 m from the wall face
  assert.deepEqual(clearWalls({ ...flush, rot: 90 }, room, "flat"), { x: 3, y: H + 0.25 });
});

test("an item too big for the gap between two walls still settles and never loops forever", () => {
  const tight = [wall(0, 0, 0, 5), wall(1, 0, 1, 5)];
  const out = slideTo({ x: 0.5, y: 2, w: 1.6, d: 0.6, rot: 0 }, { x: 0.5, y: 3 }, tight);
  assert.ok(Number.isFinite(out.x) && Number.isFinite(out.y));
});

test("wallClearance measures the free gap to the nearest wall face in each plan direction", () => {
  const c = wallClearance(box(3, 2), room);
  near(c.e!, 3 - 0.5 - H); // room is 6 wide: 2.5 m of floor east of the 1 m wide item, minus half a wall
  near(c.w!, 3 - 0.5 - H);
  near(c.n!, 2 - 0.25 - H);
  near(c.s!, 2 - 0.25 - H);
});

test("wallClearance is zero when flush, uses the rotated footprint, and is null where nothing lies ahead", () => {
  near(wallClearance(box(H + 0.5, 2), room).w!, 0);
  near(wallClearance(box(3, 2, 1, 0.5, 90), room).e!, 3 - 0.25 - H); // turned: 0.5 m wide east-west
  assert.equal(wallClearance(box(3, 2), [wall(0, 0, 6, 0)]).e, null);
  assert.equal(wallClearance(box(3, 2), room, 1).n, null); // beyond the search range
});

const solidDefs = { column: { solid: true }, water_column: { solid: true }, chair: {} };
const thing = (id: string, kind: string, x: number, y: number, w: number, d: number, rot = 0) => ({ id, kind, x, y, w, d, h: 2.6, rot });
const sortedCorners = (p: { x: number; y: number }[]) => p.map((q) => [Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

test("a solid column blocks an item dragged into it, which then sits flush on its face", () => {
  const walls = obstacleWalls([thing("c", "column", 3, 3, 0.55, 0.55), thing("x", "chair", 1, 1, 1, 1)], solidDefs);
  assert.equal(walls.length, 1); // only solid kinds become obstacles
  assert.equal(walls[0].id, "solid:c");
  const out = settleItem(box(1, 3), { x: 5, y: 3 }, walls, "floor", true);
  near(out.x, 3 - 0.275 - 0.5, 0.006); // 1 cm minimum run on a square column: within half a centimetre of its exact face
  near(out.y, 3);
  assert.equal(hitsWall({ ...box(out.x, out.y), rot: out.rot }, walls), false);
});

test("an item dragged past a column slides along its face instead of stopping dead", () => {
  const walls = obstacleWalls([thing("c", "column", 3, 3, 0.55, 0.55)], solidDefs);
  const out = settleItem(box(1, 2.2), { x: 3.4, y: 3 }, walls, "floor", false);
  assert.ok(out.x <= 3 - 0.275 - 0.5 + 0.006, `x ${out.x}`);
  near(out.y, 3, 0.05);
  assert.equal(hitsWall({ ...box(out.x, out.y), rot: 0 }, walls), false);
});

test("a turned water column covers exactly its rotated footprint", () => {
  const [w] = obstacleWalls([thing("wc", "water_column", 2, 2, 0.45, 0.35, 90)], solidDefs);
  assert.deepEqual(sortedCorners(wallSlab(w)), sortedCorners(corners({ x: 2, y: 2, w: 0.45, d: 0.35, rot: 90 })));
  const [tall] = obstacleWalls([thing("t", "water_column", 2, 2, 0.35, 0.45)], solidDefs); // taller than wide, unturned
  assert.deepEqual(sortedCorners(wallSlab(tall)), sortedCorners(corners({ x: 2, y: 2, w: 0.35, d: 0.45, rot: 0 })));
});

test("the item being moved does not collide with itself", () => {
  const items = [thing("c", "column", 3, 3, 0.55, 0.55)];
  assert.equal(obstacleWalls(items, solidDefs).length, 1);
  const walls = obstacleWalls(items, solidDefs, "c");
  assert.deepEqual(walls, []);
  const out = settleItem(box(3, 3, 0.55, 0.55), { x: 3.3, y: 3 }, walls, "floor", false);
  near(out.x, 3.3);
});

test("a wall's own thickness decides how close an item may come", () => {
  const thick = { ...wall(0, 0, 6, 0), thickness: 0.4 };
  const out = settleItem(box(3, 2), { x: 3, y: -1 }, [thick], "floor", false);
  near(out.y, 0.2 + 0.25);
});

const eastWall = wall(0, 0, 4, 0); // runs west to east: "left" is the smaller-y (north) side
const near2 = (p: { x: number; y: number }, x: number, y: number) => { near(p.x, x); near(p.y, y); };

test("doorSwing: default hinge is at the a end and the leaf opens to the left (north) of a west-east wall", () => {
  const s = doorSwing({ t: 0.5, width: 1 }, eastWall);
  near2(s.hinge, 1.5, 0);
  near2(s.arcStart, 2.5, 0);
  near2(s.leafEnd, 1.5, -1);
  near2(s.normal, 0, -1);
  assert.equal(s.side, "left");
});

test("doorSwing: flipping hinge and side mirrors the leaf", () => {
  const s = doorSwing({ t: 0.5, width: 1, hinge: "end", swing: "right" }, eastWall);
  near2(s.hinge, 2.5, 0);
  near2(s.arcStart, 1.5, 0);
  near2(s.leafEnd, 2.5, 1);
  near2(s.normal, 0, 1);
});

test("doorSwing follows a wall running north to south", () => {
  const s = doorSwing({ t: 0.5, width: 0.8, swing: "left" }, wall(0, 0, 0, 4)); // walking south, left is east (+x)
  near2(s.hinge, 0, 1.6);
  near2(s.leafEnd, 0.8, 1.6);
});

test("swingFor opens toward the pointer's side and hinges at the nearer end, Shift flips the hinge", () => {
  assert.deepEqual(swingFor(eastWall, 0.5, { x: 3, y: 0.7 }), { hinge: "end", swing: "right" });
  assert.deepEqual(swingFor(eastWall, 0.5, { x: 1, y: -0.7 }), { hinge: "start", swing: "left" });
  assert.deepEqual(swingFor(eastWall, 0.5, { x: 1, y: -0.7 }, true), { hinge: "end", swing: "left" });
});

test("swingHitsFootprint flags furniture in the swept quarter disc only", () => {
  const s = doorSwing({ t: 0.5, width: 1 }, eastWall); // sweeps x 1.5..2.5, y -1..0
  assert.equal(swingHitsFootprint(s, 1, box(1.8, -0.5, 0.3, 0.3)), true);
  assert.equal(swingHitsFootprint(s, 1, box(1.8, 0.8, 0.3, 0.3)), false); // other side of the wall
  assert.equal(swingHitsFootprint(s, 1, box(2.45, -0.95, 0.1, 0.1)), false); // inside the square, outside the arc
});

test("collisionWalls only counts walls and solid items on the item's own level", () => {
  const levels = [{ id: "L0", name: "Ground", elevation: 0, height: 2.78 }, { id: "L1", name: "Upper", elevation: 2.78, height: 2.78 }];
  const plan = {
    levels,
    walls: [{ ...wall(0, 0, 6, 0, "w0") }, { ...wall(0, 5, 6, 5, "w1"), level: "L1" }],
    openings: [],
    rooms: [],
    items: [thing("col1", "column", 3, 3, 0.55, 0.55), { ...thing("colU", "column", 4, 3, 0.55, 0.55), level: "L1" }, { ...thing("chair", "chair", 1, 1, 0.5, 0.5), level: "L0" }],
  };
  const ids = (w: { id: string }[]) => w.map((x) => x.id).sort();
  assert.deepEqual(ids(collisionWalls(plan, "chair")), ["solid:col1", "w0"]);
  assert.deepEqual(ids(collisionWalls(plan, undefined, "L1")), ["solid:colU", "w1"]);
  assert.deepEqual(ids(collisionWalls(plan, "colU")), ["w1"]); // the moving item is excluded, level 0 things are not counted
});

test("settleItem: a drag may carry an item over a wall into any free spot, otherwise it still slides along the wall", () => {
  const two = [...room, wall(6, 0, 12, 0), wall(12, 0, 12, 4), wall(12, 4, 6, 4)]; // a second room east of the first, sharing x=6
  const over = settleItem(box(3, 2), { x: 9, y: 2 }, two, "floor", false, true);
  near(over.x, 9);
  const blockedByWall = settleItem(box(3, 2), { x: 6, y: 2 }, two, "floor", false, true); // pointer on the wall: the item does not fit there
  assert.ok(blockedByWall.x < 6 - H);
  const garden = settleItem(box(3, 2), { x: 20, y: 2 }, two, "floor", false, true); // past the building: free ground
  near(garden.x, 20);
  const back = settleItem(box(20, 2), { x: 3, y: 2 }, two, "floor", false, true); // and back inside
  near(back.x, 3);
  const noCarry = settleItem(box(3, 2), { x: 9, y: 2 }, two, "floor", false);
  assert.ok(noCarry.x < 6 - H);
});
