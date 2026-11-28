import type { DatabaseSync } from "node:sqlite";
import { isRecord } from "../guards.ts";
import { COLOR_RE, ICON_RE, MAX_DESCRIPTION, MAX_NAME, MAX_PLANS, freeName, planSettingsKey } from "../planIdentity.ts";
import { isHomeId, requireHome } from "./connections.ts";
import { HttpError } from "./errors.ts";
import { checkPlan, parseSummary, tooBigPlan, MAX_PLAN_BYTES, type Summary } from "./planDoc.ts";
import { all, one, run, tx, type Row } from "./sql.ts";
import { cleanText } from "./text.ts";
import { badRequest, isCount } from "./validate.ts";

/**
 * A dashboard (the UI calls it a "plan") is one complete home design: its working plan and saved versions (rows of `plans` that carry its id),
 * its settings row `housey-plan.<id>`, and the identity kept here. Deleting is soft for a week, so an Undo (or a mistake noticed later) can bring it back.
 */

export const MAX_DASHBOARDS = MAX_PLANS;
export const UNDO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_THUMB_BYTES = 64 * 1024;
const DEFAULT_KEY = "default_dashboard";

/** Any setting key that belongs to a plan: the bare legacy `housey-plan` (refused since migration 4) or `housey-plan.<id>`. */
export const PLAN_SETTINGS_KEY = /^housey-plan(?:\.([1-9]\d*))?$/;

export type Dashboard = {
  id: number;
  name: string;
  icon: string;
  color: string;
  description: string;
  sort: number;
  createdAt: number;
  /** newest change to the plan or to the identity */
  updatedAt: number;
  /** bumps with every thumbnail upload (the thumbnail URL is cached for good under `?v=thumbRev`) */
  thumbRev: number;
  /** the working plan: 0 / 0 / 0 / null while the dashboard has none yet */
  rev: number;
  format: number;
  bytes: number;
  summary: Summary | null;
  /** the Home Assistant this plan shows: a connection id (lib/db/connections.ts), or null for the main home (the server's own HA_URL / HA_TOKEN) */
  haConnection: string | null;
};

export type DashboardList = { defaultId: number; dashboards: Dashboard[] };

const notHere = () => new HttpError(404, "not_found", "That plan does not exist (any more).");

/** Throws 404 unless the dashboard exists and is not deleted. */
export function requireDashboard(db: DatabaseSync, id: number): void {
  if (!one(db, "SELECT 1 AS ok FROM dashboards WHERE id = ? AND deleted_at IS NULL", id)) throw notHere();
}

/** `<id>` from a URL: digits only, else 404 (it can never name a plan). */
export function parseDashboardId(raw: string): number {
  if (!/^\d{1,9}$/.test(raw)) throw notHere();
  return Number(raw);
}

/** The home plan: what the curtain automation reads and what a device without a choice shows. Never a deleted plan. */
export function defaultDashboardId(db: DatabaseSync): number {
  const set = Number(one(db, "SELECT value FROM meta WHERE key = ?", DEFAULT_KEY)?.value);
  if (Number.isInteger(set) && one(db, "SELECT 1 AS ok FROM dashboards WHERE id = ? AND deleted_at IS NULL", set)) return set;
  const first = one(db, "SELECT id FROM dashboards WHERE deleted_at IS NULL ORDER BY sort, id LIMIT 1"); // a restored file whose default is gone
  if (!first) throw new Error("the database has no plan");
  return Number(first.id);
}

const LIST_SQL = `
  SELECT d.id, d.name, d.icon, d.color, d.description, d.sort, d.created_at, d.updated_at, d.thumb_rev, d.ha_connection, p.version AS rev, p.format, p.bytes, p.summary, p.updated_at AS plan_at
  FROM dashboards d LEFT JOIN plans p ON p.dashboard_id = d.id AND p.active = 1
  WHERE d.deleted_at IS NULL`;

const asDashboard = (r: Row): Dashboard => ({
  id: Number(r.id),
  name: String(r.name),
  icon: String(r.icon),
  color: String(r.color),
  description: String(r.description),
  sort: Number(r.sort),
  createdAt: Number(r.created_at),
  updatedAt: Math.max(Number(r.updated_at), Number(r.plan_at ?? 0)),
  thumbRev: Number(r.thumb_rev),
  rev: Number(r.rev ?? 0),
  format: Number(r.format ?? 0),
  bytes: Number(r.bytes ?? 0),
  summary: r.summary == null ? null : parseSummary(r.summary),
  haConnection: r.ha_connection == null ? null : String(r.ha_connection),
});

/** Every plan that is not deleted, in the owner's order. Never reads a plan's text. */
export function listDashboards(db: DatabaseSync): DashboardList {
  return { defaultId: defaultDashboardId(db), dashboards: all(db, `${LIST_SQL} ORDER BY d.sort, d.id`).map(asDashboard) };
}

export function getDashboard(db: DatabaseSync, id: number): Dashboard {
  const r = one(db, `${LIST_SQL} AND d.id = ?`, id);
  if (!r) throw notHere();
  return asDashboard(r);
}

// ---- request bodies ---------------------------------------------------------------------------------------------------------------------

type Identity = { name?: string; icon?: string; color?: string; description?: string; /** a connection id, or null for the main home */ haConnection?: string | null };
type PlanInput = { json: string; summary: string; format: number };
export type NewDashboard = Identity & { plan: PlanInput | null; fromId: number | null };

function parseIdentity(body: Record<string, unknown>): Identity {
  const out: Identity = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string") throw badRequest("Give the plan a name.");
    out.name = cleanText(body.name, MAX_NAME, "");
    if (!out.name) throw badRequest("Give the plan a name.");
  }
  if (body.icon !== undefined) {
    if (typeof body.icon !== "string" || (body.icon !== "" && !ICON_RE.test(body.icon))) throw badRequest("That icon is not allowed.");
    out.icon = body.icon;
  }
  if (body.color !== undefined) {
    if (typeof body.color !== "string" || (body.color !== "" && !COLOR_RE.test(body.color))) throw badRequest("A colour looks like #1a2b3c.");
    out.color = body.color.toLowerCase();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string") throw badRequest("That description is not text.");
    out.description = cleanText(body.description, MAX_DESCRIPTION, "");
  }
  if (body.haConnection !== undefined) {
    if (body.haConnection === null || body.haConnection === "" || body.haConnection === "main") out.haConnection = null;
    else if (isHomeId(body.haConnection)) out.haConnection = body.haConnection;
    else throw badRequest("That home is not set up (any more).");
  }
  return out;
}

/**
 * POST body: `{ name, icon?, color?, description?, plan?, format? }` (a new plan, `plan` is its first working plan) or
 * `{ fromId, name? }` (a copy of another plan's working plan; versions are not copied).
 */
export function parseCreateBody(body: unknown): NewDashboard {
  if (!isRecord(body)) throw badRequest("Expected an object.");
  const identity = parseIdentity(body);
  if (body.fromId !== undefined) {
    if (!isCount(body.fromId, Number.MAX_SAFE_INTEGER)) throw badRequest("Say which plan to copy.");
    return { ...identity, plan: null, fromId: body.fromId };
  }
  if (!identity.name) throw badRequest("Give the plan a name.");
  if (body.plan === undefined) return { ...identity, plan: null, fromId: null };
  if (!isCount(body.format, 1_000_000)) throw badRequest("The plan is missing its format.");
  return { ...identity, plan: { ...checkPlan(body.plan), format: body.format }, fromId: null };
}

/** PATCH body: any of `{ name, icon, color, description }`. */
export function parsePatchBody(body: unknown): Identity {
  if (!isRecord(body)) throw badRequest("Expected an object.");
  const identity = parseIdentity(body);
  if (!Object.keys(identity).length) throw badRequest("Nothing to change.");
  return identity;
}

/** Body `{ id }` (make a plan the home plan). */
export function parseIdBody(body: unknown): number {
  if (!isRecord(body) || !isCount(body.id, Number.MAX_SAFE_INTEGER)) throw badRequest("Say which plan.");
  return body.id;
}

/** Body `{ ids }`: the plans in the order they should be shown. */
export function parseOrderBody(body: unknown): number[] {
  if (!isRecord(body) || !Array.isArray(body.ids) || body.ids.length > MAX_DASHBOARDS * 2 || !body.ids.every((n) => isCount(n, Number.MAX_SAFE_INTEGER))) throw badRequest("Send the plan ids in the order to show them.");
  return body.ids;
}

// ---- writing ----------------------------------------------------------------------------------------------------------------------------

const nameTaken = (db: DatabaseSync, name: string, exceptId: number) => !!one(db, "SELECT 1 AS taken FROM dashboards WHERE lower(name) = lower(?) AND deleted_at IS NULL AND id != ?", name, exceptId);

function assertNameFree(db: DatabaseSync, name: string, exceptId: number): void {
  if (nameTaken(db, name, exceptId)) throw new HttpError(409, "name_taken", "Another plan already has that name.");
}

/** `base`, else `base 2`, `base 3`... among the names in use. */
const freeNameFor = (db: DatabaseSync, base: string) => freeName(base, all(db, "SELECT name FROM dashboards WHERE deleted_at IS NULL").map((r) => String(r.name)));

function assertRoom(db: DatabaseSync): void {
  if (Number(one(db, "SELECT COUNT(*) AS n FROM dashboards WHERE deleted_at IS NULL")?.n) >= MAX_DASHBOARDS) throw new HttpError(409, "too_many", `You can keep up to ${MAX_DASHBOARDS} plans. Delete one first.`);
}

const nextSort = (db: DatabaseSync) => Number(one(db, "SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM dashboards")?.n);

/** The working plan of a dashboard that has none (a new plan, or the first save). Revision 1. */
export function insertWorkingPlan(db: DatabaseSync, id: number, plan: PlanInput, now: number): void {
  const bytes = Buffer.byteLength(plan.json);
  if (bytes > MAX_PLAN_BYTES) throw tooBigPlan();
  run(db, "INSERT INTO plans (name, json, bytes, version, format, created_at, updated_at, active, summary, dashboard_id) VALUES ('Working plan', ?, ?, 1, ?, ?, ?, 1, ?, ?)", plan.json, bytes, plan.format, now, now, plan.summary, id);
}

/**
 * A new plan, or a copy of one (`fromId`: the working plan and its settings row are copied inside SQLite, the versions are not; the name defaults to
 * "<name> copy", made unique). An explicit name that is taken is refused (409).
 */
export function createDashboard(db: DatabaseSync, input: NewDashboard, now = Date.now()): Dashboard {
  return tx(db, () => {
    assertRoom(db);
    const sort = nextSort(db);
    let id: number;
    if (input.fromId !== null) {
      const from = one(db, "SELECT name FROM dashboards WHERE id = ? AND deleted_at IS NULL", input.fromId);
      if (!from) throw notHere();
      const name = input.name ?? freeNameFor(db, `${String(from.name)} copy`);
      assertNameFree(db, name, 0);
      id = Number(
        run(
          db,
          "INSERT INTO dashboards (name, icon, color, description, thumb, thumb_rev, sort, created_at, updated_at, ha_connection) SELECT ?, icon, color, description, thumb, CASE WHEN thumb IS NULL THEN 0 ELSE 1 END, ?, ?, ?, ha_connection FROM dashboards WHERE id = ?",
          name,
          sort,
          now,
          now,
          input.fromId,
        ).lastInsertRowid,
      );
      run(db, "INSERT INTO plans (name, json, bytes, version, format, created_at, updated_at, active, manual, summary, dashboard_id) SELECT 'Working plan', json, bytes, 1, format, ?, ?, 1, 0, summary, ? FROM plans WHERE dashboard_id = ? AND active = 1", now, now, id, input.fromId);
      run(db, "INSERT INTO settings (key, value, updated_at) SELECT ?, value, ? FROM settings WHERE key = ?", planSettingsKey(id), now, planSettingsKey(input.fromId));
    } else {
      const name = input.name ?? "";
      assertNameFree(db, name, 0);
      if (input.haConnection) requireHome(db, input.haConnection);
      id = Number(run(db, "INSERT INTO dashboards (name, icon, color, description, sort, created_at, updated_at, ha_connection) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", name, input.icon ?? "", input.color ?? "", input.description ?? "", sort, now, now, input.haConnection ?? null).lastInsertRowid);
      if (input.plan) insertWorkingPlan(db, id, input.plan, now);
    }
    return getDashboard(db, id);
  });
}

export function patchDashboard(db: DatabaseSync, id: number, patch: Identity, now = Date.now()): Dashboard {
  return tx(db, () => {
    requireDashboard(db, id);
    if (patch.name !== undefined) assertNameFree(db, patch.name, id);
    run(db, "UPDATE dashboards SET name = COALESCE(?, name), icon = COALESCE(?, icon), color = COALESCE(?, color), description = COALESCE(?, description), updated_at = ? WHERE id = ?", patch.name ?? null, patch.icon ?? null, patch.color ?? null, patch.description ?? null, now, id);
    if (patch.haConnection !== undefined) {
      if (patch.haConnection !== null) requireHome(db, patch.haConnection);
      run(db, "UPDATE dashboards SET ha_connection = ? WHERE id = ?", patch.haConnection, id);
    }
    return getDashboard(db, id);
  });
}

/** Hide a plan for a week (see `undeleteDashboard`). The home plan and the last plan cannot be deleted. */
export function softDeleteDashboard(db: DatabaseSync, id: number, now = Date.now()): void {
  tx(db, () => {
    requireDashboard(db, id);
    if (defaultDashboardId(db) === id) throw new HttpError(409, "is_default", "This is the home plan. Make another plan the home plan first.");
    if (Number(one(db, "SELECT COUNT(*) AS n FROM dashboards WHERE deleted_at IS NULL")?.n) <= 1) throw new HttpError(409, "last_plan", "You need at least one plan.");
    run(db, "UPDATE dashboards SET deleted_at = ? WHERE id = ?", now, id);
  });
}

/** Bring a deleted plan back (within `UNDO_WINDOW_MS`). Undoing a plan that is already back is fine. Its name is changed when someone took it meanwhile. */
export function undeleteDashboard(db: DatabaseSync, id: number, now = Date.now()): Dashboard {
  return tx(db, () => {
    const r = one(db, "SELECT name, deleted_at FROM dashboards WHERE id = ?", id);
    if (!r) throw notHere();
    if (r.deleted_at == null) return getDashboard(db, id);
    if (now - Number(r.deleted_at) > UNDO_WINDOW_MS) throw new HttpError(410, "gone", "That plan was deleted too long ago to bring back.");
    assertRoom(db);
    run(db, "UPDATE dashboards SET deleted_at = NULL, name = ?, updated_at = ? WHERE id = ?", freeNameFor(db, String(r.name)), now, id);
    return getDashboard(db, id);
  });
}

/** Really remove plans deleted more than `UNDO_WINDOW_MS` ago: their plans, versions and settings row. Returns how many went. */
export function purgeDashboards(db: DatabaseSync, now = Date.now()): number {
  return tx(db, () => {
    const gone = all(db, "SELECT id FROM dashboards WHERE deleted_at IS NOT NULL AND deleted_at < ?", now - UNDO_WINDOW_MS).map((r) => Number(r.id));
    for (const id of gone) {
      run(db, "DELETE FROM plans WHERE dashboard_id = ?", id);
      run(db, "DELETE FROM settings WHERE key = ?", planSettingsKey(id));
      run(db, "DELETE FROM dashboards WHERE id = ?", id);
    }
    return gone.length;
  });
}

export function setDefaultDashboard(db: DatabaseSync, id: number): void {
  tx(db, () => {
    requireDashboard(db, id);
    run(db, "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", DEFAULT_KEY, String(id));
  });
}

/** The plans listed in `ids` come first in that order, the others follow in their current order. Ids that are not plans are ignored. */
export function setDashboardOrder(db: DatabaseSync, ids: number[]): void {
  tx(db, () => {
    const live = all(db, "SELECT id FROM dashboards WHERE deleted_at IS NULL ORDER BY sort, id").map((r) => Number(r.id));
    const first = [...new Set(ids)].filter((id) => live.includes(id));
    [...first, ...live.filter((id) => !first.includes(id))].forEach((id, i) => run(db, "UPDATE dashboards SET sort = ? WHERE id = ?", i, id));
  });
}

// ---- thumbnails -------------------------------------------------------------------------------------------------------------------------

const isWebp = (b: Buffer) => b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP";

/** Keep a WebP thumbnail (at most 64 KB). Returns the new `thumbRev`. */
export function setThumb(db: DatabaseSync, id: number, data: Buffer): number {
  if (data.length > MAX_THUMB_BYTES) throw new HttpError(413, "too_big", "That thumbnail is too large (64 KB at most).");
  if (!isWebp(data)) throw badRequest("A thumbnail must be a WebP image.");
  return tx(db, () => {
    requireDashboard(db, id);
    run(db, "UPDATE dashboards SET thumb = ?, thumb_rev = thumb_rev + 1 WHERE id = ?", data, id);
    return Number(one(db, "SELECT thumb_rev FROM dashboards WHERE id = ?", id)?.thumb_rev);
  });
}

export function getThumb(db: DatabaseSync, id: number): { data: Buffer; rev: number } | null {
  const r = one(db, "SELECT thumb, thumb_rev FROM dashboards WHERE id = ? AND deleted_at IS NULL AND thumb IS NOT NULL", id);
  return r && r.thumb instanceof Uint8Array ? { data: Buffer.from(r.thumb), rev: Number(r.thumb_rev) } : null;
}
