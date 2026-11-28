import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import * as rules from "./swRules.ts";

/**
 * public/sw.js repeats the rules of lib/swRules.ts (a classic script cannot import). This file runs the REAL sw.js in a sandbox with a fake cache
 * and a fake network, and checks that it decides exactly like swRules.ts and that what it stores and serves is safe. A real browser, a registered
 * worker and the HTTP cache are NOT covered here: see "Manual verification" in docs/offline.md.
 */

const ORIGIN = "https://doshy.test";
const SW_SOURCE = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const plain = (x: unknown): unknown => JSON.parse(JSON.stringify(x)); // the sandbox has its own Object.prototype: compare plain data

class FakeCache {
  entries = new Map<string, Response>();
  async match(url: string): Promise<Response | undefined> {
    return this.entries.get(url)?.clone();
  }
  async put(url: string, res: Response): Promise<void> {
    this.entries.delete(url); // a rewritten entry is the newest, like the real cache
    this.entries.set(url, res);
  }
  async keys(): Promise<string[]> {
    return [...this.entries.keys()];
  }
  async delete(url: string): Promise<boolean> {
    return this.entries.delete(url);
  }
}
class FakeStorage {
  caches = new Map<string, FakeCache>();
  opened = 0;
  async open(name: string): Promise<FakeCache> {
    this.opened++;
    const c = this.caches.get(name) ?? new FakeCache();
    this.caches.set(name, c);
    return c;
  }
  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }
  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }
}

type SwApi = {
  decide(r: rules.SwRequest): unknown;
  safeVersion(raw: string | null): string;
  cacheName(kind: string, version: string): string;
  trim(cache: FakeCache, max: number): Promise<void>;
  markStale(res: Response): Response;
  constants: Record<string, unknown>;
};
type Net = (url: string) => Promise<Response>;
type Dispatched = { respondWith: Promise<Response> | null; waits: Promise<unknown>[] };
type Handler = (event: unknown) => void;
type ReqInit = { method?: string; mode?: string; headers?: Record<string, string> };
type WorkerState = { net: Net; fetched: string[]; skipped: number; claimed: number };
type Worker = {
  api: SwApi;
  storage: FakeStorage;
  state: WorkerState;
  dispatch(type: string, event?: Record<string, unknown>): Dispatched;
  /** Fire a fetch event; the response the worker gave, or null when it left the request to the browser. */
  get(path: string, init?: ReqInit): Promise<Response | null>;
};

/** `timers: "fire"` makes every timeout elapse at once (a server that never answers); "never" leaves them pending. */
function loadWorker(opts: { timers?: "fire" | "never" } = {}): Worker {
  const storage = new FakeStorage();
  const handlers: Record<string, Handler> = {};
  const state: WorkerState = { net: async () => new Response("no network", { status: 599 }), fetched: [], skipped: 0, claimed: 0 };
  const self = {
    location: { href: `${ORIGIN}/sw.js?v=1.2.3`, origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => void (handlers[type] = fn),
    skipWaiting: () => void state.skipped++,
    clients: { claim: async () => void state.claimed++ },
    __doshySwTest: true,
    __doshySwRules: undefined as SwApi | undefined,
  };
  const sandbox = {
    self,
    caches: storage,
    fetch: (input: string | { url: string }) => {
      const url = typeof input === "string" ? input : input.url;
      state.fetched.push(url);
      return state.net(url);
    },
    Response,
    Headers,
    URL,
    setTimeout: opts.timers === "fire" ? (fn: () => void) => void queueMicrotask(fn) : setTimeout,
    clearTimeout,
  };
  vm.runInContext(SW_SOURCE, vm.createContext(sandbox));
  const api = self.__doshySwRules;
  assert.ok(api, "sw.js exposes its rules when the test flag is set");

  const request = (path: string, init: ReqInit = {}) => ({
    url: path.startsWith("http") ? path : ORIGIN + path,
    method: init.method ?? "GET",
    mode: init.mode ?? "cors",
    headers: new Headers(init.headers),
  });
  const dispatch = (type: string, event: Record<string, unknown> = {}): Dispatched => {
    const out: Dispatched = { respondWith: null, waits: [] };
    handlers[type]({ ...event, respondWith: (p: Promise<Response>) => void (out.respondWith = p), waitUntil: (p: Promise<unknown>) => void out.waits.push(p) });
    return out;
  };
  const get = async (path: string, init?: ReqInit) => {
    const d = dispatch("fetch", { request: request(path, init) });
    const res = d.respondWith ? await d.respondWith : null;
    await Promise.all(d.waits);
    return res;
  };
  return { api, storage, state, dispatch, get };
}

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", etag: '"v1"' }, ...init });
const cacheOf = (w: Worker, kind: rules.CacheKind) => w.storage.caches.get(rules.cacheName(kind, "1.2.3"));

// ---- the decision table: sw.js and lib/swRules.ts must agree, and both must be safe --------------------------------------------------

const req = (path: string, over: Partial<rules.SwRequest> = {}): rules.SwRequest => ({ url: path.startsWith("http") ? path : ORIGIN + path, method: "GET", mode: "cors", headers: [], origin: ORIGIN, ...over });
const NONE = { strategy: "network-only" };

const CASES: { name: string; req: rules.SwRequest; expect: unknown }[] = [
  { name: "page load of /", req: req("/", { mode: "navigate" }), expect: { strategy: "navigation", cache: "shell", key: "/" } },
  { name: "kiosk URL shares the cached /", req: req("/?kiosk=1&plan=2", { mode: "navigate" }), expect: { strategy: "navigation", cache: "shell", key: "/" } },
  { name: "another page load is not ours", req: req("/api/db/backup", { mode: "navigate" }), expect: NONE },
  { name: "guest page navigation", req: req("/view/tok3n", { mode: "navigate" }), expect: NONE },
  { name: "guest page, any mode", req: req("/view/tok3n", { mode: "no-cors" }), expect: NONE },
  { name: "bare /view", req: req("/view", { mode: "navigate" }), expect: NONE },
  { name: "hashed app file", req: req("/_next/static/chunks/a1.js", { mode: "no-cors" }), expect: { strategy: "cache-first", cache: "static", key: "/_next/static/chunks/a1.js" } },
  { name: "font", req: req("/_next/static/media/f.woff2"), expect: { strategy: "cache-first", cache: "static", key: "/_next/static/media/f.woff2" } },
  { name: "icon", req: req("/icon-192.png"), expect: { strategy: "cache-first", cache: "static", key: "/icon-192.png" } },
  { name: "server-side next files", req: req("/_next/image?url=x"), expect: NONE },
  { name: "states", req: req("/api/ha/states"), expect: { strategy: "network-first", cache: "data", key: "/api/ha/states" } },
  { name: "states with a query", req: req("/api/ha/states?x=1"), expect: NONE },
  { name: "plan", req: req("/api/db/dashboards/2/plan"), expect: { strategy: "network-first", cache: "data", key: "/api/db/dashboards/2/plan" } },
  { name: "plan poll (?since) never replaces the stored plan", req: req("/api/db/dashboards/2/plan?since=5"), expect: NONE },
  { name: "plan of a non-number", req: req("/api/db/dashboards/x/plan"), expect: NONE },
  { name: "plan versions", req: req("/api/db/dashboards/2/versions"), expect: NONE },
  { name: "plan list", req: req("/api/db/dashboards"), expect: NONE },
  { name: "settings", req: req("/api/db/settings"), expect: NONE },
  { name: "unlisted ha route", req: req("/api/ha/areas"), expect: NONE },
  { name: "guest api", req: req("/api/guest/abc"), expect: NONE },
  { name: "guest api root", req: req("/api/guest"), expect: NONE },
  ...["service", "scene", "automation", "camera"].map((r) => ({ name: `ha ${r}`, req: req(`/api/ha/${r}`), expect: NONE })),
  ...["POST", "PUT", "PATCH", "DELETE", "HEAD"].flatMap((method) => [
    { name: `${method} plan`, req: req("/api/db/dashboards/2/plan", { method }), expect: NONE },
    { name: `${method} states`, req: req("/api/ha/states", { method }), expect: NONE },
    { name: `${method} static`, req: req("/_next/static/chunks/a1.js", { method }), expect: NONE },
  ]),
  { name: "Authorization (any case)", req: req("/api/ha/states", { headers: ["Authorization"] }), expect: NONE },
  { name: "Authorization on a file", req: req("/_next/static/chunks/a1.js", { headers: ["authorization"] }), expect: NONE },
  { name: "test database header", req: req("/api/db/dashboards/2/plan", { headers: ["x-housey-test"] }), expect: NONE },
  { name: "an extra home's states are never cached or served from the main home's copy", req: req("/api/ha/states", { headers: ["X-Doshy-Home"] }), expect: NONE },
  { name: "test database header on a page", req: req("/", { mode: "navigate", headers: ["X-Housey-Test"] }), expect: NONE },
  { name: "range request", req: req("/_next/static/media/f.woff2", { headers: ["range"] }), expect: NONE },
  { name: "another site", req: req("https://evil.test/api/ha/states"), expect: NONE },
  { name: "another scheme is another origin", req: req("http://doshy.test/api/ha/states"), expect: NONE },
  { name: "another port", req: req("https://doshy.test:8443/_next/static/a.js"), expect: NONE },
  { name: "not a URL", req: req("not a url", { url: "not a url" }), expect: NONE },
  { name: "extension scheme", req: req("chrome-extension://abc/_next/static/a.js", { origin: "chrome-extension://abc" }), expect: NONE },
];

test("sw.js and lib/swRules.ts decide every case the same way, as expected", () => {
  const { api } = loadWorker();
  for (const c of CASES) {
    assert.deepEqual(plain(rules.decide(c.req)), c.expect, `swRules: ${c.name}`);
    assert.deepEqual(plain(api.decide(c.req)), c.expect, `sw.js: ${c.name}`);
  }
});

test("sw.js and lib/swRules.ts agree on a wide matrix of requests", () => {
  const { api } = loadWorker();
  const paths = ["/", "/?kiosk=1", "/view/x", "/view", "/api/ha/states", "/api/ha/states?a=1", "/api/db/dashboards/7/plan", "/api/db/dashboards/7/plan?since=1", "/api/guest/x", "/api/ha/service", "/_next/static/a.js", "/icon.svg", "/manifest.webmanifest", "/sw.js", "//evil.test/x", "/%2e%2e/api/guest"];
  const hosts = [ORIGIN, "https://evil.test", "http://doshy.test"];
  const headerSets = [[], ["Authorization"], ["x-housey-test"], ["RANGE"], ["accept", "if-none-match"]];
  let n = 0;
  for (const method of ["GET", "POST", "HEAD"]) for (const mode of ["navigate", "cors", "no-cors", "same-origin"]) for (const host of hosts) for (const p of paths) for (const headers of headerSets) {
    const r = { url: host + p, method, mode, headers, origin: ORIGIN };
    assert.deepEqual(plain(api.decide(r)), plain(rules.decide(r)), JSON.stringify(r));
    n++;
  }
  assert.ok(n > 1000);
});

test("the constants, cache names and version check are the same in sw.js and lib/swRules.ts", () => {
  const { api } = loadWorker();
  const c = api.constants;
  assert.deepEqual(plain(c), plain({
    PREFIX: rules.CACHE_PREFIX, KINDS: rules.CACHE_KINDS, STALE_HEADER: rules.STALE_HEADER, CACHED_AT_HEADER: rules.CACHED_AT_HEADER, NAV_TIMEOUT_MS: rules.NAV_TIMEOUT_MS, DATA_TIMEOUT_MS: rules.DATA_TIMEOUT_MS,
    DATA_MIN_WRITE_MS: rules.DATA_MIN_WRITE_MS, MAX_PRECACHE: rules.MAX_PRECACHE, LIMITS: rules.LIMITS, PUBLIC_FILES: rules.PUBLIC_FILES, BYPASS_HEADERS: rules.BYPASS_HEADERS,
  }));
  for (const v of [null, "", "1.2.3", "0.1.0-beta_2", "../x", "a b", "x".repeat(40), "v1;rm"]) assert.equal(api.safeVersion(v), rules.safeVersion(v), String(v));
  for (const kind of rules.CACHE_KINDS) assert.equal(api.cacheName(kind, "9.9.9"), rules.cacheName(kind, "9.9.9"));
  assert.ok(Object.values(rules.LIMITS).every((l) => l.bytes <= 16 * 1024 * 1024 && l.entries > 0), "caps are bounded");
});

// ---- what the worker stores and serves --------------------------------------------------------------------------------------------------

test("requests the rules reject never reach a cache or the worker's response path", async () => {
  const w = loadWorker();
  w.state.net = async () => json({ secret: true });
  const blocked: [string, ReqInit][] = [
    ["/api/db/dashboards/2/plan", { method: "PUT" }],
    ["/api/ha/service", { method: "POST" }],
    ["/api/guest/abc", {}],
    ["/api/ha/camera", {}],
    ["/api/ha/states", { headers: { authorization: "Bearer x" } }],
    ["/api/db/dashboards/2/plan", { headers: { "x-housey-test": "abcdefgh" } }],
    ["/view/tok3n", { mode: "navigate" }],
    ["https://evil.test/api/ha/states", {}],
  ];
  for (const [path, init] of blocked) assert.equal(await w.get(path, init), null, `${path} is left to the browser`);
  assert.equal(w.storage.opened, 0, "no cache was even opened");
  assert.deepEqual(w.state.fetched, [], "the worker made no request of its own");
});

test("a live answer is passed on untouched and a copy is kept; when the network fails the copy is served flagged as stale", async () => {
  const w = loadWorker();
  w.state.net = async () => json({ rev: 3 });
  const live = await w.get("/api/ha/states");
  assert.equal(live?.headers.get(rules.STALE_HEADER), null, "a live answer carries no stale mark");
  assert.deepEqual(await live?.json(), { rev: 3 });

  w.state.net = async () => {
    throw new TypeError("Failed to fetch");
  };
  const stale = await w.get("/api/ha/states");
  assert.ok(stale);
  assert.equal(rules.isStaleAnswer(stale.headers), true);
  assert.equal(typeof rules.cachedAtOf(stale.headers), "number", "the page can tell how old the copy is");
  assert.deepEqual(await stale.json(), { rev: 3 });
});

test("a server error serves the stored copy as stale, and with nothing stored the error itself comes through", async () => {
  const w = loadWorker();
  w.state.net = async () => json({ error: "Home Assistant HTTP 502" }, { status: 502 });
  const bare = await w.get("/api/ha/states");
  assert.equal(bare?.status, 502);
  assert.equal(cacheOf(w, "data")?.entries.size ?? 0, 0, "an error is never stored");

  w.state.net = async () => json({ ok: 1 });
  await w.get("/api/ha/states");
  w.state.net = async () => json({ error: "Home Assistant HTTP 502" }, { status: 502 });
  const served = await w.get("/api/ha/states");
  assert.equal(served?.status, 200);
  assert.equal(rules.isStaleAnswer(served?.headers ?? new Headers()), true);
});

test("only plain 200 answers under the size limit are stored", async () => {
  const w = loadWorker();
  const tries: Response[] = [
    new Response("partial", { status: 206 }),
    new Response("nope", { status: 404 }),
    new Response(null, { status: 304 }),
    new Response("x", { status: 200, headers: { "content-length": String(rules.LIMITS.data.bytes + 1) } }),
  ];
  for (const r of tries) {
    w.state.net = async () => r;
    await w.get("/api/db/dashboards/2/plan");
  }
  assert.equal(cacheOf(w, "data")?.entries.size ?? 0, 0);
});

test("a copy is rewritten at most every few seconds, so the stored states are not churned on every poll", async () => {
  const w = loadWorker();
  w.state.net = async () => json({ n: 1 });
  await w.get("/api/ha/states");
  w.state.net = async () => json({ n: 2 });
  await w.get("/api/ha/states");
  w.state.net = async () => {
    throw new TypeError("offline");
  };
  assert.deepEqual(await (await w.get("/api/ha/states"))?.json(), { n: 1 });
});

test("a page load of any query string falls back to the one stored page", async () => {
  const w = loadWorker();
  w.state.net = async () => new Response("<html>shell</html>", { status: 200, headers: { "content-type": "text/html" } });
  await w.get("/?kiosk=1&plan=2", { mode: "navigate" });
  w.state.net = async () => {
    throw new TypeError("offline");
  };
  const offline = await w.get("/", { mode: "navigate" });
  assert.equal(await offline?.text(), "<html>shell</html>");
  assert.equal(offline?.headers.get(rules.STALE_HEADER), null, "the page is not marked: only data answers are");
  assert.equal(await w.get("/view/tok3n", { mode: "navigate" }), null, "the owner's page is never the answer for a guest link");
});

test("a server that never answers gets the stored page after the wait", async () => {
  const w = loadWorker({ timers: "fire" });
  await (await w.storage.open(rules.cacheName("shell", "1.2.3"))).put(`${ORIGIN}/`, new Response("<html>kept</html>"));
  w.state.net = () => new Promise<Response>(() => undefined);
  assert.equal(await (await w.get("/", { mode: "navigate" }))?.text(), "<html>kept</html>");
});

test("an answer that is slow but arrives is still passed on, not replaced by the stored page", async () => {
  const w = loadWorker({ timers: "never" });
  await (await w.storage.open(rules.cacheName("shell", "1.2.3"))).put(`${ORIGIN}/`, new Response("<html>kept</html>"));
  w.state.net = async () => new Response("<html>fresh</html>", { status: 200 });
  assert.equal(await (await w.get("/", { mode: "navigate" }))?.text(), "<html>fresh</html>");
});

test("app files come from the cache once stored", async () => {
  const w = loadWorker();
  w.state.net = async () => new Response("console.log(1)", { status: 200 });
  await w.get("/_next/static/chunks/a1.js");
  w.state.fetched.length = 0;
  assert.equal(await (await w.get("/_next/static/chunks/a1.js"))?.text(), "console.log(1)");
  assert.deepEqual(w.state.fetched, [], "no network round trip for a hashed file");
});

test("trimming keeps the newest entries", async () => {
  const w = loadWorker();
  const cache = new FakeCache();
  for (const k of ["a", "b", "c", "d", "e"]) await cache.put(k, new Response(k));
  await w.api.trim(cache, 2);
  assert.deepEqual(await cache.keys(), ["d", "e"]);
  await w.api.trim(cache, 10);
  assert.deepEqual(await cache.keys(), ["d", "e"]);
});

test("markStale keeps the body and the stored-at time and adds the stale mark", async () => {
  const w = loadWorker();
  const stored = new Response("body", { status: 200, headers: { [rules.CACHED_AT_HEADER]: "1700000000000", etag: '"e"' } });
  const out = w.api.markStale(stored);
  assert.equal(await out.text(), "body");
  assert.equal(rules.cachedAtOf(out.headers), 1_700_000_000_000);
  assert.equal(out.headers.get("etag"), '"e"');
});

// ---- install, update and clean-up ---------------------------------------------------------------------------------------------------------

test("install stores the page and the files it names; one missing file does not stop it", async () => {
  const w = loadWorker();
  const html = '<script src="/_next/static/chunks/a1.js"></script><link href="/_next/static/css/s.css"><script>f("static/chunks/lazy.js")</script><i>/_next/static/chunks/gone.js</i>';
  w.state.net = async (url) => (url === `${ORIGIN}/` ? new Response(html, { status: 200 }) : url.endsWith("gone.js") ? new Response("", { status: 404 }) : new Response("x", { status: 200 }));
  const d = w.dispatch("install");
  await Promise.all(d.waits);
  assert.equal(cacheOf(w, "shell")?.entries.size, 1);
  const files = await cacheOf(w, "static")?.keys();
  for (const f of ["/_next/static/chunks/a1.js", "/_next/static/css/s.css", "/_next/static/chunks/lazy.js", "/icon-192.png"]) assert.ok(files?.includes(`${ORIGIN}${f}`), f);
  assert.ok(!files?.includes(`${ORIGIN}/_next/static/chunks/gone.js`));
});

test("install fails (and is retried at the next visit) when the page itself cannot be fetched", async () => {
  const w = loadWorker();
  w.state.net = async () => new Response("bad gateway", { status: 502 });
  await assert.rejects(Promise.all(w.dispatch("install").waits));
});

test("an update waits for the page's word, and old versions' caches go when the new one activates", async () => {
  const w = loadWorker();
  w.dispatch("message", { data: { type: "something else" } });
  w.dispatch("message", { data: null });
  assert.equal(w.state.skipped, 0);
  w.dispatch("message", { data: { type: "SKIP_WAITING" } });
  assert.equal(w.state.skipped, 1);

  for (const name of ["doshy-static-v0.0.9", "doshy-data-v0.0.9", rules.cacheName("static", "1.2.3"), "someone-elses-cache"]) await w.storage.open(name);
  await Promise.all(w.dispatch("activate").waits);
  assert.deepEqual(await w.storage.keys(), [rules.cacheName("static", "1.2.3"), "someone-elses-cache"]);
  assert.equal(w.state.claimed, 1);
});
