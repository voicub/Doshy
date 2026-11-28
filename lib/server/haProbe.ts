// "Test connection": one look at Home Assistant's /api/config with a token, answered in plain words. Nothing here is saved, and the token only goes to the address it is tested against.
import { isRecord } from "../guards.ts";
import { assertHostAllowed } from "./haUrl.ts";
import { HttpError } from "../db/errors.ts";

export const PROBE_TIMEOUT_MS = 5000;

export type ProbeResult = { ok: true; version: string; locationName: string } | { ok: false; error: string };

/** Why a fetch failed, in words a person can act on. Never contains the address or the token. */
export function explainFetchError(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "TimeoutError" || name === "AbortError") return "Home Assistant did not answer in time. Check the address and that it is switched on.";
  const cause = e instanceof Error && isRecord(e.cause) && typeof e.cause.code === "string" ? e.cause.code : "";
  if (cause === "ENOTFOUND" || cause === "EAI_AGAIN") return "That address could not be found. Check the spelling, or try the IP address.";
  if (cause === "ECONNREFUSED") return "Nothing answered at that address and port. Home Assistant is usually on port 8123.";
  if (cause === "EHOSTUNREACH" || cause === "ENETUNREACH") return "That address cannot be reached from this server.";
  if (cause === "ECONNRESET" || cause === "UND_ERR_SOCKET") return "The connection was cut off. If the address starts with https://, check that Home Assistant really uses https.";
  if (/CERT|TLS|SSL|SELF_SIGNED|ERR_SSL/i.test(cause) || /certificate|tls|ssl/i.test(e instanceof Error ? e.message : "")) return "The secure connection failed: the certificate is not trusted by this server. Use the address your certificate was made for, or http:// on your home network.";
  return "Could not reach Home Assistant at that address.";
}

/** The plain sentence a Homes list shows for a failed poll: `e` is what the REST call threw (`Home Assistant HTTP 401` from the routes, or the fetch error itself). */
export function homeProblem(e: unknown): string {
  const message = e instanceof Error ? e.message : "";
  const status = /Home Assistant HTTP (\d{3})/.exec(message)?.[1];
  if (status === "401" || status === "403") return "Home Assistant refused the token.";
  if (status) return `Home Assistant answered with an error (HTTP ${status}).`;
  return explainFetchError(e);
}

/**
 * Ask `baseUrl` for its config with `token`. `fetchFn` is the real `fetch` outside tests. A refused token, a wrong address and an unreachable host each get their own sentence.
 * Throws HttpError 400 for an address that is not allowed (see haUrl.ts); everything else is a result.
 */
export async function probeHome(baseUrl: string, token: string, fetchFn: typeof fetch = fetch): Promise<ProbeResult> {
  await assertHostAllowed(baseUrl);
  try {
    const res = await fetchFn(`${baseUrl}/api/config`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      redirect: "manual", // a redirect is an answer from somewhere else: say so instead of following it with the token
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Home Assistant refused the token. Make a new long-lived access token (profile > Security) and paste it again." };
    if (res.status >= 300 && res.status < 400) return { ok: false, error: "That address sends you somewhere else. Use the address you end up at (for example the https:// one)." };
    if (!res.ok) return { ok: false, error: "This does not look like Home Assistant (it answered with an error)." };
    const body: unknown = await res.json().catch(() => null);
    if (!isRecord(body) || typeof body.version !== "string") return { ok: false, error: "This does not look like Home Assistant." };
    return { ok: true, version: body.version.slice(0, 40), locationName: typeof body.location_name === "string" ? body.location_name.slice(0, 80) : "" };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return { ok: false, error: explainFetchError(e) };
  }
}
