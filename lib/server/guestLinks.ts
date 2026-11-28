// The guest links of the database (table `guest_links`, migration 5): make one, list a plan's links, revoke one, find one by the token in its address.
// The token is returned to the owner ONCE, when the link is made; the database keeps only its SHA-256, and the PIN only as a salted scrypt hash.
import type { DatabaseSync } from "node:sqlite";
import { HttpError } from "../db/errors.ts";
import { requireDashboard } from "../db/dashboards.ts";
import { all, one, run, tx, type Row } from "../db/sql.ts";
import { cleanText } from "../db/text.ts";
import { badRequest } from "../db/validate.ts";
import { isRecord } from "../guards.ts";
import { PIN_RE, TOKEN_RE, hashPin, hashToken, newLinkId, newToken } from "./guestSecrets.ts";

export const MAX_LINKS_PER_PLAN = 10;
export const MAX_LABEL = 40;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The choices the owner gets for "how long should it work"; anything else is refused. */
export const EXPIRY_CHOICES = { "1h": HOUR, "1d": DAY, "7d": 7 * DAY, never: null } as const;
export type Expiry = keyof typeof EXPIRY_CHOICES;
const isExpiry = (v: unknown): v is Expiry => typeof v === "string" && Object.hasOwn(EXPIRY_CHOICES, v);
/** An expired link stays in the owner's list (so it can be seen and removed) for this long, then it is dropped. */
const KEEP_EXPIRED_MS = 7 * DAY;
/** `last_used_at` is written at most this often per link (a viewer polls; the database is not a log). */
export const TOUCH_EVERY_MS = 60_000;

/** A row as the server uses it. */
export type GuestLink = {
  id: string;
  dashboardId: number;
  pinHash: string | null;
  pinSalt: string | null;
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
  label: string;
  live: boolean;
  location: boolean;
};

/** A link as the owner's list shows it (never a hash, never the token). */
export type GuestLinkInfo = { id: string; label: string; createdAt: number; expiresAt: number | null; expired: boolean; lastUsedAt: number | null; pin: boolean; live: boolean; location: boolean };

const asLink = (r: Row): GuestLink => ({
  id: String(r.id),
  dashboardId: Number(r.dashboard_id),
  pinHash: r.pin_hash == null ? null : String(r.pin_hash),
  pinSalt: r.pin_salt == null ? null : String(r.pin_salt),
  createdAt: Number(r.created_at),
  expiresAt: r.expires_at == null ? null : Number(r.expires_at),
  lastUsedAt: r.last_used_at == null ? null : Number(r.last_used_at),
  label: String(r.label),
  live: r.live === 1,
  location: r.location === 1,
});

export const isExpired = (l: Pick<GuestLink, "expiresAt">, now: number): boolean => l.expiresAt !== null && l.expiresAt <= now;

const asInfo = (l: GuestLink, now: number): GuestLinkInfo => ({
  id: l.id,
  label: l.label,
  createdAt: l.createdAt,
  expiresAt: l.expiresAt,
  expired: isExpired(l, now),
  lastUsedAt: l.lastUsedAt,
  pin: l.pinHash !== null,
  live: l.live,
  location: l.location,
});

export type NewLink = { dashboardId: number; label: string; pin: string | null; expires: Expiry; live: boolean; location: boolean };

/** A create request's JSON body, checked. Unknown fields are ignored; every known one must have the right type. */
export function parseNewLink(body: unknown): NewLink {
  if (!isRecord(body)) throw badRequest("That is not a request the server understands.");
  const { dashboardId, label, pin, expires, live, location } = body;
  if (typeof dashboardId !== "number" || !Number.isInteger(dashboardId) || dashboardId < 1) throw badRequest("Say which plan to share.");
  if (label !== undefined && typeof label !== "string") throw badRequest("The name of the link has to be text.");
  if (pin !== undefined && pin !== null && (typeof pin !== "string" || (pin !== "" && !PIN_RE.test(pin)))) throw badRequest("A PIN is 4 to 8 digits.");
  if (!isExpiry(expires)) throw badRequest("Choose how long the link should work.");
  for (const flag of [live, location]) if (flag !== undefined && typeof flag !== "boolean") throw badRequest("That option is on or off.");
  return {
    dashboardId,
    label: cleanText(label, MAX_LABEL, ""),
    pin: typeof pin === "string" && pin !== "" ? pin : null,
    expires,
    live: live === true,
    location: location === true,
  };
}

/** Make a link for a plan. Returns the link and its token (the only time it exists in the clear). 404 for a plan that is not there, 409 `too_many` past the limit. */
export async function createLink(db: DatabaseSync, input: NewLink, now = Date.now()): Promise<{ link: GuestLinkInfo; token: string }> {
  const pin = input.pin ? await hashPin(input.pin) : null; // slow on purpose, so before the transaction takes the write lock
  const token = newToken();
  const id = newLinkId();
  const ttl = EXPIRY_CHOICES[input.expires];
  const expiresAt = ttl === null ? null : now + ttl;
  tx(db, () => {
    requireDashboard(db, input.dashboardId);
    run(db, "DELETE FROM guest_links WHERE expires_at IS NOT NULL AND expires_at < ?", now - KEEP_EXPIRED_MS);
    if (Number(one(db, "SELECT COUNT(*) AS n FROM guest_links WHERE dashboard_id = ?", input.dashboardId)?.n) >= MAX_LINKS_PER_PLAN) {
      throw new HttpError(409, "too_many", `A plan can have ${MAX_LINKS_PER_PLAN} links at most. Remove one you no longer need.`);
    }
    run(
      db,
      "INSERT INTO guest_links (id, dashboard_id, token_hash, pin_hash, pin_salt, created_at, expires_at, label, live, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      input.dashboardId,
      hashToken(token),
      pin?.hash ?? null,
      pin?.salt ?? null,
      now,
      expiresAt,
      input.label,
      input.live ? 1 : 0,
      input.location ? 1 : 0,
    );
  });
  const row = one(db, "SELECT * FROM guest_links WHERE id = ?", id);
  if (!row) throw new Error("the new guest link was not saved");
  return { link: asInfo(asLink(row), now), token };
}

/** The links of one plan, newest first. 404 for a plan that is not there. */
export function listLinks(db: DatabaseSync, dashboardId: number, now = Date.now()): GuestLinkInfo[] {
  requireDashboard(db, dashboardId);
  return all(db, "SELECT * FROM guest_links WHERE dashboard_id = ? ORDER BY created_at DESC, id", dashboardId).map((r) => asInfo(asLink(r), now));
}

/** Take a link away for good: its address stops working at once. Returns false when there was no such link. */
export function revokeLink(db: DatabaseSync, id: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) return false;
  return Number(run(db, "DELETE FROM guest_links WHERE id = ?", id).changes) > 0;
}

/** The link whose token this is, or null (unknown, malformed, or revoked: the three look the same to the caller on purpose). Expiry is the caller's call (`isExpired`). */
export function findLink(db: DatabaseSync, token: string): GuestLink | null {
  if (!TOKEN_RE.test(token)) return null;
  const row = one(db, "SELECT * FROM guest_links WHERE token_hash = ?", hashToken(token));
  return row ? asLink(row) : null;
}

/** Remember that the link was just used (at most once per `TOUCH_EVERY_MS`). */
export function touchLink(db: DatabaseSync, link: GuestLink, now: number): void {
  if (link.lastUsedAt !== null && now - link.lastUsedAt < TOUCH_EVERY_MS) return;
  run(db, "UPDATE guest_links SET last_used_at = ? WHERE id = ?", now, link.id);
}
