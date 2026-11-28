// The owner's calls to /api/db/guest-links (make, list and turn off a plan's read-only links). Same-origin only on the server, like every /api/db write.
import { ApiError, NetError } from "./dbApi.ts";
import type { Expiry, GuestLinkInfo } from "./server/guestLinks.ts";
import { REQUEST_TIMEOUT_MS, within } from "./requestTimeout.ts";

export type { Expiry, GuestLinkInfo };

export type NewLinkInput = { dashboardId: number; label: string; pin: string; expires: Expiry; live: boolean; location: boolean };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init, signal: within(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new NetError("The server cannot be reached.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return body as T;
  const b = typeof body === "object" && body !== null ? (body as { error?: unknown; code?: unknown }) : {};
  throw new ApiError(res.status, typeof b.code === "string" ? b.code : "error", typeof b.error === "string" ? b.error : `The server answered ${res.status}.`);
}

export const fetchLinks = async (dashboardId: number): Promise<GuestLinkInfo[]> => (await call<{ links: GuestLinkInfo[] }>(`/api/db/guest-links?dashboard=${dashboardId}`)).links;

/** Make a link. `token` is the secret part of its address and exists only in this answer. */
export const createLink = (input: NewLinkInput): Promise<{ link: GuestLinkInfo; token: string }> =>
  call("/api/db/guest-links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });

export const revokeLink = (id: string): Promise<unknown> => call(`/api/db/guest-links/${encodeURIComponent(id)}`, { method: "DELETE" });
