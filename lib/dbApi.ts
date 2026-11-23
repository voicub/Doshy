import { REQUEST_TIMEOUT_MS, TRANSFER_TIMEOUT_MS, timedOut, within } from "./requestTimeout.ts";
import type { DbInfo } from "./db/info";
import type { Version } from "./db/plans";
import type { ResourceInfo } from "./db/resources";

export type { DbInfo, ResourceInfo, Version };

/** Typed calls to /api/db/*. Everything the browser says to the database goes through here. */

/** The server could not be reached or is struggling (offline, restarting, rate limited): the same request is worth trying again later. */
export class NetError extends Error {}

/** The server understood and said no (too big, not allowed, bad request): sending the same thing again will not help. */
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type ServerPlan = { rev: number; updatedAt: number; format: number; plan: unknown };
/** Another device saved first. `server` is its copy (null only if the server has no plan any more). */
export class ConflictError extends ApiError {
  server: ServerPlan | null;
  constructor(server: ServerPlan | null) {
    super(409, "conflict", "Someone saved a newer version of this plan first.");
    this.server = server;
  }
}

type ErrorBody = { error?: unknown; code?: unknown; server?: ServerPlan | null };

async function request(path: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", ...init, signal: within(timeoutMs, init.signal) });
  } catch {
    throw new NetError("The server cannot be reached."); // also a request nobody answered in time: the retry and offline banner are the same
  }
  if (res.ok || res.status === 304) return res;
  const body: ErrorBody = await res.json().catch(() => ({}));
  const message = typeof body.error === "string" ? body.error : `The server answered ${res.status}.`;
  if (res.status >= 500 || res.status === 429 || res.status === 408) throw new NetError(message);
  if (res.status === 409 && body.code === "conflict") throw new ConflictError(body.server ?? null);
  throw new ApiError(res.status, typeof body.code === "string" ? body.code : "error", message);
}

const sendJson = (method: string, body: unknown, keepalive?: boolean): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive });
const asJson = async <T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> => {
  const res = await request(path, init, timeoutMs);
  try {
    return await res.json();
  } catch (e) {
    throw timedOut(e) ? new NetError("The server stopped answering.") : e; // the deadline also covers reading the body
  }
};

export const fetchInfo = () => asJson<DbInfo>("/api/db/info");

export type ServerSettings = Record<string, { value: unknown; updatedAt: number }>;
export const fetchSettings = async (): Promise<ServerSettings> => (await asJson<{ settings: ServerSettings }>("/api/db/settings")).settings;
export const saveSettings = (settings: Record<string, unknown>, keepalive?: boolean) => request("/api/db/settings", sendJson("PUT", { settings }, keepalive)).then(() => undefined);

export type PlanReply = ServerPlan | { rev: number; plan: null } | { rev: number; unchanged: true };
/** The working plan. With `since`, an unchanged plan comes back as `{ rev, unchanged: true }` (nothing else is sent). */
export const fetchPlan = (since?: number) => asJson<PlanReply>(since === undefined ? "/api/db/plan" : `/api/db/plan?since=${since}`);
export const savePlan = (body: { plan: unknown; baseRev: number; format: number; overwrite?: boolean }, keepalive?: boolean) =>
  asJson<{ rev: number; updatedAt: number; changed: boolean }>("/api/db/plan", sendJson("PUT", body, keepalive));

export const fetchVersions = async () => (await asJson<{ versions: Version[] }>("/api/db/plan/versions")).versions;
/** "Save version now". An empty label becomes "Saved version". With `plan`, that plan (not the working one) is kept as the version: how a plan this device is about to lose is also kept on the server. */
export const saveVersion = async (label = "", plan?: { plan: unknown; format: number }) => (await asJson<{ version: Version }>("/api/db/plan/versions", sendJson("POST", { label, ...(plan ? { plan: plan.plan, format: plan.format } : {}) }))).version;
/** Make a saved version the working plan. The reply is the new working plan: pass it to `adoptServerPlan` (lib/dbClient) so this screen shows it. */
export const restoreVersion = (id: number) => asJson<ServerPlan>("/api/db/plan/restore", sendJson("POST", { id }));

export type ResourceList = { resources: (ResourceInfo & { json?: unknown })[]; totals: { count: number; bytes: number; limit: number } };
export const fetchResources = (kind?: string, inline = false) => asJson<ResourceList>(`/api/db/resources?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(inline ? { inline: "1" } : {}) })}`);
export const putResource = (r: { id: string; kind: string; mime: string; name?: string; meta?: object }, body: BodyInit, keepalive?: boolean) =>
  asJson<{ resource: ResourceInfo & { deduped: boolean } }>(
    `/api/db/resources?${new URLSearchParams({ id: r.id, kind: r.kind, ...(r.name ? { name: r.name } : {}), ...(r.meta ? { meta: JSON.stringify(r.meta) } : {}) })}`,
    { method: "POST", headers: { "content-type": r.mime }, body, keepalive },
    TRANSFER_TIMEOUT_MS,
  ).then((x) => x.resource);
/** Deleting something that is already gone counts as done. */
export const deleteResource = (id: string) =>
  request(`/api/db/resources/${encodeURIComponent(id)}`, { method: "DELETE" }).then(
    () => undefined,
    (e) => {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    },
  );
/** The file's bytes and type, or null when the server does not have it. Pass the hash from a list to get the long-cached URL. */
export async function fetchResourceFile(id: string, hash?: string): Promise<{ mime: string; buf: ArrayBuffer } | null> {
  try {
    const res = await request(`/api/db/resources/${encodeURIComponent(id)}${hash ? `?h=${hash}` : ""}`, { cache: "default" }, TRANSFER_TIMEOUT_MS);
    return { mime: res.headers.get("content-type") ?? "application/octet-stream", buf: await res.arrayBuffer() };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export const BACKUP_URL = "/api/db/backup";
/** Replace everything with a backup file. The server checks it first and keeps a safety copy of what it replaces. */
export const importBackup = (file: Blob) => asJson<DbInfo>(BACKUP_URL, { method: "POST", headers: { "content-type": "application/vnd.sqlite3" }, body: file }, TRANSFER_TIMEOUT_MS);
