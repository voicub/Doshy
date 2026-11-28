import assert from "node:assert/strict";
import { copyFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { KEEP_BEFORE_IMPORT, KEEP_BEFORE_MIGRATE, KEEP_DAILY, backupBeforeImport, backupBeforeMigrate, checkBackupFile, dailyBackup, lastBackupAt, snapshotTo } from "./backup.ts";
import { closeDb, getDb, replaceDatabase } from "./connection.ts";
import { HttpError } from "./errors.ts";
import { MIGRATIONS } from "./migrations.ts";
import { setSettings } from "./settings.ts";
import { tempDb, v3Fixture } from "./testDb.ts";

const bad = (e: unknown) => e instanceof HttpError && e.status === 400;
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 12));

test("a daily backup is made once per day and only the newest 7 are kept", () => {
  const t = tempDb();
  const dir = join(t.dir, "backups");
  setSettings(t.db, { a: 1 });
  assert.ok(dailyBackup(t.db, dir, day(0)));
  assert.equal(dailyBackup(t.db, dir, day(0)), null, "already done today");
  for (let i = 1; i < 10; i++) dailyBackup(t.db, dir, day(i));
  const files = readdirSync(dir).sort();
  assert.equal(files.length, KEEP_DAILY);
  assert.equal(files[0], "housey-2026-01-04.db");
  assert.equal(files.at(-1), "housey-2026-01-10.db");
  assert.ok(lastBackupAt(dir)! > 0);
  t.cleanup();
});

test("a backup is a complete, openable copy that passes the check", () => {
  const t = tempDb();
  setSettings(t.db, { keep: { me: true } });
  const file = join(t.dir, "copy.db");
  snapshotTo(t.db, file);
  assert.equal(checkBackupFile(file), MIGRATIONS.length);
  const copy = new DatabaseSync(file);
  assert.equal(copy.prepare("SELECT value FROM settings WHERE key = 'keep'").get()?.value, '{"me":true}');
  copy.close();
  assert.ok(!existsSync(`${file}.tmp`));
  t.cleanup();
});

test("safety copies made before an import are limited too", () => {
  const t = tempDb();
  const dir = join(t.dir, "backups");
  for (let i = 0; i < KEEP_BEFORE_IMPORT + 3; i++) backupBeforeImport(t.db, dir, 1000 + i);
  assert.equal(readdirSync(dir).length, KEEP_BEFORE_IMPORT);
  t.cleanup();
});

test("pre-migration copies are limited to the newest few (ordered by time, not by name), and are not mistaken for the other kinds", () => {
  const t = tempDb();
  const dir = join(t.dir, "backups");
  backupBeforeImport(t.db, dir, 5);
  dailyBackup(t.db, dir, day(0));
  for (const at of [900, 1000, 20_000, 300_000, 4_000_000]) backupBeforeMigrate(t.db, dir, 4, at);
  assert.deepEqual(readdirSync(dir).filter((n) => n.startsWith("housey-before-v")).sort(), ["housey-before-v4-20000.db", "housey-before-v4-300000.db", "housey-before-v4-4000000.db"]);
  assert.equal(KEEP_BEFORE_MIGRATE, 3);
  assert.equal(readdirSync(dir).length, 3 + 2, "the daily backup and the import safety copy are untouched");
  t.cleanup();
});

test("only a healthy Doshy database is accepted as a backup", () => {
  const t = tempDb();
  const text = join(t.dir, "notes.db");
  writeFileSync(text, "just some text ".repeat(200));
  assert.throws(() => checkBackupFile(text), bad);

  const empty = join(t.dir, "empty.db");
  const other = new DatabaseSync(empty);
  other.exec("CREATE TABLE unrelated (a INTEGER)");
  other.close();
  assert.throws(() => checkBackupFile(empty), bad, "a SQLite file without our tables");

  const lookalike = join(t.dir, "lookalike.db");
  snapshotTo(t.db, lookalike);
  const l = new DatabaseSync(lookalike);
  l.exec("UPDATE meta SET value = 'something-else' WHERE key = 'app'");
  l.close();
  assert.throws(() => checkBackupFile(lookalike), bad);

  const newer = join(t.dir, "newer.db");
  snapshotTo(t.db, newer);
  const n = new DatabaseSync(newer);
  n.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
  n.close();
  assert.throws(() => checkBackupFile(newer), (e) => bad(e) && e instanceof Error && /newer/.test(e.message));
  t.cleanup();
});

test("restoring a backup swaps the data in, keeps a safety copy of what was there, and the connection keeps working", (ctx) => {
  const t = tempDb();
  t.db.close();
  process.env.HOUSEY_DB_PATH = t.file;
  ctx.after(() => {
    closeDb();
    delete process.env.HOUSEY_DB_PATH;
    t.cleanup();
  });
  const live = getDb();
  setSettings(live, { which: "backup" });
  const backup = join(t.dir, "incoming.tmp");
  snapshotTo(live, backup);
  setSettings(live, { which: "current", extra: 1 });

  replaceDatabase(backup);

  const now = getDb();
  assert.equal(now.prepare("SELECT value FROM settings WHERE key = 'which'").get()?.value, '"backup"');
  assert.equal(now.prepare("SELECT COUNT(*) AS n FROM settings").get()?.n, 1);
  const safety = readdirSync(join(t.dir, "backups")).find((n) => n.startsWith("housey-before-import-"));
  assert.ok(safety, "the data that was replaced is still on disk");
  const old = new DatabaseSync(join(t.dir, "backups", safety));
  assert.equal(old.prepare("SELECT value FROM settings WHERE key = 'which'").get()?.value, '"current"');
  old.close();
  assert.ok(!existsSync(backup), "the upload was moved into place");
});

test("restoring an old backup (before several plans existed) gives one plan 'Home' with the old plan, versions and settings", (ctx) => {
  const t = tempDb();
  t.db.close();
  process.env.HOUSEY_DB_PATH = t.file;
  const old = v3Fixture(414, 5);
  ctx.after(() => {
    closeDb();
    delete process.env.HOUSEY_DB_PATH;
    t.cleanup();
    old.cleanup();
  });
  getDb();
  const upload = join(t.dir, "incoming.tmp");
  copyFileSync(old.file, upload);
  assert.equal(checkBackupFile(upload), 3);
  replaceDatabase(upload);
  const now = getDb();
  assert.equal(now.prepare("SELECT name FROM dashboards").get()?.name, "Home");
  assert.equal(now.prepare("SELECT version FROM plans WHERE dashboard_id = 1 AND active = 1").get()?.version, 414);
  assert.equal(now.prepare("SELECT COUNT(*) AS n FROM plans WHERE dashboard_id = 1 AND active = 0").get()?.n, 5);
  assert.ok(now.prepare("SELECT 1 FROM settings WHERE key = 'housey-plan.1'").get(), "the plan's own settings row travelled with it");
  assert.ok(!now.prepare("SELECT 1 FROM settings WHERE key = 'housey-plan'").get());
  assert.ok(readdirSync(join(t.dir, "backups")).some((n) => n.startsWith("housey-before-import-")), "what was there before is kept");
});
