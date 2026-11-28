import test from "node:test";
import assert from "node:assert/strict";
import { FENCE_STYLES, fenceDefaults, fenceParts, isFence, isSeeThroughFence, isSolidFence, restyleWall, shellWalls, wallHeight } from "./fences.ts";
import { gateFor } from "./gates.ts";
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

const OPEN_STYLES = FENCE_STYLES.filter((s) => !isSolidFence(s) && s !== "hedge");

test("every open style stays within its segment, above ground, with posts evenly spaced and never more than their gap apart", () => {
  for (const style of OPEN_STYLES) {
    for (const coarse of [false, true]) {
      const { posts, fill, extra } = fenceParts(style, 1, 6.6, 1.2, 0.05, coarse);
      assert.ok(posts.length >= 3 && fill.length > 0, style);
      for (const p of [...posts, ...fill, ...extra]) {
        assert.ok(p.x - p.sx / 2 >= 1 - 0.05 && p.x + p.sx / 2 <= 6.6 + 0.05, `${style} x`);
        assert.ok(p.y - p.sy / 2 >= -1e-9, `${style} y`);
      }
      const xs = posts.map((p) => p.x).sort((a, b) => a - b);
      const gaps = xs.slice(1).map((x, i) => x - xs[i]);
      assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1e-9 && Math.max(...gaps) <= 3.0 + 1e-9, `${style} posts`);
    }
  }
});

test("a longer fence has more posts, and tiny, empty or very tall spans are safe", () => {
  for (const style of OPEN_STYLES) {
    assert.ok(fenceParts(style, 0, 20, 1.2, 0.05).posts.length > fenceParts(style, 0, 2, 1.2, 0.05).posts.length, style);
    assert.deepEqual(fenceParts(style, 2, 2, 1, 0.05), { posts: [], fill: [], extra: [] });
    fenceParts(style, 0, 0.03, 1.2, 0.05).fill.forEach((p) => assert.ok(Number.isFinite(p.sx) && p.sx > 0, `${style} tiny`));
    assert.ok(fenceParts(style, 0, 3, 500, 0.05).fill.length < 600, `${style} tall`);
  }
});

test("the Eco look uses fewer infill parts and drops the extras", () => {
  for (const style of ["fence_bar", "fence_iron", "fence_bamboo"] as const) {
    const fine = fenceParts(style, 0, 4, 1.4, 0.05);
    const coarse = fenceParts(style, 0, 4, 1.4, 0.05, true);
    assert.ok(coarse.fill.length < fine.fill.length, style);
    assert.equal(coarse.extra.length, 0, style);
  }
  assert.ok(fenceParts("fence_iron", 0, 4, 1.4, 0.05).extra.length > 0, "finials");
});

test("a glass fence is panes between posts, a slat fence is horizontal, an electric fence has three thin lines", () => {
  const glass = fenceParts("fence_glass", 0, 3.2, 1.1, 0.04);
  assert.equal(glass.fill.length, glass.posts.length - 1);
  const slat = fenceParts("fence_slat", 0, 3, 1.5, 0.05).fill;
  assert.ok(slat.every((p) => p.sx > p.sy * 5));
  const tape = fenceParts("fence_electric", 0, 3, 1.1, 0.03).fill;
  assert.equal(tape.length, 3);
  assert.ok(tape.every((p) => p.sy <= 0.03));
});

test("solid walls, hedges and house styles are volumes: no parts", () => {
  for (const style of ["wall_stone", "wall_brick_low", "wall_block", "hedge", "plaster"] as const) assert.deepEqual(fenceParts(style, 0, 4, 1, 0.3), { posts: [], fill: [], extra: [] });
});

test("only the slabs are solid; every style the fade can see past is open", () => {
  assert.deepEqual(FENCE_STYLES.filter(isSolidFence), ["wall_stone", "wall_brick_low", "wall_block"]);
  for (const s of FENCE_STYLES.filter(isSeeThroughFence)) assert.ok(!isSolidFence(s) && s !== "hedge", s);
  assert.ok(isSeeThroughFence("glass") && !isSeeThroughFence("fence_panel"));
});

test("restyling a wall between any two fence styles round-trips through the plain look", () => {
  const plain = wall("w", 0, 0, 5, 0);
  for (const s of FENCE_STYLES) {
    const fenced = restyleWall(plain, { ...plain, style: s });
    assert.deepEqual([fenced.height, fenced.thickness], [fenceDefaults(s).height, fenceDefaults(s).thickness], s);
    assert.deepEqual(restyleWall(fenced, { ...fenced, style: "plaster" }), plain, s);
  }
});

test("a gate goes in the middle, then beside it, and is refused when no free stretch is wide enough", () => {
  const fence = wall("f", 0, 0, 6, 0, { style: "fence_picket", ...fenceDefaults("fence_picket") });
  const first = gateFor(fence, [], "garden");
  assert.ok(first);
  assert.equal(first.t, 0.5);
  assert.equal(first.height, 1.0); // never taller than the fence
  assert.equal(first.sill, 0);
  const second = gateFor(fence, [{ ...first, id: "g1" }], "garden");
  assert.ok(second && Math.abs(second.t * 6 - 3) >= first.width - 1e-9, "beside, not on top of, the first");
  assert.equal(gateFor(wall("s", 0, 0, 2, 0, { style: "fence_picket" }), [], "driveway"), null);
  assert.equal(gateFor(wall("t", 0, 0, 2, 0, { style: "fence_picket" }), [{ ...first, wallId: "t", t: 0.5, width: 1.5, id: "x" }], "garden"), null);
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
