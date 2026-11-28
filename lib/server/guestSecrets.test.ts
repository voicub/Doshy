import assert from "node:assert/strict";
import { test } from "node:test";
import { PIN_RE, SESSION_COOKIE, SESSION_TTL_MS, TOKEN_RE, cookieValue, hashPin, hashToken, newLinkId, newToken, sessionCookie, signSession, verifyPin, verifySession } from "./guestSecrets.ts";

test("a token is 128 random bits, never repeats, and only its hash is what gets stored", () => {
  const tokens = new Set(Array.from({ length: 200 }, newToken));
  assert.equal(tokens.size, 200);
  for (const t of tokens) assert.match(t, TOKEN_RE);
  const [a] = tokens;
  assert.match(hashToken(a), /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken(a), a);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(newLinkId(), newLinkId());
});

test("a PIN is checked against its salted hash: the right one passes, anything else (even a near miss or junk) does not", async () => {
  const stored = await hashPin("4821");
  assert.match(stored.hash, /^[0-9a-f]{64}$/);
  assert.match(stored.salt, /^[0-9a-f]{32}$/);
  assert.equal(await verifyPin("4821", stored.hash, stored.salt), true);
  for (const bad of ["4822", "482", "48211", "", "abcd", "4821 ", "04821"]) assert.equal(await verifyPin(bad, stored.hash, stored.salt), false, JSON.stringify(bad));
  assert.equal(await verifyPin("4821", "not-hex", stored.salt), false, "a damaged row never lets anybody in");
  assert.equal(await verifyPin("4821", stored.hash, "00"), false);
  const again = await hashPin("4821");
  assert.notEqual(again.hash, stored.hash, "the salt differs, so equal PINs do not look equal in the database");
});

test("which strings are PINs", () => {
  for (const ok of ["1234", "12345678", "0000"]) assert.match(ok, PIN_RE);
  for (const bad of ["123", "123456789", "12a4", " 1234", ""]) assert.doesNotMatch(bad, PIN_RE);
});

const link = { id: "abc123", pin_hash: "ab".repeat(32) };
const now = 1_700_000_000_000;

test("a session cookie is good for its own link until it ends, and for nothing else", () => {
  const value = signSession(link, now + 1000);
  assert.equal(verifySession(value, link, now), true);
  assert.equal(verifySession(value, link, now + 1000), false, "ended");
  assert.equal(verifySession(value, { ...link, id: "other" }, now), false, "another link");
  assert.equal(verifySession(value, { ...link, pin_hash: "cd".repeat(32) }, now), false, "the link was made again with another PIN");
  assert.equal(verifySession(undefined, link, now), false);
  assert.equal(verifySession("", link, now), false);
});

test("a tampered or invented cookie is refused", () => {
  const [exp, mac] = signSession(link, now + 1000).split(".");
  assert.equal(verifySession(`${Number(exp) + 1}.${mac}`, link, now), false, "a later end with the old signature");
  assert.equal(verifySession(`${exp}.${mac.slice(0, -1)}A`, link, now), false);
  assert.equal(verifySession(`${exp}.${"A".repeat(43)}`, link, now), false);
  assert.equal(verifySession(`${now + 1000}`, link, now), false, "no signature");
  const forever = signSession(link, now + 10 * SESSION_TTL_MS);
  assert.equal(verifySession(forever, link, now), false, "longer than a session can be, even though it is signed");
});

test("the cookie is httpOnly, SameSite=Strict and limited to this link's API; Secure over https", () => {
  const token = newToken();
  const c = sessionCookie(token, "1.x", 3600.9, true);
  assert.ok(c.startsWith(`${SESSION_COOKIE}=1.x; `));
  for (const part of [`Path=/api/guest/${token}`, "HttpOnly", "SameSite=Strict", "Max-Age=3600", "Secure"]) assert.ok(c.includes(part), part);
  assert.ok(!sessionCookie(token, "1.x", 5, false).includes("Secure"));
  assert.throws(() => sessionCookie("../../x", "v", 5, false), "a token that is not a token never reaches a header (no cookie injection)");
  assert.throws(() => sessionCookie("a".repeat(21) + ";", "v", 5, false));
});

test("one cookie is picked out of a Cookie header", () => {
  assert.equal(cookieValue(`a=1; ${SESSION_COOKIE}=xyz; b=2`, SESSION_COOKIE), "xyz");
  assert.equal(cookieValue(`x${SESSION_COOKIE}=nope`, SESSION_COOKIE), undefined);
  assert.equal(cookieValue(null, SESSION_COOKIE), undefined);
});
