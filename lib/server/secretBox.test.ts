import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { TEST_DB_PREFIX, openDb } from "../db/connection.ts";
import { tempDb } from "../db/testDb.ts";
import { forgetKeys, keyFileFor, loadKey, open, seal } from "./secretBox.ts";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.demo-token-payload.signature-9f8e7d";

test("a sealed token opens again, and the sealed text does not contain it", () => {
  const key = randomBytes(32);
  const sealed = seal(key, TOKEN);
  assert.equal(open(key, sealed), TOKEN);
  assert.ok(!sealed.includes(TOKEN) && !sealed.includes("demo-token"));
  assert.notEqual(seal(key, TOKEN), sealed, "a new random nonce every time");
});

test("another key, a changed byte, a cut value or plain text never open: null, no throw", () => {
  const key = randomBytes(32);
  const sealed = seal(key, TOKEN);
  assert.equal(open(randomBytes(32), sealed), null);
  const parts = sealed.split(".");
  const flipped = [...parts.slice(0, 3), (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1)].join(".");
  assert.equal(open(key, flipped), null);
  assert.equal(open(key, parts.slice(0, 3).join(".")), null);
  assert.equal(open(key, TOKEN), null, "an unsealed token (a hand-edited database) is not trusted");
  assert.equal(open(key, ""), null);
  assert.equal(open(key, "v1....."), null);
});

test("the key file is created next to the database, 0600, once, and found again", () => {
  const t = tempDb();
  forgetKeys();
  const file = keyFileFor(t.db);
  assert.equal(file, join(realpathSync(t.dir), "doshy.key")); // SQLite reports the real path (/var is /private/var on a Mac)
  assert.ok(!existsSync(file), "no key until something needs one");
  const key = loadKey(file);
  assert.equal(key.length, 32);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  forgetKeys();
  assert.deepEqual(loadKey(file), key, "read back from the file");
  t.cleanup();
});

test("a damaged key file is kept aside and replaced: its tokens ask to be entered again", () => {
  const t = tempDb();
  forgetKeys();
  const file = keyFileFor(t.db);
  writeFileSync(file, "not a key\n");
  assert.equal(loadKey(file).length, 32);
  assert.ok(readdirSync(t.dir).some((n) => n.startsWith("doshy.key.bad-")), "the old file is not thrown away");
  t.cleanup();
});

test("a throwaway test database keeps its key beside itself, never the real one", () => {
  const t = tempDb();
  const testFile = join(realpathSync(t.dir), `${TEST_DB_PREFIX}abcdefgh.db`);
  const db = openDb(testFile);
  assert.equal(keyFileFor(db), `${testFile}.key`);
  db.close();
  t.cleanup();
});
