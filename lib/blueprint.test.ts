import test from "node:test";
import assert from "node:assert/strict";
import { gridLevels, openingTags, outsideNormal, planStats, roomArea, scaleDenominator, wallAxes, wallBounds } from "./blueprint.ts";
import { starterPlan } from "./starterPlan.ts";
import type { Plan, Wall } from "./types.ts";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number, thickness?: number): Wall => ({ id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster", ...(thickness ? { thickness } : {}) });
const room = (id: string, x: number, y: number, w: number, h: number, parent?: string) => ({ id, name: id, x, y, w, h, floor: "wood" as const, color: "#fff", ...(parent ? { parent } : {}) });

test("zooming in reveals finer paper rulings, zooming out drops them", () => {
  const far = gridLevels(0.05).map((l) => l.step); // 5 cm per pixel: a 1 m ruling is 20 px apart
  const near = gridLevels(0.001).map((l) => l.step); // 1 mm per pixel
  assert.ok(!far.includes(0.01) && !far.includes(0.05) && far.includes(1));
  assert.deepEqual(near.slice(0, 3), [0.01, 0.05, 0.1]);
  assert.ok(gridLevels(0.001).every((l) => l.alpha > 0 && l.alpha <= 0.55));
});

test("a ruling fades in instead of popping: absent when too dense, full strength 18 px apart", () => {
  assert.equal(gridLevels(0.1 / 5).find((l) => l.step === 0.1), undefined);
  const full = gridLevels(0.1 / 18).find((l) => l.step === 0.1)!;
  assert.ok(Math.abs(full.alpha - 0.22) < 1e-9);
});

test("the drawing scale is a standard architectural one", () => {
  assert.equal(scaleDenominator(0.0264583), 100); // 1 px = 26.5 mm of plan: 1 mm of paper = 100 mm
  assert.equal(scaleDenominator(0.00264583), 10);
});

test("a wall's outside is the face with no room behind it; interior walls have none", () => {
  const plan = { rooms: [room("r", 0, 0, 4, 3)] } as Pick<Plan, "rooms">;
  const south = outsideNormal(plan, wall("s", -0.06, 3.06, 4.06, 3.06))!;
  assert.deepEqual([Math.round(south.x) + 0, Math.round(south.y) + 0], [0, 1]); // outside is below the room
  const north = outsideNormal(plan, wall("n", -0.06, -0.06, 4.06, -0.06))!;
  assert.deepEqual([Math.round(north.x) + 0, Math.round(north.y) + 0], [0, -1]);
  const twin = { rooms: [...plan.rooms, room("q", 4.12, 0, 3, 3)] } as Pick<Plan, "rooms">;
  assert.equal(outsideNormal(twin, wall("m", 4.06, 0, 4.06, 3)), null);
});

test("grid axes merge wall lines that nearly coincide", () => {
  const axes = wallAxes([wall("a", 0, 0, 0, 5), wall("b", 0.1, 5, 0.1, 8), wall("c", 4, 0, 4, 5), wall("d", 0, 5, 4, 5)]);
  assert.equal(axes.xs.length, 2);
  assert.ok(Math.abs(axes.xs[0] - 0.05) < 1e-9);
  assert.deepEqual(axes.ys, [5]);
});

test("wall bounds include thickness; a room's area includes its alcoves but not door-threshold strips", () => {
  assert.deepEqual(wallBounds([wall("a", 0, 0, 4, 0, 0.2)]), { x0: -0.1, y0: -0.1, x1: 4.1, y1: 0.1 });
  const plan = { rooms: [room("p", 0, 0, 3, 2), room("alcove", 3, 0, 1, 1, "p"), room("sill", 0, 2, 0.9, 0.12, "p")] } as Pick<Plan, "rooms">;
  assert.ok(Math.abs(roomArea(plan, plan.rooms[0]) - 7) < 1e-9);
});

test("openings are tagged D1.. and W1.. and the starter flat's totals are sane", () => {
  const plan = starterPlan();
  const tags = Object.values(openingTags(plan));
  assert.equal(tags.length, plan.openings.length);
  assert.equal(new Set(tags).size, tags.length);
  assert.ok(tags.includes("D1") && tags.includes("W1"));
  const s = planStats(plan);
  assert.ok(s.net > 40 && s.net < 120, `net area ${s.net}`);
  assert.ok(s.walls > 5 && s.walls < 40);
});
