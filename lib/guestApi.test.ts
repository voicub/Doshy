import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchGuestModel, fetchGuestPlan, fetchGuestStates, fetchSession, screenAfter, sendPin } from "./guestApi.ts";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const real = globalThis.fetch;
afterEach(() => void (globalThis.fetch = real));

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const answer = (res: Response | Error) => void (globalThis.fetch = (async () => { if (res instanceof Error) throw res; return res; }) as typeof fetch);

const PLAN = { v: 1, name: "Home", rev: 3, live: false, location: false, plan: { walls: [], openings: [], rooms: [], items: [] }, pieces: [], models: [] };

test("the session answer says whether a PIN is needed", async () => {
  answer(reply({ pin: true, unlocked: false }));
  assert.deepEqual(await fetchSession(TOKEN), { ok: true, value: { pin: true, unlocked: false } });
  answer(reply({ nonsense: 1 }));
  const bad = await fetchSession(TOKEN);
  assert.equal(bad.ok, false);
});

test("a wrong PIN comes back as words, a lockout with how long to wait", async () => {
  answer(reply({ error: "That PIN is not right. 4 tries left.", code: "wrong_pin" }, 403));
  assert.deepEqual(await sendPin(TOKEN, "1234"), { ok: false, status: 403, code: "wrong_pin", message: "That PIN is not right. 4 tries left.", retryAfter: null });
  answer(reply({ error: "Too many wrong PINs.", code: "locked" }, 429, { "retry-after": "900" }));
  const locked = await sendPin(TOKEN, "1234");
  assert.equal(!locked.ok && locked.retryAfter, 900);
  answer(reply({ ok: true, pin: true }));
  assert.deepEqual(await sendPin(TOKEN, "1234"), { ok: true, value: true });
});

test("the plan is checked before the page uses it", async () => {
  answer(reply(PLAN));
  const got = await fetchGuestPlan(TOKEN);
  assert.equal(got.ok && got.value.name, "Home");
  answer(reply({ ...PLAN, plan: { walls: "no" } }));
  const bad = await fetchGuestPlan(TOKEN);
  assert.equal(!bad.ok && bad.code, "bad_reply");
});

test("no connection is a failure with status 0, not an exception", async () => {
  answer(new TypeError("fetch failed"));
  const r = await fetchGuestStates(TOKEN);
  assert.equal(!r.ok && r.status, 0);
  assert.equal(await fetchGuestModel(TOKEN, "m_1"), undefined);
});

test("a model file is read with its kind from the content type; a refusal is no model", async () => {
  answer(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "model/gltf+json" } }));
  const m = await fetchGuestModel(TOKEN, "m_1");
  assert.equal(m?.ext, "gltf");
  assert.equal(m?.buf.byteLength, 3);
  answer(reply({ error: "no", code: "not_found" }, 404));
  assert.equal(await fetchGuestModel(TOKEN, "m_1"), undefined);
});

test("what the page shows after a failure", () => {
  const f = (status: number, code: string) => ({ ok: false as const, status, code, message: "words", retryAfter: null });
  assert.deepEqual(screenAfter(f(404, "not_found")), { kind: "gone" });
  assert.deepEqual(screenAfter(f(401, "pin_required")), { kind: "pin" });
  assert.deepEqual(screenAfter(f(429, "slow_down")), { kind: "problem", message: "words" });
  assert.deepEqual(screenAfter(f(0, "offline")), { kind: "problem", message: "words" });
});
