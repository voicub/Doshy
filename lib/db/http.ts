import type { DatabaseSync } from "node:sqlite";
import { getDb, getTestDb, isTestToken } from "./connection.ts";
import { HttpError } from "./errors.ts";
import { readCapped } from "../server/readCapped.ts";

/**
 * Shared rules for every /api/db route. These endpoints are NOT authenticated, like the rest of this local dashboard: they are meant for a
 * trusted LAN or behind a reverse proxy that does the signing in. What they do guard against is a web page on another site talking to them
 * from the owner's browser (same-origin check), oversized or odd requests, and runaway write loops (a light rate limit).
 */

const forbidden = () => new HttpError(403, "forbidden", "This request did not come from the dashboard.");

export function checkSameOrigin(req: Request): void {
  const site = req.headers.get("sec-fetch-site");
  const readOnly = req.method === "GET" || req.method === "HEAD";
  if (site && site !== "same-origin" && !(site === "none" && readOnly)) throw forbidden();
  const origin = req.headers.get("origin");
  if (!origin) return; // not a browser (curl, scripts) or a plain same-origin GET: nothing cross-site to guard against
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    throw forbidden(); // "null" origins (sandboxed frames) and garbage
  }
  if (host !== req.headers.get("host") && host !== req.headers.get("x-forwarded-host")) throw forbidden();
}

type Bucket = { start: number; n: number };
const buckets: Record<string, Bucket> = {};
// `connect`: adding, changing or testing a Home Assistant address (docs/multi-home.md): each one makes this server open a connection to an address a person typed.
const LIMITS: Record<string, { max: number; windowMs: number }> = { write: { max: 300, windowMs: 60_000 }, heavy: { max: 3, windowMs: 60_000 }, connect: { max: 10, windowMs: 60_000 } };

/** Fixed-window counter per class of request (`write`: any change, `heavy`: backup import, `connect`: a Home Assistant address). Light on purpose: a stuck client loop, not a user. */
export function rateLimit(kind: "write" | "heavy" | "connect", now = Date.now()): void {
  const { max, windowMs } = LIMITS[kind];
  const b = (buckets[kind] ??= { start: now, n: 0 });
  if (now - b.start >= windowMs) {
    b.start = now;
    b.n = 0;
  }
  if (++b.n > max) throw new HttpError(429, "slow_down", "Too many changes at once. Try again in a moment.");
}

/** The request's content type without parameters; 415 unless it is one of `allowed`. */
export function contentType(req: Request, allowed: readonly string[]): string {
  const ct = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!allowed.includes(ct)) throw new HttpError(415, "bad_type", "Unexpected content type.");
  return ct;
}

const tooBig = (max: number) => new HttpError(413, "too_big", `That is too large to send (${Math.round(max / 1024 / 1024) || "<1"} MB at most).`);

/** The whole body, refused as soon as it passes `max` bytes (the Content-Length is only a hint). */
export async function readBody(req: Request, max: number): Promise<Buffer> {
  const announced = Number(req.headers.get("content-length"));
  if (announced > max) throw tooBig(max);
  if (!req.body) return Buffer.alloc(0);
  const bytes = await readCapped(req.body, max, announced);
  if (!bytes) throw tooBig(max);
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength); // a view of the same bytes, not a copy
}

/** A JSON body (must be sent as application/json). */
export async function readJson(req: Request, max: number): Promise<unknown> {
  contentType(req, ["application/json"]);
  try {
    return JSON.parse((await readBody(req, max)).toString("utf8"));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "bad_json", "The request body is not valid JSON.");
  }
}

export const reply = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** A JSON reply made of already-serialised pieces (the plan text is embedded as is: no parse and re-stringify of megabytes). */
export const replyRaw = (text: string, status = 200): Response => new Response(text, { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

type RouteOptions = { /** changes data: counted by the rate limit */ write?: boolean; /** much heavier than a normal write */ heavy?: boolean; /** opens a connection to a typed address (also counted as a write) */ connect?: boolean };

/** The database this request works on: the shared one, or in development the throwaway one named by `X-Housey-Test: <token>` (see getTestDb). 400 for a bad test header, 503 when it cannot be opened. */
export function dbFor(req: Request): DatabaseSync {
  try {
    const test = process.env.NODE_ENV === "production" ? null : req.headers.get("x-housey-test");
    if (test !== null && !isTestToken(test)) throw new HttpError(400, "bad_request", "That test header is not valid.");
    return test !== null ? getTestDb(test) : getDb();
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error("housey db: cannot open the database", e);
    throw new HttpError(503, "unavailable", "The database is not available right now.");
  }
}

/** Wrap a route: same-origin check, rate limit, the shared connection, and errors turned into plain replies that never leak internals. */
export async function api(req: Request, opts: RouteOptions, fn: (db: DatabaseSync) => Promise<Response> | Response): Promise<Response> {
  try {
    checkSameOrigin(req);
    if (opts.heavy) rateLimit("heavy");
    else if (opts.write || opts.connect) rateLimit("write");
    if (opts.connect) rateLimit("connect");
    return await fn(dbFor(req));
  } catch (e) {
    if (e instanceof HttpError) return reply({ error: e.message, code: e.code }, e.status);
    console.error("housey db:", e);
    return reply({ error: "Something went wrong on the server. Your changes are still safe on this device.", code: "server_error" }, 500);
  }
}

/**
 * The same-origin check (and, for a change, the rate limit) for the routes `api` does not wrap (Home Assistant, site): the plain reply to refuse the
 * request with, or null when it may go on.
 */
export function refuse(req: Request, rate?: "write"): Response | null {
  try {
    checkSameOrigin(req);
    if (rate) rateLimit(rate);
    return null;
  } catch (e) {
    if (e instanceof HttpError) return reply({ error: e.message, code: e.code }, e.status);
    throw e;
  }
}
