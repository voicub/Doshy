import test from "node:test";
import assert from "node:assert/strict";
import { FENCE_STYLES, fenceDefaults, fenceParts, isFence, restyleWall, shellWalls, wallHeight } from "./fences.ts";
import { planStats } from "./blueprint.ts";
import { WALL_H, normalizeOpening, planBounds } from "./geometry.ts";
import { WALLS, paintLevelWalls, paintWall, type Brush } from "./materials.ts";
import { STYLES_OF, styleSize, swings } from "./openings.ts";
import type { Plan, Wall } from "./types.ts";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<Wall> = {}): Wall => ({ id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster", ...extra });
const brush = (id: Wall["style"], color: string | null = null): Brush => ({ material: { kind: "wall", id }, color });

test("garden styles are fences, house wall styles are not, and every fence has a positive default size", () => {
  for (const s of FENCE_STYLES) {
    assert.ok(isFence(s) && WALLS[s].label, s);
    const d = fenceDefaults(s);
    assert.ok(d.height > 0 && d.thickness > 0, s);
  }
  for (const s of ["plaster", "brick", "glass", "stone", undefined] as const) assert.ok(!isFence(s), String(s));
});

test("a wall stands as tall as its own height, else the storey's", () => {
  assert.equal(wallHeight(wall("a", 0, 0, 1, 0), WALL_H), WALL_H);
  assert.equal(wallHeight(wall("a", 0, 0, 1, 0, { height: 1.2 }), WALL_H), 1.2);
});

test("fences are not the building: bounds and wall area ignore them", () => {
  const house = wall("h", 0, 0, 4, 0);
  const far = wall("f", 20, 20, 30, 20, { style: "hedge", ...fenceDefaults("hedge") });
  const plan: Plan = { walls: [house, far], openings: [], rooms: [], items: [] };
  assert.deepEqual(shellWalls(plan.walls), [house]);
  assert.deepEqual(planBounds(plan), { x0: 0, y0: 0, x1: 4, y1: 0 });
  assert.ok(Math.abs(planStats(plan).walls - 4 * 0.12) < 1e-9);
  // a plan with only a fence falls back to its rooms and items instead of framing the fence
  assert.equal(planBounds({ ...plan, walls: [far] }), null);
});

test("painting a wall with a fence style gives it the fence height and thickness on both faces", () => {
  const out = paintWall(wall("w", 0, 0, 5, 0), "A", brush("fence_picket"));
  assert.equal(out.style, "fence_picket");
  assert.equal(out.height, 1.0);
  assert.equal(out.thickness, 0.05);
  assert.equal(out.styleB, undefined); // one material through and through
});

test("a plain wall with its own height keeps it when it becomes a fence, and leaving a fence drops the fence size", () => {
  const tall = paintWall(wall("w", 0, 0, 5, 0, { height: 2.2 }), "both", brush("fence_panel"));
  assert.equal(tall.height, 2.2);
  const fence = paintWall(wall("w", 0, 0, 5, 0), "both", brush("fence_picket"));
  const swapped = paintWall(fence, "both", brush("hedge"));
  assert.deepEqual([swapped.height, swapped.thickness], [1.4, 0.6]);
  const plain = paintWall(fence, "both", brush("plaster"));
  assert.equal(plain.style, "plaster");
  assert.ok(!("height" in plain) && !("thickness" in plain));
  // changing between two house materials never touches a custom thickness
  assert.equal(paintWall(wall("w", 0, 0, 5, 0, { thickness: 0.3 }), "A", brush("brick")).thickness, 0.3);
});

test("recolouring a fence colours both sides and keeps its size", () => {
  const fence = paintWall(wall("w", 0, 0, 5, 0), "both", brush("fence_wire"));
  const green = paintWall(fence, "A", { material: null, color: "#a9b8a0" });
  assert.equal(green.color, "#a9b8a0");
  assert.equal(green.styleB, undefined);
  assert.equal(green.height, 1.2);
});

test("painting every wall of a level leaves fences alone", () => {
  const fence = wall("f", 0, 0, 5, 0, { style: "fence_picket", ...fenceDefaults("fence_picket") });
  const plan: Plan = { walls: [wall("h", 0, 3, 5, 3), fence], openings: [], rooms: [], items: [] };
  const out = paintLevelWalls(plan, "L0", "all", brush("brick"));
  assert.equal(out.walls[0].style, "brick");
  assert.equal(out.walls[1], fence);
});

test("restyleWall changes nothing when the style stays", () => {
  const w = wall("w", 0, 0, 5, 0, { style: "hedge", height: 2 });
  assert.equal(restyleWall(w, w), w);
});

test("a picket fence has real gaps between its pickets and posts at least every 2.2 m", () => {
  const { posts, fill } = fenceParts("fence_picket", 0, 6, 1.0, 0.05);
  const pickets = fill.filter((p) => p.sy > 0.5).sort((a, b) => a.x - b.x);
  assert.ok(pickets.length > 30);
  for (let i = 1; i < pickets.length; i++) assert.ok(pickets[i].x - pickets[i].sx / 2 - (pickets[i - 1].x + pickets[i - 1].sx / 2) > 0.02, "gap between pickets");
  const xs = posts.map((p) => p.x).sort((a, b) => a - b);
  assert.equal(xs[0], 0);
  assert.equal(xs.at(-1), 6);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] <= 2.2 + 1e-9);
});

test("a wire fence is posts and thin wires, never a solid panel", () => {
  const { posts, fill } = fenceParts("fence_wire", 0, 4, 1.2, 0.04);
  assert.ok(posts.length >= 3 && fill.length > 20);
  for (const p of fill) assert.ok(Math.min(p.sx, p.sy) <= 0.03, "every wire piece is thin");
  const covered = fill.reduce((a, p) => a + Math.max(p.sx, p.sy) * Math.min(p.sx, p.sy), 0);
  assert.ok(covered < 0.2 * 4 * 1.2, "most of the fence is open air");
});

test("every part stays within its segment and above ground", () => {
  for (const style of ["fence_picket", "fence_wire", "fence_panel"] as const) {
    const { posts, fill } = fenceParts(style, 1, 3.4, 1.1, 0.05);
    for (const p of [...posts, ...fill]) {
      assert.ok(p.x - p.sx / 2 >= 1 - 0.05 && p.x + p.sx / 2 <= 3.4 + 0.05, `${style} x`);
      assert.ok(p.y - p.sy / 2 >= -1e-9, `${style} y`);
    }
  }
});

test("stone, brick and hedge are solid volumes: no parts; a degenerate segment has none either", () => {
  for (const style of ["wall_stone", "wall_brick_low", "hedge", "plaster"] as const) assert.deepEqual(fenceParts(style, 0, 4, 1, 0.3), { posts: [], fill: [] });
  assert.deepEqual(fenceParts("fence_picket", 2, 2, 1, 0.05), { posts: [], fill: [] });
});

test("gates: a garden gate is 0.9 to 1.2 m wide, a wicket 0.8 m, both swing, and a gate fits under a low fence", () => {
  assert.ok(STYLES_OF.door.includes("gate") && STYLES_OF.door.includes("wicket"));
  const gate = styleSize("gate");
  assert.ok(gate.width >= 0.9 && gate.width <= 1.2 && gate.height === 1.0 && gate.sill === 0);
  assert.equal(styleSize("wicket").width, 0.8);
  assert.ok(swings({ type: "door", style: "gate" }) && swings({ type: "door", style: "wicket" }));
  const low = normalizeOpening({ t: 0.5, width: gate.width, sill: 0, height: gate.height }, 5, wallHeight({ height: 0.6 }, WALL_H));
  assert.equal(low.height, 0.6);
  assert.equal(normalizeOpening({ t: 0.5, width: gate.width, sill: 0, height: gate.height }, 5, wallHeight({}, WALL_H)).height, 1.0);
});
