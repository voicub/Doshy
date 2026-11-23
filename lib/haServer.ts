import { errorMessage } from "./guards.ts";
import type { SocketFactory } from "./haNotify.ts";

// A call that has not answered by then is given up: without a limit a stuck Home Assistant would pile up every browser's polls behind it.
const DEFAULT_TIMEOUT_MS = 10_000;

/** Where Home Assistant is and the token for it (both from `.env.local`; the token never leaves the server). */
export function haCredentials(): { base: string; token: string } {
  const base = process.env.HA_URL?.replace(/\/$/, "");
  const token = process.env.HA_TOKEN;
  if (!base || !token) throw new Error("HA_URL / HA_TOKEN not set in .env.local");
  return { base, token };
}

/** The runtime's WebSocket, typed as the small surface lib/haNotify.ts uses (its `Socket`): the DOM type's handler signatures do not unify with it. */
export const HaWebSocket = WebSocket as unknown as SocketFactory;

export async function ha(path: string, init?: RequestInit) {
  const { base, token } = haCredentials();
  return fetch(`${base}/api/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    cache: "no-store",
  });
}

/** The reply when Home Assistant cannot be asked or answered badly: 502 with the plain reason. */
export const haFailure = (e: unknown): Response => Response.json({ error: errorMessage(e) }, { status: 502 });
