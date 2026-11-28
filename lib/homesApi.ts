// Typed calls to /api/db/connections (the Homes manager, docs/multi-home.md). There is never a token in an answer: `hint` is the last 4 characters.
import { REQUEST_TIMEOUT_MS, within } from "./requestTimeout.ts";
import { isRecord } from "./guards.ts";
import type { Home } from "./db/connections";

export type { Home };

/** What `GET /api/db/connections` answers. */
export type HomesAnswer = { main: { name: string; configured: boolean }; homes: Home[]; /** why homes cannot be added here, or null */ locked: string | null };
export type TestResult = { ok: true; version: string; locationName: string } | { ok: false; error: string };

/** The server's plain sentence (it answers `{ error }` for a refusal), else one of ours. */
export class HomesError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", ...init, signal: within(REQUEST_TIMEOUT_MS, init.signal) });
  } catch {
    throw new HomesError(0, "offline", "The Doshy server cannot be reached.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new HomesError(res.status, isRecord(body) && typeof body.code === "string" ? body.code : "error", isRecord(body) && typeof body.error === "string" ? body.error : `The server answered ${res.status}.`);
  return body as T; // our own route, typed by lib/db/connections.ts
}

const send = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const fetchHomes = (): Promise<HomesAnswer> => call("/api/db/connections");
export const addHome = (input: { name: string; url: string; token: string }): Promise<{ home: Home }> => call("/api/db/connections", send("POST", input));
export const patchHome = (id: string, patch: { name?: string; url?: string; token?: string }): Promise<{ home: Home }> => call(`/api/db/connections/${id}`, send("PATCH", patch));
/** `movePlans`: the plans that show this home show the main home instead (otherwise the server refuses while any do). */
export const removeHome = (id: string, movePlans: boolean): Promise<{ ok: true }> => call(`/api/db/connections/${id}${movePlans ? "?movePlans=1" : ""}`, { method: "DELETE" });
/** Try an address (`{ url, token }`) or a saved home (`{ id }`, optionally with a new `url` and `token`). */
export const testHome = (input: { id?: string; url?: string; token?: string }): Promise<TestResult> => call("/api/db/connections/test", send("POST", input));
