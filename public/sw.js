/*
 * Doshy offline shell: a service worker that keeps the app files and the last known states and plan, so a screen still boots and shows its
 * last state when Wi-Fi or Home Assistant drops. Classic script, imports nothing. Registered only by production builds (lib/offlineWorker.ts).
 * The rules below are mirrored in lib/swRules.ts; lib/swRules.test.ts runs this very file in a sandbox against the same cases. See docs/offline.md.
 * Writes are never cached or queued: only GET requests that `decide` names are touched, everything else goes straight to the network.
 */
"use strict";

const PREFIX = "doshy-";
const KINDS = ["static", "shell", "data"];
const STALE_HEADER = "x-doshy-cache";
const CACHED_AT_HEADER = "x-doshy-cached-at";
const NAV_TIMEOUT_MS = 3000;
const DATA_TIMEOUT_MS = 6000;
const DATA_MIN_WRITE_MS = 15000;
const MAX_PRECACHE = 120;
const MB = 1024 * 1024;
const LIMITS = { static: { entries: 400, bytes: 8 * MB }, shell: { entries: 2, bytes: 2 * MB }, data: { entries: 24, bytes: 6 * MB } };
const PUBLIC_FILES = ["/icon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"];
const BYPASS_HEADERS = ["authorization", "x-housey-test", "range", "x-doshy-home"];
const PLAN_PATH = /^\/api\/db\/dashboards\/[0-9]+\/plan$/;

const safeVersion = (raw) => (raw !== null && /^[0-9A-Za-z._-]{1,32}$/.test(raw) ? raw : "dev");
const cacheName = (kind, version) => PREFIX + kind + "-v" + version;
const VERSION = safeVersion(new URL(self.location.href).searchParams.get("v"));
const absolute = (key) => new URL(key, self.location.origin).href;

/** One decision per request; anything not named is network-only (the worker does not touch it). Same table as lib/swRules.ts. */
function decide(req) {
  const none = { strategy: "network-only" };
  if (req.method !== "GET") return none;
  let u;
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

/** Keep the newest `max` entries (the cache lists oldest-written first). */
async function trim(cache, max) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}

/** A stored copy as the page receives it when the network failed: flagged, with the time it was stored. */
function markStale(cached) {
  const headers = new Headers(cached.headers);
  headers.set(STALE_HEADER, "stale");
  return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
}

const lastWrite = new Map();

/** Store a copy of a successful answer. Only a plain 200 under the size limit; never throws (a full disk must not break the page). */
async function store(kind, key, res, now) {
  try {
    const limit = LIMITS[kind];
    if (res.status !== 200 || res.type === "opaque" || Number(res.headers.get("content-length")) > limit.bytes) return;
    if (kind === "data" && now - (lastWrite.get(key) || 0) < DATA_MIN_WRITE_MS) return;
    const blob = await res.clone().blob();
    if (blob.size > limit.bytes) return;
    lastWrite.set(key, now);
    const headers = new Headers(res.headers);
    headers.delete("content-encoding"); // the body is already decoded: keeping these would make the browser decode or measure it twice
    headers.delete("content-length");
    headers.set(CACHED_AT_HEADER, String(now));
    const cache = await caches.open(cacheName(kind, VERSION));
    await cache.put(absolute(key), new Response(blob, { status: 200, statusText: res.statusText, headers }));
    await trim(cache, limit.entries);
  } catch {
    /* storage full or blocked: the live answer is unaffected */
  }
}

/** Finish storing after the answer has been handed to the page (a worker may be stopped once it has nothing pending). */
const keepAlive = (event, work) => {
  try {
    event.waitUntil(work);
  } catch {
    /* too late to extend this event: storing still runs while the worker lives */
  }
};

async function cacheFirst(event, d) {
  const cache = await caches.open(cacheName(d.cache, VERSION));
  const hit = await cache.match(absolute(d.key), { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(event.request);
  keepAlive(event, store(d.cache, d.key, res, Date.now()));
  return res;
}

/** The network's answer, unless it is slow (more than `timeoutMs`), down or a server error: then the stored copy (flagged stale for data). */
async function networkFirst(event, d) {
  const timeoutMs = d.strategy === "navigation" ? NAV_TIMEOUT_MS : DATA_TIMEOUT_MS;
  const net = fetch(event.request).then((res) => {
    keepAlive(event, store(d.cache, d.key, res, Date.now()));
    return res;
  });
  let timer;
  const slow = new Promise((resolve) => (timer = setTimeout(() => resolve(null), timeoutMs)));
  const first = await Promise.race([net.catch(() => null), slow]);
  clearTimeout(timer);
  if (first && first.status < 500) return first;
  const cache = await caches.open(cacheName(d.cache, VERSION));
  const kept = await cache.match(absolute(d.key), { ignoreVary: true });
  if (kept) return d.cache === "data" ? markStale(kept) : kept;
  return first || net; // nothing stored yet: wait for the network, or fail exactly as without a worker
}

self.addEventListener("fetch", (event) => {
  const r = event.request;
  const d = decide({ url: r.url, method: r.method, mode: r.mode, headers: [...r.headers.keys()], origin: self.location.origin });
  if (d.strategy === "network-only") return; // no respondWith: the browser handles it as if there were no worker
  event.respondWith(d.strategy === "cache-first" ? cacheFirst(event, d) : networkFirst(event, d));
});

/** The page's HTML names its hashed script, style and font files: fetching them now makes the first offline start work. A file that fails is skipped. */
async function precache() {
  const page = await fetch(absolute("/"), { cache: "reload" });
  if (!page.ok) throw new Error("The page answered " + page.status); // not installed: tried again at the next visit
  const html = await page.clone().text();
  await store("shell", "/", page, Date.now());
  const named = html.match(/(?:\/_next\/)?static\/[\w\-.~%@+/]+\.(?:js|css|woff2?)/g) || [];
  const files = [...new Set(named.map((m) => (m.startsWith("static/") ? "/_next/" + m : m)))].slice(0, MAX_PRECACHE);
  await Promise.allSettled(
    [...files, ...PUBLIC_FILES].map(async (path) => {
      const res = await fetch(absolute(path));
      await store("static", path, res, Date.now());
    }),
  );
}

self.addEventListener("install", (event) => event.waitUntil(precache()));

// An update waits for the page to ask (the "Reload" button): lib/offlineWorker.ts posts this, then reloads once the new worker takes over.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const current = KINDS.map((k) => cacheName(k, VERSION));
      for (const name of await caches.keys()) if (name.startsWith(PREFIX) && !current.includes(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);

// Test hook (lib/swRules.test.ts sets this flag before loading the file): the pieces that decide and store, without a browser.
if (self.__doshySwTest === true) {
  self.__doshySwRules = {
    decide, safeVersion, cacheName, trim, markStale, store, VERSION,
    constants: { PREFIX, KINDS, STALE_HEADER, CACHED_AT_HEADER, NAV_TIMEOUT_MS, DATA_TIMEOUT_MS, DATA_MIN_WRITE_MS, MAX_PRECACHE, LIMITS, PUBLIC_FILES, BYPASS_HEADERS },
  };
}
