import assert from "node:assert/strict";
import test from "node:test";
import { fenceDefaults } from "./fences.ts";
import { addFenceLine, drawnPathFields, duplicatePath } from "./lineDraw.ts";
import { PATH_KINDS } from "./lineKinds.ts";
import type { Plan } from "./types.ts";

const empty: Plan = { walls: [], openings: [], rooms: [], items: [] };
const ids = () => {
  let n = 0;
  return () => `w${++n}`;
};
const line = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }];

test("a fence line makes one wall per segment with the style's height and thickness, on the given level", () => {
  const out = addFenceLine(empty, line, "fence_picket", "L1", ids());
  assert.equal(out.walls.length, 2);
  for (const w of out.walls) {
    assert.equal(w.style, "fence_picket");
    assert.equal(w.level, "L1");
    assert.equal(w.height, fenceDefaults("fence_picket").height);
    assert.equal(w.thickness, fenceDefaults("fence_picket").thickness);
  }
});

test("the walls are chained: each one starts exactly where the one before ends", () => {
  const out = addFenceLine(empty, line, "hedge", "L0", ids());
  assert.deepEqual([out.walls[0].a, out.walls[0].b, out.walls[1].b], line);
  assert.equal(out.walls[0].b, out.walls[1].a);
});

test("duplicate clicks add no zero-length wall, and the ids are unique", () => {
  const out = addFenceLine({ ...empty, walls: [{ id: "old", a: { x: 9, y: 9 }, b: { x: 9, y: 10 }, style: "plaster" }] }, [line[0], line[0], line[1], line[1], line[2]], "wall_stone", "L0", ids());
  assert.equal(out.walls.length, 3);
  assert.equal(new Set(out.walls.map((w) => w.id)).size, 3);
});

test("fewer than two distinct points leave the plan as it was", () => {
  assert.equal(addFenceLine(empty, [], "hedge", "L0", ids()), empty);
  assert.equal(addFenceLine(empty, [line[0], line[0]], "hedge", "L0", ids()), empty);
});

test("a duplicated path is the same path one metre over, under a new id, and the original stays", () => {
  const plan: Plan = { ...empty, paths: [{ id: "p", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], width: 1, kind: "gravel", name: "Gravel 1", marks: "dashed" }] };
  const { plan: out, id } = duplicatePath(plan, "p", () => "q");
  assert.equal(id, "q");
  assert.equal(out.paths?.length, 2);
  assert.deepEqual(out.paths?.[0], plan.paths?.[0]);
  assert.deepEqual(out.paths?.[1].points, [{ x: 1, y: 1 }, { x: 6, y: 1 }]);
  assert.equal(out.paths?.[1].marks, "dashed");
  assert.deepEqual(duplicatePath(plan, "none", () => "z"), { plan, id: null });
});

test("road options override the kind's own look, and none leaves the field out", () => {
  const street = PATH_KINDS.find((k) => k.id === "road_street")!;
  const plain = drawnPathFields(street, 6.5, { marks: "none", pavement: "none" });
  assert.equal("marks" in plain, false);
  assert.equal("pavement" in plain, false);
  const left = drawnPathFields(street, 6.5, { pavement: "left", edge: "kerb" });
  assert.equal(left.pavement, "left");
  assert.equal(left.edge, "kerb");
  assert.equal(left.marks, "dashed");
  assert.equal(drawnPathFields(street, 99, {}).width, street.look.max);
});
