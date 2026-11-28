// The guest side of the server: what a person holding a guest link may ask for. Plain Request -> Response functions with the database and the clock passed in, so
// tests call them without Next; app/api/guest/** only picks the database and forwards.
//
// Every answer: `Cache-Control: no-store` (no proxy keeps it), `X-Robots-Tag: noindex`, `nosniff`, no referrer. A link that does not exist, was revoked, has expired or
// belongs to a deleted plan answers the same 404, so an address cannot be probed for which of those it is. Nothing here reads or changes anything but its own link.
import type { DatabaseSync } from "node:sqlite";
import { cleanPiece, type CustomPiece } from "../customCatalog.ts";
import { homeOfPlan } from "../db/connections.ts";
import { HttpError } from "../db/errors.ts";
import { checkSameOrigin, dbFor, readJson } from "../db/http.ts";
import { getPlan, getPlanRev } from "../db/plans.ts";
import { ID_RE, getResource, getResourceInfo, listResources } from "../db/resources.ts";
import { one } from "../db/sql.ts";
import { cleanText } from "../db/text.ts";
import { guestPlan, guestStates } from "../guestPlan.ts";
import { materialIds } from "../planMaterials.ts";
import { planSettingsKey } from "../planIdentity.ts";
import { isRecord } from "../guards.ts";
import { bytesResponse } from "./bytesResponse.ts";
import { guestLimits, clientAddress, type GuestLimits } from "./guestLimits.ts";
import { isExpired, touchLink, findLink, type GuestLink } from "./guestLinks.ts";
import { SESSION_COOKIE, SESSION_TTL_MS, cookieValue, sessionCookie, signSession, verifySession, verifyPin } from "./guestSecrets.ts";
import { ttlCache, type TtlCache } from "./ttlCache.ts";

export type GuestEnv = {
  db: DatabaseSync;
  now?: number;
  limits?: GuestLimits;
  /** Home Assistant's state list for the home the plan shows (a connection id, null = the main home); only called for a link with live states on. */
  loadStates?: (connectionId: string | null) => Promise<readonly unknown[]>;
};

/** A refusal that carries how long to wait, for the Retry-After header. */
class GuestError extends HttpError {
  retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(status, code, message);
    this.retryAfter = retryAfter;
  }
}

const notFound = () => new GuestError(404, "not_found", "This link does not work (any more).");
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };

const json = (data: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), { status, headers: { ...HEADERS, "content-type": "application/json", ...extra } });

/** Run a handler; a refusal (or a surprise) becomes the plain reply, never a stack trace and never anything that names the link. */
async function guarded(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof GuestError) return json({ error: e.message, code: e.code }, e.status, e.retryAfter ? { "retry-after": String(e.retryAfter) } : {});
    if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
    console.error("doshy guest: unexpected error"); // no detail on purpose: it could hold the address
    return json({ error: "Something went wrong. Try again in a moment.", code: "server_error" }, 500);
  }
}

type Seen = { link: GuestLink; now: number; ip: string; limits: GuestLimits };

/** The link behind this address, after the per-address request limit. Throws the same 404 for every kind of "no such link". */
function find(req: Request, token: string, env: GuestEnv): Seen {
  const now = env.now ?? Date.now();
  const limits = env.limits ?? guestLimits();
  const ip = clientAddress(req.headers);
  if (!limits.requests.allow(ip, now)) throw new GuestError(429, "slow_down", "Too many requests. Try again in a minute.", 60);
  const link = findLink(env.db, token);
  const alive = link && !isExpired(link, now) && one(env.db, "SELECT 1 AS ok FROM dashboards WHERE id = ? AND deleted_at IS NULL", link.dashboardId);
  if (!link || !alive) {
    if (!limits.unknown.allow(ip, now)) throw new GuestError(429, "slow_down", "Too many requests. Try again in a minute.", 60);
    throw notFound();
  }
  return { link, now, ip, limits };
}

const hasPinCookie = (req: Request, link: GuestLink, now: number): boolean =>
  link.pinHash !== null && verifySession(cookieValue(req.headers.get("cookie"), SESSION_COOKIE), { id: link.id, pin_hash: link.pinHash }, now);

/** `find`, and the PIN's cookie when the link has a PIN. */
function authorize(req: Request, token: string, env: GuestEnv): Seen {
  const seen = find(req, token, env);
  if (seen.link.pinHash !== null && !hasPinCookie(req, seen.link, seen.now)) throw new GuestError(401, "pin_required", "This link needs its PIN.");
  return seen;
}

/** What every guest route does first: pick the database (in development the throwaway one named by `X-Housey-Test`) and hand it to the handler. */
export function withDb(req: Request, run: (env: GuestEnv) => Promise<Response>): Promise<Response> {
  return guarded(() => run({ db: dbFor(req) }));
}

// ---- session ------------------------------------------------------------------------------------------------------------------------------------------

/** `GET /api/guest/<token>/session`: does this link ask for a PIN, and has this browser already entered it? */
export function guestSessionStatus(req: Request, token: string, env: GuestEnv): Promise<Response> {
  return guarded(() => {
    const { link, now } = find(req, token, env);
    return json({ pin: link.pinHash !== null, unlocked: link.pinHash === null || hasPinCookie(req, link, now) });
  });
}

/**
 * `POST /api/guest/<token>/session` `{ pin }`. 5 wrong PINs from one address for this link, or 25 from anywhere, lock it for 15 minutes (a try during the lockout is
 * refused even with the right PIN). A try is counted BEFORE the slow check, so a burst of parallel requests cannot get more tries than the limit. The right PIN sets a cookie
 * (httpOnly, SameSite=Strict, Path = this link's API only) that lasts 8 hours or until the link expires.
 */
export function guestEnterPin(req: Request, token: string, env: GuestEnv): Promise<Response> {
  return guarded(async () => {
    checkSameOrigin(req);
    const { link, now, ip, limits } = find(req, token, env);
    if (link.pinHash === null || link.pinSalt === null) return json({ ok: true, pin: false });
    const body = await readJson(req, 256); // read first: from the lockout check to counting the try below there must be no `await`, or parallel requests would all pass the check
    const pin = isRecord(body) && typeof body.pin === "string" ? body.pin : undefined;
    const byAddress = `${ip}|${link.id}`;
    const wait = Math.max(limits.pinByAddress.locked(byAddress, now), limits.pinByLink.locked(link.id, now));
    if (wait > 0) throw new GuestError(429, "locked", `Too many wrong PINs. Try again in ${Math.ceil(wait / 60_000)} minutes.`, Math.ceil(wait / 1000));
    const left = limits.pinByAddress.fail(byAddress, now); // counted before the slow check; a right PIN gives the try back below
    const ok = pin !== undefined && (await verifyPin(pin, link.pinHash, link.pinSalt));
    if (!ok) {
      limits.pinByLink.fail(link.id, now);
      const holdMs = left > 0 ? 0 : limits.pinByAddress.locked(byAddress, now); // the try that starts the lockout says how long it lasts, so the page can hold still
      throw new GuestError(403, "wrong_pin", left > 0 ? `That PIN is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That PIN is not right. Try again in 15 minutes.", holdMs > 0 ? Math.ceil(holdMs / 1000) : undefined);
    }
    limits.pinByAddress.clear(byAddress);
    const ends = Math.min(now + SESSION_TTL_MS, link.expiresAt ?? Infinity);
    const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
    const cookie = sessionCookie(token, signSession({ id: link.id, pin_hash: link.pinHash }, ends), (ends - now) / 1000, secure);
    return json({ ok: true, pin: true }, 200, { "set-cookie": cookie });
  });
}

// ---- the plan -----------------------------------------------------------------------------------------------------------------------------------------

/** What `GET /plan` answers, and what the other routes need of it. */
type Snapshot = { body: string; entities: Map<string, string>; modelIds: Set<string>; materialIds: Set<string> };


const MY_PREFIX = "my_";
const withoutThumb = (p: CustomPiece): CustomPiece => {
  const { thumb: _thumb, ...rest } = p; // a picture of a model piece for the owner's catalog: not needed to draw it, and it can be 200 KB
  return rest;
};

/** The custom pieces a plan uses (re-checked like any file), and the model files they point at that exist. */
function piecesOf(db: DatabaseSync, kinds: Set<string>) {
  const pieces = kinds.size ? listResources(db, { kind: "piece", inline: true }).flatMap((r) => cleanPiece(r.json) ?? []).filter((p) => kinds.has(p.kind)).map(withoutThumb) : [];
  const models = pieces.flatMap((p) => (p.model && getResourceInfo(db, p.model.id)?.kind === "model" ? [{ id: p.model.id, ext: p.model.ext }] : []));
  return { pieces, models };
}

/** How the owner looks at this plan (studio or garden surroundings, walls cut away): two of the view settings kept beside the plan. Defaults when there are none. */
function lookOf(db: DatabaseSync, dashboardId: number): { environment: "studio" | "garden"; cutaway: boolean } {
  try {
    const row = one(db, "SELECT value FROM settings WHERE key = ?", planSettingsKey(dashboardId));
    const saved: unknown = row ? JSON.parse(String(row.value)) : null;
    const state = isRecord(saved) && isRecord(saved.state) ? saved.state : {};
    return { environment: state.environment === "garden" ? "garden" : "studio", cutaway: state.cutaway !== false };
  } catch {
    return { environment: "studio", cutaway: true };
  }
}

function build(db: DatabaseSync, link: GuestLink, rev: number): Snapshot {
  const stored = getPlan(db, link.dashboardId);
  if (!stored) throw notFound();
  let raw: unknown;
  try {
    raw = JSON.parse(stored.json);
  } catch {
    throw notFound();
  }
  const { plan, entities } = guestPlan(raw, { location: link.location, live: link.live });
  const { pieces, models } = piecesOf(db, new Set(plan.items.map((i) => i.kind).filter((k) => k.startsWith(MY_PREFIX))));
  const name = cleanText(one(db, "SELECT name FROM dashboards WHERE id = ?", link.dashboardId)?.name, 60, "Home");
  const body = JSON.stringify({ v: 1, name, rev, live: link.live, location: link.location, ...lookOf(db, link.dashboardId), plan, pieces, models });
  return { body, entities, modelIds: new Set(models.map((m) => m.id)), materialIds: new Set(materialIds(plan)) };
}

// A plan is up to 5 MB: parsing and cleaning it for every poll of every guest would be a cheap way to burn a small computer. Kept briefly, per link and plan revision.
const g = globalThis as typeof globalThis & { __doshyGuestPlans?: TtlCache<Snapshot> };
const snapshots = (g.__doshyGuestPlans ??= ttlCache<Snapshot>(10_000, 32));

function snapshotOf(env: GuestEnv, link: GuestLink): Promise<Snapshot> {
  const rev = getPlanRev(env.db, link.dashboardId);
  if (rev === null) throw notFound();
  return snapshots.get(`${link.id}:${rev}`, async () => build(env.db, link, rev));
}

/** `GET /api/guest/<token>/plan`: `{ v, name, rev, live, location, plan, pieces, models }` with everything private taken out (lib/guestPlan.ts). */
export function guestPlanReply(req: Request, token: string, env: GuestEnv): Promise<Response> {
  return guarded(async () => {
    const { link, now } = authorize(req, token, env);
    touchLink(env.db, link, now);
    return new Response((await snapshotOf(env, link)).body, { headers: { ...HEADERS, "content-type": "application/json" } });
  });
}

/** `GET /api/guest/<token>/states`: only for a link made with live states. The made-up ids of the plan -> a state word or number each. */
export function guestStatesReply(req: Request, token: string, env: GuestEnv): Promise<Response> {
  return guarded(async () => {
    const { link } = authorize(req, token, env);
    if (!link.live || !env.loadStates) throw notFound();
    const { entities } = await snapshotOf(env, link);
    if (!entities.size) return json({ states: {} });
    try {
      return json({ states: guestStates(entities, await env.loadStates(homeOfPlan(env.db, link.dashboardId))) });
    } catch {
      throw new GuestError(503, "unavailable", "The live states are not available right now.");
    }
  });
}

/**
 * `GET /api/guest/<token>/resource/<id>`: a 3D model file that a piece of THIS plan uses, or a Poly Haven texture (kind "material") that a floor, wall, ground area or path
 * of THIS plan wears. Any other id (another plan's, a photo, a backup) is the same 404.
 */
export function guestResourceReply(req: Request, token: string, id: string, env: GuestEnv): Promise<Response> {
  return guarded(async () => {
    const { link, now, ip, limits } = authorize(req, token, env);
    if (!limits.files.allow(ip, now)) throw new GuestError(429, "slow_down", "Too many downloads. Try again in a minute.", 60);
    const snap = ID_RE.test(id) ? await snapshotOf(env, link) : null;
    const kind = snap?.modelIds.has(id) ? "model" : snap?.materialIds.has(id) ? "material" : null;
    if (!kind) throw notFound();
    const file = getResource(env.db, id);
    if (!file || file.info.kind !== kind) throw notFound();
    return bytesResponse(file.data, {
      headers: { ...HEADERS, "content-type": file.info.mime, "content-length": String(file.info.size), "content-security-policy": "sandbox; default-src 'none'" },
    });
  });
}
