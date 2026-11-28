// Secrets of a guest link: the token in the address, the optional PIN and the cookie that remembers a correct PIN. Only node:crypto, no I/O.
// Nothing here is ever logged. See docs/sharing.md for the threat model.
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** 16 random bytes (128 bits) as base64url = 22 characters. Guessing one is out of the question; the PIN is a second lock for a link that was forwarded. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
export const newToken = (): string => randomBytes(16).toString("base64url");
/** The owner's handle for a link (list, revoke). Not secret, and not derivable from the token. */
export const newLinkId = (): string => randomBytes(9).toString("base64url");
/** What the database keeps of a token: a lookup by this hash finds the link, and a stolen database file does not hold a working address. */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const PIN_RE = /^\d{4,8}$/;
// scrypt (memory-hard, so a stolen hash is slow to attack): N = 2^14 uses 16 MB for about 50 ms on a desktop. Async, so it runs on the thread pool, not on the event loop.
const SCRYPT_COST = { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_BYTES = 32;

function derive(pin: string, salt: Buffer): Promise<Buffer> {
  const { promise, resolve, reject } = Promise.withResolvers<Buffer>();
  scrypt(pin, salt, KEY_BYTES, SCRYPT_COST, (e, key) => (e ? reject(e) : resolve(key)));
  return promise;
}

/** A salted, slow hash of a PIN, as hex (what the database keeps). */
export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16);
  return { hash: (await derive(pin, salt)).toString("hex"), salt: salt.toString("hex") };
}

/** Is `pin` the PIN behind this hash? Compared in constant time. Garbage stored values are simply "no". */
export async function verifyPin(pin: string, hashHex: string, saltHex: string): Promise<boolean> {
  if (!PIN_RE.test(pin) || !/^[0-9a-f]{64}$/.test(hashHex) || !/^[0-9a-f]{32}$/.test(saltHex)) return false;
  const got = await derive(pin, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(got, Buffer.from(hashHex, "hex"));
}

// ---- the session cookie: "<expiry ms>.<mac>" -------------------------------------------------------------------------------------------------------
// The key is the link's own PIN hash (secret, high entropy, only in the database), so there is no extra server secret to store, nothing to rotate, and a revoked
// link (its row is gone) or a link with another PIN (a new link) can never accept an old cookie. A link without a PIN needs no cookie at all.

export const SESSION_COOKIE = "doshy_guest";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

type Keyed = { id: string; pin_hash: string };
const mac = (link: Keyed, expires: number) => createHmac("sha256", Buffer.from(link.pin_hash, "hex")).update(`doshy-guest-v1|${link.id}|${expires}`).digest("base64url");

/** The cookie value for a session that ends at `expires` (ms). */
export const signSession = (link: Keyed, expires: number): string => `${expires}.${mac(link, expires)}`;

/** Is `value` a session of this link that has not ended (and is not longer than a session can be)? */
export function verifySession(value: string | null | undefined, link: Keyed, now: number): boolean {
  const m = /^(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(value ?? "");
  if (!m) return false;
  const expires = Number(m[1]);
  if (expires <= now || expires > now + SESSION_TTL_MS) return false;
  const want = Buffer.from(mac(link, expires));
  const have = Buffer.from(m[2]);
  return want.length === have.length && timingSafeEqual(want, have);
}

/** One cookie's value out of a `Cookie` header, or undefined. */
export function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/**
 * The Set-Cookie header: httpOnly (scripts cannot read it), SameSite=Strict (never sent from another site), and Path limited to this one link's API (it is never sent
 * to the owner's routes or to any other link). `secure` when the page is served over https.
 */
export function sessionCookie(token: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  if (!TOKEN_RE.test(token)) throw new Error("not a token");
  return `${SESSION_COOKIE}=${value}; Path=/api/guest/${token}; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure ? "; Secure" : ""}`;
}
