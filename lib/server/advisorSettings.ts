import type { DatabaseSync } from "node:sqlite";
import { parseSettings } from "../advisorSettings.ts";
import { isRecord } from "../guards.ts";
import { HttpError } from "../db/errors.ts";
import { getSettings } from "../db/settings.ts";
import { one, run } from "../db/sql.ts";
import { keyFileFor, loadKey, open, seal } from "./secretBox.ts";

const TOKEN_KEY = "advisor-entsoe-token";
export function advisorToken(db: DatabaseSync): string | null {
  const row = one(db, "SELECT value FROM meta WHERE key = ?", TOKEN_KEY);
  return row ? open(loadKey(keyFileFor(db)), String(row.value)) : null;
}
export function advisorSettings(db: DatabaseSync) {
  return { settings: parseSettings(getSettings(db)["housey-advisor"]?.value), tokenSaved: advisorToken(db) !== null };
}
export function saveAdvisorSettings(db: DatabaseSync, body: unknown) {
  const bad = () => new HttpError(400, "bad_request", "Send settings and an optional ENTSO-E token.");
  if (!isRecord(body) || !isRecord(body.settings) || Object.keys(body).some((k) => !["settings", "token", "clearToken"].includes(k))) throw bad();
  if (body.clearToken !== undefined && typeof body.clearToken !== "boolean") throw bad();
  if (body.token !== undefined && (typeof body.token !== "string" || !/^[A-Za-z0-9-]{8,128}$/.test(body.token))) throw bad();
  if (body.token !== undefined && body.clearToken === true) throw bad();
  const settings = parseSettings(body.settings);
  const encrypted = typeof body.token === "string" ? seal(loadKey(keyFileFor(db)), body.token) : null;
  db.exec("BEGIN IMMEDIATE");
  try {
    // setSettings owns its transaction; write this single validated row alongside the secret instead.
    run(db, "INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", "housey-advisor", JSON.stringify(settings), Date.now());
    if (encrypted) run(db, "INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", TOKEN_KEY, encrypted);
    if (body.clearToken === true) run(db, "DELETE FROM meta WHERE key = ?", TOKEN_KEY);
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
  return advisorSettings(db);
}
