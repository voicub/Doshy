import type { DatabaseSync } from "node:sqlite";
import { MAIN_HOME, homeSecret, isHomeId, noteHomeResult } from "./db/connections.ts";
import { HttpError } from "./db/errors.ts";
import { dbFor } from "./db/http.ts";
import { errorMessage } from "./guards.ts";
import type { SocketFactory } from "./haNotify.ts";
import type { HaFetch } from "./server/haCall.ts";
import { homeProblem } from "./server/haProbe.ts";
import { assertHostAllowed } from "./server/haUrl.ts";

// A call that has not answered by then is given up: without a limit a stuck Home Assistant would pile up every browser's polls behind it.
const DEFAULT_TIMEOUT_MS = 10_000;

/** The request header the dashboard sets from the plan on screen (lib/haHome.ts): the id of the extra home to ask. Absent or `main` = the built-in home. */
export const HOME_HEADER = "x-doshy-home";

/** A Home Assistant to talk to. The token never leaves the server: it is not in anything a route sends, logs or puts in an error. */
export type HaHome = { id: string; baseUrl: string; token: string };

/** The built-in home: HA_URL / HA_TOKEN from `.env.local`, or the add-on's Supervisor proxy (scripts/addon-env.mjs). Throws when they are not set. */
export function mainHome(): HaHome {
  const baseUrl = process.env.HA_URL?.replace(/\/$/, "");
  const token = process.env.HA_TOKEN;
  if (!baseUrl || !token) throw new Error("HA_URL / HA_TOKEN not set in .env.local");
  return { id: MAIN_HOME, baseUrl, token };
}

/** The home with this connection id in `db` (null or `main`: the built-in one). Throws HttpError 404 for an id that is not set up, 409 when its token cannot be read. */
export function resolveHaIn(db: DatabaseSync, id: string | null): HaHome {
  if (id === null || id === MAIN_HOME) return mainHome();
  return { id, ...homeSecret(db, id) };
}

/**
 * The home this request is about: the id in `X-Doshy-Home` (set by the dashboard from the plan on screen), else the built-in home. Every Home Assistant route starts here.
 * `fromQuery` also reads `?home=`, for the one kind of request that cannot carry a header (an <img> of a media player's artwork).
 * An id that is not set up is 404 for everyone; guest routes never call this (a guest link shows the home of its own plan, chosen on the server).
 */
export function resolveHa(req: Request, opts: { fromQuery?: boolean } = {}): HaHome {
  const raw = req.headers.get(HOME_HEADER) ?? (opts.fromQuery ? new URL(req.url).searchParams.get("home") : null);
  if (raw === null || raw === "" || raw === MAIN_HOME) return mainHome();
  if (!isHomeId(raw)) throw new HttpError(404, "unknown_home", "That home is not set up (any more).");
  return resolveHaIn(dbFor(req), raw);
}

// One fetch function per home, kept while its address and token stay the same: lib/server/haCall.ts keeps its answers per function, so two homes never share them.
const fetchers = new Map<string, { sig: string; fetch: HaFetch }>();

/** `ha(path, init)` for one home: Home Assistant's REST API (`path` after /api/) with its token. */
export function haFor(home: HaHome): HaFetch {
  const sig = `${home.baseUrl}\n${home.token}`;
  const hit = fetchers.get(home.id);
  if (hit?.sig === sig) return hit.fetch;
  const extra = home.id !== MAIN_HOME;
  const call: HaFetch = async (path, init) => {
    if (extra) await assertHostAllowed(home.baseUrl); // the built-in home is the owner's own setting; an extra one was typed into a form
    return fetch(`${home.baseUrl}/api/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${home.token}`, "Content-Type": "application/json" },
      signal: init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      cache: "no-store",
      ...(extra ? { redirect: "manual" as const } : {}), // never follow a redirect with the token
    });
  };
  fetchers.set(home.id, { sig, fetch: call });
  return call;
}

/** Before a WebSocket to an extra home (the REST calls above check by themselves). */
export const allowHome = (home: HaHome): Promise<void> => (home.id === MAIN_HOME ? Promise.resolve() : assertHostAllowed(home.baseUrl));

/** Record how the last call to this home went, for the Homes list. Nothing for the built-in home (it has no row). */
export function noteHome(req: Request, home: HaHome, problem: unknown): void {
  if (home.id !== MAIN_HOME) noteHomeResult(dbFor(req), home.id, problem === null ? null : homeProblem(problem));
}

/**
 * `haFor(resolveHa(req))` for routes that hand the fetch to a helper which turns a failed call into its own plain reply (lib/server/haCall.ts, haBatch.ts, haAutomation.ts).
 * An unknown home or a token to enter again throws (the route answers 404 / 409); a missing HA_URL / HA_TOKEN fails on the first call instead, as it always has.
 */
export function haFetchFor(req: Request): HaFetch {
  try {
    return haFor(resolveHa(req));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return () => Promise.reject(e);
  }
}

/** The runtime's WebSocket, typed as the small surface lib/haNotify.ts uses (its `Socket`): the DOM type's handler signatures do not unify with it. */
export const HaWebSocket = WebSocket as unknown as SocketFactory;

/** The reply when Home Assistant cannot be asked or answered badly: 502 with the plain reason (or the plain refusal: an unknown home is 404, a token to enter again 409). */
export const haFailure = (e: unknown): Response =>
  e instanceof HttpError ? Response.json({ error: e.message, code: e.code }, { status: e.status }) : Response.json({ error: errorMessage(e) }, { status: 502 });
