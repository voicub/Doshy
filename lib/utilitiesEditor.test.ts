import test from "node:test";
import assert from "node:assert/strict";
import { hitUtilityLine, snapUtilityPoint, utilityLinesOn } from "./utilitiesEditor.ts";
import type { Plan } from "./types.ts";

const plan: Plan = { walls: [{ id: "w", a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, style: "plaster" }], rooms: [{ id: "r", name: "Room", x: 0, y: 1, w: 4, h: 4, color: "#fff", floor: "wood" }], openings: [], items: [{ id: "v", kind: "ut_water_main", x: 2, y: 2, rot: 0, w: .2, d: .1, h: .1 }], utilities: [{ id: "p", kind: "cold", pts: [{ x: 0, y: 3 }, { x: 5, y: 3 }] }, { id: "upper", kind: "gas", level: "L1", pts: [{ x: 0, y: 6 }, { x: 5, y: 6 }] }] };
test("pipes snap to walls, room edges, pipe segments and valves on their level, with free placement and grid fallback", () => {
  assert.deepEqual(snapUtilityPoint(plan, "L0", { x: 2.1, y: .08 }, .15, .05), { x: 2.1, y: 0 });
  assert.deepEqual(snapUtilityPoint(plan, "L0", { x: 3.95, y: 2 }, .15, .05), { x: 4, y: 2 });
  assert.deepEqual(snapUtilityPoint(plan, "L0", { x: 2.5, y: 3.08 }, .15, .05), { x: 2.5, y: 3 });
  assert.deepEqual(snapUtilityPoint(plan, "L0", { x: 2.06, y: 2 }, .15, .05), { x: 2, y: 2 });
  assert.deepEqual(snapUtilityPoint(plan, "L0", { x: 2.02, y: 6.08 }, .15, .05), { x: 2, y: 6.1000000000000005 });
  const raw = { x: 2.1, y: .08 };
  assert.equal(snapUtilityPoint(plan, "L0", raw, .15, .05, true), raw);
  assert.equal(hitUtilityLine(utilityLinesOn(plan, "L0"), { x: 2.5, y: 3.1 }, .2)?.id, "p");
  assert.equal(hitUtilityLine(utilityLinesOn(plan, "L0"), { x: 2.5, y: 6 }, .2), undefined);
});
