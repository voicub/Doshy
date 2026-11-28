import assert from "node:assert/strict";
import { test } from "node:test";
import { createDashboard, parseCreateBody, softDeleteDashboard } from "./dashboards.ts";
import { HttpError } from "./errors.ts";
import { MAX_KEYS_PER_WRITE, MAX_VALUE_BYTES, getSettings, setSettings } from "./settings.ts";
import { tempDb } from "./testDb.ts";

const refused = (status: number) => (e: unknown) => e instanceof HttpError && e.status === status;

test("settings round-trip as JSON values, all in one read", () => {
  const t = tempDb();
  setSettings(t.db, { "housey-sky": { state: { timeMode: "manual" }, version: 3 }, "housey-declutter": { state: { on: false }, version: 0 }, "n.1_x-y": [1, 2, null] }, 5000);
  const all = getSettings(t.db);
  assert.deepEqual(Object.keys(all).sort(), ["housey-declutter", "housey-sky", "n.1_x-y"]);
  assert.deepEqual(all["housey-sky"], { value: { state: { timeMode: "manual" }, version: 3 }, updatedAt: 5000 });
  assert.deepEqual(all["n.1_x-y"].value, [1, 2, null]);
  t.cleanup();
});

test("an unchanged value is not rewritten; a changed one gets a new time", () => {
  const t = tempDb();
  assert.equal(setSettings(t.db, { a: { x: 1 } }, 1000), 1);
  assert.equal(setSettings(t.db, { a: { x: 1 } }, 2000), 0);
  assert.equal(getSettings(t.db).a.updatedAt, 1000);
  assert.equal(setSettings(t.db, { a: { x: 2 } }, 3000), 1);
  assert.equal(getSettings(t.db).a.updatedAt, 3000);
  t.cleanup();
});

test("only simple key names are accepted, and one bad key refuses the whole write", () => {
  const t = tempDb();
  for (const key of ["", "Upper", "has space", "a/b", "a;b", "../x", "x".repeat(65), "é", "a\nb"]) {
    assert.throws(() => setSettings(t.db, { fine: 1, [key]: 1 }), refused(400), JSON.stringify(key));
  }
  assert.deepEqual(getSettings(t.db), {}, "nothing was written");
  assert.doesNotThrow(() => setSettings(t.db, { ["x".repeat(64)]: 1 }));
  t.cleanup();
});

test("a value is limited to 256 KB of JSON", () => {
  const t = tempDb();
  const fits = "x".repeat(MAX_VALUE_BYTES - 2); // the two quotes make it exactly the limit
  assert.doesNotThrow(() => setSettings(t.db, { big: fits }));
  assert.throws(() => setSettings(t.db, { big: fits + "x" }), refused(413));
  assert.equal(JSON.stringify(getSettings(t.db).big.value).length, MAX_VALUE_BYTES, "the earlier value stays");
  t.cleanup();
});

test("the body must be an object with between 1 and 64 keys and every value defined", () => {
  const t = tempDb();
  for (const bad of [null, [], "x", 5, {}]) assert.throws(() => setSettings(t.db, bad), refused(400));
  assert.throws(() => setSettings(t.db, { a: undefined }), refused(400));
  const many = Object.fromEntries(Array.from({ length: MAX_KEYS_PER_WRITE + 1 }, (_, i) => [`k${i}`, i]));
  assert.throws(() => setSettings(t.db, many), refused(400));
  t.cleanup();
});

test("a plan's settings are kept under housey-plan.<id>, only for a plan that exists, and the old bare key is refused", () => {
  const t = tempDb();
  const b = createDashboard(t.db, parseCreateBody({ name: "Beta" })).id;
  assert.equal(setSettings(t.db, { "housey-plan.1": { v: 1 }, [`housey-plan.${b}`]: { v: 2 } }), 2);
  assert.throws(() => setSettings(t.db, { "housey-plan": { v: 1 } }), refused(400), "what a tab opened before multi-plan would send");
  for (const key of ["housey-plan.", "housey-plan.x", "housey-plan.1.2", "housey-plan.01x", "housey-plan.007", "housey-plan.-1"]) assert.throws(() => setSettings(t.db, { [key]: 1 }), refused(400), key);
  assert.throws(() => setSettings(t.db, { "housey-plan.99": 1 }), refused(404), "no row for a plan that never existed");
  softDeleteDashboard(t.db, b, 1000);
  assert.throws(() => setSettings(t.db, { [`housey-plan.${b}`]: { v: 3 }, other: 1 }), refused(404), "nor for a deleted one, and the rest of that write is not applied");
  assert.equal(getSettings(t.db).other, undefined);
  assert.equal(setSettings(t.db, { "housey-planner": 1, "housey-plan-x": 2 }), 2, "other keys that merely start alike are ordinary");
  t.cleanup();
});
