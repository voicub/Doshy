// The guest page's calls to its own link's API (app/api/guest/<token>/*). Every answer is checked (lib/guestData.ts) before the page uses it, and a failure comes back as a value
// with plain words and the server's status, never as an exception: the page decides what each one means (no such link, PIN needed, too many tries, offline).
import { parseGuestReply, parseGuestStates, type GuestReply } from "./guestData.ts";
import type { HAState } from "./ha.ts";
import { isRecord } from "./guards.ts";
import { REQUEST_TIMEOUT_MS, TRANSFER_TIMEOUT_MS, within } from "./requestTimeout.ts";

export type GuestFail = {
  ok: false;
  /** the HTTP status; 0 = the server could not be reached */
  status: number;
  /** the server's short code (`wrong_pin`, `locked`, `pin_required`, `not_found`, `slow_down`, ...) */
  code: string;
  message: string;
  /** seconds until a refused request is worth repeating (from `Retry-After`), or null */
  retryAfter: number | null;
};
export type Got<T> = { ok: true; value: T } | GuestFail;

const fail = (status: number, code: string, message: string, retryAfter: number | null = null): GuestFail => ({ ok: false, status, code, message, retryAfter });
const path = (token: string, rest: string) => `/api/guest/${token}/${rest}`;

/** One call: the parsed JSON of a good answer, or the failure in words. */
async function ask(url: string, init: RequestInit = {}): Promise<Got<unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init, signal: within(REQUEST_TIMEOUT_MS) });
  } catch {
    return fail(0, "offline", "The server cannot be reached. Check the connection and try again.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, value: body };
  const retry = Number(res.headers.get("retry-after"));
  return fail(
    res.status,
    isRecord(body) && typeof body.code === "string" ? body.code : "error",
    isRecord(body) && typeof body.error === "string" ? body.error : `The server answered ${res.status}.`,
    Number.isFinite(retry) && retry > 0 ? retry : null,
  );
}

/** Does this link ask for a PIN, and is this browser already in? */
export async function fetchSession(token: string): Promise<Got<{ pin: boolean; unlocked: boolean }>> {
  const r = await ask(path(token, "session"));
  if (!r.ok) return r;
  const v = r.value;
  return isRecord(v) && typeof v.pin === "boolean" && typeof v.unlocked === "boolean" ? { ok: true, value: { pin: v.pin, unlocked: v.unlocked } } : fail(502, "bad_reply", "The server's answer was not what this page expected.");
}

/** Try a PIN. The right one makes the server set the session cookie (this page never sees it). */
export async function sendPin(token: string, pin: string): Promise<Got<true>> {
  const r = await ask(path(token, "session"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
  return r.ok ? { ok: true, value: true } : r;
}

/** The shared plan with the custom pieces it uses. */
export async function fetchGuestPlan(token: string): Promise<Got<GuestReply>> {
  const r = await ask(path(token, "plan"));
  if (!r.ok) return r;
  const reply = parseGuestReply(r.value);
  return reply ? { ok: true, value: reply } : fail(502, "bad_reply", "The server's answer was not what this page expected.");
}

/** The read-only live states (a link made with "show live states"). */
export async function fetchGuestStates(token: string): Promise<Got<Record<string, HAState>>> {
  const r = await ask(path(token, "states"));
  return r.ok ? { ok: true, value: parseGuestStates(r.value) } : r;
}

/** A 3D model file of a piece of this plan, or undefined (the piece then shows its stand-in box). Not kept in this browser. */
export async function fetchGuestModel(token: string, id: string): Promise<{ ext: "glb" | "gltf"; buf: ArrayBuffer } | undefined> {
  try {
    const res = await fetch(path(token, `resource/${encodeURIComponent(id)}`), { cache: "no-store", credentials: "same-origin", signal: within(TRANSFER_TIMEOUT_MS) });
    if (!res.ok) return undefined;
    return { ext: (res.headers.get("content-type") ?? "").startsWith("model/gltf+json") ? "gltf" : "glb", buf: await res.arrayBuffer() };
  } catch {
    return undefined;
  }
}

/** What the page shows after a request failed: the link is gone, the PIN is needed, or a problem in words (the page keeps what it has and offers to try again). */
export function screenAfter(f: GuestFail): { kind: "gone" } | { kind: "pin" } | { kind: "problem"; message: string } {
  if (f.status === 404) return { kind: "gone" };
  if (f.status === 401 && f.code === "pin_required") return { kind: "pin" };
  return { kind: "problem", message: f.message };
}
