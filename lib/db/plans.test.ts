import assert from "node:assert/strict";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { HttpError } from "./errors.ts";
import { KEEP_VERSIONS, MAX_PLAN_BYTES, SNAPSHOT_EVERY_MS, getPlan, listVersions, parsePlanBody, putPlan, restoreVersion, saveVersion } from "./plans.ts";
import { openDb } from "./connection.ts";
import { planJson, tempDb } from "./testDb.ts";

const MIN = 60_000;
const put = (db: Parameters<typeof putPlan>[0], marker: string | number, baseRev: number, now: number, extra: { overwrite?: boolean; format?: number } = {}) =>
  putPlan(db, { json: planJson(marker), baseRev, format: extra.format ?? 3, overwrite: extra.overwrite }, now);
const marker = (json: string) => JSON.parse(json).marker;

test("the first save creates revision 1; saving the same plan again changes nothing", () => {
  const t = tempDb();
  assert.equal(getPlan(t.db), null);
  assert.deepEqual(put(t.db, "a", 0, 1000), { ok: true, rev: 1, updatedAt: 1000, changed: true });
  assert.deepEqual(put(t.db, "a", 1, 2000), { ok: true, rev: 1, updatedAt: 1000, changed: false });
  assert.equal(getPlan(t.db)?.rev, 1);
  assert.equal(listVersions(t.db).length, 0);
  t.cleanup();
});

test("each real change bumps the revision and keeps the format it was saved with", () => {
  const t = tempDb();
  put(t.db, "a", 0, 1000, { format: 3 });
  assert.deepEqual(put(t.db, "b", 1, 2000, { format: 4 }), { ok: true, rev: 2, updatedAt: 2000, changed: true });
  const p = getPlan(t.db)!;
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
  assert.equal(marker(getPlan(t.db)!.json), "b");
  assert.equal(getPlan(t.db)?.rev, 2);
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
  assert.deepEqual(listVersions(t.db).map((v) => v.rev), [1]);
  put(t.db, "v5", 4, 1 * MIN + SNAPSHOT_EVERY_MS); // five minutes after the last version: keeps v4
  const versions = listVersions(t.db);
  assert.deepEqual(versions.map((v) => v.rev), [4, 1]);
  assert.ok(versions.every((v) => !v.manual && v.label === ""));
  t.cleanup();
});

test("an automatic version is skipped when the newest version already holds that plan", () => {
  const t = tempDb();
  put(t.db, "a", 0, 0);
  put(t.db, "b", 1, MIN); // keeps "a"
  saveVersion(t.db, "keep", 2 * MIN); // holds "b"
  put(t.db, "c", 2, 10 * MIN); // the plan being replaced ("b") is already the newest version: nothing new
  assert.deepEqual(listVersions(t.db).map((v) => v.label), ["keep", ""]);
  t.cleanup();
});

test("only the newest 30 automatic versions are kept", () => {
  const t = tempDb();
  put(t.db, 0, 0, 0);
  for (let i = 1; i <= 40; i++) put(t.db, i, i, i * 10 * MIN);
  const versions = listVersions(t.db);
  assert.equal(versions.length, KEEP_VERSIONS);
  assert.equal(versions[0].rev, 40);
  assert.equal(versions.at(-1)!.rev, 40 - KEEP_VERSIONS + 1);
  t.cleanup();
});

test("saved versions are labelled, never thinned by automatic ones, and capped separately", () => {
  const t = tempDb();
  assert.throws(() => saveVersion(t.db, "x"), (e) => e instanceof HttpError && e.status === 409);
  put(t.db, "a", 0, 0);
  const mine = saveVersion(t.db, "  Before <b>moving</b> the wall  ", 1000);
  assert.ok(!/[<>]/.test(mine.label));
  assert.equal(mine.manual, true);
  assert.ok(saveVersion(t.db, "", 2000).label.length > 0, "a blank label still gets a name");
  for (let i = 1; i <= 40; i++) put(t.db, i, i, 10_000 + i * 10 * MIN);
  const versions = listVersions(t.db);
  assert.equal(versions.filter((v) => v.manual).length, 2, "automatic churn never removes saved versions");
  assert.equal(versions.filter((v) => !v.manual).length, KEEP_VERSIONS);
  for (let i = 0; i < 40; i++) saveVersion(t.db, `v${i}`, 5_000_000 + i);
  assert.equal(listVersions(t.db).filter((v) => v.manual).length, KEEP_VERSIONS);
  t.cleanup();
});

test("restore makes a version the working plan and keeps what it replaced", () => {
  const t = tempDb();
  put(t.db, "first", 0, 0);
  const saved = saveVersion(t.db, "good", 1000);
  put(t.db, "second", 1, 2000);
  const restored = restoreVersion(t.db, saved.id, 3000);
  assert.equal(marker(restored.json), "first");
  assert.equal(restored.rev, 3, "a restore is a new revision, so other devices notice it");
  const before = listVersions(t.db).find((v) => v.label === "Before restore");
  assert.ok(before, "the replaced plan is a version too");
  assert.equal(marker(restoreVersion(t.db, before!.id, 4000).json), "second", "a restore can be undone");
  t.cleanup();
});

test("restoring a version that does not exist is a clear 404", () => {
  const t = tempDb();
  put(t.db, "a", 0, 0);
  assert.throws(() => restoreVersion(t.db, 999), (e) => e instanceof HttpError && e.status === 404);
  t.cleanup();
});

test("keeping my plan after a conflict keeps the one it replaces, even inside the five minute window", () => {
  const t = tempDb();
  put(t.db, "a", 0, 0);
  put(t.db, "b", 1, 1 * MIN);
  put(t.db, "other-device", 2, 2 * MIN);
  const r = put(t.db, "mine", 3, 3 * MIN, { overwrite: true });
  assert.equal(r.ok, true);
  assert.ok(listVersions(t.db).some((v) => v.label === "Before overwrite"));
  t.cleanup();
});

test("a plan over 5 MB is refused", () => {
  const t = tempDb();
  const big = JSON.stringify({ walls: [], openings: [], rooms: [], items: [], pad: "x".repeat(MAX_PLAN_BYTES) });
  assert.throws(() => putPlan(t.db, { json: big, baseRev: 0, format: 1 }), (e) => e instanceof HttpError && e.status === 413);
  assert.equal(getPlan(t.db), null);
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
      const w = new Worker(new URL("./testWorker.ts", import.meta.url), { workerData: { file: t.file, times: per } });
      w.on("error", reject);
      w.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
    });
  await Promise.all([run(), run()]);
  const db = openDb(t.file);
  const p = getPlan(db)!;
  assert.equal(marker(p.json), 2 * per, "every increment landed");
  assert.equal(p.rev, 2 * per + 1, "one revision per successful save");
  db.close();
  t.cleanup();
});
