import type { DatabaseSync } from "node:sqlite";
import { backupDir, dbBytes } from "./connection.ts";
import { lastBackupAt } from "./backup.ts";
import { defaultDashboardId, listDashboards } from "./dashboards.ts";
import { userVersion } from "./migrations.ts";
import { KEEP_VERSIONS, SNAPSHOT_EVERY_MS } from "./plans.ts";
import { resourceTotals } from "./resources.ts";
import { all, one } from "./sql.ts";

export type DbInfo = {
  /** database file plus write-ahead log, bytes */
  bytes: number;
  schema: number;
  settings: number;
  /** the home plan's working plan (see `dashboards` for every plan) */
  plan: { rev: number; updatedAt: number; bytes: number } | null;
  /** saved versions held now across all plans, and the most that are kept of each kind per plan */
  versions: number;
  keepVersions: number;
  snapshotEveryMs: number;
  /** per plan: its working plan's size and how many versions it holds */
  dashboards: { id: number; name: string; bytes: number; versions: number }[];
  resources: { count: number; bytes: number; limit: number };
  lastBackupAt: number | null;
  /** newest change to anything, ms */
  lastSavedAt: number | null;
};

/** Numbers for the Data panel: all small indexed reads. */
export function dbInfo(db: DatabaseSync): DbInfo {
  const home = one(db, "SELECT version, updated_at, bytes FROM plans WHERE dashboard_id = ? AND active = 1", defaultDashboardId(db));
  const settings = one(db, "SELECT COUNT(*) AS n, MAX(updated_at) AS at FROM settings");
  const versionsOf = new Map(all(db, "SELECT dashboard_id, COUNT(*) AS n FROM plans WHERE active = 0 GROUP BY dashboard_id").map((r) => [Number(r.dashboard_id), Number(r.n)]));
  const dashboards = listDashboards(db).dashboards;
  const planAt = Math.max(0, ...dashboards.map((d) => d.updatedAt)) || null;
  const settingsAt = settings?.at == null ? null : Number(settings.at);
  return {
    bytes: dbBytes(),
    schema: userVersion(db),
    settings: Number(settings?.n ?? 0),
    plan: home ? { rev: Number(home.version), updatedAt: Number(home.updated_at), bytes: Number(home.bytes) } : null,
    versions: dashboards.reduce((n, d) => n + (versionsOf.get(d.id) ?? 0), 0),
    keepVersions: KEEP_VERSIONS,
    snapshotEveryMs: SNAPSHOT_EVERY_MS,
    dashboards: dashboards.map((d) => ({ id: d.id, name: d.name, bytes: d.bytes, versions: versionsOf.get(d.id) ?? 0 })),
    resources: resourceTotals(db),
    lastBackupAt: lastBackupAt(backupDir()),
    lastSavedAt: planAt === null ? settingsAt : settingsAt === null ? planAt : Math.max(planAt, settingsAt),
  };
}
