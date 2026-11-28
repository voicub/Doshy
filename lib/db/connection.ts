import { mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { clearTimeout, setInterval, setTimeout } from "node:timers";
import { backupBeforeImport, backupBeforeMigrate, dailyBackup } from "./backup.ts";
import { purgeDashboards } from "./dashboards.ts";
import { MIGRATIONS, migrate, userVersion } from "./migrations.ts";

const SQLITE_CORRUPT = 11;
const SQLITE_NOTADB = 26;
const SIDECARS = ["", "-wal", "-shm"];
const IDLE_MS = 10_000; // the daily backup waits for a quiet moment: it blocks writers while it copies
const BACKUP_CHECK_MS = 60_000;

/** `HOUSEY_DB_PATH` when set, else `data/housey.db` under the project. */
export const dbFile = () => resolve(process.env.HOUSEY_DB_PATH || "data/housey.db");
export const backupDir = (file = dbFile()) => join(dirname(file), "backups");

class CorruptError extends Error {}

const isCorrupt = (e: unknown) => e instanceof CorruptError || (e instanceof Error && "errcode" in e && (e.errcode === SQLITE_CORRUPT || e.errcode === SQLITE_NOTADB));

function configure(db: DatabaseSync) {
  db.exec("PRAGMA busy_timeout = 5000"); // first, so every later statement waits for a busy file instead of failing
  db.exec("PRAGMA journal_mode = WAL"); // throws "not a database" for a file that is not SQLite
  db.exec("PRAGMA synchronous = NORMAL"); // safe in WAL mode; the daily backup covers the power-loss corner
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_size_limit = 67108864");
  if (db.prepare("PRAGMA quick_check(1)").get()?.quick_check !== "ok") throw new CorruptError("integrity check failed");
}

/**
 * Migrate a database that already holds data: first keep a copy of it as it is ("housey-before-v<N>-<time>.db" in the backups folder), because a
 * migration rewrites the owner's data in place. No copy is made for a new file. If the copy cannot be made nothing is migrated.
 */
function upgrade(db: DatabaseSync, file: string): number {
  const v = userVersion(db);
  if (v > 0 && v < MIGRATIONS.length) backupBeforeMigrate(db, backupDir(file), MIGRATIONS.length);
  return migrate(db);
}

function init(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  try {
    configure(db);
    upgrade(db, file);
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}

/** Move a damaged database (and its WAL files) aside, keeping it for a human to look at. */
function quarantine(file: string): string {
  const stamp = `.corrupt-${Date.now()}`;
  for (const s of SIDECARS) {
    try {
      renameSync(file + s, file + s + stamp);
    } catch {
      /* a sidecar that does not exist is fine */
    }
  }
  return file + stamp;
}

/** Open (creating when missing) and migrate the database at `file`. A damaged file is moved aside and a fresh one started: the dashboard must never fail to start over it. */
export function openDb(file: string): DatabaseSync {
  mkdirSync(dirname(file), { recursive: true });
  try {
    return init(file);
  } catch (e) {
    if (!isCorrupt(e)) throw e; // busy, read-only disk, newer schema...: leave the file alone
    console.error(`housey: the database file is damaged; kept as ${quarantine(file)} and starting a new one`);
    return init(file);
  }
}

type Slot = { file: string; db: DatabaseSync; lastUse: number; timers: NodeJS.Timeout[]; schema: number };
// Next dev re-evaluates modules on hot reload: the one connection lives on globalThis so every reload shares it.
const g = globalThis as typeof globalThis & { __houseyDb?: Slot; __houseyTestDbs?: Map<string, DatabaseSync> };

function startBackups(slot: Slot) {
  const dir = backupDir(slot.file);
  let doneDay = "";
  const tick = () => {
    const day = new Date().toISOString().slice(0, 10);
    if (day === doneDay || Date.now() - slot.lastUse < IDLE_MS) return; // done today, or busy: look again in a minute
    try {
      dailyBackup(slot.db, dir);
      purgeDashboards(slot.db); // plans deleted more than a week ago (after the backup above, which still holds them)
      doneDay = day;
    } catch (e) {
      console.error("housey: daily backup failed", e);
    }
  };
  const first = setTimeout(tick, 15_000);
  const every = setInterval(tick, BACKUP_CHECK_MS);
  first.unref();
  every.unref();
  slot.timers.push(first, every);
}

/** The one shared connection (opened on first use). Throws when the database cannot be opened at all. */
export function getDb(): DatabaseSync {
  const file = dbFile();
  let slot = g.__houseyDb;
  if (slot && slot.file !== file) {
    closeDb();
    slot = undefined;
  }
  if (!slot) {
    slot = { file, db: openDb(file), lastUse: 0, timers: [], schema: MIGRATIONS.length };
    g.__houseyDb = slot;
    if (process.env.DOSHY_GUEST_ONLY !== "1") startBackups(slot); // a guest-only copy shares the file with the owner's Doshy, which makes the backups
  }
  // A connection opened before a hot reload (or by an older build) may predate the newest migrations: bring it up to date once, with the same safety copy.
  if (slot.schema !== MIGRATIONS.length) slot.schema = upgrade(slot.db, slot.file);
  slot.lastUse = Date.now();
  return slot.db;
}

const TEST_TOKEN = /^[a-z0-9]{8,32}$/;
const MAX_TEST_DBS = 4;
/** File name start of a throwaway test database in the temp folder (lib/server/secretBox.ts keeps its key apart from the real one). */
export const TEST_DB_PREFIX = "housey-test-";
export const isTestToken = (t: string) => TEST_TOKEN.test(t);

/**
 * Development only: a request that carries `X-Housey-Test: <token>` works on a throwaway database in the temp folder (one per token), so
 * browser tests can exercise every route without ever touching data/housey.db. Never available when NODE_ENV is production.
 */
export function getTestDb(token: string): DatabaseSync {
  const tests = (g.__houseyTestDbs ??= new Map<string, DatabaseSync>());
  let db = tests.get(token);
  if (!db) {
    if (tests.size >= MAX_TEST_DBS) {
      const oldest = tests.keys().next().value;
      if (oldest !== undefined) {
        tests.get(oldest)?.close();
        tests.delete(oldest);
      }
    }
    db = openDb(join(tmpdir(), `${TEST_DB_PREFIX}${token}.db`));
    tests.set(token, db);
  }
  if (userVersion(db) !== MIGRATIONS.length) migrate(db); // a throwaway database opened before a hot reload that added a migration
  return db;
}

export function closeDb(): void {
  const slot = g.__houseyDb;
  if (!slot) return;
  g.__houseyDb = undefined;
  for (const t of slot.timers) clearTimeout(t);
  try {
    slot.db.close();
  } catch {
    /* already closed */
  }
}

/** Swap in a validated backup file (`upload`, same folder as the database): keep a safety copy of the current data, replace, reopen (migrating forward when it is older). */
export function replaceDatabase(upload: string): void {
  const file = dbFile();
  backupBeforeImport(getDb(), backupDir(file));
  closeDb();
  for (const s of SIDECARS) rmSync(file + s, { force: true });
  renameSync(upload, file);
  getDb();
}

/** Size on disk of the database plus its write-ahead log. */
export function dbBytes(file = dbFile()): number {
  return SIDECARS.slice(0, 2).reduce((n, s) => {
    try {
      return n + statSync(file + s).size;
    } catch {
      return n;
    }
  }, 0);
}
