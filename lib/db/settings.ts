import type { DatabaseSync } from "node:sqlite";
import { HttpError } from "./errors.ts";
import { all, run, tx } from "./sql.ts";

const KEY_RE = /^[a-z0-9._-]{1,64}$/;
export const MAX_VALUE_BYTES = 256 * 1024;
export const MAX_KEYS_PER_WRITE = 64;

export type Setting = { value: unknown; updatedAt: number };

/** Every setting in one query (the dashboard asks once on boot). */
export function getSettings(db: DatabaseSync): Record<string, Setting> {
  const out: Record<string, Setting> = {};
  for (const r of all(db, "SELECT key, value, updated_at FROM settings")) out[String(r.key)] = { value: JSON.parse(String(r.value)), updatedAt: Number(r.updated_at) };
  return out;
}

/** Validate a bulk write and return the JSON text to store for each key. Nothing is written when any key or value is refused. */
function checkSettings(entries: unknown): [string, string][] {
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) throw new HttpError(400, "bad_request", "Expected an object of settings.");
  const pairs = Object.entries(entries);
  if (!pairs.length || pairs.length > MAX_KEYS_PER_WRITE) throw new HttpError(400, "bad_request", `Send between 1 and ${MAX_KEYS_PER_WRITE} settings at a time.`);
  return pairs.map(([key, value]) => {
    if (!KEY_RE.test(key)) throw new HttpError(400, "bad_key", "A setting name may only use a-z, 0-9, dot, dash and underscore (up to 64 characters).");
    const json = value === undefined ? undefined : JSON.stringify(value);
    if (json === undefined) throw new HttpError(400, "bad_value", "A setting needs a value.");
    if (Buffer.byteLength(json) > MAX_VALUE_BYTES) throw new HttpError(413, "too_big", "That setting is too large to keep (256 KB at most).");
    return [key, json];
  });
}

/** Set many keys in one transaction. A key whose value did not change is not rewritten (no WAL churn from repeated identical saves). */
export function setSettings(db: DatabaseSync, entries: unknown, now = Date.now()): number {
  const pairs = checkSettings(entries);
  return tx(db, () => {
    let changed = 0;
    for (const [key, json] of pairs) {
      const r = run(
        db,
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE value IS NOT excluded.value",
        key,
        json,
        now,
      );
      changed += Number(r.changes);
    }
    return changed;
  });
}
