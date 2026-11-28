import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, truncateSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { test } from "node:test";
import { checkBackupFile } from "./backup.ts";
import { closeDb, getDb, openDb } from "./connection.ts";
import { MIGRATIONS, migrate, userVersion } from "./migrations.ts";
import { tempDb, v3Fixture } from "./testDb.ts";

const tables = (db: DatabaseSync) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => String(r.name));

test("a new database is migrated to the latest schema and marked as ours", () => {
  const t = tempDb();
  assert.equal(userVersion(t.db), MIGRATIONS.length);
  assert.deepEqual(tables(t.db).filter((n) => !n.startsWith("sqlite_")), ["blobs", "dashboards", "events", "guest_links", "ha_connections", "meta", "plans", "resources", "settings"]);
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

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const backupsOf = (dir: string) => (existsSync(join(dir, "backups")) ? readdirSync(join(dir, "backups")) : []);

test("migration 4 turns the single plan into plan 1 'Home' without touching the plan, its versions or the other settings", () => {
  const fx = v3Fixture(414, 5);
  const db = openDb(fx.file);
  assert.equal(userVersion(db), MIGRATIONS.length);
  assert.deepEqual(db.prepare("SELECT id, name, icon, deleted_at FROM dashboards").all().map((r) => ({ ...r })), [{ id: 1, name: "Home", icon: "house", deleted_at: null }]);
  assert.equal(db.prepare("SELECT value FROM meta WHERE key = 'default_dashboard'").get()?.value, "1");
  const working = db.prepare("SELECT json, version, format, updated_at, dashboard_id FROM plans WHERE active = 1").all();
  assert.equal(working.length, 1);
  assert.equal(working[0].version, 414, "the revision counter is untouched");
  assert.equal(sha(String(working[0].json)), sha(fx.planJson), "the plan text is byte for byte the same");
  assert.equal(working[0].dashboard_id, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM plans WHERE active = 0 AND dashboard_id = 1").get()?.n, fx.versions);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM plans WHERE dashboard_id IS NULL").get()?.n, 0, "no plan row is left without an owner");
  const settings = Object.fromEntries(db.prepare("SELECT key, value, updated_at FROM settings").all().map((r) => [String(r.key), [r.value, r.updated_at]]));
  assert.deepEqual(Object.keys(settings).sort(), ["housey-plan.1", "housey-sky"], "the plan's settings row moved to plan 1");
  assert.deepEqual(settings["housey-plan.1"], [JSON.stringify({ state: { time: 12, activeLevel: "ground" }, version: 15 }), 7000]);
  db.close();
  fx.cleanup();
});

test("migrating an existing database first keeps a copy of it as it was, and the copy is a working schema-3 database", () => {
  const fx = v3Fixture(414, 5);
  openDb(fx.file).close();
  const copies = backupsOf(fx.dir).filter((n) => new RegExp(`^housey-before-v${MIGRATIONS.length}-\\d+\\.db$`).test(n));
  assert.equal(copies.length, 1);
  const copy = new DatabaseSync(join(fx.dir, "backups", copies[0]));
  assert.equal(userVersion(copy), 3);
  assert.equal(copy.prepare("SELECT version FROM plans WHERE active = 1").get()?.version, 414);
  assert.equal(sha(String(copy.prepare("SELECT json FROM plans WHERE active = 1").get()?.json)), sha(fx.planJson));
  assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM plans WHERE active = 0").get()?.n, fx.versions);
  assert.ok(copy.prepare("SELECT 1 FROM settings WHERE key = 'housey-plan'").get(), "the old settings key is still in the copy");
  assert.equal(checkBackupFile(join(fx.dir, "backups", copies[0])), 3, "and the app accepts it as a backup to restore");
  copy.close();
  fx.cleanup();
});

test("opening the migrated database again changes nothing and makes no second copy; a brand new database makes none", () => {
  const fx = v3Fixture();
  openDb(fx.file).close();
  const db = openDb(fx.file);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dashboards").get()?.n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM settings").get()?.n, 2);
  assert.equal(backupsOf(fx.dir).length, 1);
  db.close();
  fx.cleanup();
  const t = tempDb();
  assert.deepEqual(backupsOf(t.dir), []);
  t.cleanup();
});

test("if the safety copy cannot be made the database is not migrated", () => {
  const fx = v3Fixture();
  writeFileSync(join(fx.dir, "backups"), "a file where the backups folder should be");
  assert.throws(() => openDb(fx.file));
  const db = new DatabaseSync(fx.file);
  assert.equal(userVersion(db), 3);
  assert.ok(db.prepare("SELECT 1 FROM settings WHERE key = 'housey-plan'").get());
  assert.ok(!readdirSync(fx.dir).some((n) => n.includes("corrupt")), "a failed copy is not mistaken for a damaged file");
  db.close();
  fx.cleanup();
});

test("an older database with no plan at all still gets plan 1 (the first save creates its working plan)", () => {
  const fx = v3Fixture();
  const raw = new DatabaseSync(fx.file);
  raw.exec("DELETE FROM plans; DELETE FROM settings");
  raw.close();
  const db = openDb(fx.file);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dashboards").get()?.n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM plans").get()?.n, 0);
  db.close();
  fx.cleanup();
});

test("a file migrated by this build is refused by a build that only knows schema 3 (the safe failure after a downgrade)", () => {
  const fx = v3Fixture();
  const db = openDb(fx.file);
  assert.throws(() => migrate(db, MIGRATIONS.slice(0, 3)), /newer/);
  assert.equal(userVersion(db), MIGRATIONS.length);
  db.close();
  fx.cleanup();
});

test("a plan row cannot point at a plan that does not exist, and only one working plan per plan", () => {
  const t = tempDb();
  const add = (dashboard: number, active: number) =>
    t.db.prepare("INSERT INTO plans (name, json, bytes, version, format, created_at, updated_at, active, dashboard_id) VALUES ('x', '{}', 2, 1, 1, 1, 1, ?, ?)").run(active, dashboard);
  assert.throws(() => add(99, 1), /FOREIGN KEY/);
  add(1, 1);
  assert.throws(() => add(1, 1), /UNIQUE/);
  assert.doesNotThrow(() => add(1, 0));
  t.cleanup();
});

test("a connection that was open before migration 4 existed is upgraded on its next use, with the same safety copy (hot reload of the dev server)", (ctx) => {
  const fx = v3Fixture();
  process.env.HOUSEY_DB_PATH = fx.file;
  ctx.after(() => {
    closeDb();
    delete process.env.HOUSEY_DB_PATH;
    fx.cleanup();
  });
  // what the module cache holds when the dev server was started by the previous build: an open schema-3 connection
  const stale = new DatabaseSync(fx.file);
  Reflect.set(globalThis, "__houseyDb", { file: fx.file, db: stale, lastUse: 0, timers: [], schema: 3 });
  const db = getDb();
  assert.equal(db, stale, "the same connection keeps being used");
  assert.equal(userVersion(db), MIGRATIONS.length);
  assert.equal(db.prepare("SELECT version FROM plans WHERE active = 1 AND dashboard_id = 1").get()?.version, 414);
  assert.equal(backupsOf(fx.dir).filter((n) => n.startsWith(`housey-before-v${MIGRATIONS.length}-`)).length, 1);
});

test("an old file (schema 3) restored through the backup check migrates to one plan 'Home' holding the old plan", () => {
  const fx = v3Fixture();
  assert.equal(checkBackupFile(fx.file), 3, "the file is accepted as a backup");
  const db = openDb(fx.file);
  assert.equal(db.prepare("SELECT name FROM dashboards").get()?.name, "Home");
  assert.equal(sha(String(db.prepare("SELECT json FROM plans WHERE dashboard_id = 1 AND active = 1").get()?.json)), sha(fx.planJson));
  db.close();
  fx.cleanup();
});

test("a file that says schema 4 but has no dashboards table is not accepted as a backup", () => {
  const fx = v3Fixture();
  const raw = new DatabaseSync(fx.file);
  raw.exec("PRAGMA user_version = 4");
  raw.close();
  assert.throws(() => checkBackupFile(fx.file), /not a Doshy backup/);
  fx.cleanup();
});
