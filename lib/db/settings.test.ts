import assert from "node:assert/strict";
import { test } from "node:test";
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
