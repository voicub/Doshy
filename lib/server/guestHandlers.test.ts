import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createHome, parseNewHome } from "../db/connections.ts";
import { patchDashboard } from "../db/dashboards.ts";
import { tempDb } from "../db/testDb.ts";
import { putPlan } from "../db/plans.ts";
import { putResource } from "../db/resources.ts";
import { guestEnterPin, guestPlanReply, guestResourceReply, guestSessionStatus, guestStatesReply, type GuestEnv } from "./guestHandlers.ts";
import { PIN_LOCK_MS, createGuestLimits } from "./guestLimits.ts";
import { createLink, revokeLink, type NewLink } from "./guestLinks.ts";
import { SESSION_COOKIE, newToken } from "./guestSecrets.ts";

const NOW = 1_800_000_000_000;
const MODEL = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3, 4]);
const base: NewLink = { dashboardId: 1, label: "", pin: null, expires: "7d", live: false, location: false };

const plan = {
  walls: [{ id: "w", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, style: "plaster" }],
  openings: [],
  rooms: [{ id: "r", name: "<img src=x onerror=alert(1)>Kitchen", x: 0, y: 0, w: 4, h: 3, color: "#fff", floor: "wood", tempEntity: "sensor.kitchen_temp" }],
  items: [
    { id: "i1", kind: "my_chair_ab12", x: 1, y: 1, rot: 0, w: 1, d: 1, h: 1, entity: "light.secret_lamp" },
    { id: "i2", kind: "sofa", x: 2, y: 1, rot: 0, w: 1, d: 1, h: 1, entity: "switch.hidden_plug" },
  ],
  scenes: [{ id: "s", name: "Away mode", steps: [] }],
  site: { source: "manual", lat: 52.5, lon: 4.9, dx: 0, dy: 0, enabled: true, radius: 200 },
};

/** A database with a plan that uses one custom piece with a 3D model, plus a model and a photo the plan does NOT use. */
function setup() {
  const t = tempDb();
  putPlan(t.db, 1, { json: JSON.stringify(plan), baseRev: 0, format: 1 }, NOW);
  const piece = { kind: "my_chair_ab12", name: "Chair", w: 1, d: 1, h: 1, parts: [{ p: [0, 0.5, 0], s: [1, 1, 1], c: "#aaaaaa" }], model: { id: "m_chair", ext: "glb", bytes: 8 }, at: 1 };
  putResource(t.db, { id: "p_chair", kind: "piece", name: "Chair", mime: "application/json", data: new TextEncoder().encode(JSON.stringify(piece)) }, NOW);
  putResource(t.db, { id: "m_chair", kind: "model", name: "Chair", mime: "model/gltf-binary", meta: { ext: "glb" }, data: MODEL }, NOW);
  putResource(t.db, { id: "m_other", kind: "model", name: "Someone else's model", mime: "model/gltf-binary", meta: { ext: "glb" }, data: new Uint8Array([0x67, 0x6c, 0x54, 0x46, 9]) }, NOW);
  putResource(t.db, { id: "photo_1", kind: "image", name: "Floor plan", mime: "image/png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]) }, NOW);
  return t;
}

const url = (token: string, path: string) => `http://doshy.test/api/guest/${token}/${path}`;
const get = (token: string, path: string, headers: Record<string, string> = {}) => new Request(url(token, path), { headers });
const post = (token: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url(token, "session"), { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers }, body: JSON.stringify(body) });
const env = (db: DatabaseSync, extra: Partial<GuestEnv> = {}): GuestEnv => ({ db, now: NOW, limits: createGuestLimits(), ...extra });
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
const asJson = async (res: Response): Promise<Record<string, unknown>> => JSON.parse(await res.text());

/** The privacy headers every guest answer carries, success or not. */
function assertPrivate(res: Response) {
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
}

test("a link without a PIN shows the plan, with none of the owner's private parts, and every answer says do-not-store and do-not-index", async () => {
  const t = setup();
  const { token } = await createLink(t.db, base, NOW);
  const e = env(t.db);
  const res = await guestPlanReply(get(token, "plan"), token, e);
  assert.equal(res.status, 200);
  assertPrivate(res);
  const text = await res.text();
  for (const secret of ["secret_lamp", "hidden_plug", "kitchen_temp", "Away mode", "52.5", "scenes", "site"]) assert.ok(!text.includes(secret), secret);
  const body: Record<string, unknown> = JSON.parse(text);
  assert.equal(body.live, false);
  assert.equal((body.pieces as unknown[]).length, 1);
  assert.deepEqual(body.models, [{ id: "m_chair", ext: "glb" }]);
  assert.doesNotMatch(String(body.name), /[<>]/);
  assert.doesNotMatch(JSON.stringify(body), /<img/, "a name with markup in it is plain text by the time it is sent");
  assertPrivate(await guestSessionStatus(get(token, "session"), token, e));
  t.cleanup();
});

test("an unknown, malformed, revoked, expired or deleted-plan link all answer the same plain 404: an address cannot be probed", async () => {
  const t = setup();
  const live = await createLink(t.db, base, NOW);
  const revoked = await createLink(t.db, base, NOW);
  const expiring = await createLink(t.db, { ...base, expires: "1h" }, NOW);
  revokeLink(t.db, revoked.link.id);
  const tokens = [newToken(), "short", "x".repeat(22), "../../../etc/passwd", revoked.token, expiring.token];
  const seen = new Set<string>();
  for (const [i, token] of tokens.entries()) {
    const later = token === expiring.token ? NOW + 2 * 3_600_000 : NOW;
    const res = await guestPlanReply(get(token, "plan"), token, env(t.db, { now: later }));
    assert.equal(res.status, 404, token);
    assertPrivate(res);
    seen.add(await res.text());
    assert.equal((await guestResourceReply(get(token, "resource/m_chair"), token, "m_chair", env(t.db, { now: later }))).status, 404, `resource ${i}`);
    assert.equal((await guestSessionStatus(get(token, "session"), token, env(t.db, { now: later }))).status, 404, `session ${i}`);
  }
  assert.equal(seen.size, 1, "the same words every time");
  t.db.prepare("UPDATE dashboards SET deleted_at = 1 WHERE id = 1").run();
  assert.equal((await guestPlanReply(get(live.token, "plan"), live.token, env(t.db))).status, 404, "a plan that was deleted");
  t.cleanup();
});

test("scanning for addresses is slowed down: after 20 misses from one address the answer is 429", async () => {
  const t = setup();
  const e = env(t.db);
  const statuses: number[] = [];
  for (let i = 0; i < 25; i++) {
    const token = newToken();
    statuses.push((await guestPlanReply(get(token, "plan", { "x-forwarded-for": "203.0.113.9" }), token, e)).status);
  }
  assert.deepEqual([...new Set(statuses.slice(0, 20))], [404]);
  assert.equal(statuses[24], 429);
  t.cleanup();
});

test("a link with a PIN shows nothing until the PIN is entered; the right PIN sets a cookie that is only for this link's API", async () => {
  const t = setup();
  const { token } = await createLink(t.db, { ...base, pin: "4821" }, NOW);
  const e = env(t.db);
  const locked = await guestPlanReply(get(token, "plan"), token, e);
  assert.equal(locked.status, 401);
  assert.equal((await asJson(locked)).code, "pin_required");
  assert.ok(!(await guestResourceReply(get(token, "resource/m_chair"), token, "m_chair", e)).ok, "and no model either");
  assert.deepEqual(await asJson(await guestSessionStatus(get(token, "session"), token, e)), { pin: true, unlocked: false });

  const ok = await guestEnterPin(post(token, { pin: "4821" }), token, e);
  assert.equal(ok.status, 200);
  const header = ok.headers.get("set-cookie") ?? "";
  for (const part of [`${SESSION_COOKIE}=`, `Path=/api/guest/${token}`, "HttpOnly", "SameSite=Strict"]) assert.ok(header.includes(part), part);
  assert.ok(!/Domain=/i.test(header));
  assertPrivate(ok);

  const cookie = { cookie: cookieOf(ok) };
  assert.equal((await guestPlanReply(get(token, "plan", cookie), token, e)).status, 200);
  assert.equal((await guestResourceReply(get(token, "resource/m_chair", cookie), token, "m_chair", e)).status, 200);
  assert.deepEqual(await asJson(await guestSessionStatus(get(token, "session", cookie), token, e)), { pin: true, unlocked: true });
  const elsewhere = await guestPlanReply(get(token, "plan", { cookie: `${SESSION_COOKIE}=${cookieOf(ok).split("=")[1].replace(/.$/, (c) => (c === "A" ? "B" : "A"))}` }), token, e); // the last character always changes
  assert.equal(elsewhere.status, 401, "a changed cookie is not a session");
  t.cleanup();
});

test("a cookie from one link does not open another, and a session ends with its time", async () => {
  const t = setup();
  const a = await createLink(t.db, { ...base, pin: "1111" }, NOW);
  const b = await createLink(t.db, { ...base, pin: "1111" }, NOW);
  const e = env(t.db);
  const cookie = cookieOf(await guestEnterPin(post(a.token, { pin: "1111" }), a.token, e));
  assert.equal((await guestPlanReply(get(a.token, "plan", { cookie }), a.token, e)).status, 200);
  assert.equal((await guestPlanReply(get(b.token, "plan", { cookie }), b.token, e)).status, 401, "same PIN, another link");
  assert.equal((await guestPlanReply(get(a.token, "plan", { cookie }), a.token, env(t.db, { now: NOW + 9 * 3_600_000 }))).status, 401, "after 8 hours");
  t.cleanup();
});

test("a session never outlasts the link: the cookie's lifetime stops at the link's end", async () => {
  const t = setup();
  const { token } = await createLink(t.db, { ...base, pin: "1111", expires: "1h" }, NOW);
  const res = await guestEnterPin(post(token, { pin: "1111" }), token, env(t.db));
  assert.match(res.headers.get("set-cookie") ?? "", /Max-Age=3600/);
  t.cleanup();
});

test("5 wrong PINs lock the link for 15 minutes, even the right PIN is refused meanwhile, and then it works again", async () => {
  const t = setup();
  const { token } = await createLink(t.db, { ...base, pin: "4821" }, NOW);
  const e = env(t.db);
  const wrong = async (n: number) => asJson(await guestEnterPin(post(token, { pin: "0000" }), token, { ...e, now: NOW + n }));
  assert.match(String((await wrong(0)).error), /4 tries left/);
  for (let i = 1; i < 4; i++) await wrong(i);
  const starting = await guestEnterPin(post(token, { pin: "0000" }), token, { ...e, now: NOW + 4 });
  assert.equal(starting.status, 403);
  assert.match(String((await asJson(starting)).error), /15 minutes/);
  assert.ok(Number(starting.headers.get("retry-after")) > 800, "the try that starts the lockout says how long it lasts");
  const refused = await guestEnterPin(post(token, { pin: "4821" }), token, { ...e, now: NOW + 5000 });
  assert.equal(refused.status, 429);
  assert.equal((await asJson(refused)).code, "locked");
  assert.ok(Number(refused.headers.get("retry-after")) > 800, "says how long to wait");
  assert.ok(!refused.headers.get("set-cookie"), "no cookie from a refused try");
  const after = await guestEnterPin(post(token, { pin: "4821" }), token, { ...e, now: NOW + 4 + PIN_LOCK_MS });
  assert.equal(after.status, 200);
  t.cleanup();
});

test("another person on another address is not locked out by one address's wrong tries", async () => {
  const t = setup();
  const { token } = await createLink(t.db, { ...base, pin: "4821" }, NOW);
  const e = env(t.db);
  for (let i = 0; i < 5; i++) await guestEnterPin(post(token, { pin: "0000" }, { "x-forwarded-for": "198.51.100.1" }), token, e);
  assert.equal((await guestEnterPin(post(token, { pin: "4821" }, { "x-forwarded-for": "198.51.100.1" }), token, e)).status, 429);
  assert.equal((await guestEnterPin(post(token, { pin: "4821" }, { "x-forwarded-for": "198.51.100.2" }), token, e)).status, 200);
  t.cleanup();
});

test("guessing from many addresses does not help: 25 wrong PINs from anywhere lock the whole link", async () => {
  const t = setup();
  const { token } = await createLink(t.db, { ...base, pin: "4821" }, NOW);
  const e = env(t.db);
  // not digits: counted as a wrong try like any other, without the slow hash, so 25 of them stay quick
  for (let i = 0; i < 25; i++) await guestEnterPin(post(token, { pin: "abcd" }, { "x-forwarded-for": `198.51.100.${i}` }), token, e);
  const res = await guestEnterPin(post(token, { pin: "4821" }, { "x-forwarded-for": "192.0.2.77" }), token, e);
  assert.equal(res.status, 429, "even a new address with the right PIN waits");
  t.cleanup();
});

test("20 PINs sent at the same moment get 5 tries between them, not 20", async () => {
  const t = setup();
  const { token } = await createLink(t.db, { ...base, pin: "4821" }, NOW);
  const e = env(t.db);
  const results = await Promise.all(Array.from({ length: 20 }, () => guestEnterPin(post(token, { pin: "0000" }), token, e)));
  const statuses = results.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 403).length, 5);
  assert.equal(statuses.filter((s) => s === 429).length, 15);
  t.cleanup();
});

test("a PIN request from another site is refused before it is even counted; junk bodies are plain 400s", async () => {
  const t = setup();
  const { token } = await createLink(t.db, { ...base, pin: "4821" }, NOW);
  const e = env(t.db);
  assert.equal((await guestEnterPin(post(token, { pin: "4821" }, { "sec-fetch-site": "cross-site" }), token, e)).status, 403);
  assert.equal((await guestEnterPin(post(token, { pin: "4821" }, { origin: "https://evil.example", host: "doshy.test" }), token, e)).status, 403);
  const plain = new Request(url(token, "session"), { method: "POST", headers: { "content-type": "text/plain", "sec-fetch-site": "same-origin" }, body: "pin=4821" });
  assert.equal((await guestEnterPin(plain, token, e)).status, 415);
  assert.equal((await guestEnterPin(post(token, "not an object"), token, e)).status, 403, "counted as a wrong try, never a crash");
  assert.equal((await guestEnterPin(post(token, { pin: 4821 }), token, e)).status, 403);
  t.cleanup();
});

test("a guest can fetch the 3D models of THIS plan's pieces and nothing else in the database", async () => {
  const t = setup();
  const { token } = await createLink(t.db, base, NOW);
  const e = env(t.db);
  const mine = await guestResourceReply(get(token, "resource/m_chair"), token, "m_chair", e);
  assert.equal(mine.status, 200);
  assert.deepEqual(new Uint8Array(await mine.arrayBuffer()), MODEL);
  assert.equal(mine.headers.get("content-type"), "model/gltf-binary");
  assertPrivate(mine);
  assert.match(mine.headers.get("content-security-policy") ?? "", /sandbox/);
  for (const id of ["m_other", "photo_1", "p_chair", "nope", "../photo_1", "m_chair/../m_other", "m_chair%2f..%2fm_other", "m_chair\\..\\m_other", "x".repeat(65), "", "m chair", "' OR 1=1 --"]) {
    const res = await guestResourceReply(get(token, `resource/${id}`), token, id, e);
    assert.equal(res.status, 404, JSON.stringify(id));
    assert.doesNotMatch(await res.text(), /Someone else|Floor plan/);
  }
  t.cleanup();
});

test("a guest cannot reach another plan's files through their own link: a model only counts when a piece of the shared plan uses it", async () => {
  const t = setup();
  putPlan(t.db, 1, { json: JSON.stringify({ ...plan, items: [plan.items[1]] }), baseRev: 1, format: 1 }, NOW + 1);
  const { token } = await createLink(t.db, base, NOW);
  const res = await guestResourceReply(get(token, "resource/m_chair"), token, "m_chair", env(t.db));
  assert.equal(res.status, 404, "the piece is no longer in the plan, so its model is not offered");
  t.cleanup();
});

test("live states are off unless the owner turned them on; then a guest gets state words and numbers under made-up ids, never the real ones", async () => {
  const t = setup();
  const quiet = await createLink(t.db, base, NOW);
  const loud = await createLink(t.db, { ...base, live: true }, NOW);
  const loadStates = async () => [
    { entity_id: "light.secret_lamp", state: "on", attributes: { brightness: 180, friendly_name: "Secret lamp" } },
    { entity_id: "switch.hidden_plug", state: "off", attributes: {} },
    { entity_id: "sensor.kitchen_temp", state: "20.5", attributes: { unit_of_measurement: "°C" } },
    { entity_id: "light.not_in_the_plan", state: "on", attributes: {} },
  ];
  const e = env(t.db, { loadStates });
  assert.equal((await guestStatesReply(get(quiet.token, "states"), quiet.token, e)).status, 404);
  assert.equal((await guestStatesReply(get(loud.token, "states"), loud.token, env(t.db)) ).status, 404, "no source of states, nothing to show");

  const planText = await (await guestPlanReply(get(loud.token, "plan"), loud.token, e)).text();
  assert.doesNotMatch(planText, /secret_lamp|hidden_plug|kitchen_temp/);
  const planBody: { plan: { items: { entity?: string }[] } } = JSON.parse(planText);
  const lamp = planBody.plan.items[0].entity;
  assert.match(String(lamp), /^light\.g\d+$/);

  const res = await guestStatesReply(get(loud.token, "states"), loud.token, e);
  assert.equal(res.status, 200);
  assertPrivate(res);
  const text = await res.text();
  assert.doesNotMatch(text, /secret_lamp|hidden_plug|kitchen_temp|Secret lamp|not_in_the_plan/);
  const states: { states: Record<string, { state: string; attributes: Record<string, unknown> }> } = JSON.parse(text);
  assert.equal(Object.keys(states.states).length, 3);
  assert.equal(states.states[String(lamp)].state, "on");
  assert.equal(states.states[String(lamp)].attributes.brightness, 180);
  t.cleanup();
});

test("live states of a link with a PIN need the PIN too; and a Home Assistant that is down is a plain 503", async () => {
  const t = setup();
  const { token } = await createLink(t.db, { ...base, pin: "4821", live: true }, NOW);
  const down: GuestEnv["loadStates"] = async () => {
    throw new Error("connect ECONNREFUSED 192.168.1.5:8123 token=abc");
  };
  const e = env(t.db, { loadStates: down });
  assert.equal((await guestStatesReply(get(token, "states"), token, e)).status, 401);
  const cookie = cookieOf(await guestEnterPin(post(token, { pin: "4821" }), token, e));
  const res = await guestStatesReply(get(token, "states", { cookie }), token, e);
  assert.equal(res.status, 503);
  assert.doesNotMatch(await res.text(), /192\.168|ECONNREFUSED|token/, "no detail of the owner's network");
  t.cleanup();
});

test("the real home location only travels with a link made with that option", async () => {
  const t = setup();
  const without = await createLink(t.db, base, NOW);
  const withIt = await createLink(t.db, { ...base, location: true }, NOW);
  const e = env(t.db);
  assert.ok(!(await (await guestPlanReply(get(without.token, "plan"), without.token, e)).text()).includes("52.5"));
  const text = await (await guestPlanReply(get(withIt.token, "plan"), withIt.token, e)).text();
  assert.ok(text.includes("52.5"));
  assert.ok(!text.includes("Away mode"), "and still no scenes");
  t.cleanup();
});

test("`last used` is recorded when a guest opens the plan", async () => {
  const t = setup();
  const { link, token } = await createLink(t.db, base, NOW);
  await guestPlanReply(get(token, "plan"), token, env(t.db, { now: NOW + 5000 }));
  assert.equal(t.db.prepare("SELECT last_used_at FROM guest_links WHERE id = ?").get(link.id)?.last_used_at, NOW + 5000);
  t.cleanup();
});

test("an unexpected failure is a plain 500 that says nothing about the link or the server", async () => {
  const t = setup();
  const { token } = await createLink(t.db, base, NOW);
  t.db.close();
  const res = await guestPlanReply(get(token, "plan"), token, env(t.db));
  assert.equal(res.status, 500);
  assertPrivate(res);
  const text = await res.text();
  assert.ok(!text.includes(token));
  assert.doesNotMatch(text, /sqlite|SELECT|database|\.ts/i);
});

test("a guest link shows the home of its own plan: a request header cannot pick another one", async () => {
  const t = setup();
  const mine = createHome(t.db, parseNewHome({ name: "Holiday house", url: "http://127.0.0.1:9", token: "tok-aaaa-1111" }));
  const other = createHome(t.db, parseNewHome({ name: "Parents", url: "http://127.0.0.1:9", token: "tok-bbbb-2222" }));
  const { token } = await createLink(t.db, { ...base, live: true }, NOW);
  const asked: (string | null)[] = [];
  const e = env(t.db, { loadStates: async (id) => (asked.push(id), []) });
  await guestStatesReply(get(token, "states", { "x-doshy-home": other.id }), token, e);
  patchDashboard(t.db, 1, { haConnection: mine.id });
  await guestStatesReply(get(token, "states", { "x-doshy-home": other.id }), token, e);
  assert.deepEqual(asked, [null, mine.id]);
  t.cleanup();
});
