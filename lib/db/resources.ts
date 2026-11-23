import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { HttpError } from "./errors.ts";
import { all, one, run, tx, type Row } from "./sql.ts";
import { cleanText } from "./text.ts";

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_RESOURCE_BYTES = 25 * 1024 * 1024;
/** Soft ceiling on everything stored (distinct file contents): past it, new files are refused with a clear message. */
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
export const MAX_META_BYTES = 8 * 1024;

/** What each kind of resource may be (the stored type is also what the file is served back as). */
const MIMES: Record<string, readonly string[]> = {
  model: ["model/gltf-binary", "model/gltf+json", "application/octet-stream"],
  piece: ["application/json"],
  image: ["image/png", "image/jpeg", "image/webp", "image/gif"],
};
const isKind = (kind: string) => Object.hasOwn(MIMES, kind);

export type ResourceInfo = { id: string; kind: string; name: string; mime: string; size: number; hash: string; meta: unknown; createdAt: number };

const select = (withData: boolean) => `SELECT r.id, r.kind, r.name, r.mime, r.hash, r.meta, r.created_at, b.size${withData ? ", b.data" : ""} FROM resources r JOIN blobs b ON b.hash = r.hash`;
const asInfo = (r: Row): ResourceInfo => ({ id: String(r.id), kind: String(r.kind), name: String(r.name), mime: String(r.mime), size: Number(r.size), hash: String(r.hash), meta: JSON.parse(String(r.meta)), createdAt: Number(r.created_at) });
const bytesOf = (r: Row): Uint8Array => {
  if (!(r.data instanceof Uint8Array)) throw new Error("resource row without data");
  return r.data;
};

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

type NewResource = { id: string; kind: string; name?: unknown; mime: string; meta?: unknown; data: Uint8Array };

/** Drop a file's contents once no resource uses them any more. */
function dropIfOrphan(db: DatabaseSync, hash: string) {
  run(db, "DELETE FROM blobs WHERE hash = ? AND NOT EXISTS (SELECT 1 FROM resources WHERE hash = ?)", hash, hash);
}

/** Total bytes of distinct stored contents. */
const storedBytes = (db: DatabaseSync): number => Number(one(db, "SELECT COALESCE(SUM(size), 0) AS n FROM blobs")?.n ?? 0);

/**
 * Store (or replace) a resource. The same contents under several ids are stored once (`deduped`). Refused with a plain-language error when
 * the id, type, size or the total allowance is wrong; nothing is written then.
 */
export function putResource(db: DatabaseSync, r: NewResource, now = Date.now(), totalLimit = MAX_TOTAL_BYTES): ResourceInfo & { deduped: boolean } {
  if (!ID_RE.test(r.id)) throw new HttpError(400, "bad_id", "A resource id may only use a-z, 0-9, dash and underscore (up to 64 characters).");
  if (!isKind(r.kind)) throw new HttpError(400, "bad_kind", "Unknown kind of resource.");
  const mime = r.mime.split(";")[0].trim().toLowerCase();
  if (!MIMES[r.kind].includes(mime)) throw new HttpError(415, "bad_type", "That file type is not accepted for this kind of resource.");
  const size = r.data.byteLength;
  if (size === 0) throw new HttpError(400, "empty", "The file is empty.");
  if (size > MAX_RESOURCE_BYTES) throw new HttpError(413, "too_big", `That file is too large to keep (${MAX_RESOURCE_BYTES / 1024 / 1024} MB at most).`);
  const meta = JSON.stringify(r.meta ?? {});
  if (meta[0] !== "{" || Buffer.byteLength(meta) > MAX_META_BYTES) throw new HttpError(400, "bad_meta", "The details sent with the file are not valid.");
  const name = cleanText(r.name, 120, r.id);
  const hash = sha256(r.data);

  return tx(db, () => {
    const before = one(db, "SELECT hash, created_at FROM resources WHERE id = ?", r.id);
    const known = !!one(db, "SELECT 1 AS x FROM blobs WHERE hash = ?", hash);
    if (!known) {
      if (storedBytes(db) + size > totalLimit) throw new HttpError(413, "full", "There is no room left to keep more files. Delete some in Data and backups first.");
      run(db, "INSERT INTO blobs (hash, size, data) VALUES (?, ?, ?)", hash, size, r.data);
    }
    run(
      db,
      "INSERT INTO resources (id, kind, name, mime, hash, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, name = excluded.name, mime = excluded.mime, hash = excluded.hash, meta = excluded.meta",
      r.id,
      r.kind,
      name,
      mime,
      hash,
      meta,
      now,
    );
    if (before && String(before.hash) !== hash) dropIfOrphan(db, String(before.hash));
    return { id: r.id, kind: r.kind, name, mime, size, hash, meta: JSON.parse(meta), createdAt: before ? Number(before.created_at) : now, deduped: known && String(before?.hash) !== hash };
  });
}

/** Metadata only (newest first), optionally one kind. With `inline`, only JSON resources (custom pieces) are listed, each carrying its parsed contents. */
export function listResources(db: DatabaseSync, opts: { kind?: string; inline?: boolean } = {}): (ResourceInfo & { json?: unknown })[] {
  const where = [opts.kind ? "r.kind = ?" : "", opts.inline ? "r.mime = 'application/json'" : ""].filter(Boolean).join(" AND ");
  const sql = `${select(!!opts.inline)}${where ? ` WHERE ${where}` : ""} ORDER BY r.created_at DESC, r.id`;
  return (opts.kind ? all(db, sql, opts.kind) : all(db, sql)).map((r) => {
    const info = asInfo(r);
    return opts.inline && info.mime === "application/json" ? { ...info, json: JSON.parse(Buffer.from(bytesOf(r)).toString("utf8")) } : info;
  });
}

export function getResource(db: DatabaseSync, id: string): { info: ResourceInfo; data: Uint8Array } | null {
  const r = one(db, `${select(true)} WHERE r.id = ?`, id);
  return r ? { info: asInfo(r), data: bytesOf(r) } : null;
}

/** A resource's details without reading its contents (the file can be megabytes: a revalidating browser only needs the hash). */
export function getResourceInfo(db: DatabaseSync, id: string): ResourceInfo | null {
  const r = one(db, `${select(false)} WHERE r.id = ?`, id);
  return r ? asInfo(r) : null;
}

export function deleteResource(db: DatabaseSync, id: string): boolean {
  return tx(db, () => {
    const r = one(db, "SELECT hash FROM resources WHERE id = ?", id);
    if (!r) return false;
    run(db, "DELETE FROM resources WHERE id = ?", id);
    dropIfOrphan(db, String(r.hash));
    return true;
  });
}

export function resourceTotals(db: DatabaseSync): { count: number; bytes: number; limit: number } {
  return { count: Number(one(db, "SELECT COUNT(*) AS n FROM resources")?.n ?? 0), bytes: storedBytes(db), limit: MAX_TOTAL_BYTES };
}
