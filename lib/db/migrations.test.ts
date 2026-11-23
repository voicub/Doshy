import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, truncateSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { test } from "node:test";
import { closeDb, getDb, openDb } from "./connection.ts";
import { MIGRATIONS, migrate, userVersion } from "./migrations.ts";
import { tempDb } from "./testDb.ts";

const tables = (db: DatabaseSync) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => String(r.name));

test("a new database is migrated to the latest schema and marked as ours", () => {
  const t = tempDb();
  assert.equal(userVersion(t.db), MIGRATIONS.length);
  assert.deepEqual(tables(t.db).filter((n) => !n.startsWith("sqlite_")), ["blobs", "events", "meta", "plans", "resources", "settings"]);
  assert.equal(t.db.prepare("SELECT value FROM meta WHERE key = 'app'").get()?.value, "housey");
  assert.equal(t.db.prepare("PRAGMA journal_mode").get()?.journal_mode, "wal");
  assert.equal(t.db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
  t.cleanup();
});

test("running migrate again changes nothing", () => {
  const t = tempDb();
  t.db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('a', '1', 1)").run();
  assert.equal(migrate(t.db), MIGRATIONS.length);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM settings").get()?.n, 1);
  t.cleanup();
});

test("migrations apply forward in order and keep existing rows", () => {
  const t = tempDb();
  const v1 = MIGRATIONS.length;
  t.db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('keep', '\"me\"', 1)").run();
  const next = [...MIGRATIONS, (db: DatabaseSync) => db.exec("ALTER TABLE settings ADD COLUMN note TEXT"), (db: DatabaseSync) => db.exec("UPDATE settings SET note = 'done'")];
  assert.equal(migrate(t.db, next), v1 + 2);
  assert.equal(userVersion(t.db), v1 + 2);
  assert.deepEqual({ ...t.db.prepare("SELECT value, note FROM settings WHERE key = 'keep'").get() }, { value: '"me"', note: "done" });
  t.cleanup();
});

test("a failing migration rolls back completely and leaves the previous version", () => {
  const t = tempDb();
  const v = userVersion(t.db);
  const bad = [
    ...MIGRATIONS,
    (db: DatabaseSync) => db.exec("CREATE TABLE half (a INTEGER); INSERT INTO half VALUES (1)"),
    (db: DatabaseSync) => {
      db.exec("CREATE TABLE never (a INTEGER)");
      throw new Error("boom");
    },
  ];
  assert.throws(() => migrate(t.db, bad), /boom/);
  assert.equal(userVersion(t.db), v + 1, "the first extra migration stays applied");
  assert.ok(tables(t.db).includes("half"));
  assert.ok(!tables(t.db).includes("never"), "the failed migration's changes are gone");
  assert.equal(t.db.isTransaction, false);
  t.cleanup();
});

test("a database from a newer build is refused and left untouched, never quarantined", () => {
  const t = tempDb();
  t.db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 5}`);
  assert.throws(() => migrate(t.db), /newer/);
  t.db.close();
  assert.throws(() => openDb(t.file), /newer/);
  assert.ok(!readdirSync(t.dir).some((n) => n.includes("corrupt")));
  assert.equal(userVersion(new DatabaseSync(t.file)), MIGRATIONS.length + 5);
  t.cleanup();
});

test("a file that is not a database is moved aside and a fresh one starts", () => {
  const t = tempDb();
  t.db.close();
  writeFileSync(t.file, "definitely not sqlite ".repeat(500));
  const db = openDb(t.file);
  assert.equal(userVersion(db), MIGRATIONS.length);
  const kept = readdirSync(t.dir).filter((n) => /^housey\.db\.corrupt-\d+$/.test(n));
  assert.equal(kept.length, 1);
  assert.match(readFileSync(join(t.dir, kept[0]), "utf8"), /definitely not sqlite/);
  db.close();
  t.cleanup();
});

test("a real database that lost half its pages is moved aside too (integrity check)", () => {
  const t = tempDb();
  const ins = t.db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 1)");
  for (let i = 0; i < 400; i++) ins.run(`k${i}`, JSON.stringify("x".repeat(400)));
  t.db.close(); // checkpoints the WAL into the main file
  truncateSync(t.file, Math.floor(readFileSync(t.file).length / 2));
  const db = openDb(t.file);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM settings").get()?.n, 0, "starts empty");
  assert.ok(readdirSync(t.dir).some((n) => n.startsWith("housey.db.corrupt-")));
  db.close();
  t.cleanup();
});

test("getDb shares one connection and survives a module reload (cached on globalThis)", (ctx) => {
  const t = tempDb();
  t.db.close();
  process.env.HOUSEY_DB_PATH = t.file;
  ctx.after(() => {
    closeDb();
    delete process.env.HOUSEY_DB_PATH;
    t.cleanup();
  });
  const a = getDb();
  assert.equal(getDb(), a);
  assert.ok(existsSync(t.file));
  closeDb();
  assert.notEqual(getDb(), a, "reopens after an explicit close");
  closeDb();
});
