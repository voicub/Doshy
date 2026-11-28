// The browser side of Poly Haven (docs/polyhaven.md): ask this app's own /api/polyhaven routes (never Poly Haven directly) and keep what was downloaded as a
// resource in the database, so the plan keeps working without Poly Haven, offline, and travels in exports. Browser module (fetch, crypto); not unit tested.
import { putResource } from "./dbApi";
import { isRecord } from "./guards";
import { isAssetId, isPhItem, type HdriRes, type PhItem, type PhPage, type PhType } from "./polyhaven";
import { sha256Hex } from "./sha256";

/** A refusal with the server's plain sentence (or one of ours when the server could not be reached). `offline` is true when Poly Haven or the network is down. */
export class PhRequestError extends Error {
  offline: boolean;
  constructor(message: string, offline: boolean) {
    super(message);
    this.offline = offline;
  }
}

const OFFLINE_MESSAGE = "Poly Haven cannot be reached right now. Assets you already used still work; try again when the internet is back.";

async function ask(url: string, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { signal, cache: "no-store" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new PhRequestError(OFFLINE_MESSAGE, true);
  }
  if (res.ok) return res;
  const body: unknown = await res.json().catch(() => null);
  const message = isRecord(body) && typeof body.error === "string" ? body.error : "Poly Haven did not answer.";
  throw new PhRequestError(message, res.status === 503 || (isRecord(body) && body.code === "offline"));
}

/** One page of the listing; `filter` is a chip id from `PH_FILTERS`. */
export async function browse(type: PhType, p: { q: string; filter?: string; page: number }, signal?: AbortSignal): Promise<PhPage> {
  const qs = new URLSearchParams({ t: type, q: p.q, page: String(p.page), ...(p.filter ? { f: p.filter } : {}) });
  const body: unknown = await (await ask(`/api/polyhaven/assets?${qs}`, signal)).json();
  if (!isRecord(body) || !Array.isArray(body.items) || typeof body.total !== "number" || typeof body.page !== "number" || typeof body.limit !== "number") throw new PhRequestError("Poly Haven answered with something this app could not read.", false);
  return { items: body.items.filter(isPhItem), total: body.total, page: body.page, limit: body.limit };
}

/** The preview picture's address on this server (kept by the browser and by the server's disk cache). */
export const thumbSrc = (item: Pick<PhItem, "id" | "v">, size: 128 | 256 = 256): string => `/api/polyhaven/thumb?id=${encodeURIComponent(item.id)}&w=${size}${item.v ? `&v=${item.v}` : ""}`;

/** The asset's file, fetched through this server. hdri: pass the size for the tier (`hdriResFor`). */
export async function downloadAsset(kind: "hdri" | "material" | "model", id: string, res: HdriRes = "1k", signal?: AbortSignal): Promise<ArrayBuffer> {
  if (!isAssetId(id)) throw new PhRequestError("That is not a Poly Haven asset.", false);
  return (await ask(`/api/polyhaven/download?kind=${kind}&id=${encodeURIComponent(id)}&res=${res}`, signal)).arrayBuffer();
}

/** The resource id of a downloaded file: a short kind prefix and the first 24 hex digits of the SHA-256 of its bytes, so the same file is stored once however it was reached. */
export async function resourceIdFor(prefix: "hdri" | "mat", bytes: ArrayBuffer): Promise<string> {
  const hex = globalThis.crypto?.subtle ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("") : sha256Hex(new Uint8Array(bytes));
  return `${prefix}-${hex.slice(0, 24)}`;
}

/** Keeps a downloaded HDRI or texture as a resource and returns its id. The details travel with it (which asset, its name and credit) for the Data panel and exports. */
export async function keepAsResource(kind: "hdri" | "material", item: Pick<PhItem, "id" | "name" | "authors">, bytes: ArrayBuffer): Promise<string> {
  const id = await resourceIdFor(kind === "hdri" ? "hdri" : "mat", bytes);
  await putResource({ id, kind, mime: "application/octet-stream", name: item.name, meta: { asset: item.id, name: item.name, authors: item.authors } }, bytes);
  return id;
}
