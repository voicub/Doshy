import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import { createDashboard, parseCreateBody } from "./db/dashboards.ts";
import { getPlan, listVersions, putPlan } from "./db/plans.ts";
import { tempDb } from "./db/testDb.ts";
import { installBrowser, markerOf, persistedPlan } from "./dbClientHarness.ts";

// A kiosk opened with ?plan=2 whose browser still holds a copy of plan 1 with edits that never reached the server.
const t = tempDb();
const plan = (marker: string) => ({ walls: [], openings: [], rooms: [], items: [], marker });
putPlan(t.db, 1, { json: JSON.stringify(plan("home")), baseRev: 0, format: 15 });
const garden = createDashboard(t.db, parseCreateBody({ name: "Garden", plan: plan("garden"), format: 15 })).id;
const edited = persistedPlan("home-edited");
const h = installBrowser(t.db, {
  search: `?kiosk=1&plan=${garden}`,
  local: { "housey-plan": edited, "housey-db-sync": JSON.stringify({ rev: 1, planId: 1, dirty: ["housey-plan"], pieces: [], stashUp: [] }) },
});
const { activePlanId, dbStorage } = await import("./dbClient.ts");
const { onPlanState } = await import("./planState.ts");
let status = "";
onPlanState((s) => {
  status = s.status;
});

test("a pinned plan opens, and the copy of another plan is kept, not sent over it", async () => {
  const storage = dbStorage("housey-plan", "plan", 15);
  storage.bind(() => undefined);
  for (let i = 0; i < 300 && status !== "ready"; i++) await sleep(10);
  assert.equal(activePlanId(), garden);
  assert.equal(markerOf(h.ls.get("housey-plan")), "garden");
  assert.equal(h.puts(garden), 0, "the other plan's copy was not sent as this plan");
  assert.equal(h.puts(1), 0, "and not as a normal save either: it goes in as a version");
  const index = JSON.parse(h.ls.get("housey-plan-stash-index") ?? "[]");
  assert.equal(index[0].planId, 1);
  assert.equal(h.ls.get(`housey-plan-before-load-${index[0].slot}`), edited, "kept byte for byte");
  for (let i = 0; i < 300 && !listVersions(t.db, 1).length; i++) await sleep(10);
  assert.ok(listVersions(t.db, 1).some((v) => v.label.startsWith("This device, before opening another plan")), "and saved on the server as a version of plan 1");
  assert.equal(JSON.parse(getPlan(t.db, 1)?.json ?? "{}").marker, "home", "plan 1 itself is as it was");
});
