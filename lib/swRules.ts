/**
 * What the offline service worker (public/sw.js) may cache and how. See docs/offline.md.
 *
 * public/sw.js is a classic script that cannot import this file, so it repeats these rules inline. lib/swRules.test.ts evaluates the real
 * sw.js in a sandbox and runs the same cases against both, so the two cannot drift apart silently: change a rule here AND in sw.js.
 * The page side (lib/ha.ts, lib/dbApi.ts) reads the headers below from the same constants.
 */

export const CACHE_PREFIX = "doshy-";
export type CacheKind = "static" | "shell" | "data";
export const CACHE_KINDS: readonly CacheKind[] = ["static", "shell", "data"];

/** Added by the worker to an answer it served from its cache because the network failed: "stale" + when that copy was stored (epoch ms). */
export const STALE_HEADER = "x-doshy-cache";
export const CACHED_AT_HEADER = "x-doshy-cached-at";

/** A page load waits this long for the server before the cached shell is shown; data requests (states, plan) a little longer. Both stay under the page's own 15 s deadline (lib/requestTimeout.ts). */
export const NAV_TIMEOUT_MS = 3000;
export const DATA_TIMEOUT_MS = 6000;
/** The states poll runs every 3 s: a copy is rewritten at most this often (a Pi's SD card does not need 250 KB every poll). */
export const DATA_MIN_WRITE_MS = 15_000;
/** At most this many files are fetched ahead of time at install, from what the page's HTML mentions. */
export const MAX_PRECACHE = 120;

const MB = 1024 * 1024;
/** Per cache: entries kept (oldest dropped first) and the biggest single response stored. */
export const LIMITS: Record<CacheKind, { entries: number; bytes: number }> = {
  static: { entries: 400, bytes: 8 * MB },
  shell: { entries: 2, bytes: 2 * MB },
  data: { entries: 24, bytes: 6 * MB },
};

/** Icons in public/: cached with the app files. */
export const PUBLIC_FILES: readonly string[] = ["/icon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"];
/** A request with any of these is never answered from (or stored in) a cache: credentials, the test database switch, partial content, and an extra home (`X-Doshy-Home`: the one cached copy of /api/ha/states is the main home's, and another home's devices must never be shown from it). */
export const BYPASS_HEADERS: readonly string[] = ["authorization", "x-housey-test", "range", "x-doshy-home"];
const PLAN_PATH = /^\/api\/db\/dashboards\/[0-9]+\/plan$/;

export type SwRequest = {
  url: string;
  method: string;
  /** Request.mode: "navigate" for a page load. */
  mode: string;
  /** The names of the headers on the request. */
  headers: readonly string[];
  /** The worker's own origin (`location.origin`). */
  origin: string;
};
export type Decision = { strategy: "network-only" } | { strategy: "cache-first" | "network-first" | "navigation"; cache: CacheKind; key: string };

/**
 * One decision per request. Everything not listed here is `network-only`: the worker does not call `respondWith`, so the browser behaves as if there were no worker.
 *  - navigation: only "/" (a page load of any query string, e.g. the kiosk URL, shares one cached copy): network first, the cached page when the server is slow or down;
 *  - cache-first: hashed app files (`/_next/static/*`: fonts too) and the icons;
 *  - network-first: the last known states and a plan's working copy (no query string: `?since=` answers are tiny "unchanged" notes that must never replace a stored plan).
 * Anything else under /api (guest links, service calls, scenes, automations, cameras, writes) is network-only by default: nothing is cached unless it is named above.
 */
export function decide(req: SwRequest): Decision {
  const none: Decision = { strategy: "network-only" };
  if (req.method !== "GET") return none;
  let u: URL;
  try {
    u = new URL(req.url);
  } catch {
    return none;
  }
  if (u.origin !== req.origin || (u.protocol !== "http:" && u.protocol !== "https:")) return none;
  if (req.headers.some((h) => BYPASS_HEADERS.includes(h.toLowerCase()))) return none;
  const p = u.pathname;
  if (p === "/view" || p.startsWith("/view/")) return none; // the guest page: its link token is in the path, never cached and never answered with the owner's shell
  if (req.mode === "navigate") return p === "/" ? { strategy: "navigation", cache: "shell", key: "/" } : none;
  if (p.startsWith("/_next/static/") || PUBLIC_FILES.includes(p)) return { strategy: "cache-first", cache: "static", key: p + u.search };
  if (!u.search && (p === "/api/ha/states" || PLAN_PATH.test(p))) return { strategy: "network-first", cache: "data", key: p };
  return none;
}

/** The version the page puts in the worker's URL (`/sw.js?v=1.2.3`); anything odd becomes "dev". A new version = a new worker and fresh cache names. */
export const safeVersion = (raw: string | null): string => (raw !== null && /^[0-9A-Za-z._-]{1,32}$/.test(raw) ? raw : "dev");
export const cacheName = (kind: CacheKind, version: string): string => `${CACHE_PREFIX}${kind}-v${version}`;
export const workerUrl = (version: string): string => `/sw.js?v=${encodeURIComponent(version)}`;

type HeaderReader = { get(name: string): string | null };

/** The worker served this answer from its cache: it may be old and must not be treated as what the server says now. */
export const isStaleAnswer = (h: HeaderReader): boolean => h.get(STALE_HEADER) === "stale";

/** When a stale answer was stored (epoch ms), or null for a live answer or a missing / odd timestamp. */
export function cachedAtOf(h: HeaderReader): number | null {
  if (!isStaleAnswer(h)) return null;
  const at = Number(h.get(CACHED_AT_HEADER));
  return Number.isFinite(at) && at > 0 ? at : null;
}
