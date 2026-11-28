import assert from "node:assert/strict";
import test from "node:test";
import { withDesign } from "../designFields.ts";
import { guestPlan } from "../guestPlan.ts";
import { splitPlanFile } from "../planFile.ts";
import type { Plan } from "../types.ts";
import { createDashboard, parseCreateBody } from "./dashboards.ts";
import { getPlan, parsePlanBody, putPlan } from "./plans.ts";
import { tempDb } from "./testDb.ts";

test("maintenance history and pipes survive saving, duplication, file import and guest scrubbing", () => {
  const t = tempDb();
  try {
    const plan: Plan = {
      walls: [], openings: [], rooms: [], items: [],
      maintenance: { tasks: [{ id: "filter", name: "Replace filter", every: 6, unit: "month", due: "2027-05-27", last: "2026-11-27", history: ["2026-11-27"], notes: "Owner-only notes" }], batteryBelow: 25 },
      utilities: [{ id: "supply", kind: "cold", pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }], h: 0.2, width: 0.025, name: "Kitchen supply" }],
    };
    assert.equal(putPlan(t.db, 1, parsePlanBody({ plan, baseRev: 0, format: 15 }), 1000).ok, true);
    const saved = JSON.parse(getPlan(t.db, 1)!.json) as Plan;
    assert.deepEqual(saved, plan);
    const copy = createDashboard(t.db, parseCreateBody({ fromId: 1 }), 2000);
    assert.deepEqual(JSON.parse(getPlan(t.db, copy.id)!.json), plan);
    const imported = withDesign(splitPlanFile(JSON.parse(JSON.stringify({ ...saved, dashboard: { name: "Imported home" } }))).plan);
    assert.deepEqual(imported, plan);
    const newPlan = createDashboard(t.db, parseCreateBody({ name: "Imported home", plan: imported, format: 15 }), 3000);
    assert.deepEqual(JSON.parse(getPlan(t.db, newPlan.id)!.json), plan);
    const guest = guestPlan(plan, { live: false, location: false }).plan;
    assert.equal(guest.maintenance, undefined);
    assert.deepEqual(guest.utilities, plan.utilities);
  } finally {
    t.cleanup();
  }
});
