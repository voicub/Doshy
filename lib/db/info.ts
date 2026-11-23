import type { DatabaseSync } from "node:sqlite";
import { backupDir, dbBytes } from "./connection.ts";
import { lastBackupAt } from "./backup.ts";
import { userVersion } from "./migrations.ts";
import { KEEP_VERSIONS, SNAPSHOT_EVERY_MS } from "./plans.ts";
import { resourceTotals } from "./resources.ts";
import { one } from "./sql.ts";

export type DbInfo = {
  /** database file plus write-ahead log, bytes */
  bytes: number;
  schema: number;
  settings: number;
  plan: { rev: number; updatedAt: number; bytes: number } | null;
  /** saved versions held now, and the most that are kept of each kind */
  versions: number;
  keepVersions: number;
  snapshotEveryMs: number;
  resources: { count: number; bytes: number; limit: number };
  lastBackupAt: number | null;
  /** newest change to anything, ms */
  lastSavedAt: number | null;
};

/** Numbers for the Data panel: all small indexed reads. */
export function dbInfo(db: DatabaseSync): DbInfo {
  const plan = one(db, "SELECT version, updated_at, bytes FROM plans WHERE active = 1");
  const settings = one(db, "SELECT COUNT(*) AS n, MAX(updated_at) AS at FROM settings");
  const planAt = plan ? Number(plan.updated_at) : null;
  const settingsAt = settings?.at == null ? null : Number(settings.at);
  return {
    bytes: dbBytes(),
    schema: userVersion(db),
    settings: Number(settings?.n ?? 0),
    plan: plan ? { rev: Number(plan.version), updatedAt: Number(plan.updated_at), bytes: Number(plan.bytes) } : null,
    versions: Number(one(db, "SELECT COUNT(*) AS n FROM plans WHERE active = 0")?.n ?? 0),
    keepVersions: KEEP_VERSIONS,
    snapshotEveryMs: SNAPSHOT_EVERY_MS,
    resources: resourceTotals(db),
    lastBackupAt: lastBackupAt(backupDir()),
    lastSavedAt: planAt === null ? settingsAt : settingsAt === null ? planAt : Math.max(planAt, settingsAt),
  };
}
