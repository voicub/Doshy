import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { HttpError } from "./errors.ts";
import { MIGRATIONS, REQUIRED_TABLES, userVersion } from "./migrations.ts";

export const KEEP_DAILY = 7;
export const KEEP_BEFORE_IMPORT = 3;
const DAILY = /^housey-(\d{4}-\d{2}-\d{2})\.db$/;
const BEFORE_IMPORT = /^housey-before-import-(\d+)\.db$/;

/** A consistent copy of the live database (safe while it is being written). Written to a temp name first, so a half-written copy never looks like a backup. */
export function snapshotTo(db: DatabaseSync, dest: string): void {
  const tmp = `${dest}.tmp`;
  rmSync(tmp, { force: true });
  db.prepare("VACUUM INTO ?").run(tmp);
  renameSync(tmp, dest);
}

/** Keep the newest `KEEP_DAILY` day files and `KEEP_BEFORE_IMPORT` safety copies; stray .tmp files go too. */
function pruneBackups(dir: string): void {
  if (!existsSync(dir)) return;
  const names = readdirSync(dir);
  const drop = (pattern: RegExp, keep: number) => names.filter((n) => pattern.test(n)).sort().reverse().slice(keep);
  for (const n of [...drop(DAILY, KEEP_DAILY), ...drop(BEFORE_IMPORT, KEEP_BEFORE_IMPORT), ...names.filter((n) => n.endsWith(".tmp"))]) rmSync(join(dir, n), { force: true });
}

/** Today's backup, made once per UTC day. Returns the new file, or null when today's already exists. */
export function dailyBackup(db: DatabaseSync, dir: string, now = new Date()): string | null {
  const file = join(dir, `housey-${now.toISOString().slice(0, 10)}.db`);
  if (existsSync(file)) return null;
  mkdirSync(dir, { recursive: true });
  snapshotTo(db, file);
  pruneBackups(dir);
  return file;
}

/** Safety copy made right before a backup file replaces the live database. */
export function backupBeforeImport(db: DatabaseSync, dir: string, now = Date.now()): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `housey-before-import-${now}.db`);
  snapshotTo(db, file);
  pruneBackups(dir);
  return file;
}

/** When the newest automatic backup was made (ms), or null. */
export function lastBackupAt(dir: string): number | null {
  if (!existsSync(dir)) return null;
  const newest = readdirSync(dir).filter((n) => DAILY.test(n)).sort().at(-1);
  return newest ? statSync(join(dir, newest)).mtimeMs : null;
}

const notBackup = () => new HttpError(400, "bad_backup", "That file is not a Doshy backup.");

/** Refuse anything that is not a healthy SQLite file with our tables, from this or an older build. Never modifies the file. */
export function checkBackupFile(file: string): number {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file);
    if (db.prepare("PRAGMA quick_check(1)").get()?.quick_check !== "ok") throw notBackup();
    const have = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => String(r.name)));
    if (!REQUIRED_TABLES.every((t) => have.has(t)) || db.prepare("SELECT value FROM meta WHERE key = 'app'").get()?.value !== "housey") throw notBackup();
    const v = userVersion(db);
    if (v < 1) throw notBackup();
    if (v > MIGRATIONS.length) throw new HttpError(400, "newer_backup", "That backup was made by a newer version of Doshy.");
    return v;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw notBackup(); // not a database at all, damaged, or a different schema
  } finally {
    db?.close();
    for (const s of ["-wal", "-shm", "-journal"]) rmSync(file + s, { force: true });
  }
}
