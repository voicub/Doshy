import test from "node:test";
import assert from "node:assert/strict";
import { applyAdditions } from "./additions.ts";
import { CATALOG } from "./catalog.ts";
import { WALL_T } from "./geometry.ts";
import { onLevel, planOfLevel } from "./levels.ts";
import { MAX_LEVEL_HEIGHT, MIN_LEVEL_HEIGHT, doorSwingBlockers, openingEnd, openingStart, overlappingLevels, withDefaultLevels } from "./planOps.ts";
import { classify, corners, doorSwing, hitsWall, separation, swingHitsFootprint } from "./placement.ts";
import { TEMPLATES, footprintArea } from "./templates.ts";
import type { Item, Plan, Room, Wall } from "./types.ts";

const byId = (id: string) => TEMPLATES.find((t) => t.id === id)!;
const eps = 1e-6;
const isFloorItem = (i: Item) => classify({ wall: CATALOG[i.kind].wall, h: i.h }, i.kind) === "floor" && !i.elev;
const wallLen = (w: Wall) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);

for (const t of TEMPLATES) {
  const plan = t.build();
  const levelIds = plan.levels!.map((l) => l.id);
  const content = (p: Plan, id: string) => onLevel(p, id);

  test(`${t.id}: building type and levels are valid and every entity sits on one`, () => {
    assert.ok(plan.building?.type === "apartment" || plan.building?.type === "house");
    assert.equal(new Set(levelIds).size, levelIds.length);
    assert.deepEqual(overlappingLevels(plan.levels!), []);
    for (const l of plan.levels!) assert.ok(l.height >= MIN_LEVEL_HEIGHT && l.height <= MAX_LEVEL_HEIGHT && Number.isFinite(l.elevation));
    for (const e of [...plan.walls, ...plan.openings, ...plan.rooms, ...plan.items]) assert.ok(e.level && levelIds.includes(e.level), "entity has a known level");
    assert.equal(withDefaultLevels(plan), plan, "levels and building are already complete");
  });

  test(`${t.id}: a reloaded plan receives none of the owner's flat additions`, () => {
    assert.equal(applyAdditions(plan), plan);
  });

  test(`${t.id}: openings sit on a wall of their level, inside it, and never overlap`, () => {
    for (const o of plan.openings) {
      const w = plan.walls.find((x) => x.id === o.wallId);
      assert.ok(w, "opening references an existing wall");
      assert.equal(o.level, w.level);
      assert.ok(openingStart(o, wallLen(w)) > 0.05 && openingEnd(o, wallLen(w)) > 0.05, `${o.type} fits its wall`);
      if (o.type === "door") assert.ok(o.hinge && o.swing, "door has hinge and swing");
      assert.ok(o.sill + o.height <= plan.levels!.find((l) => l.id === o.level)!.height - 0.2, "opening stays under the ceiling");
    }
    for (const w of plan.walls) {
      const on = plan.openings.filter((o) => o.wallId === w.id).map((o) => [openingStart(o, wallLen(w)), wallLen(w) - openingEnd(o, wallLen(w))]).sort((a, b) => a[0] - b[0]);
      on.slice(1).forEach(([s], i) => assert.ok(s >= on[i][1] + 0.1, "openings leave solid wall between them"));
    }
  });

  test(`${t.id}: items use catalog kinds and lie wholly inside a room of their level`, () => {
    for (const i of plan.items) {
      const d = CATALOG[i.kind];
      assert.ok(d, `catalog has ${i.kind}`);
      assert.deepEqual([i.w, i.d, i.h], [d.w, d.d, d.h]);
      const rooms = content(plan, i.level!).rooms;
      const c = corners(i);
      assert.ok(rooms.some((r) => c.every((q) => q.x >= r.x - 1e-3 && q.x <= r.x + r.w + 1e-3 && q.y >= r.y - 1e-3 && q.y <= r.y + r.h + 1e-3)), `${i.kind} at ${i.x},${i.y} lies inside one room`);
    }
  });

  test(`${t.id}: no two rooms of a level overlap`, () => {
    const parents = (r: Room) => !r.parent;
    for (const id of levelIds) {
      const rooms = content(plan, id).rooms.filter(parents);
      rooms.forEach((a, i) => rooms.slice(i + 1).forEach((b) => assert.ok(a.x + a.w <= b.x + eps || b.x + b.w <= a.x + eps || a.y + a.h <= b.y + eps || b.y + b.h <= a.y + eps, `${a.name} overlaps ${b.name}`)));
    }
  });

  test(`${t.id}: every indoor room is walled on all four sides and has a door and a window`, () => {
    const H = WALL_T / 2;
    for (const r of plan.rooms.filter((r) => r.floor !== "grass")) {
      const walls = content(plan, r.level!).walls;
      const covers = (horiz: boolean, c: number, lo: number, hi: number) =>
        walls.some((w) => (horiz ? w.a.y === w.b.y && Math.abs(w.a.y - c) < eps : w.a.x === w.b.x && Math.abs(w.a.x - c) < eps) && Math.min(horiz ? w.a.x : w.a.y, horiz ? w.b.x : w.b.y) <= lo + eps && Math.max(horiz ? w.a.x : w.a.y, horiz ? w.b.x : w.b.y) >= hi - eps);
      assert.ok(covers(true, r.y - H, r.x - H, r.x + r.w + H), `${r.name} north`);
      assert.ok(covers(true, r.y + r.h + H, r.x - H, r.x + r.w + H), `${r.name} south`);
      assert.ok(covers(false, r.x - H, r.y - H, r.y + r.h + H), `${r.name} west`);
      assert.ok(covers(false, r.x + r.w + H, r.y - H, r.y + r.h + H), `${r.name} east`);
      // an opening belongs to a room when its wall runs along one of the room's edges within its span
      const near = (type: string) => content(plan, r.level!).openings.filter((o) => o.type === type).some((o) => {
        const w = walls.find((x) => x.id === o.wallId)!;
        const p = { x: w.a.x + (w.b.x - w.a.x) * o.t, y: w.a.y + (w.b.y - w.a.y) * o.t };
        return p.x >= r.x - H - eps && p.x <= r.x + r.w + H + eps && p.y >= r.y - H - eps && p.y <= r.y + r.h + H + eps;
      });
      assert.ok(near("door"), `${r.name} has a door`);
      assert.ok(near("window"), `${r.name} has a window`);
    }
  });

  test(`${t.id}: no door swing is blocked by a wall or by furniture`, () => {
    for (const o of plan.openings.filter((o) => o.type === "door")) {
      const level = planOfLevel(plan, o.level!);
      const host = level.walls.find((w) => w.id === o.wallId)!;
      const sw = doorSwing(o, host);
      for (const w of level.walls.filter((w) => w.id !== host.id)) {
        const f = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2, w: wallLen(w), d: w.thickness ?? WALL_T, rot: w.a.y === w.b.y ? 0 : 90 };
        assert.ok(!swingHitsFootprint(sw, o.width, f), `door ${o.id} swings into a wall`);
      }
      assert.deepEqual(doorSwingBlockers(level, o).map((i) => i.kind), []);
    }
  });

  test(`${t.id}: floor furniture clears the walls and other furniture`, () => {
    for (const id of levelIds) {
      const here = content(plan, id);
      const floor = here.items.filter(isFloorItem);
      for (const i of floor) assert.ok(!hitsWall(i, here.walls), `${i.kind} at ${i.x},${i.y} cuts a wall`);
      floor.forEach((a, n) => floor.slice(n + 1).forEach((b) => assert.equal(separation(corners(a), corners(b)), null, `${a.kind} overlaps ${b.kind} near ${a.x},${a.y}`)));
    }
  });

  test(`${t.id}: every build is a fresh plan with its own ids`, () => {
    const again = t.build();
    const ids = (p: Plan) => new Set([...p.walls, ...p.rooms, ...p.items].map((e) => e.id));
    assert.ok([...ids(plan)].every((id) => !ids(again).has(id)));
  });
}

test("blank templates are empty but still carry a building type and levels", () => {
  const flat = byId("blank-apartment").build();
  const house = byId("blank-house").build();
  for (const p of [flat, house]) assert.deepEqual([p.walls.length, p.openings.length, p.rooms.length, p.items.length], [0, 0, 0, 0]);
  assert.deepEqual([flat.building?.type, flat.levels?.length], ["apartment", 1]);
  assert.deepEqual([house.building?.type, house.levels?.length], ["house", 2]);
  assert.equal(footprintArea(flat), 0);
});

test("template sizes match their names", () => {
  const studio = footprintArea(byId("studio").build());
  const flat = footprintArea(byId("two-bedroom").build());
  const house = byId("family-house").build();
  assert.ok(studio > 26 && studio < 30, `studio ${studio}`);
  assert.ok(flat > 56 && flat < 64, `two-bedroom ${flat}`);
  // the footprint of a house counts walls too: its indoor floor plus the wall ring is about 120 m2
  assert.ok(footprintArea(house) > 105 && footprintArea(house) < 125);
  assert.equal(house.levels?.length, 2);
  assert.equal(house.building?.type, "house");
});

test("the family house has a brick shell on both floors, plaster inside and a grass garden", () => {
  const house = byId("family-house").build();
  const xs = house.walls.flatMap((w) => [w.a.x, w.b.x]);
  const ys = house.walls.flatMap((w) => [w.a.y, w.b.y]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (const w of house.walls) {
    const shell = w.a.x === w.b.x ? w.a.x === x0 || w.a.x === x1 : w.a.y === y0 || w.a.y === y1;
    assert.equal(w.style, shell ? "brick" : "plaster");
  }
  assert.ok(house.rooms.some((r) => r.floor === "grass" && r.level === "L0"));
  assert.equal(house.rooms.filter((r) => r.level === "L1").length, 6);
});
