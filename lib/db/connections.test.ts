import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, test } from "node:test";
import { forgetKeys } from "../server/secretBox.ts";
import { backupDir, openDb } from "./connection.ts";
import {
  MAX_HOMES,
  assertHomesEditable,
  createHome,
  deleteHome,
  getHome,
  homeOfPlan,
  homeSecret,
  homesLockedReason,
  listHomes,
  noteHomeResult,
  parseHomePatch,
  parseNewHome,
  plansUsing,
  updateHome,
} from "./connections.ts";
import { createDashboard, listDashboards, parseCreateBody, parsePatchBody, patchDashboard, softDeleteDashboard } from "./dashboards.ts";
import { HttpError } from "./errors.ts";
import { MIGRATIONS, migrate, userVersion } from "./migrations.ts";
import { tempDb, v3Fixture } from "./testDb.ts";

afterEach(() => forgetKeys());

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.first-token-payload.sig-a1b2";
const home = (over: Record<string, unknown> = {}) => parseNewHome({ name: "Holiday house", url: "http://192.168.7.5:8123", token: TOKEN, ...over });
const refused = (fn: () => unknown, status = 400) => assert.throws(fn, (e: unknown) => e instanceof HttpError && e.status === status && e.message.length > 8);
const newPlan = (db: DatabaseSync, name: string, extra: Record<string, unknown> = {}) => createDashboard(db, parseCreateBody({ name, ...extra }));

// ---- migration 6 ------------------------------------------------------------------------------------------------------------------------

/** A database exactly as the build before multi-home left it (schema 5): the v3 fixture moved forward to 5 with its plan and versions. */
function v5Fixture() {
  const fx = v3Fixture();
  const raw = new DatabaseSync(fx.file);
  raw.exec("PRAGMA journal_mode = WAL");
  migrate(raw, MIGRATIONS.slice(0, 5));
  assert.equal(userVersion(raw), 5);
  raw.close();
  return fx;
}

test("migration 6 adds the homes table and the plan link without touching a plan, keeps a copy of the old file, and a second open changes nothing", () => {
  const fx = v5Fixture();
  const db = openDb(fx.file);
  assert.equal(userVersion(db), MIGRATIONS.length);
  assert.equal(String(db.prepare("SELECT json FROM plans WHERE dashboard_id = 1 AND active = 1").get()?.json), fx.planJson, "the plan is byte for byte as it was");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ha_connections").get()?.n, 0);
  assert.deepEqual(db.prepare("SELECT id, ha_connection FROM dashboards").all().map((r) => [r.id, r.ha_connection]), [[1, null]], "every plan starts on the main home");

  const copies = readdirSync(backupDir(fx.file)).filter((n) => /^housey-before-v\d+-\d+\.db$/.test(n));
  assert.equal(copies.length, 1);
  const old = new DatabaseSync(join(backupDir(fx.file), copies[0]), { readOnly: true });
  assert.equal(userVersion(old), 5, "the copy is the schema-5 file as it was");
  assert.equal(old.prepare("SELECT name FROM sqlite_master WHERE name = 'ha_connections'").get(), undefined);
  old.close();

  db.close();
  const again = openDb(fx.file);
  assert.equal(readdirSync(backupDir(fx.file)).filter((n) => n.startsWith("housey-before-v")).length, 1, "no second copy");
  assert.equal(migrate(again), MIGRATIONS.length);
  again.close();
  fx.cleanup();
});

test("a database from a newer build is refused, never downgraded", () => {
  const t = tempDb();
  t.db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
  t.db.close();
  assert.throws(() => openDb(t.file), /newer/);
  assert.equal(userVersion(new DatabaseSync(t.file)), MIGRATIONS.length + 1);
  t.cleanup();
});

test("deleting a home sends its plans back to the main home by itself (the link is a real reference)", () => {
  const t = tempDb();
  const h = createHome(t.db, home());
  const plan = newPlan(t.db, "Cabin", { haConnection: h.id });
  assert.equal(plan.haConnection, h.id);
  t.db.prepare("DELETE FROM ha_connections WHERE id = ?").run(h.id); // even a delete that skips our checks
  assert.equal(homeOfPlan(t.db, plan.id), null);
  t.cleanup();
});

// ---- storage ----------------------------------------------------------------------------------------------------------------------------

test("a home is stored with a sealed token: the database file never holds the token, and the list never returns it", () => {
  const t = tempDb();
  const h = createHome(t.db, home());
  assert.deepEqual(Object.keys(h).sort(), ["createdAt", "hint", "id", "lastError", "lastOkAt", "name", "needsToken", "plans", "url"]);
  assert.equal(h.hint, "a1b2");
  assert.equal(h.needsToken, false);
  assert.match(h.id, /^[a-z0-9]{6,16}$/);
  assert.ok(!JSON.stringify(listHomes(t.db)).includes("first-token"));
  t.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  t.db.close();
  const bytes = readFileSync(t.file).toString("latin1");
  assert.ok(!bytes.includes("first-token") && !bytes.includes(TOKEN), "no token in the database file");
  t.cleanup();
});

test("the server's own call gets the token back; a restored database whose key is another one asks for the token again, without crashing", () => {
  const t = tempDb();
  const h = createHome(t.db, home());
  assert.deepEqual(homeSecret(t.db, h.id), { baseUrl: "http://192.168.7.5:8123", token: TOKEN });
  // the same row in a database with another key file beside it = a backup restored on another machine
  const other = tempDb();
  const row = t.db.prepare("SELECT * FROM ha_connections WHERE id = ?").get(h.id);
  other.db.prepare("INSERT INTO ha_connections (id, name, base_url, token_enc, token_hint, created_at, sort) VALUES (?, ?, ?, ?, ?, ?, ?)").run(String(row?.id), String(row?.name), String(row?.base_url), String(row?.token_enc), String(row?.token_hint), 1, 1);
  const [only] = listHomes(other.db);
  assert.equal(only.needsToken, true);
  assert.equal(only.hint, "a1b2");
  assert.throws(() => homeSecret(other.db, h.id), (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === "token_needed");
  const fixed = updateHome(other.db, h.id, { token: "brand-new-token-0000" });
  assert.equal(fixed.needsToken, false);
  assert.equal(homeSecret(other.db, h.id).token, "brand-new-token-0000");
  other.cleanup();
  t.cleanup();
});

test("a hand-edited row with an unsealed token is not trusted", () => {
  const t = tempDb();
  const h = createHome(t.db, home());
  t.db.prepare("UPDATE ha_connections SET token_enc = ? WHERE id = ?").run("plain-text-token", h.id);
  assert.equal(getHome(t.db, h.id).needsToken, true);
  assert.throws(() => homeSecret(t.db, h.id), HttpError);
  t.cleanup();
});

// ---- validation -------------------------------------------------------------------------------------------------------------------------

test("what a new home needs is checked: name, address, token, sizes", () => {
  refused(() => parseNewHome(null));
  refused(() => parseNewHome([]));
  refused(() => parseNewHome("x"));
  refused(() => home({ name: "" }));
  refused(() => home({ name: "   " }));
  refused(() => home({ name: 42 }));
  refused(() => home({ name: "main home" }), 400); // the name of the built-in home
  refused(() => home({ name: "MAIN HOME" }));
  refused(() => home({ url: "file:///etc/passwd" }));
  refused(() => home({ url: "http://user:pw@ha.local" }));
  refused(() => home({ url: "http://169.254.169.254" }));
  refused(() => home({ url: "x".repeat(10_000) }));
  refused(() => home({ token: "" }));
  refused(() => home({ token: "has a space" }));
  refused(() => home({ token: "line\nbreak" }));
  refused(() => home({ token: "tökén" }));
  refused(() => home({ token: "a".repeat(5000) }));
  refused(() => home({ token: undefined }));
  assert.equal(home({ name: `  ${"n".repeat(500)}  ` }).name.length, 40, "a huge name is cut, not stored whole");
  assert.equal(home({ name: "<b>Flat</b>" }).name, "b Flat /b", "markup characters become spaces");
  assert.equal(home({ token: `  ${TOKEN}\n` }).token, TOKEN, "a pasted token loses its surrounding spaces");
});

test("names are unique ignoring case, at most 8 homes, and the main home's name is taken", () => {
  const t = tempDb();
  createHome(t.db, home());
  refused(() => createHome(t.db, home({ name: "holiday HOUSE" })), 409);
  for (let i = 1; i < MAX_HOMES; i++) createHome(t.db, home({ name: `Home ${i}` }));
  refused(() => createHome(t.db, home({ name: "One too many" })), 409);
  assert.equal(listHomes(t.db).length, MAX_HOMES);
  t.cleanup();
});

test("rename and re-token are easy, but a new address needs the token typed again (a saved token is never sent to an address it was not saved for)", () => {
  const t = tempDb();
  const a = createHome(t.db, home());
  const b = createHome(t.db, home({ name: "Parents" }));
  assert.equal(updateHome(t.db, a.id, { name: "Holiday home" }).name, "Holiday home");
  assert.equal(updateHome(t.db, a.id, parseHomePatch({ url: "http://192.168.7.5:8123/" })).url, "http://192.168.7.5:8123", "the same origin: no token needed");
  refused(() => updateHome(t.db, a.id, { url: "http://evil.example:8123" }));
  assert.equal(homeSecret(t.db, a.id).baseUrl, "http://192.168.7.5:8123", "nothing changed by the refused edit");
  const moved = updateHome(t.db, a.id, { url: "https://ha.example.org", token: "another-token-9999" });
  assert.equal(moved.url, "https://ha.example.org");
  assert.equal(moved.hint, "9999");
  assert.deepEqual(homeSecret(t.db, a.id), { baseUrl: "https://ha.example.org", token: "another-token-9999" });
  refused(() => updateHome(t.db, a.id, { name: "parents" }), 409);
  refused(() => updateHome(t.db, "nosuchhome1", { name: "x" }), 404);
  refused(() => updateHome(t.db, "../../etc", { name: "x" }), 404);
  assert.equal(homeSecret(t.db, b.id).token, TOKEN, "the other home is untouched");
  assert.deepEqual(Object.keys(parseHomePatch({ name: "x" })), ["name"]);
  t.cleanup();
});

test("a fresh token clears the old error; the status is written when it changes and not on every poll", () => {
  const t = tempDb();
  const h = createHome(t.db, home());
  noteHomeResult(t.db, h.id, "Home Assistant refused the token.", 1000);
  assert.equal(getHome(t.db, h.id).lastError, "Home Assistant refused the token.");
  t.db.prepare("UPDATE ha_connections SET last_error = 'changed behind its back' WHERE id = ?").run(h.id);
  noteHomeResult(t.db, h.id, "Home Assistant refused the token.", 2000); // same news within 30 s: no write
  assert.equal(getHome(t.db, h.id).lastError, "changed behind its back");
  noteHomeResult(t.db, h.id, null, 3000);
  assert.deepEqual([getHome(t.db, h.id).lastError, getHome(t.db, h.id).lastOkAt], [null, 3000]);
  noteHomeResult(t.db, h.id, "x".repeat(900), 4000);
  assert.equal(getHome(t.db, h.id).lastError?.length, 200);
  updateHome(t.db, h.id, { token: "renewed-token-0001" });
  assert.equal(getHome(t.db, h.id).lastError, null);
  t.cleanup();
});

// ---- plans and homes --------------------------------------------------------------------------------------------------------------------

test("a plan shows the main home until it is pointed at a home; a plan can be pointed back", () => {
  const t = tempDb();
  const h = createHome(t.db, home());
  const plain = newPlan(t.db, "Flat");
  assert.equal(plain.haConnection, null);
  assert.equal(newPlan(t.db, "Cabin", { haConnection: h.id }).haConnection, h.id);
  assert.equal(newPlan(t.db, "Annex", { haConnection: "main" }).haConnection, null, "'main' is the same as none");
  const p = patchDashboard(t.db, plain.id, parsePatchBody({ haConnection: h.id }));
  assert.equal(p.haConnection, h.id);
  assert.equal(patchDashboard(t.db, plain.id, parsePatchBody({ haConnection: null })).haConnection, null);
  assert.equal(listDashboards(t.db).dashboards.find((d) => d.id === plain.id)?.haConnection, null);
  t.cleanup();
});

test("a plan cannot be pointed at a home that is not there, or at something that is not an id", () => {
  const t = tempDb();
  refused(() => newPlan(t.db, "Ghost", { haConnection: "abcdef123456" }));
  refused(() => parsePatchBody({ haConnection: "../x" }));
  refused(() => parsePatchBody({ haConnection: 7 }));
  const plan = newPlan(t.db, "Real");
  refused(() => patchDashboard(t.db, plan.id, parsePatchBody({ haConnection: "abcdef123456" })));
  assert.equal(homeOfPlan(t.db, plan.id), null);
  assert.equal(listDashboards(t.db).dashboards.length, 2, "the refused create left no plan behind");
  t.cleanup();
});

test("a copy of a plan keeps its home", () => {
  const t = tempDb();
  const h = createHome(t.db, home());
  const src = newPlan(t.db, "Cabin", { haConnection: h.id });
  const copy = createDashboard(t.db, parseCreateBody({ fromId: src.id }));
  assert.equal(copy.haConnection, h.id);
  assert.equal(homeOfPlan(t.db, copy.id), h.id);
  t.cleanup();
});

test("deleting a home: refused while plans show it (with their names), allowed with 'move to the main home'; deleted plans do not block", () => {
  const t = tempDb();
  const h = createHome(t.db, home());
  const a = newPlan(t.db, "Cabin", { haConnection: h.id });
  const b = newPlan(t.db, "Boat", { haConnection: h.id });
  softDeleteDashboard(t.db, b.id);
  assert.deepEqual(plansUsing(t.db, h.id), ["Cabin"]);
  assert.equal(getHome(t.db, h.id).plans, 1);
  assert.throws(() => deleteHome(t.db, h.id, false), (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === "in_use" && e.message.includes("Cabin"));
  assert.equal(listHomes(t.db).length, 1);
  deleteHome(t.db, h.id, true);
  assert.equal(listHomes(t.db).length, 0);
  assert.equal(homeOfPlan(t.db, a.id), null);
  assert.equal(homeOfPlan(t.db, b.id), null, "a plan deleted a day ago comes back on the main home, not on a home that is gone");
  refused(() => deleteHome(t.db, h.id, true), 404);
  const c = createHome(t.db, home({ name: "Unused" }));
  deleteHome(t.db, c.id, false);
  assert.equal(listHomes(t.db).length, 0);
  t.cleanup();
});

// ---- switching homes off ----------------------------------------------------------------------------------------------------------------

test("DOSHY_ALLOW_CUSTOM_HA=0 and guest-only mode refuse to add or change homes; the default allows", () => {
  assert.equal(homesLockedReason({}), null);
  assert.equal(homesLockedReason({ DOSHY_ALLOW_CUSTOM_HA: "1" }), null);
  assert.match(homesLockedReason({ DOSHY_ALLOW_CUSTOM_HA: "0" }) ?? "", /switched off/);
  assert.match(homesLockedReason({ DOSHY_ALLOW_CUSTOM_HA: " 0 " }) ?? "", /switched off/);
  assert.match(homesLockedReason({ DOSHY_GUEST_ONLY: "1" }) ?? "", /guests only/);
  assert.throws(() => assertHomesEditable({ DOSHY_GUEST_ONLY: "1" }), (e: unknown) => e instanceof HttpError && e.status === 403);
  assert.doesNotThrow(() => assertHomesEditable({}));
});
