// The ISS position for /api/sky/iss, from the free wheretheiss.at API (https://wheretheiss.at/w/developer): HTTPS, no key, about one request per second per client.
// ONE request per 10 seconds leaves this server, however many browsers ask: the answer (and a failure) is kept in memory, and callers that ask while it is being fetched
// share that fetch. Nothing about the user or the home is sent: only a fixed URL with two timestamps. Switched off with DOSHY_EXTERNAL_DATA=0 (lib/server/externalData.ts).
// Node's type stripping loads this file in tests: .ts import extensions.
import { parseIssFix, type IssFix } from "../iss.ts";
import { externalDataEnabled } from "./externalData.ts";
import { readCapped } from "./readCapped.ts";

/** Polite, identifiable, like the other third-party fetches. */
export const USER_AGENT = "Doshy/1.0 (+https://github.com/voicub/Doshy; ISS position)";
export const ISS_URL = "https://api.wheretheiss.at/v1/satellites/25544/positions";
/** A good answer is reused this long: 6 requests a minute at most, far inside the 1 a second limit. */
export const ISS_TTL_MS = 10_000;
/** After a failure nobody asks again for this long (a down or rate-limiting server must not be hammered by every browser's poll). */
export const ISS_FAILURE_TTL_MS = 5_000;
export const ISS_TIMEOUT_MS = 5_000;
/** Two small fixes are about 1 KB; anything past this is not the API. */
export const ISS_MAX_BYTES = 16 * 1024;
/** The earlier fix is this many seconds before the later one: it only tells which way the station is heading (north or south). */
export const PREV_FIX_SECONDS = 30;

export type IssFeed = { fix: IssFix; prevFix: IssFix | null; fetchedAt: number } | { disabled: true } | { unavailable: true };

type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal; redirect: "error" }) => Promise<Response>;

/**
 * Two positions in ONE request (the documented `positions` endpoint takes a list of timestamps): now and 30 seconds earlier, so that the very first answer already
 * tells the direction of travel and pass predictions are not mirrored. Same reply format as the single-position endpoint, each entry validated by parseIssFix.
 */
async function load(fetchFn: Fetch, nowMs: number): Promise<IssFeed> {
  const t = Math.floor(nowMs / 1000);
  const url = `${ISS_URL}?timestamps=${t - PREV_FIX_SECONDS},${t}&units=kilometers`;
  try {
    const res = await fetchFn(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(ISS_TIMEOUT_MS), redirect: "error" });
    if (!res.ok || !res.body) return { unavailable: true };
    const hint = Number(res.headers.get("content-length"));
    const bytes = await readCapped(res.body, ISS_MAX_BYTES, Number.isFinite(hint) && hint > 0 ? hint : 0);
    if (!bytes) return { unavailable: true };
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(data) || data.length !== 2) return { unavailable: true };
    const prevFix = parseIssFix(data[0]);
    const fix = parseIssFix(data[1]);
    if (!fix || !prevFix || Math.abs(fix.timestamp - t) > 5 || Math.abs(prevFix.timestamp - (t - PREV_FIX_SECONDS)) > 5) return { unavailable: true };
    return { fix, prevFix, fetchedAt: nowMs };
  } catch {
    // Timeout, offline, DNS, bad JSON: all the same to the caller. The reason is not shown (nothing from upstream ever reaches the client).
    return { unavailable: true };
  }
}

/** A fetcher with its own memory (tests make one each; the app uses the shared `fetchIss`). */
export function makeIssFetcher(env: Readonly<Record<string, string | undefined>> = process.env) {
  let kept: { at: number; value: IssFeed } | null = null;
  let running: Promise<IssFeed> | null = null;
  return async function fetchIss(fetchFn: Fetch, now: () => number = Date.now): Promise<IssFeed> {
    if (!externalDataEnabled(env)) return { disabled: true };
    const at = now();
    if (kept && at >= kept.at && at - kept.at < ("unavailable" in kept.value ? ISS_FAILURE_TTL_MS : ISS_TTL_MS)) return kept.value;
    if (running) return running;
    running = load(fetchFn, at)
      .then((value) => {
        kept = { at, value };
        return value;
      })
      .finally(() => {
        running = null;
      });
    return running;
  };
}

export const fetchIss = makeIssFetcher();
