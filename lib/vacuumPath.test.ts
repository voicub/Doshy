import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "./catalog.ts";
import { firstLevelId, onLevel } from "./levels.ts";
import { classify, corners } from "./placement.ts";
import { starterPlan } from "./starterPlan.ts";
import { TEMPLATES } from "./templates.ts";
import { CELL, ROBOT_R, buildGrid, buildWorld, cellOf, coverage, findPath, makeRoute, nearestFree, pathToPark, pointAt, type World } from "./vacuumPath.ts";
import type { Item, Plan, Pt } from "./types.ts";

const robot = (x: number, y: number, level?: string): Item => ({ id: "vac", kind: "ap_robot_vacuum", x, y, rot: 0, w: 0.34, d: 0.34, h: 0.09, ...(level ? { level } : {}) });

/** A vacuum standing on the free floor of the room (of the biggest few) from which it can reach the most. */
function worldOf(plan: Plan): { world: World; vac: Item } {
  let best: { world: World; vac: Item } | undefined;
  const rooms = [...plan.rooms].filter((r) => r.floor !== "grass" && !r.parent).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 4);
  for (const room of rooms) {
    const grid = buildGrid(plan, room.level ?? firstLevelId(plan), (i) => i.kind === "ap_robot_vacuum");
    if (!grid || nearestFree(grid, { x: room.x + room.w / 2, y: room.y + room.h / 2 }, 3) < 0) continue;
    const vac = robot(room.x + room.w / 2, room.y + room.h / 2, room.level);
    const world = buildWorld(plan, vac);
    if (world && (!best || world.clean.len > best.world.clean.len)) best = { world, vac };
  }
  assert.ok(best, "a world");
  return best;
}

const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
};
/** Distance from p to a convex polygon (0 inside). */
const polyDist = (p: Pt, poly: Pt[]) => {
  const inside = poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;
  }) || poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) <= 0;
  });
  return inside ? 0 : Math.min(...poly.map((a, i) => segDist(p, a, poly[(i + 1) % poly.length])));
};

const TOL = 0.006;

/** Independent of the grid: is the point at least ROBOT_R from every solid piece of wall (a wall cut at its doors) and every floor item? */
function assertClear(plan: Plan, levelId: string, p: Pt, ignore: (i: Item) => boolean, what: string) {
  const lv = onLevel(plan, levelId);
  for (const w of lv.walls) {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const t = w.thickness ?? 0.12;
    const ux = (w.b.x - w.a.x) / len;
    const uy = (w.b.y - w.a.y) / len;
    const doors = lv.openings.filter((o) => o.wallId === w.id && o.type === "door").sort((a, b) => a.t - b.t);
    const cuts = [-t / 2, ...doors.flatMap((o) => [o.t * len - o.width / 2, o.t * len + o.width / 2]), len + t / 2];
    for (let k = 0; k < cuts.length; k += 2) {
      const [a, b] = [cuts[k], cuts[k + 1]];
      const at = (s: number, n: number) => ({ x: w.a.x + ux * s - uy * n, y: w.a.y + uy * s + ux * n });
      const piece = [at(a, -t / 2), at(b, -t / 2), at(b, t / 2), at(a, t / 2)];
      assert.ok(polyDist(p, piece) >= ROBOT_R - TOL, `${what}: ${p.x.toFixed(2)},${p.y.toFixed(2)} is closer than the robot radius to a wall`);
    }
  }
  for (const it of lv.items) {
    const def = CATALOG[it.kind];
    if (!def || ignore(it) || classify(def, it.kind) !== "floor" || (it.elev ?? 0) > 0.15) continue;
    assert.ok(polyDist(p, corners(it)) >= ROBOT_R - TOL, `${what}: ${p.x.toFixed(2)},${p.y.toFixed(2)} touches ${it.kind}`);
  }
}

test("every template yields a coverage path over free floor that covers nearly all of it", () => {
  for (const t of TEMPLATES) {
    const plan = t.build();
    if (!plan.rooms.some((r) => r.floor !== "grass")) continue;
    const { world } = worldOf(plan);
    assert.ok(world.clean.pts.length > 2, t.id);
    const cov = coverage(world.grid, world.reach, world.clean.pts);
    assert.ok(cov >= 0.95, `${t.id}: coverage ${cov.toFixed(3)}`);
  }
});

test("the lap never gets closer to a wall or to furniture than the robot's radius", () => {
  for (const id of ["studio", "two-bedroom", "family-house"]) {
    const plan = TEMPLATES.find((t) => t.id === id)!.build();
    const { world } = worldOf(plan);
    const r = world.clean;
    for (let s = 0; s < r.len; s += 0.05) assertClear(plan, world.levelId, pointAt(r, s), () => false, id);
  }
});

test("furniture on the floor blocks the robot; a rug does not", () => {
  const plan = TEMPLATES.find((t) => t.id === "studio")!.build();
  const level = firstLevelId(plan);
  const grid = buildGrid(plan, level)!;
  let blockers = 0;
  for (const it of onLevel(plan, level).items) {
    const def = CATALOG[it.kind];
    if (!def) continue;
    const c = cellOf(grid, { x: it.x, y: it.y });
    if (classify(def, it.kind) === "floor" && !(it.elev && it.elev > 0.15)) (blockers++, assert.equal(grid.free[c], 0, `${it.kind} should block`));
  }
  assert.ok(blockers > 2);
  const rugKind = Object.keys(CATALOG).find((k) => classify(CATALOG[k], k) === "flat");
  assert.ok(rugKind, "the catalog has a flat piece");
  const room = plan.rooms.find((r) => r.floor !== "grass")!;
  const rug: Item = { id: "rug", kind: rugKind, x: room.x + room.w / 2, y: room.y + room.h / 2, rot: 0, w: CATALOG[rugKind].w, d: CATALOG[rugKind].d, h: CATALOG[rugKind].h };
  const withRug = buildGrid({ ...plan, items: [...plan.items, rug] }, level)!;
  assert.deepEqual(withRug.free, grid.free);
});

test("the same plan always gives the same path", () => {
  const plan = TEMPLATES.find((t) => t.id === "two-bedroom")!.build();
  const { world, vac } = worldOf(plan);
  assert.deepEqual(buildWorld(plan, vac)!.clean.pts, world.clean.pts);
});

test("the way home ends on the parking spot, is shorter than the lap and keeps clear of walls", () => {
  const plan = TEMPLATES.find((t) => t.id === "two-bedroom")!.build();
  const { world } = worldOf(plan);
  const far = world.clean.pts[Math.floor(world.clean.pts.length * 0.8)];
  const home = pathToPark(world, far)!;
  assert.ok(home, "a path home exists");
  const end = home[home.length - 1];
  assert.ok(Math.hypot(end.x - world.park.x, end.y - world.park.y) < 1e-6);
  const route = makeRoute(home);
  for (let s = 0; s < route.len; s += 0.05) assertClear(plan, world.levelId, pointAt(route, s), () => false, "home");
  assert.ok(route.len < world.clean.len / 2);
});

test("the robot only crosses between rooms through a door and cleans every room it can reach", () => {
  const plan = TEMPLATES.find((t) => t.id === "two-bedroom")!.build();
  const { world } = worldOf(plan);
  const g = world.grid;
  for (let c = 0; c < g.free.length; c++) {
    if (!g.free[c] || g.door[c]) continue;
    const p = { x: g.x0 + ((c % g.nx) + 0.5) * CELL, y: g.y0 + (Math.floor(c / g.nx) + 0.5) * CELL };
    assert.ok(plan.rooms.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h), `free cell outside every room and not a doorway: ${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  const rooms = plan.rooms.filter((r) => !r.parent && r.floor !== "grass");
  const visited = rooms.filter((r) => world.clean.pts.some((p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h));
  assert.equal(visited.length, rooms.length, "every room of the flat is visited");
});

test("a wall with no door keeps the robot in: closing every door confines it to one room", () => {
  const plan = TEMPLATES.find((t) => t.id === "two-bedroom")!.build();
  const walled: Plan = { ...plan, openings: plan.openings.filter((o) => o.type !== "door") };
  const { world: open } = worldOf(plan);
  const { world: shut } = worldOf(walled);
  const area = (w: World) => w.reach.reduce((a, b) => a + b, 0);
  assert.ok(area(shut) < area(open) * 0.6);
});

test("the owner's flat can be cleaned end to end", () => {
  const plan = starterPlan();
  const { world } = worldOf(plan);
  assert.ok(coverage(world.grid, world.reach, world.clean.pts) >= 0.9);
  assert.ok(findPath(world.grid, world.clean.pts[1], world.park));
});

test("a level without an indoor room gives no world", () => {
  const plan = TEMPLATES.find((t) => t.id === "blank-house")!.build();
  assert.equal(buildWorld(plan, robot(1, 1)), null);
});
