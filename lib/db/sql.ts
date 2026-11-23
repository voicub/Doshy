import type { DatabaseSync, SQLInputValue, StatementSync } from "node:sqlite";

// One prepared statement per distinct SQL text and connection: the statements here are tiny and hot, so they are compiled once.
const cache = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

function stmt(db: DatabaseSync, sql: string): StatementSync {
  let m = cache.get(db);
  if (!m) cache.set(db, (m = new Map()));
  let s = m.get(sql);
  if (!s) m.set(sql, (s = db.prepare(sql)));
  return s;
}

export type Row = Record<string, unknown>;
export const one = (db: DatabaseSync, sql: string, ...args: SQLInputValue[]): Row | undefined => stmt(db, sql).get(...args);
export const all = (db: DatabaseSync, sql: string, ...args: SQLInputValue[]): Row[] => stmt(db, sql).all(...args);
export const run = (db: DatabaseSync, sql: string, ...args: SQLInputValue[]) => stmt(db, sql).run(...args);

/** Run `fn` in a write transaction that takes the write lock up front, so two writers queue (busy_timeout) instead of failing half way. */
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
}
