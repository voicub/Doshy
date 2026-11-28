import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { loadKey, keyFileFor, open, seal } from "../server/secretBox.ts";
import { parseHaUrl } from "../server/haUrl.ts";
import { HttpError } from "./errors.ts";
import { all, one, run, tx } from "./sql.ts";
import { cleanText } from "./text.ts";
import { badRequest } from "./validate.ts";

/**
 * Extra Home Assistants ("homes", docs/multi-home.md): a name, an address and a long-lived token, one row each. The home from the server's environment
 * (HA_URL / HA_TOKEN, or the add-on's Supervisor proxy) is NOT a row: it is the built-in 'main' home, used by every plan that names none.
 * The token is only ever stored sealed (lib/server/secretBox.ts) and is never part of anything this file returns except `homeSecret`, which only the server's own Home Assistant calls use.
 */

export const MAIN_HOME = "main";
export const MAIN_NAME = "Main home";
export const MAX_HOMES = 8;
export const MAX_HOME_NAME = 40;
export const MAX_TOKEN = 2048;
export const HOME_ID = /^[a-z0-9]{6,16}$/;
/** A long-lived access token is a JWT: visible ASCII only (this also keeps a pasted space or line break out of the Authorization header). */
const TOKEN_CHARS = /^[\x21-\x7e]+$/;

/** What the screen may know about a home. There is no token here, not even sealed. */
export type Home = {
  id: string;
  name: string;
  url: string;
  /** the last 4 characters of the token, so two tokens can be told apart ('...a1b2') */
  hint: string;
  createdAt: number;
  lastOkAt: number | null;
  /** plain words for what went wrong the last time Home Assistant was asked, or null */
  lastError: string | null;
  /** the token cannot be read (the key file is missing or another one: a restored backup): it has to be entered again */
  needsToken: boolean;
  /** how many plans (not deleted) show this home */
  plans: number;
};

export type NewHome = { name: string; url: string; token: string };
export type HomePatch = { name?: string; url?: string; token?: string };

export const isHomeId = (v: unknown): v is string => typeof v === "string" && HOME_ID.test(v);

/** Why homes cannot be added or changed on this server, or null when they can: `DOSHY_ALLOW_CUSTOM_HA=0` switches it off, and a public guest-only copy never takes a Home Assistant address. */
export function homesLockedReason(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  if (env.DOSHY_GUEST_ONLY === "1") return "This copy of Doshy is for guests only, so other homes cannot be added here.";
  if (env.DOSHY_ALLOW_CUSTOM_HA?.trim() === "0") return "Adding other homes is switched off on this server (DOSHY_ALLOW_CUSTOM_HA=0).";
  return null;
}

/** Throws 403 when homes cannot be added or changed (see `homesLockedReason`). */
export function assertHomesEditable(env: Readonly<Record<string, string | undefined>> = process.env): void {
  const why = homesLockedReason(env);
  if (why) throw new HttpError(403, "homes_locked", why);
}

const unknownHome = () => new HttpError(404, "unknown_home", "That home is not set up (any more).");

// ---- reading ------------------------------------------------------------------------------------------------------------------------------

const LIST_SQL = `
  SELECT c.id, c.name, c.base_url, c.token_enc, c.token_hint, c.created_at, c.last_ok_at, c.last_error,
    (SELECT COUNT(*) FROM dashboards d WHERE d.ha_connection = c.id AND d.deleted_at IS NULL) AS plans
  FROM ha_connections c`;

/** Every extra home in the owner's order. Reads the key only when there is at least one. */
export function listHomes(db: DatabaseSync): Home[] {
  const rows = all(db, `${LIST_SQL} ORDER BY c.sort, c.created_at, c.id`);
  if (!rows.length) return [];
  const key = loadKey(keyFileFor(db));
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    url: String(r.base_url),
    hint: String(r.token_hint),
    createdAt: Number(r.created_at),
    lastOkAt: r.last_ok_at == null ? null : Number(r.last_ok_at),
    lastError: r.last_error == null ? null : String(r.last_error),
    needsToken: open(key, String(r.token_enc)) === null,
    plans: Number(r.plans),
  }));
}

export function getHome(db: DatabaseSync, id: string): Home {
  const home = listHomes(db).find((h) => h.id === id);
  if (!home) throw unknownHome();
  return home;
}

export const homesExist = (db: DatabaseSync): boolean => !!one(db, "SELECT 1 AS n FROM ha_connections LIMIT 1");

/** The address and token of a home, for the server's own calls to it. 404 for a home that does not exist, 409 `token_needed` when its token cannot be read. */
export function homeSecret(db: DatabaseSync, id: string): { baseUrl: string; token: string } {
  const r = isHomeId(id) ? one(db, "SELECT name, base_url, token_enc FROM ha_connections WHERE id = ?", id) : undefined;
  if (!r) throw unknownHome();
  const token = open(loadKey(keyFileFor(db)), String(r.token_enc));
  if (token === null) throw new HttpError(409, "token_needed", `${String(r.name)}: the token needs to be entered again.`);
  return { baseUrl: String(r.base_url), token };
}

/** The home a plan shows: a connection id, or null for the main home. */
export function homeOfPlan(db: DatabaseSync, dashboardId: number): string | null {
  const r = one(db, "SELECT ha_connection FROM dashboards WHERE id = ?", dashboardId);
  return r?.ha_connection == null ? null : String(r.ha_connection);
}

/** Throws 400 unless `id` is an existing home. Used before a plan is pointed at one. */
export function requireHome(db: DatabaseSync, id: string): void {
  if (!isHomeId(id) || !one(db, "SELECT 1 AS ok FROM ha_connections WHERE id = ?", id)) throw badRequest("That home is not set up (any more).");
}

// ---- request bodies -----------------------------------------------------------------------------------------------------------------------

function parseName(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("Give this home a name.");
  const name = cleanText(raw, MAX_HOME_NAME, "");
  if (!name) throw badRequest("Give this home a name.");
  if (name.toLowerCase() === MAIN_NAME.toLowerCase()) throw badRequest(`"${MAIN_NAME}" is the home this server was set up with. Pick another name.`);
  return name;
}

export function parseToken(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) throw badRequest("Paste the long-lived access token (Home Assistant > your profile > Security).");
  const token = raw.trim();
  if (token.length > MAX_TOKEN) throw badRequest("That token is too long.");
  if (!TOKEN_CHARS.test(token)) throw badRequest("That does not look like a token: it has spaces or odd characters in it. Copy it again from Home Assistant.");
  return token;
}

const asBody = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("Send the home as JSON.");
  return { ...body };
};

/** POST body `{ name, url, token }`. */
export function parseNewHome(body: unknown): NewHome {
  const b = asBody(body);
  return { name: parseName(b.name), url: parseHaUrl(b.url), token: parseToken(b.token) };
}

/** PATCH body: any of `{ name, url, token }`. */
export function parseHomePatch(body: unknown): HomePatch {
  const b = asBody(body);
  const out: HomePatch = {};
  if (b.name !== undefined) out.name = parseName(b.name);
  if (b.url !== undefined) out.url = parseHaUrl(b.url);
  if (b.token !== undefined) out.token = parseToken(b.token);
  return out;
}

// ---- writing ------------------------------------------------------------------------------------------------------------------------------

const nameTaken = (db: DatabaseSync, name: string, exceptId: string) => !!one(db, "SELECT 1 AS taken FROM ha_connections WHERE lower(name) = lower(?) AND id != ?", name, exceptId);

const hintOf = (token: string) => token.slice(-4);

export function createHome(db: DatabaseSync, input: NewHome, now = Date.now()): Home {
  const sealed = seal(loadKey(keyFileFor(db)), input.token);
  const id = tx(db, () => {
    if (Number(one(db, "SELECT COUNT(*) AS n FROM ha_connections")?.n) >= MAX_HOMES) throw new HttpError(409, "too_many", `You can keep up to ${MAX_HOMES} homes. Delete one first.`);
    if (nameTaken(db, input.name, "")) throw new HttpError(409, "name_taken", "Another home already has that name.");
    const fresh = randomBytes(5).toString("hex");
    const sort = Number(one(db, "SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM ha_connections")?.n);
    run(db, "INSERT INTO ha_connections (id, name, base_url, token_enc, token_hint, created_at, sort) VALUES (?, ?, ?, ?, ?, ?, ?)", fresh, input.name, input.url, sealed, hintOf(input.token), now, sort);
    return fresh;
  });
  return getHome(db, id);
}

const originOf = (url: string) => new URL(url).origin;

/**
 * Rename, move or give a home a new token. A new address needs the token typed again: otherwise anyone who can reach this screen could point a saved
 * token at a machine of their own and read it there.
 */
export function updateHome(db: DatabaseSync, id: string, patch: HomePatch): Home {
  const key = loadKey(keyFileFor(db));
  tx(db, () => {
    const r = isHomeId(id) ? one(db, "SELECT base_url FROM ha_connections WHERE id = ?", id) : undefined;
    if (!r) throw unknownHome();
    if (patch.name !== undefined && nameTaken(db, patch.name, id)) throw new HttpError(409, "name_taken", "Another home already has that name.");
    if (patch.url !== undefined && patch.token === undefined && originOf(patch.url) !== originOf(String(r.base_url))) {
      throw badRequest("When the address changes, enter the token again too.");
    }
    run(db, "UPDATE ha_connections SET name = COALESCE(?, name), base_url = COALESCE(?, base_url) WHERE id = ?", patch.name ?? null, patch.url ?? null, id);
    if (patch.token !== undefined) run(db, "UPDATE ha_connections SET token_enc = ?, token_hint = ?, last_error = NULL WHERE id = ?", seal(key, patch.token), hintOf(patch.token), id);
  });
  return getHome(db, id);
}

/** Plans (not deleted) that show this home, by name. */
export const plansUsing = (db: DatabaseSync, id: string): string[] =>
  all(db, "SELECT name FROM dashboards WHERE ha_connection = ? AND deleted_at IS NULL ORDER BY sort, id", id).map((r) => String(r.name));

/** Delete a home. Refused (409 `in_use`, with the plan names) while plans show it, unless `movePlans`: then they go back to the main home. */
export function deleteHome(db: DatabaseSync, id: string, movePlans: boolean): void {
  tx(db, () => {
    if (!isHomeId(id) || !one(db, "SELECT 1 AS ok FROM ha_connections WHERE id = ?", id)) throw unknownHome();
    const using = plansUsing(db, id);
    if (using.length && !movePlans) throw new HttpError(409, "in_use", `These plans show this home: ${using.join(", ")}. Move them to the ${MAIN_NAME} first.`);
    run(db, "DELETE FROM ha_connections WHERE id = ?", id); // the plans' link goes with it (ON DELETE SET NULL): they show the main home
  });
}

// ---- status -------------------------------------------------------------------------------------------------------------------------------

// The states poll runs every few seconds per browser: the outcome is written when it changes and otherwise once in a while, not on every poll.
const NOTE_EVERY_MS = 30_000;
const notes = new Map<string, { at: number; error: string | null }>();

/** Remember whether Home Assistant answered (`error` null) or why not. Best effort: the status is a hint, so a failure to write it never fails a request. */
export function noteHomeResult(db: DatabaseSync, id: string, error: string | null, now = Date.now()): void {
  const prev = notes.get(id);
  if (prev && prev.error === error && now - prev.at < NOTE_EVERY_MS) return;
  notes.set(id, { at: now, error });
  try {
    if (error === null) run(db, "UPDATE ha_connections SET last_ok_at = ?, last_error = NULL WHERE id = ?", now, id);
    else run(db, "UPDATE ha_connections SET last_error = ? WHERE id = ?", error.slice(0, 200), id);
  } catch (e) {
    console.error("housey: could not record the status of a home", e instanceof Error ? e.message : "");
  }
}
