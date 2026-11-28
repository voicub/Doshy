import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import { createDashboard, parseCreateBody, softDeleteDashboard } from "./db/dashboards.ts";
import { getPlan, listVersions, putPlan } from "./db/plans.ts";
import { getSettings, setSettings } from "./db/settings.ts";
import { tempDb } from "./db/testDb.ts";
import { installBrowser, markerOf, persistedPlan } from "./dbClientHarness.ts";

// One scenario, in order, against one fake browser and the real data layer: the plan engine of lib/dbClient (one process per test file).
const t = tempDb();
const plan = (marker: string) => ({ walls: [], openings: [], rooms: [], items: [], marker });
putPlan(t.db, 1, { json: JSON.stringify(plan("home")), baseRev: 0, format: 15 });
setSettings(t.db, { "housey-plan.1": { state: { time: "dusk" }, version: 15 } });
// a device from before several plans existed: its copy equals the server's, its sync meta has no plan id
const h = installBrowser(t.db, { local: { "housey-plan": persistedPlan("home"), "housey-db-sync": JSON.stringify({ rev: 1, dirty: [], pieces: [], stashUp: [] }) } });

const { ACTIVE_KEY, SwitchRefused, activePlanId, dbStorage, flushNow, stashEntries, switchPlanTo } = await import("./dbClient.ts");
const { onPlanState } = await import("./planState.ts");

let state: Parameters<Parameters<typeof onPlanState>[0]>[0] | null = null;
onPlanState((s) => {
  state = s;
});
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 300 && !ok(); i++) await sleep(10);
  assert.ok(ok(), "timed out");
};
const meta = () => JSON.parse(h.ls.get("housey-db-sync") ?? "{}");
const planOf = (id: number) => JSON.parse(getPlan(t.db, id)?.json ?? "null");

const storage = dbStorage("housey-plan", "plan", 15);
let rehydrations = 0;
storage.bind(() => rehydrations++);
let garden = 0;

test("a device from before multi-plan opens plan 1 and sends nothing: its copy is the server's", async () => {
  await until(() => state?.status === "ready");
  assert.equal(activePlanId(), 1);
  assert.equal(state?.id, 1);
  assert.deepEqual(state?.list?.map((d) => d.name), ["Home"]);
  assert.equal(meta().planId, 1, "the copy is now recorded as plan 1's");
  assert.equal(h.puts(1), 0);
  assert.equal(rehydrations, 0);
});

test("switching shows the other plan and its own settings row; the device remembers its choice", async () => {
  garden = createDashboard(t.db, parseCreateBody({ name: "Garden", plan: plan("garden"), format: 15 })).id;
  setSettings(t.db, { [`housey-plan.${garden}`]: { state: { time: "noon" }, version: 15 } });
  await switchPlanTo(garden);
  assert.equal(activePlanId(), garden);
  assert.equal(markerOf(h.ls.get("housey-plan")), "garden");
  assert.equal(JSON.parse(h.ls.get("housey-plan") ?? "{}").state.time, "noon");
  assert.equal(h.ls.get(ACTIVE_KEY), String(garden));
  assert.equal(meta().planId, garden);
  assert.equal(rehydrations, 1, "the store was told once");
  assert.equal(state?.status, "ready");
});

test("edits go to the plan on screen only, with its own settings row", async () => {
  storage.setItem("housey-plan", persistedPlan("garden-2", { time: "night" }));
  await flushNow();
  assert.equal(planOf(garden).marker, "garden-2");
  assert.equal(getPlan(t.db, garden)?.rev, 2);
  assert.equal(planOf(1).marker, "home", "plan 1 is untouched");
  assert.equal(getPlan(t.db, 1)?.rev, 1);
  const rows = getSettings(t.db);
  assert.equal(JSON.parse(JSON.stringify(rows[`housey-plan.${garden}`].value)).state.time, "night");
  assert.equal(JSON.parse(JSON.stringify(rows["housey-plan.1"].value)).state.time, "dusk");
  assert.equal(rows["housey-plan"], undefined, "the old single row is never written again");
});

test("a switch is refused while edits cannot be sent, and nothing moves; once they are sent it works", async () => {
  storage.setItem("housey-plan", persistedPlan("garden-3"));
  h.offline.value = true;
  await assert.rejects(() => switchPlanTo(1), SwitchRefused);
  assert.equal(activePlanId(), garden);
  assert.equal(markerOf(h.ls.get("housey-plan")), "garden-3", "the unsent edit is still on screen");
  h.offline.value = false;
  await flushNow();
  assert.equal(planOf(garden).marker, "garden-3");
  await switchPlanTo(1);
  assert.equal(markerOf(h.ls.get("housey-plan")), "home");
  assert.equal(activePlanId(), 1);
});

test("a plan deleted on another device: this device moves to the home plan and keeps what it had", async () => {
  await switchPlanTo(garden);
  storage.setItem("housey-plan", persistedPlan("garden-4")); // an edit not sent yet
  softDeleteDashboard(t.db, garden);
  const poll = h.polls[0];
  assert.ok(poll, "the client polls");
  poll();
  await until(() => state?.notice === "plan-removed");
  assert.equal(activePlanId(), 1);
  assert.equal(markerOf(h.ls.get("housey-plan")), "home");
  const index = JSON.parse(h.ls.get("housey-plan-stash-index") ?? "[]");
  assert.equal(index[0].planId, garden, "the kept copy is tagged with the plan it was of");
  assert.equal(markerOf(h.ls.get(`housey-plan-before-load-${index[0].slot}`)), "garden-4");
  assert.deepEqual(stashEntries(), [], "it is not offered while another plan is on screen");
  await until(() => listVersions(t.db, 1).some((v) => v.label.startsWith("This device, plan deleted on another device")));
});

test("another tab of this browser opened a different plan: nothing of this tab's copy is sent", async () => {
  const before = h.puts(1);
  h.ls.set("housey-db-sync", JSON.stringify({ ...meta(), planId: 99 }));
  storage.setItem("housey-plan", persistedPlan("tab-edit"));
  await flushNow();
  assert.equal(h.puts(1), before);
  assert.equal(planOf(1).marker, "home");
});
