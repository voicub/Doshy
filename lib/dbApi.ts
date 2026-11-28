import { REQUEST_TIMEOUT_MS, TRANSFER_TIMEOUT_MS, timedOut, within } from "./requestTimeout.ts";
import { isStaleAnswer } from "./swRules.ts";
import type { Dashboard, DashboardList } from "./db/dashboards";
import type { DbInfo } from "./db/info";
import type { Version } from "./db/plans";
import type { ResourceInfo } from "./db/resources";

export type { Dashboard, DashboardList, DbInfo, ResourceInfo, Version };

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
  // The offline worker (public/sw.js) answered from its cache because the network failed: that copy may be older than this device's own saved revision, so it counts as "server unreachable" (docs/offline.md).
  if (isStaleAnswer(res.headers)) throw new NetError("The server cannot be reached.");
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
const planUrl = (id: number) => `/api/db/dashboards/${id}`;
/** Plan `id`'s working plan. With `since`, an unchanged plan comes back as `{ rev, unchanged: true }` (nothing else is sent). A plan that does not exist (any more) is an `ApiError` 404. */
export const fetchPlan = (id: number, since?: number) => asJson<PlanReply>(since === undefined ? `${planUrl(id)}/plan` : `${planUrl(id)}/plan?since=${since}`);
export const savePlan = (id: number, body: { plan: unknown; baseRev: number; format: number; overwrite?: boolean }, keepalive?: boolean) =>
  asJson<{ rev: number; updatedAt: number; changed: boolean }>(`${planUrl(id)}/plan`, sendJson("PUT", body, keepalive));

export const fetchVersions = async (id: number) => (await asJson<{ versions: Version[] }>(`${planUrl(id)}/versions`)).versions;
/** "Save version now" for plan `id`. An empty label becomes "Saved version". With `plan`, that plan (not the working one) is kept as the version: how a plan this device is about to lose is also kept on the server. */
export const saveVersion = async (id: number, label = "", plan?: { plan: unknown; format: number }) =>
  (await asJson<{ version: Version }>(`${planUrl(id)}/versions`, sendJson("POST", { label, ...(plan ? { plan: plan.plan, format: plan.format } : {}) }))).version;
/** Make a saved version of plan `id` its working plan. The reply is the new working plan: pass it to `adoptServerPlan` (lib/dbClient) so this screen shows it. */
export const restoreVersion = (id: number, versionId: number) => asJson<ServerPlan>(`${planUrl(id)}/restore`, sendJson("POST", { id: versionId }));

/** Every plan with the numbers the switcher shows, and the ETag to hand back to `fetchDashboardsIfChanged`. */
export type DashboardsAnswer = { list: DashboardList; etag: string | null };
async function readDashboards(res: Response): Promise<DashboardsAnswer> {
  try {
    return { list: await res.json(), etag: res.headers.get("etag") };
  } catch (e) {
    throw timedOut(e) ? new NetError("The server stopped answering.") : e;
  }
}
export const fetchDashboards = async () => readDashboards(await request("/api/db/dashboards"));
/** The list again, or null when `etag` (from the last answer) still matches (a 304: nothing was sent). */
export async function fetchDashboardsIfChanged(etag: string | null): Promise<DashboardsAnswer | null> {
  const res = await request("/api/db/dashboards", etag ? { headers: { "if-none-match": etag } } : {});
  return res.status === 304 ? null : readDashboards(res);
}

/** What a new plan starts from: `plan` + `format` (blank, template, imported file), or `fromId` (a copy of another plan's working plan; its versions are not copied). */
export type NewPlanBody = { name?: string; icon?: string; color?: string; description?: string; plan?: unknown; format?: number; fromId?: number; /** a connection id (lib/db/connections.ts); null or absent = the main home */ haConnection?: string | null };
export type PlanIdentityPatch = { name?: string; icon?: string; color?: string; description?: string; haConnection?: string | null };
const dashboardReply = async (path: string, init: RequestInit) => (await asJson<{ dashboard: Dashboard }>(path, init)).dashboard;
export const createDashboard = (body: NewPlanBody) => dashboardReply("/api/db/dashboards", sendJson("POST", body));
export const patchDashboard = (id: number, patch: PlanIdentityPatch) => dashboardReply(planUrl(id), sendJson("PATCH", patch));
/** Soft delete: the plan can be brought back with `undeleteDashboard` for a week. 409 for the home plan and the last plan. */
export const deleteDashboard = (id: number) => request(planUrl(id), { method: "DELETE" }).then(() => undefined);
export const undeleteDashboard = (id: number) => dashboardReply(`${planUrl(id)}/undelete`, { method: "POST" });
export const setDefaultDashboard = (id: number) => request("/api/db/dashboards/default", sendJson("PUT", { id })).then(() => undefined);
export const setDashboardOrder = (ids: number[]) => request("/api/db/dashboards/order", sendJson("PUT", { ids })).then(() => undefined);
/** Keep a WebP thumbnail (at most 64 KB) for plan `id`. Returns the new `thumbRev`. */
export const putThumb = (id: number, webp: Blob) => asJson<{ thumbRev: number }>(`${planUrl(id)}/thumb`, { method: "PUT", headers: { "content-type": "image/webp" }, body: webp }).then((x) => x.thumbRev);
/** The thumbnail's URL; `thumbRev` (from the list) pins it so the browser keeps it for good. */
export const thumbUrl = (id: number, thumbRev: number) => `${planUrl(id)}/thumb?v=${thumbRev}`;

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
