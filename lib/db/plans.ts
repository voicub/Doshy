import type { DatabaseSync } from "node:sqlite";
import { HttpError } from "./errors.ts";
import { all, one, run, tx, type Row } from "./sql.ts";
import { cleanText } from "./text.ts";
import { isRecord } from "../guards.ts";
import { badRequest, isCount } from "./validate.ts";

/** At most one automatic version per this long of editing. */
export const SNAPSHOT_EVERY_MS = 5 * 60 * 1000;
/** Versions kept: the newest this many automatic ones, and separately the newest this many the user saved on purpose. */
export const KEEP_VERSIONS = 30;
export const MAX_PLAN_BYTES = 5 * 1024 * 1024;

/** `rev` counts every change of the working plan (optimistic concurrency); `format` is the client's persist version (starter-plan generation). */
type WorkingPlan = { rev: number; updatedAt: number; format: number; json: string };
export type Version = { id: number; label: string; manual: boolean; rev: number; savedAt: number; changedAt: number; bytes: number; summary: { items: number; walls: number; rooms: number } | null };
type PutResult = { ok: true; rev: number; updatedAt: number; changed: boolean } | { ok: false; server: WorkingPlan | null };

// The plan text is a few MB: it is only ever read when it must be sent, and copies between rows happen inside SQLite, never through JS.
const META = "SELECT version, format, updated_at, bytes FROM plans WHERE active = 1";
const VERSION_COLUMNS = "id, name, manual, version, created_at, updated_at, bytes, summary";

export function getPlan(db: DatabaseSync): WorkingPlan | null {
  const r = one(db, "SELECT json, version, format, updated_at FROM plans WHERE active = 1");
  return r ? { rev: Number(r.version), updatedAt: Number(r.updated_at), format: Number(r.format), json: String(r.json) } : null;
}

/** The working plan's revision without reading the plan itself (what a poll needs), or null when there is none. */
export const getPlanRev = (db: DatabaseSync): number | null => {
  const r = one(db, "SELECT version FROM plans WHERE active = 1");
  return r ? Number(r.version) : null;
};

/** The newest `KEEP_VERSIONS` of each kind survive; the rest go. */
function prune(db: DatabaseSync, manual: number) {
  run(db, "DELETE FROM plans WHERE active = 0 AND manual = ? AND id NOT IN (SELECT id FROM plans WHERE active = 0 AND manual = ? ORDER BY id DESC LIMIT ?)", manual, manual, KEEP_VERSIONS);
}

/**
 * Keep the working plan (the state about to be replaced) as a version. Automatic ones are throttled to one per `SNAPSHOT_EVERY_MS` and skipped
 * when the newest version already holds the same plan; `force` (a restore, an overwrite, "Save version now") always writes.
 * Returns the new version's id, or null when none was made.
 */
function snapshot(db: DatabaseSync, now: number, label: string, manual: boolean, force: boolean): number | null {
  if (!force) {
    const last = one(db, "SELECT created_at FROM plans WHERE active = 0 ORDER BY id DESC LIMIT 1");
    if (last && now - Number(last.created_at) < SNAPSHOT_EVERY_MS) return null;
    if (last && one(db, "SELECT 1 AS same FROM plans w, plans s WHERE w.active = 1 AND s.id = (SELECT MAX(id) FROM plans WHERE active = 0) AND w.bytes = s.bytes AND w.json = s.json")) return null;
  }
  const r = run(
    db,
    "INSERT INTO plans (name, json, bytes, version, format, created_at, updated_at, active, manual, summary) SELECT ?, json, bytes, version, format, ?, updated_at, 0, ?, summary FROM plans WHERE active = 1",
    label,
    now,
    manual ? 1 : 0,
  );
  prune(db, manual ? 1 : 0);
  return Number(r.lastInsertRowid);
}

/**
 * Save the working plan if the caller saw the latest revision (`baseRev`). Otherwise nothing is written and the server copy comes back so the
 * client can choose. `overwrite` marks a deliberate "keep mine" after a conflict: the replaced plan is always kept as a version first.
 */
export function putPlan(db: DatabaseSync, input: { json: string; baseRev: number; format: number; summary?: string; overwrite?: boolean }, now = Date.now()): PutResult {
  const { json, baseRev, format } = input;
  const bytes = Buffer.byteLength(json);
  if (bytes > MAX_PLAN_BYTES) throw new HttpError(413, "too_big", "This plan is too large to keep on the server (5 MB at most).");
  return tx(db, () => {
    const cur = one(db, META);
    if (!cur) {
      run(db, "INSERT INTO plans (name, json, bytes, version, format, created_at, updated_at, active, summary) VALUES ('Working plan', ?, ?, 1, ?, ?, ?, 1, ?)", json, bytes, format, now, now, input.summary ?? "");
      return { ok: true, rev: 1, updatedAt: now, changed: true } as const;
    }
    const rev = Number(cur.version);
    if (rev !== baseRev) return { ok: false, server: getPlan(db) } as const;
    if (Number(cur.format) === format && Number(cur.bytes) === bytes && one(db, "SELECT 1 AS same FROM plans WHERE active = 1 AND json = ?", json)) return { ok: true, rev, updatedAt: Number(cur.updated_at), changed: false } as const;
    if (input.overwrite) snapshot(db, now, "Before overwrite", false, true);
    else snapshot(db, now, "", false, false);
    run(db, "UPDATE plans SET json = ?, bytes = ?, format = ?, summary = ?, version = version + 1, updated_at = ? WHERE active = 1", json, bytes, format, input.summary ?? "", now);
    return { ok: true, rev: rev + 1, updatedAt: now, changed: true } as const;
  });
}

function parseSummary(s: unknown): Version["summary"] {
  try {
    const v: unknown = JSON.parse(String(s));
    return isRecord(v) && typeof v.items === "number" && typeof v.walls === "number" && typeof v.rooms === "number" ? { items: v.items, walls: v.walls, rooms: v.rooms } : null;
  } catch {
    return null;
  }
}

const asVersion = (r: Row): Version => ({ id: Number(r.id), label: String(r.name), manual: Number(r.manual) === 1, rev: Number(r.version), savedAt: Number(r.created_at), changedAt: Number(r.updated_at), bytes: Number(r.bytes), summary: parseSummary(r.summary) });

/** A version row that was just written in the same transaction. */
function versionById(db: DatabaseSync, id: number | bigint | null): Version {
  const r = one(db, `SELECT ${VERSION_COLUMNS} FROM plans WHERE id = ?`, id);
  if (!r) throw new HttpError(404, "not_found", "That version no longer exists.");
  return asVersion(r);
}

/** Newest first. Never loads the plans themselves. */
export function listVersions(db: DatabaseSync): Version[] {
  return all(db, `SELECT ${VERSION_COLUMNS} FROM plans WHERE active = 0 ORDER BY id DESC`).map(asVersion);
}

/** "Save version now": keep the working plan as a labelled version. */
export function saveVersion(db: DatabaseSync, label: unknown, now = Date.now()): Version {
  const name = cleanText(label, 60, "Saved version");
  return tx(db, () => {
    if (!one(db, META)) throw new HttpError(409, "empty", "There is no plan to save yet.");
    const id = snapshot(db, now, name, true, true);
    return versionById(db, id);
  });
}

/** Make a saved version the working plan. The plan being replaced is kept as a version first, so a restore can itself be undone. */
export function restoreVersion(db: DatabaseSync, id: number, now = Date.now()): WorkingPlan {
  return tx(db, () => {
    const v = one(db, "SELECT format, bytes FROM plans WHERE id = ? AND active = 0", id);
    if (!v) throw new HttpError(404, "not_found", "That version no longer exists.");
    const cur = one(db, META);
    if (!cur) {
      run(db, "INSERT INTO plans (name, json, bytes, version, format, created_at, updated_at, active, summary) SELECT 'Working plan', json, bytes, 1, format, ?, ?, 1, summary FROM plans WHERE id = ?", now, now, id);
    } else if (cur.format !== v.format || cur.bytes !== v.bytes || !one(db, "SELECT 1 AS same FROM plans w, plans s WHERE w.active = 1 AND s.id = ? AND w.json = s.json", id)) {
      snapshot(db, now, "Before restore", false, true);
      run(
        db,
        "UPDATE plans SET json = (SELECT json FROM plans WHERE id = ?), bytes = ?, format = ?, summary = (SELECT summary FROM plans WHERE id = ?), version = version + 1, updated_at = ? WHERE active = 1",
        id,
        Number(v.bytes),
        Number(v.format),
        id,
        now,
      );
    }
    const restored = getPlan(db);
    if (!restored) throw new HttpError(404, "not_found", "That version no longer exists.");
    return restored;
  });
}

/** The working plan as the clients read it. The stored plan text is embedded as is (no parse and re-stringify of megabytes). */
export const planText = (p: WorkingPlan) => `{"rev":${p.rev},"updatedAt":${p.updatedAt},"format":${p.format},"plan":${p.json}}`;

type PlanBody = { json: string; summary: string; baseRev: number; format: number; overwrite: boolean };

const LISTS = ["walls", "openings", "rooms", "items"];

/** A plan the server is willing to keep: its JSON text and a small summary (counts) kept beside it. */
export function checkPlan(plan: unknown): { json: string; summary: string } {
  if (!isRecord(plan) || !LISTS.every((k) => Array.isArray(plan[k]))) throw badRequest("That is not a plan the server can keep.");
  const count = (k: string) => (Array.isArray(plan[k]) ? plan[k].length : 0);
  return { json: JSON.stringify(plan), summary: JSON.stringify({ items: count("items"), walls: count("walls"), rooms: count("rooms") }) };
}

/** Check a PUT body `{ plan, baseRev, format, overwrite? }` and return what `putPlan` needs. The plan itself must look like a plan (the four lists). */
export function parsePlanBody(body: unknown): PlanBody {
  if (!isRecord(body)) throw badRequest("That is not a plan the server can keep.");
  const plan = checkPlan(body.plan);
  if (!isCount(body.baseRev, Number.MAX_SAFE_INTEGER) || !isCount(body.format, 1_000_000)) throw badRequest("The plan is missing its revision details.");
  return { ...plan, baseRev: body.baseRev, format: body.format, overwrite: body.overwrite === true };
}

/**
 * Keep a plan that is NOT the working plan as a saved version (a plan a device is about to lose, say). The working plan is untouched.
 * Body `{ label?, plan?, format? }`: without `plan` it is "Save version now".
 */
export function parseVersionBody(body: unknown): { label: unknown; plan: { json: string; summary: string; format: number } | null } {
  if (!isRecord(body)) throw badRequest("Expected an object.");
  if (body.plan === undefined) return { label: body.label, plan: null };
  if (!isCount(body.format, 1_000_000)) throw badRequest("The plan is missing its format.");
  return { label: body.label, plan: { ...checkPlan(body.plan), format: body.format } };
}

export function saveVersionOf(db: DatabaseSync, plan: { json: string; summary: string; format: number }, label: unknown, now = Date.now()): Version {
  const bytes = Buffer.byteLength(plan.json);
  if (bytes > MAX_PLAN_BYTES) throw new HttpError(413, "too_big", "This plan is too large to keep on the server (5 MB at most).");
  const name = cleanText(label, 60, "Saved version");
  return tx(db, () => {
    const rev = getPlanRev(db) ?? 0;
    const r = run(db, "INSERT INTO plans (name, json, bytes, version, format, created_at, updated_at, active, manual, summary) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?)", name, plan.json, bytes, rev, plan.format, now, now, plan.summary);
    prune(db, 1);
    return versionById(db, r.lastInsertRowid);
  });
}
