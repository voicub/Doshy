import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { closeDb, getDb } from "./db/connection.ts";
import { createHome, getHome, parseNewHome } from "./db/connections.ts";
import { HttpError } from "./db/errors.ts";
import { forgetKeys } from "./server/secretBox.ts";
import { HOME_HEADER, haFailure, haFetchFor, haFor, mainHome, resolveHa } from "./haServer.ts";
import { callHaService } from "./server/haCall.ts";
import { forgetStates } from "./server/haStates.ts";
import { statesReply } from "./server/haStatesReply.ts";
import { tempDb } from "./db/testDb.ts";

type Seen = { method: string; path: string; auth: string; body: string };
type Fake = { url: string; token: string; seen: Seen[]; close: () => Promise<void>; entities: Record<string, string> };

/** A small Home Assistant: /api/states, /api/config and any service, answering only to its own token. Nothing here can reach the network beyond 127.0.0.1. */
async function fakeHa(token: string, entities: Record<string, string>): Promise<Fake> {
  const seen: Seen[] = [];
  const server: Server = createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const auth = String(req.headers.authorization ?? "");
    seen.push({ method: req.method ?? "", path: req.url ?? "", auth, body: Buffer.concat(chunks).toString() });
    if (auth !== `Bearer ${token}`) return void res.writeHead(401).end("unauthorized");
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/states") return void res.end(JSON.stringify(Object.entries(fake.entities).map(([entity_id, state]) => ({ entity_id, state, attributes: { friendly_name: entity_id } }))));
    if (req.url === "/api/config") return void res.end(JSON.stringify({ version: "2026.1.0", location_name: "Fake" }));
    if (req.url?.startsWith("/api/services/")) return void res.end("[]");
    res.writeHead(404).end("{}");
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const fake: Fake = {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    token,
    seen,
    entities: { ...entities },
    close: () => new Promise((ok) => (server.closeAllConnections(), server.close(() => ok()))),
  };
  return fake;
}

const MAIN_TOKEN = "main-token-0000-secret";
const A_TOKEN = "holiday-token-1111-secret";
const B_TOKEN = "parents-token-2222-secret";
const ALL_TOKENS = [MAIN_TOKEN, A_TOKEN, B_TOKEN];

const saved = { path: process.env.HOUSEY_DB_PATH, url: process.env.HA_URL, token: process.env.HA_TOKEN };
let dir = "";
const fakes: Fake[] = [];
const spawn = async (token: string, entities: Record<string, string>) => {
  const f = await fakeHa(token, entities);
  fakes.push(f);
  return f;
};

beforeEach(() => {
  const t = tempDb(); // only for its folder: the app's own connection is opened on the same file below
  dir = t.dir;
  t.db.close();
  process.env.HOUSEY_DB_PATH = join(dir, "housey.db");
  forgetStates();
  forgetKeys();
});

afterEach(async () => {
  closeDb();
  for (const f of fakes.splice(0)) await f.close();
  rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of [["HOUSEY_DB_PATH", saved.path], ["HA_URL", saved.url], ["HA_TOKEN", saved.token]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const get = (path: string, headers: Record<string, string> = {}) => new Request(`http://doshy.test${path}`, { headers });
const refusedWith = (fn: () => unknown, status: number, code?: string) => assert.throws(fn, (e: unknown) => e instanceof HttpError && e.status === status && (code === undefined || e.code === code));

/** The three homes of these tests: the built-in one from the environment, and two saved ones, each on its own fake server. */
async function setup() {
  const main = await spawn(MAIN_TOKEN, { "light.kitchen": "on", "sensor.shared": "1" });
  const a = await spawn(A_TOKEN, { "light.cabin": "on", "sensor.shared": "1" });
  const b = await spawn(B_TOKEN, { "light.parents": "off", "sensor.shared": "1" });
  process.env.HA_URL = `${main.url}/`;
  process.env.HA_TOKEN = MAIN_TOKEN;
  const db = getDb();
  const homeA = createHome(db, parseNewHome({ name: "Holiday house", url: a.url, token: A_TOKEN }));
  const homeB = createHome(db, parseNewHome({ name: "Parents", url: b.url, token: B_TOKEN }));
  return { main, a, b, idA: homeA.id, idB: homeB.id, db };
}

const ids = async (res: Response): Promise<string[]> => (JSON.parse(await res.text()) as { entity_id: string }[]).map((e) => e.entity_id).sort();

// ---- the resolver -----------------------------------------------------------------------------------------------------------------------

test("no header, an empty one and 'main' all mean the built-in home (a Doshy with one home behaves as before)", async () => {
  const { main } = await setup();
  const variants: Record<string, string>[] = [{}, { [HOME_HEADER]: "" }, { [HOME_HEADER]: "main" }];
  for (const headers of variants) {
    assert.deepEqual(resolveHa(get("/api/ha/states", headers)), { id: "main", baseUrl: main.url, token: MAIN_TOKEN }, JSON.stringify(headers));
  }
  assert.deepEqual(mainHome(), { id: "main", baseUrl: main.url, token: MAIN_TOKEN }, "a trailing slash in HA_URL is dropped");
});

test("the header picks a saved home; an unknown or odd id is a plain 404 and never falls back to the main home", async () => {
  const { a, idA } = await setup();
  assert.deepEqual(resolveHa(get("/x", { [HOME_HEADER]: idA })), { id: idA, baseUrl: a.url, token: A_TOKEN });
  refusedWith(() => resolveHa(get("/x", { [HOME_HEADER]: "abcdef123456" })), 404, "unknown_home");
  for (const odd of ["../../etc", "A".repeat(500), "main2", "x", "ABCDEF123456", "a b c d e f"]) refusedWith(() => resolveHa(get("/x", { [HOME_HEADER]: odd })), 404, "unknown_home");
});

test("a saved home whose token cannot be read is a plain 409, not a crash", async () => {
  const { idA, db } = await setup();
  db.prepare("UPDATE ha_connections SET token_enc = 'v1.broken' WHERE id = ?").run(idA);
  refusedWith(() => resolveHa(get("/x", { [HOME_HEADER]: idA })), 409, "token_needed");
  const res = haFailure(new HttpError(409, "token_needed", "Holiday house: the token needs to be entered again."));
  assert.equal(res.status, 409);
});

test("a request for the throwaway test database never sees a saved home: that database has none of its own", async () => {
  const { idA } = await setup();
  const token = `tst${Date.now().toString(36)}`.slice(0, 16).padEnd(8, "x");
  try {
    refusedWith(() => resolveHa(get("/x", { [HOME_HEADER]: idA, "x-housey-test": token })), 404, "unknown_home");
    assert.equal(resolveHa(get("/x", { "x-housey-test": token })).id, "main", "the built-in home works there for reads, as it always did");
  } finally {
    closeDb();
    for (const s of ["", "-wal", "-shm", ".key"]) rmSync(join(tmpdir(), `housey-test-${token}.db${s}`), { force: true });
  }
});

test("?home= is read only where an <img> must use it (the artwork route), never for ordinary routes", async () => {
  const { idA } = await setup();
  assert.equal(resolveHa(get(`/api/ha/media-image?entity=media_player.tv&home=${idA}`)).id, "main");
  assert.equal(resolveHa(get(`/api/ha/media-image?entity=media_player.tv&home=${idA}`), { fromQuery: true }).id, idA);
  assert.equal(resolveHa(get("/x", { [HOME_HEADER]: "main" }), { fromQuery: true }).id, "main");
});

// ---- states: no cross-talk between homes ------------------------------------------------------------------------------------------------

test("two homes answer with their own devices, each asked once, each with its own token, and never the other's", async () => {
  const { main, a, b, idA, idB } = await setup();
  const [m, ra, rb] = await Promise.all([statesReply(get("/api/ha/states")), statesReply(get("/api/ha/states", { [HOME_HEADER]: idA })), statesReply(get("/api/ha/states", { [HOME_HEADER]: idB }))]);
  assert.deepEqual(await ids(m), ["light.kitchen", "sensor.shared"]);
  assert.deepEqual(await ids(ra), ["light.cabin", "sensor.shared"]);
  assert.deepEqual(await ids(rb), ["light.parents", "sensor.shared"]);
  // the same again within the cache window: no new request to any of them
  await Promise.all([statesReply(get("/api/ha/states")), statesReply(get("/api/ha/states", { [HOME_HEADER]: idA })), statesReply(get("/api/ha/states", { [HOME_HEADER]: idB }))]);
  for (const f of [main, a, b]) {
    assert.equal(f.seen.length, 1, `${f.url} was asked once`);
    assert.equal(f.seen[0].auth, `Bearer ${f.token}`, "each Home Assistant only ever sees its own token");
  }
});

test("the ETag is per home: a copy of one home's list never validates another's, even when the lists are identical", async () => {
  const { a, b, idA, idB } = await setup();
  const ra = await statesReply(get("/api/ha/states", { [HOME_HEADER]: idA }));
  const etagA = ra.headers.get("etag") ?? "";
  assert.ok(etagA);
  const same = await statesReply(get("/api/ha/states", { [HOME_HEADER]: idA, "if-none-match": etagA }));
  assert.equal(same.status, 304, "an unchanged list costs an empty 304");
  const other = await statesReply(get("/api/ha/states", { [HOME_HEADER]: idB, "if-none-match": etagA }));
  assert.equal(other.status, 200, "the other home sends its own list");
  assert.deepEqual(await ids(other), ["light.parents", "sensor.shared"]);
  assert.notEqual(other.headers.get("etag"), etagA);

  // two homes that report exactly the same list still get different validators
  a.entities = { "sensor.shared": "1" };
  b.entities = { "sensor.shared": "1" };
  forgetStates();
  const [x, y] = await Promise.all([statesReply(get("/api/ha/states", { [HOME_HEADER]: idA })), statesReply(get("/api/ha/states", { [HOME_HEADER]: idB }))]);
  assert.equal(await x.text(), await y.text(), "identical lists");
  assert.notEqual(x.headers.get("etag"), y.headers.get("etag"), "different validators");
});

test("a home that is off answers 502 in plain words while the others carry on; the Homes list remembers why", async () => {
  const { a, b, idA, idB, db } = await setup();
  await a.close();
  const down = await statesReply(get("/api/ha/states", { [HOME_HEADER]: idA }));
  assert.equal(down.status, 502);
  const text = await down.text();
  assert.ok(!text.includes(String(new URL(a.url).port)) && !ALL_TOKENS.some((t) => text.includes(t)), "no address and no token in the error");
  const ok = await statesReply(get("/api/ha/states", { [HOME_HEADER]: idB }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ids(ok), ["light.parents", "sensor.shared"]);
  assert.equal(getHome(db, idA).lastError, "Nothing answered at that address and port. Home Assistant is usually on port 8123.");
  assert.equal(getHome(db, idB).lastError, null);
  assert.ok(getHome(db, idB).lastOkAt !== null);
  assert.ok(b.seen.length >= 1);
});

test("a refused token is told as such, and an unknown home never reaches any Home Assistant", async () => {
  const { main, a, b, idA } = await setup();
  const db = getDb();
  db.prepare("UPDATE ha_connections SET token_enc = ? WHERE id = ?").run("v1.x.y.z", idA);
  const res = await statesReply(get("/api/ha/states", { [HOME_HEADER]: "abcdef123456" }));
  assert.equal(res.status, 404);
  assert.deepEqual([main.seen.length, a.seen.length, b.seen.length], [0, 0, 0]);
});

test("a wrong token on the Home Assistant side is a 502 that says so in the Homes list, and never shows the token", async () => {
  const { a, idA, db } = await setup();
  a.entities = {};
  db.prepare("UPDATE ha_connections SET base_url = ? WHERE id = ?").run(a.url, idA);
  const wrong = await spawn("someone-elses-token-3333", {});
  db.prepare("UPDATE ha_connections SET base_url = ? WHERE id = ?").run(wrong.url, idA);
  const res = await statesReply(get("/api/ha/states", { [HOME_HEADER]: idA }));
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.ok(!ALL_TOKENS.some((t) => text.includes(t)));
  assert.equal(getHome(db, idA).lastError, "Home Assistant refused the token.");
});

// ---- services and the per-home attribute cache ----------------------------------------------------------------------------------------

test("a service call goes to the home of the request only", async () => {
  const { main, a, b, idA } = await setup();
  const req = get("/api/ha/service", { [HOME_HEADER]: idA });
  const r = await callHaService({ domain: "light", service: "turn_off", entity_id: "light.cabin" }, haFetchFor(req));
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(a.seen.map((s) => `${s.method} ${s.path}`), ["POST /api/services/light/turn_off"]);
  assert.deepEqual([main.seen.length, b.seen.length], [0, 0]);
});

test("the one fetch function of a home is kept (so its attribute cache works) and replaced when its address or token changes", async () => {
  const { idA, db } = await setup();
  const first = haFor(resolveHa(get("/x", { [HOME_HEADER]: idA })));
  assert.equal(haFor(resolveHa(get("/x", { [HOME_HEADER]: idA }))), first);
  db.prepare("UPDATE ha_connections SET base_url = 'http://127.0.0.1:9' WHERE id = ?").run(idA);
  assert.notEqual(haFor(resolveHa(get("/x", { [HOME_HEADER]: idA }))), first);
});

test("an extra home's address is checked again at call time: a link-local address saved by hand is never called", async () => {
  const { idA, db } = await setup();
  db.prepare("UPDATE ha_connections SET base_url = 'http://169.254.169.254' WHERE id = ?").run(idA);
  await assert.rejects(() => haFor(resolveHa(get("/x", { [HOME_HEADER]: idA })))("states"), HttpError);
});

test("an unknown home on a route that hands the fetch to a helper is refused before anything runs", async () => {
  await setup();
  assert.throws(() => haFetchFor(get("/x", { [HOME_HEADER]: "abcdef123456" })), HttpError);
  delete process.env.HA_URL;
  const lazy = haFetchFor(get("/x")); // the main home without settings still fails on the first call, as it always has
  await assert.rejects(() => lazy("states"), /HA_URL \/ HA_TOKEN not set/);
});
