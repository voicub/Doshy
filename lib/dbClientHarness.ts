import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { setTimeout as sleep } from "node:timers/promises";
import { createDashboard, listDashboards, parseCreateBody, parseDashboardId, requireDashboard, softDeleteDashboard } from "./db/dashboards.ts";
import { HttpError } from "./db/errors.ts";
import { getPlan, getPlanRev, listVersions, parsePlanBody, parseVersionBody, planText, putPlan, restoreVersion, saveVersion, saveVersionOf } from "./db/plans.ts";
import { getSettings, setSettings } from "./db/settings.ts";
import { isRecord } from "./guards.ts";

/**
 * Test support for lib/dbClient: a stand-in browser (localStorage, window, document, location, timers) and a stand-in server that answers /api/db/* with
 * the REAL data layer (lib/db) on a temp database, so the client engine is tested against the same rules the routes use. Install it BEFORE importing
 * lib/dbClient (the module reads the browser when it starts), and run one scenario per test file: the client keeps its state per process.
 */
export type Harness = {
  /** localStorage */
  ls: Map<string, string>;
  /** "METHOD /path" of every request the client made, in order */
  requests: string[];
  /** while true every request fails like an unreachable server */
  offline: { value: boolean };
  /** the polling callbacks the client registered (setInterval is replaced so nothing keeps running) */
  polls: (() => void)[];
  puts: (id: number) => number;
};

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const raw = (text: string, status = 200) => new Response(text, { status, headers: { "content-type": "application/json" } });

/** One field of a request body (the harness's stand-in for the routes' body checks). */
const field = (body: unknown, key: string): unknown => (isRecord(body) ? body[key] : undefined);

function route(db: DatabaseSync, method: string, path: string, query: URLSearchParams, body: unknown, ifNoneMatch: string | null): Response {
  if (path === "/api/db/settings") return method === "PUT" ? json({ changed: setSettings(db, field(body, "settings")) }) : json({ settings: getSettings(db) });
  if (path === "/api/db/resources") return json({ resources: [], totals: { count: 0, bytes: 0, limit: 0 } });
  const m = /^\/api\/db\/dashboards(?:\/(\w+)(?:\/(\w+))?)?$/.exec(path);
  if (!m) return json({ error: "no such route", code: "not_found" }, 404);
  const [, idText, sub] = m;
  if (idText === undefined) {
    if (method === "POST") return json({ dashboard: createDashboard(db, parseCreateBody(body)) }, 201);
    const text = JSON.stringify(listDashboards(db));
    const etag = `"${createHash("sha1").update(text).digest("base64url")}"`;
    return ifNoneMatch === etag ? new Response(null, { status: 304 }) : new Response(text, { headers: { "content-type": "application/json", etag } });
  }
  const id = parseDashboardId(idText);
  if (sub === undefined && method === "DELETE") {
    softDeleteDashboard(db, id);
    return json({ ok: true });
  }
  if (sub === "plan") {
    if (method === "PUT") {
      const r = putPlan(db, id, parsePlanBody(body));
      return r.ok ? json({ rev: r.rev, updatedAt: r.updatedAt, changed: r.changed }) : raw(`{"error":"Someone saved a newer version of this plan first.","code":"conflict","server":${r.server ? planText(r.server) : "null"}}`, 409);
    }
    requireDashboard(db, id);
    const since = query.get("since");
    const rev = getPlanRev(db, id);
    if (since !== null && rev !== null && Number(since) === rev) return json({ rev, unchanged: true });
    const p = getPlan(db, id);
    return p ? raw(planText(p)) : json({ rev: 0, plan: null });
  }
  if (sub === "versions") {
    if (method === "GET") return json({ versions: listVersions(db, id) });
    const { label, plan } = parseVersionBody(body);
    return json({ version: plan ? saveVersionOf(db, id, plan, label) : saveVersion(db, id, label) }, 201);
  }
  if (sub === "restore") return raw(planText(restoreVersion(db, id, Number(field(body, "id")))));
  return json({ error: "no such route", code: "not_found" }, 404);
}

export function installBrowser(db: DatabaseSync, opts: { search?: string; local?: Record<string, string> } = {}): Harness {
  const ls = new Map(Object.entries(opts.local ?? {}));
  const requests: string[] = [];
  const offline = { value: false };
  const polls: (() => void)[] = [];
  const localStorage = { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) };
  const noop = () => undefined;
  Object.assign(globalThis, {
    window: { localStorage, addEventListener: noop },
    document: { visibilityState: "visible", addEventListener: noop },
    location: { search: opts.search ?? "", pathname: "/", hash: "", reload: noop },
    setInterval: (fn: () => void) => {
      polls.push(fn);
      return 0;
    },
    fetch: async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const url = new URL(input, "http://localhost");
      requests.push(`${method} ${url.pathname}`);
      if (offline.value) throw new TypeError("fetch failed");
      const headers = new Headers(init.headers);
      try {
        return route(db, method, url.pathname, url.searchParams, typeof init.body === "string" ? JSON.parse(init.body) : undefined, headers.get("if-none-match"));
      } catch (e) {
        if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
        throw e;
      }
    },
  });
  return { ls, requests, offline, polls, puts: (id) => requests.filter((r) => r === `PUT /api/db/dashboards/${id}/plan`).length };
}

/** A persisted plan-store value as zustand writes it: `{ state: { plan, ...rest }, version }`, the plan first. */
export const persistedPlan = (marker: string, rest: Record<string, unknown> = { time: "dusk" }, version = 15) =>
  JSON.stringify({ state: { plan: { walls: [], openings: [], rooms: [], items: [], marker }, ...rest }, version });

export const markerOf = (text: string | null | undefined): unknown => {
  const state = field(JSON.parse(text ?? "null"), "state");
  return field(field(state, "plan"), "marker");
};

export const wait = (ms: number) => sleep(ms);
