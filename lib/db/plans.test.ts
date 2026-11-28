import assert from "node:assert/strict";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { createDashboard, parseCreateBody, softDeleteDashboard } from "./dashboards.ts";
import { HttpError } from "./errors.ts";
import { MAX_PLAN_BYTES } from "./planDoc.ts";
import { KEEP_VERSIONS, SNAPSHOT_EVERY_MS, getPlan, listVersions, parsePlanBody, putPlan, restoreVersion, saveVersion } from "./plans.ts";
import { openDb } from "./connection.ts";
import { planJson, tempDb } from "./testDb.ts";

const MIN = 60_000;
/** The plan every database starts with (migration 4 creates it). */
const HOME = 1;
const put = (db: Parameters<typeof putPlan>[0], marker: string | number, baseRev: number, now: number, extra: { overwrite?: boolean; format?: number } = {}, dashboardId = HOME) =>
  putPlan(db, dashboardId, { json: planJson(marker), baseRev, format: extra.format ?? 3, overwrite: extra.overwrite }, now);
const marker = (json: string) => JSON.parse(json).marker;

test("the first save creates revision 1; saving the same plan again changes nothing", () => {
  const t = tempDb();
  assert.equal(getPlan(t.db, HOME), null);
  assert.deepEqual(put(t.db, "a", 0, 1000), { ok: true, rev: 1, updatedAt: 1000, changed: true });
  assert.deepEqual(put(t.db, "a", 1, 2000), { ok: true, rev: 1, updatedAt: 1000, changed: false });
  assert.equal(getPlan(t.db, HOME)?.rev, 1);
  assert.equal(listVersions(t.db, HOME).length, 0);
  t.cleanup();
});

test("each real change bumps the revision and keeps the format it was saved with", () => {
  const t = tempDb();
  put(t.db, "a", 0, 1000, { format: 3 });
  assert.deepEqual(put(t.db, "b", 1, 2000, { format: 4 }), { ok: true, rev: 2, updatedAt: 2000, changed: true });
  const p = getPlan(t.db, HOME)!;
  assert.equal(marker(p.json), "b");
  assert.equal(p.format, 4);
  t.cleanup();
});

test("a save based on an old revision is refused with the server copy, and nothing is written", () => {
  const t = tempDb();
  put(t.db, "a", 0, 1000);
  put(t.db, "b", 1, 2000); // device A
  const r = put(t.db, "mine", 1, 3000); // device B still on revision 1
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.server?.rev, 2);
    assert.equal(marker(r.server!.json), "b");
  }
  assert.equal(marker(getPlan(t.db, HOME)!.json), "b");
  assert.equal(getPlan(t.db, HOME)?.rev, 2);
  t.cleanup();
});

test("a second device starting from nothing cannot overwrite an existing plan", () => {
  const t = tempDb();
  put(t.db, "a", 0, 1000);
  assert.equal(put(t.db, "fresh", 0, 2000).ok, false);
  t.cleanup();
});

test("when the server has no plan any base revision is accepted (a restored or wiped database)", () => {
  const t = tempDb();
  assert.deepEqual(put(t.db, "a", 7, 1000), { ok: true, rev: 1, updatedAt: 1000, changed: true });
  t.cleanup();
});

test("automatic versions: the plan being replaced is kept, at most one per five minutes", () => {
  const t = tempDb();
  put(t.db, "v1", 0, 0);
  put(t.db, "v2", 1, 1 * MIN); // keeps v1 (the plan as it was before this editing session)
  put(t.db, "v3", 2, 2 * MIN); // within five minutes: nothing new
  put(t.db, "v4", 3, 4 * MIN);
  assert.deepEqual(listVersions(t.db, HOME).map((v) => v.rev), [1]);
  put(t.db, "v5", 4, 1 * MIN + SNAPSHOT_EVERY_MS); // five minutes after the last version: keeps v4
  const versions = listVersions(t.db, HOME);
  assert.deepEqual(versions.map((v) => v.rev), [4, 1]);
  assert.ok(versions.every((v) => !v.manual && v.label === ""));
  t.cleanup();
});

test("an automatic version is skipped when the newest version already holds that plan", () => {
  const t = tempDb();
  put(t.db, "a", 0, 0);
  put(t.db, "b", 1, MIN); // keeps "a"
  saveVersion(t.db, HOME, "keep", 2 * MIN); // holds "b"
  put(t.db, "c", 2, 10 * MIN); // the plan being replaced ("b") is already the newest version: nothing new
  assert.deepEqual(listVersions(t.db, HOME).map((v) => v.label), ["keep", ""]);
  t.cleanup();
});

test("only the newest 30 automatic versions are kept", () => {
  const t = tempDb();
  put(t.db, 0, 0, 0);
  for (let i = 1; i <= 40; i++) put(t.db, i, i, i * 10 * MIN);
  const versions = listVersions(t.db, HOME);
  assert.equal(versions.length, KEEP_VERSIONS);
  assert.equal(versions[0].rev, 40);
  assert.equal(versions.at(-1)!.rev, 40 - KEEP_VERSIONS + 1);
  t.cleanup();
});

test("saved versions are labelled, never thinned by automatic ones, and capped separately", () => {
  const t = tempDb();
  assert.throws(() => saveVersion(t.db, HOME, "x"), (e) => e instanceof HttpError && e.status === 409);
  put(t.db, "a", 0, 0);
  const mine = saveVersion(t.db, HOME, "  Before <b>moving</b> the wall  ", 1000);
  assert.ok(!/[<>]/.test(mine.label));
  assert.equal(mine.manual, true);
  assert.ok(saveVersion(t.db, HOME, "", 2000).label.length > 0, "a blank label still gets a name");
  for (let i = 1; i <= 40; i++) put(t.db, i, i, 10_000 + i * 10 * MIN);
  const versions = listVersions(t.db, HOME);
  assert.equal(versions.filter((v) => v.manual).length, 2, "automatic churn never removes saved versions");
  assert.equal(versions.filter((v) => !v.manual).length, KEEP_VERSIONS);
  for (let i = 0; i < 40; i++) saveVersion(t.db, HOME, `v${i}`, 5_000_000 + i);
  assert.equal(listVersions(t.db, HOME).filter((v) => v.manual).length, KEEP_VERSIONS);
  t.cleanup();
});

test("restore makes a version the working plan and keeps what it replaced", () => {
  const t = tempDb();
  put(t.db, "first", 0, 0);
  const saved = saveVersion(t.db, HOME, "good", 1000);
  put(t.db, "second", 1, 2000);
  const restored = restoreVersion(t.db, HOME, saved.id, 3000);
  assert.equal(marker(restored.json), "first");
  assert.equal(restored.rev, 3, "a restore is a new revision, so other devices notice it");
  const before = listVersions(t.db, HOME).find((v) => v.label === "Before restore");
  assert.ok(before, "the replaced plan is a version too");
  assert.equal(marker(restoreVersion(t.db, HOME, before!.id, 4000).json), "second", "a restore can be undone");
  t.cleanup();
});

test("restoring a version that does not exist is a clear 404", () => {
  const t = tempDb();
  put(t.db, "a", 0, 0);
  assert.throws(() => restoreVersion(t.db, HOME, 999), (e) => e instanceof HttpError && e.status === 404);
  t.cleanup();
});

test("keeping my plan after a conflict keeps the one it replaces, even inside the five minute window", () => {
  const t = tempDb();
  put(t.db, "a", 0, 0);
  put(t.db, "b", 1, 1 * MIN);
  put(t.db, "other-device", 2, 2 * MIN);
  const r = put(t.db, "mine", 3, 3 * MIN, { overwrite: true });
  assert.equal(r.ok, true);
  assert.ok(listVersions(t.db, HOME).some((v) => v.label === "Before overwrite"));
  t.cleanup();
});

test("a plan over 5 MB is refused", () => {
  const t = tempDb();
  const big = JSON.stringify({ walls: [], openings: [], rooms: [], items: [], pad: "x".repeat(MAX_PLAN_BYTES) });
  assert.throws(() => putPlan(t.db, HOME, { json: big, baseRev: 0, format: 1 }), (e) => e instanceof HttpError && e.status === 413);
  assert.equal(getPlan(t.db, HOME), null);
  t.cleanup();
});

test("the request body is checked: it must look like a plan with numeric revision details", () => {
  const ok = { plan: { walls: [], openings: [], rooms: [], items: [] }, baseRev: 0, format: 2 };
  assert.deepEqual(parsePlanBody(ok), { json: JSON.stringify(ok.plan), summary: "{\"items\":0,\"walls\":0,\"rooms\":0}", baseRev: 0, format: 2, overwrite: false });
  assert.equal(parsePlanBody({ ...ok, overwrite: true }).overwrite, true);
  for (const bad of [null, [], "x", {}, { ...ok, plan: [] }, { ...ok, plan: { walls: [] } }, { ...ok, baseRev: -1 }, { ...ok, baseRev: 1.5 }, { ...ok, baseRev: "1" }, { ...ok, format: 1e9 }, { plan: ok.plan }]) {
    assert.throws(() => parsePlanBody(bad), (e) => e instanceof HttpError && e.status === 400, JSON.stringify(bad)?.slice(0, 60));
  }
});

test("two writers on separate connections never lose an update", async () => {
  const t = tempDb();
  put(t.db, 0, 0, 0);
  const per = 60;
  const run = () =>
    new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL("./testWorker.ts", import.meta.url), { workerData: { file: t.file, times: per, dashboardId: HOME } });
      w.on("error", reject);
      w.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
    });
  await Promise.all([run(), run()]);
  const db = openDb(t.file);
  const p = getPlan(db, HOME)!;
  assert.equal(marker(p.json), 2 * per, "every increment landed");
  assert.equal(p.rev, 2 * per + 1, "one revision per successful save");
  db.close();
  t.cleanup();
});

test("the server keeps a plan exactly as sent: a frame colour on an opening and a paint colour on a pillar come back unchanged", () => {
  const t = tempDb();
  const plan = {
    walls: [],
    rooms: [],
    openings: [{ id: "w", wallId: "x", type: "window", t: 0.5, width: 1, height: 1.2, sill: 0.9, color: "#3a3d44", tint: "dark" }],
    items: [{ id: "c", kind: "column", x: 1, y: 1, rot: 0, w: 0.4, d: 0.4, h: 2.58, color: "#c9ccd1" }],
  };
  assert.equal(putPlan(t.db, HOME, { ...parsePlanBody({ plan, baseRev: 0, format: 3 }) }).ok, true);
  assert.deepEqual(JSON.parse(getPlan(t.db, HOME)!.json), plan);
  t.cleanup();
});

test("the server keeps garden lines exactly as sent: road options on a path, the fence styles of walls and the lamps of a lamp line come back unchanged", () => {
  const t = tempDb();
  const plan = {
    walls: [{ id: "f", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, style: "fence_iron", height: 1.4, thickness: 0.05, level: "ground" }],
    rooms: [],
    openings: [{ id: "g", wallId: "f", t: 0.5, width: 1, type: "door", sill: 0, height: 1.2, style: "wicket" }],
    items: [{ id: "l", kind: "gd_street_classic", x: 1, y: 2, rot: 90, w: 0.3, d: 0.3, h: 3.6, level: "ground" }],
    paths: [{ id: "r", points: [{ x: 0, y: 0 }, { x: 8, y: 1 }, { x: 14, y: 6 }], width: 6.5, kind: "asphalt", ends: "flat", smooth: true, marks: "double", pavement: "both", pavementWidth: 2, edge: "kerb" }],
  };
  assert.equal(putPlan(t.db, HOME, { ...parsePlanBody({ plan, baseRev: 0, format: 3 }) }).ok, true);
  assert.deepEqual(JSON.parse(getPlan(t.db, HOME)!.json), plan);
  t.cleanup();
});

const second = (db: Parameters<typeof putPlan>[0]) => createDashboard(db, parseCreateBody({ name: "Second" }), 1).id;

test("two plans keep separate revisions, so saving one never conflicts with the other", () => {
  const t = tempDb();
  const b = second(t.db);
  put(t.db, "a", 0, 1000);
  put(t.db, "a2", 1, 2000);
  assert.deepEqual(put(t.db, "b", 0, 3000, {}, b), { ok: true, rev: 1, updatedAt: 3000, changed: true });
  assert.equal(getPlan(t.db, HOME)?.rev, 2);
  assert.equal(marker(getPlan(t.db, b)!.json), "b");
  assert.equal(put(t.db, "b-stale", 0, 4000, {}, b).ok, false, "a stale save is refused per plan");
  assert.equal(put(t.db, "a3", 2, 4000).ok, true, "and the other plan is unaffected");
  t.cleanup();
});

test("versions, the five-minute throttle and the 30 + 30 limit apply per plan", () => {
  const t = tempDb();
  const b = second(t.db);
  put(t.db, "a1", 0, 0);
  put(t.db, "a2", 1, 1 * MIN); // keeps a1
  put(t.db, "b1", 0, 2 * MIN, {}, b);
  put(t.db, "b2", 1, 3 * MIN, {}, b); // the other plan's recent version does not throttle this one
  assert.deepEqual(listVersions(t.db, HOME).map((v) => v.rev), [1]);
  assert.deepEqual(listVersions(t.db, b).map((v) => v.rev), [1]);
  for (let i = 1; i <= 40; i++) put(t.db, `n${i}`, i + 1, 10 * MIN * (i + 1));
  assert.equal(listVersions(t.db, HOME).length, KEEP_VERSIONS);
  assert.equal(listVersions(t.db, b).length, 1, "the busy plan's pruning left the other plan's version alone");
  saveVersion(t.db, b, "mine", 99 * MIN);
  assert.equal(listVersions(t.db, HOME).filter((v) => v.manual).length, 0, "a saved version belongs to one plan");
  t.cleanup();
});

test("a version can only be restored into its own plan", () => {
  const t = tempDb();
  const b = second(t.db);
  put(t.db, "a", 0, 0);
  put(t.db, "b", 0, 0, {}, b);
  const mine = saveVersion(t.db, HOME, "a-version", 1000);
  assert.throws(() => restoreVersion(t.db, b, mine.id), (e) => e instanceof HttpError && e.status === 404);
  assert.equal(marker(getPlan(t.db, b)!.json), "b", "nothing changed in the other plan");
  assert.equal(marker(restoreVersion(t.db, HOME, mine.id, 2000).json), "a");
  t.cleanup();
});

test("a plan that does not exist or is deleted cannot be saved to, versioned or restored (the editing device must find out)", () => {
  const t = tempDb();
  const b = second(t.db);
  put(t.db, "b", 0, 0, {}, b);
  const v = saveVersion(t.db, b, "v", 1);
  softDeleteDashboard(t.db, b, 2);
  const gone = (e: unknown) => e instanceof HttpError && e.status === 404;
  assert.throws(() => put(t.db, "b2", 1, 3, {}, b), gone);
  assert.throws(() => saveVersion(t.db, b, "x", 3), gone);
  assert.throws(() => restoreVersion(t.db, b, v.id, 3), gone);
  assert.throws(() => put(t.db, "z", 0, 3, {}, 99), gone, "an id that never existed, not a foreign key failure");
  t.cleanup();
});

test("two writers on separate connections, one per plan and one on the same plan, never lose an update", async () => {
  const t = tempDb();
  const b = second(t.db);
  put(t.db, 0, 0, 0);
  put(t.db, 0, 0, 0, {}, b);
  const per = 40;
  const run = (dashboardId: number) =>
    new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL("./testWorker.ts", import.meta.url), { workerData: { file: t.file, times: per, dashboardId } });
      w.on("error", reject);
      w.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
    });
  await Promise.all([run(HOME), run(HOME), run(b)]);
  assert.equal(marker(getPlan(t.db, HOME)!.json), 2 * per);
  assert.equal(getPlan(t.db, HOME)!.rev, 2 * per + 1);
  assert.equal(marker(getPlan(t.db, b)!.json), per);
  assert.equal(getPlan(t.db, b)!.rev, per + 1);
  t.cleanup();
});
