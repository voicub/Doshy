import type { DatabaseSync } from "node:sqlite";
import { insertWorkingPlan, requireDashboard } from "./dashboards.ts";
import { HttpError } from "./errors.ts";
import { checkPlan, parseSummary, tooBigPlan, MAX_PLAN_BYTES, type Summary } from "./planDoc.ts";
import { all, one, run, tx, type Row } from "./sql.ts";
import { cleanText } from "./text.ts";
import { isRecord } from "../guards.ts";
import { badRequest, isCount } from "./validate.ts";

/** At most one automatic version per this long of editing. */
export const SNAPSHOT_EVERY_MS = 5 * 60 * 1000;
/** Versions kept PER PLAN: the newest this many automatic ones, and separately the newest this many the user saved on purpose. */
export const KEEP_VERSIONS = 30;

/** `rev` counts every change of the working plan (optimistic concurrency); `format` is the client's persist version (starter-plan generation). */
type WorkingPlan = { rev: number; updatedAt: number; format: number; json: string };
export type Version = { id: number; label: string; manual: boolean; rev: number; savedAt: number; changedAt: number; bytes: number; summary: Summary | null };
type PutResult = { ok: true; rev: number; updatedAt: number; changed: boolean } | { ok: false; server: WorkingPlan | null };

// Every function here works on ONE dashboard's rows (`plans.dashboard_id`): its working plan (active = 1) and its versions (active = 0).
// The plan text is a few MB: it is only ever read when it must be sent, and copies between rows happen inside SQLite, never through JS.
const META = "SELECT version, format, updated_at, bytes FROM plans WHERE dashboard_id = ? AND active = 1";
const VERSION_COLUMNS = "id, name, manual, version, created_at, updated_at, bytes, summary";

export function getPlan(db: DatabaseSync, dashboardId: number): WorkingPlan | null {
  const r = one(db, "SELECT json, version, format, updated_at FROM plans WHERE dashboard_id = ? AND active = 1", dashboardId);
  return r ? { rev: Number(r.version), updatedAt: Number(r.updated_at), format: Number(r.format), json: String(r.json) } : null;
}

/** The working plan's revision without reading the plan itself, or null when there is none. */
export const getPlanRev = (db: DatabaseSync, dashboardId: number): number | null => {
  const r = one(db, "SELECT version FROM plans WHERE dashboard_id = ? AND active = 1", dashboardId);
  return r ? Number(r.version) : null;
};

/** The newest `KEEP_VERSIONS` of each kind survive; the rest go. */
function prune(db: DatabaseSync, dashboardId: number, manual: number) {
  run(
    db,
    "DELETE FROM plans WHERE dashboard_id = ? AND active = 0 AND manual = ? AND id NOT IN (SELECT id FROM plans WHERE dashboard_id = ? AND active = 0 AND manual = ? ORDER BY id DESC LIMIT ?)",
    dashboardId,
    manual,
    dashboardId,
    manual,
    KEEP_VERSIONS,
  );
}

/**
 * Keep the working plan (the state about to be replaced) as a version. Automatic ones are throttled to one per `SNAPSHOT_EVERY_MS` and skipped
 * when the newest version already holds the same plan; `force` (a restore, an overwrite, "Save version now") always writes.
 * Returns the new version's id, or null when none was made.
 */
function snapshot(db: DatabaseSync, dashboardId: number, now: number, label: string, manual: boolean, force: boolean): number | null {
  if (!force) {
    const last = one(db, "SELECT created_at FROM plans WHERE dashboard_id = ? AND active = 0 ORDER BY id DESC LIMIT 1", dashboardId);
    if (last && now - Number(last.created_at) < SNAPSHOT_EVERY_MS) return null;
    if (
      last &&
      one(
        db,
        "SELECT 1 AS same FROM plans w, plans s WHERE w.dashboard_id = ? AND w.active = 1 AND s.id = (SELECT MAX(id) FROM plans WHERE dashboard_id = ? AND active = 0) AND w.bytes = s.bytes AND w.json = s.json",
        dashboardId,
        dashboardId,
      )
    )
      return null;
  }
  const r = run(
    db,
    "INSERT INTO plans (name, json, bytes, version, format, created_at, updated_at, active, manual, summary, dashboard_id) SELECT ?, json, bytes, version, format, ?, updated_at, 0, ?, summary, dashboard_id FROM plans WHERE dashboard_id = ? AND active = 1",
    label,
    now,
    manual ? 1 : 0,
    dashboardId,
  );
  prune(db, dashboardId, manual ? 1 : 0);
  return Number(r.lastInsertRowid);
}

/**
 * Save the dashboard's working plan if the caller saw the latest revision (`baseRev`). Otherwise nothing is written and the server copy comes back so the
 * client can choose. `overwrite` marks a deliberate "keep mine" after a conflict: the replaced plan is always kept as a version first.
 * 404 when the dashboard does not exist (or is deleted): a device editing a plan removed elsewhere must find out, not recreate it.
 */
export function putPlan(db: DatabaseSync, dashboardId: number, input: { json: string; baseRev: number; format: number; summary?: string; overwrite?: boolean }, now = Date.now()): PutResult {
  const { json, baseRev, format } = input;
  const bytes = Buffer.byteLength(json);
  if (bytes > MAX_PLAN_BYTES) throw tooBigPlan();
  return tx(db, () => {
    requireDashboard(db, dashboardId);
    const cur = one(db, META, dashboardId);
    if (!cur) {
      insertWorkingPlan(db, dashboardId, { json, summary: input.summary ?? "", format }, now);
      return { ok: true, rev: 1, updatedAt: now, changed: true } as const;
    }
    const rev = Number(cur.version);
    if (rev !== baseRev) return { ok: false, server: getPlan(db, dashboardId) } as const;
    if (Number(cur.format) === format && Number(cur.bytes) === bytes && one(db, "SELECT 1 AS same FROM plans WHERE dashboard_id = ? AND active = 1 AND json = ?", dashboardId, json)) return { ok: true, rev, updatedAt: Number(cur.updated_at), changed: false } as const;
    if (input.overwrite) snapshot(db, dashboardId, now, "Before overwrite", false, true);
    else snapshot(db, dashboardId, now, "", false, false);
    run(db, "UPDATE plans SET json = ?, bytes = ?, format = ?, summary = ?, version = version + 1, updated_at = ? WHERE dashboard_id = ? AND active = 1", json, bytes, format, input.summary ?? "", now, dashboardId);
    return { ok: true, rev: rev + 1, updatedAt: now, changed: true } as const;
  });
}

const asVersion = (r: Row): Version => ({ id: Number(r.id), label: String(r.name), manual: Number(r.manual) === 1, rev: Number(r.version), savedAt: Number(r.created_at), changedAt: Number(r.updated_at), bytes: Number(r.bytes), summary: parseSummary(r.summary) });

/** A version row that was just written in the same transaction. */
function versionById(db: DatabaseSync, id: number | bigint | null): Version {
  const r = one(db, `SELECT ${VERSION_COLUMNS} FROM plans WHERE id = ?`, id);
  if (!r) throw new HttpError(404, "not_found", "That version no longer exists.");
  return asVersion(r);
}

/** The dashboard's versions, newest first. Never loads the plans themselves. */
export function listVersions(db: DatabaseSync, dashboardId: number): Version[] {
  return all(db, `SELECT ${VERSION_COLUMNS} FROM plans WHERE dashboard_id = ? AND active = 0 ORDER BY id DESC`, dashboardId).map(asVersion);
}

/** "Save version now": keep the working plan as a labelled version. */
export function saveVersion(db: DatabaseSync, dashboardId: number, label: unknown, now = Date.now()): Version {
  const name = cleanText(label, 60, "Saved version");
  return tx(db, () => {
    requireDashboard(db, dashboardId);
    if (!one(db, META, dashboardId)) throw new HttpError(409, "empty", "There is no plan to save yet.");
    const id = snapshot(db, dashboardId, now, name, true, true);
    return versionById(db, id);
  });
}

/**
 * Make a saved version the working plan of its dashboard. The plan being replaced is kept as a version first, so a restore can itself be undone.
 * A version of ANOTHER dashboard is "not found" here.
 */
export function restoreVersion(db: DatabaseSync, dashboardId: number, id: number, now = Date.now()): WorkingPlan {
  return tx(db, () => {
    requireDashboard(db, dashboardId);
    const v = one(db, "SELECT format, bytes FROM plans WHERE id = ? AND dashboard_id = ? AND active = 0", id, dashboardId);
    if (!v) throw new HttpError(404, "not_found", "That version no longer exists.");
    const cur = one(db, META, dashboardId);
    if (!cur) {
      run(db, "INSERT INTO plans (name, json, bytes, version, format, created_at, updated_at, active, summary, dashboard_id) SELECT 'Working plan', json, bytes, 1, format, ?, ?, 1, summary, dashboard_id FROM plans WHERE id = ?", now, now, id);
    } else if (cur.format !== v.format || cur.bytes !== v.bytes || !one(db, "SELECT 1 AS same FROM plans w, plans s WHERE w.dashboard_id = ? AND w.active = 1 AND s.id = ? AND w.json = s.json", dashboardId, id)) {
      snapshot(db, dashboardId, now, "Before restore", false, true);
      run(
        db,
        "UPDATE plans SET json = (SELECT json FROM plans WHERE id = ?), bytes = ?, format = ?, summary = (SELECT summary FROM plans WHERE id = ?), version = version + 1, updated_at = ? WHERE dashboard_id = ? AND active = 1",
        id,
        Number(v.bytes),
        Number(v.format),
        id,
        now,
        dashboardId,
      );
    }
    const restored = getPlan(db, dashboardId);
    if (!restored) throw new HttpError(404, "not_found", "That version no longer exists.");
    return restored;
  });
}

/** The working plan as the clients read it. The stored plan text is embedded as is (no parse and re-stringify of megabytes). */
export const planText = (p: WorkingPlan) => `{"rev":${p.rev},"updatedAt":${p.updatedAt},"format":${p.format},"plan":${p.json}}`;

type PlanBody = { json: string; summary: string; baseRev: number; format: number; overwrite: boolean };

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

export function saveVersionOf(db: DatabaseSync, dashboardId: number, plan: { json: string; summary: string; format: number }, label: unknown, now = Date.now()): Version {
  const bytes = Buffer.byteLength(plan.json);
  if (bytes > MAX_PLAN_BYTES) throw tooBigPlan();
  const name = cleanText(label, 60, "Saved version");
  return tx(db, () => {
    requireDashboard(db, dashboardId);
    const rev = getPlanRev(db, dashboardId) ?? 0;
    const r = run(db, "INSERT INTO plans (name, json, bytes, version, format, created_at, updated_at, active, manual, summary, dashboard_id) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)", name, plan.json, bytes, rev, plan.format, now, now, plan.summary, dashboardId);
    prune(db, dashboardId, 1);
    return versionById(db, r.lastInsertRowid);
  });
}
