import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, isPillar } from "./catalog.ts";
import { PILLAR_PRESETS, addPillar, fullHeight, isRoundPillar, pillarAt, resizePillar, snapPillar, viewPicksItem } from "./pillars.ts";
import { withDefaultLevels } from "./planOps.ts";
import { starterPlan } from "./starterPlan.ts";
import type { Item, Wall } from "./types.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const wall = (x1: number, y1: number, x2: number, y2: number): Wall => ({ id: "w", a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster" });

test("isPillar: columns and the plumbing riser are pillars, other solid parts are not", () => {
  for (const k of ["column", "column_round", "bt_water_column"]) assert.equal(isPillar(k), true, k);
  for (const k of ["balcony_railing", "chair", "no_such_kind"]) assert.equal(isPillar(k), false, k);
  const stairs = Object.keys(CATALOG).filter((k) => CATALOG[k].stair);
  assert.ok(stairs.length > 0 && stairs.every((k) => !isPillar(k)), "stairs are solid but not pillars");
  assert.ok(Object.keys(CATALOG).filter(isPillar).every((k) => CATALOG[k].solid), "every pillar still blocks furniture");
  assert.equal(isRoundPillar("column_round"), true);
  assert.equal(isRoundPillar("column"), false);
});

test("the starter flat's columns and riser are pillars", () => {
  const plan = starterPlan();
  const kinds = plan.items.filter((i) => isPillar(i.kind)).map((i) => i.kind);
  assert.equal(kinds.filter((k) => k === "column").length, 4);
  assert.equal(kinds.filter((k) => k === "bt_water_column").length, 1);
});

test("Plan mode selects pillars only; Furniture and Home Assistant select everything but pillars; Live selects nothing", () => {
  assert.equal(viewPicksItem("plan", "column"), true);
  assert.equal(viewPicksItem("plan", "bt_water_column"), true);
  assert.equal(viewPicksItem("plan", "chair"), false);
  assert.equal(viewPicksItem("plan", "balcony_railing"), false);
  for (const v of ["furniture", "ha"]) {
    assert.equal(viewPicksItem(v, "column"), false, v);
    assert.equal(viewPicksItem(v, "chair"), true, v);
  }
  assert.equal(viewPicksItem("live", "chair"), false);
  assert.equal(viewPicksItem("live", "column"), false);
});

test("every preset is a pillar kind and the ids are unique", () => {
  assert.ok(PILLAR_PRESETS.every((p) => isPillar(p.kind)));
  assert.equal(new Set(PILLAR_PRESETS.map((p) => p.id)).size, PILLAR_PRESETS.length);
});

test("snapPillar: grid, wall ends, wall centre lines, Alt-free", () => {
  const walls = [wall(0, 0, 6, 0), wall(6, 0, 6, 4)];
  assert.deepEqual(snapPillar({ x: 3.02, y: 2.03 }, walls, 0.05), { x: 3, y: 2.05 }, "open floor: grid only");
  assert.deepEqual(snapPillar({ x: 6.1, y: 0.1 }, walls, 0.05), { x: 6, y: 0 }, "near a corner: onto the wall end");
  const line = snapPillar({ x: 3.02, y: 0.07 }, walls, 0.05);
  near(line.x, 3);
  near(line.y, 0); // onto the centre line, the along-wall position stays on the grid
  assert.deepEqual(snapPillar({ x: 3.02, y: 0.3 }, walls, 0.05), { x: 3, y: 0.3 }, "30 cm off a wall is open floor");
  assert.deepEqual(snapPillar({ x: 6.1, y: 0.1 }, walls, 0, false), { x: 6.1, y: 0.1 }, "Alt: exactly where the pointer is");
  assert.deepEqual(snapPillar({ x: 3.1, y: 2.1 }, walls, 0.25), { x: 3, y: 2 }, "Shift: 25 cm grid");
});

test("resizePillar: symmetric about the centre in the pillar's own axes, snapped, never below the minimum", () => {
  assert.deepEqual(resizePillar({ x: 5, y: 5 }, 0, { x: 5.3, y: 5.2 }, 0.05, false), { w: 0.6, d: 0.4 });
  assert.deepEqual(resizePillar({ x: 5, y: 5 }, 90, { x: 5.3, y: 5.2 }, 0.05, false), { w: 0.4, d: 0.6 }, "turned a quarter: the axes swap");
  assert.deepEqual(resizePillar({ x: 5, y: 5 }, 0, { x: 5.3, y: 5.2 }, 0.05, true), { w: 0.6, d: 0.6 }, "round stays a circle");
  assert.deepEqual(resizePillar({ x: 5, y: 5 }, 0, { x: 5.01, y: 5.01 }, 0.05, false), { w: 0.1, d: 0.1 });
});

test("addPillar drops a storey-high pillar of the chosen size on the level; unknown or non-pillar kinds change nothing", () => {
  const plan = withDefaultLevels(starterPlan());
  const level = plan.levels![0];
  const preset = PILLAR_PRESETS.find((p) => p.id === "rd40")!;
  const next = addPillar(plan, level.id, preset, { x: -3, y: 12.5 }, "p1");
  const made = next.items.at(-1)!;
  assert.deepEqual([made.kind, made.x, made.y, made.w, made.d, made.rot, made.level], ["column_round", -3, 12.5, 0.4, 0.4, 0, level.id]);
  near(made.h, fullHeight(plan, level.id));
  assert.equal(next.items.length, plan.items.length + 1);
  assert.equal(addPillar(plan, level.id, { id: "x", label: "x", kind: "chair" }, { x: 0, y: 0 }, "p2"), plan);
  const wide = addPillar(plan, level.id, PILLAR_PRESETS.find((p) => p.id === "wide")!, { x: 0, y: 0 }, "p3").items.at(-1)!;
  assert.deepEqual([wide.w, wide.d], [0.55, 0.55], "no size = the def's own");
});

test("fullHeight is the level's wall height", () => {
  near(fullHeight({ levels: [{ id: "L0", name: "G", elevation: 0, height: 2.78 }] }, "L0"), 2.58);
  near(fullHeight({ levels: [{ id: "L0", name: "G", elevation: 0, height: 3.2 }] }, "L0"), 3.0);
});

test("every kind of pillar can be painted: its main body takes the item's colour, and unpainted pillars keep the colour they were drawn with", () => {
  for (const kind of Object.keys(CATALOG).filter(isPillar)) {
    const body = CATALOG[kind].parts.reduce((a, p) => (p.s[0] * p.s[1] * p.s[2] > a.s[0] * a.s[1] * a.s[2] ? p : a));
    assert.equal(body.m, true, `${kind}: the biggest part is the pillar itself`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(body.c), `${kind}: still has its own colour to fall back to`);
  }
});

const col = (id: string, over: Partial<Item> = {}): Item => ({ id, kind: "column", x: 2, y: 2, rot: 0, w: 0.4, d: 0.2, h: 2.58, ...over });

test("pillarAt finds the pillar under a point, turned and round ones included, and ignores furniture", () => {
  assert.equal(pillarAt([col("a")], { x: 2.19, y: 2.09 })?.id, "a");
  assert.equal(pillarAt([col("a")], { x: 2.21, y: 2 }), null, "just outside the footprint");
  assert.equal(pillarAt([col("a")], { x: 2.21, y: 2 }, 0.05)?.id, "a", "reach adds slack");
  assert.equal(pillarAt([col("a", { rot: 90 })], { x: 2.09, y: 2.19 })?.id, "a", "a quarter turn swaps the sides");
  assert.equal(pillarAt([col("a", { rot: 90 })], { x: 2.19, y: 2.09 }), null);
  const round = col("r", { kind: "column_round", w: 0.4, d: 0.4 });
  assert.equal(pillarAt([round], { x: 2.18, y: 2 })?.id, "r");
  assert.equal(pillarAt([round], { x: 2.18, y: 2.18 }), null, "a circle has no corners");
  assert.equal(pillarAt([col("chair", { kind: "chair" })], { x: 2, y: 2 }), null);
  assert.equal(pillarAt([col("under"), col("over")], { x: 2, y: 2 })?.id, "over", "the one drawn last is on top");
});
