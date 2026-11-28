import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { purgeDashboards, softDeleteDashboard, createDashboard, parseCreateBody, UNDO_WINDOW_MS } from "../db/dashboards.ts";
import { HttpError } from "../db/errors.ts";
import { tempDb } from "../db/testDb.ts";
import { MAX_LINKS_PER_PLAN, createLink, findLink, isExpired, listLinks, parseNewLink, revokeLink, touchLink, TOUCH_EVERY_MS, type NewLink } from "./guestLinks.ts";
import { hashToken } from "./guestSecrets.ts";

const NOW = 1_800_000_000_000;
const base: NewLink = { dashboardId: 1, label: "", pin: null, expires: "7d", live: false, location: false };
const refused = (status: number, code?: string) => (e: unknown) => e instanceof HttpError && e.status === status && (!code || e.code === code);

/** Every value in every table of the database, as text: what a stolen database file would show. */
function everythingStored(db: DatabaseSync): string {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => String(r.name));
  return tables.map((t) => JSON.stringify(db.prepare(`SELECT * FROM "${t}"`).all())).join("\n");
}

test("a new link comes with its token once; the database holds only the token's hash and the PIN's salted hash", async () => {
  const t = tempDb();
  const { link, token } = await createLink(t.db, { ...base, pin: "482913", label: "Mum's iPad" }, NOW);
  assert.equal(link.pin, true);
  assert.equal(link.label, "Mum's iPad");
  assert.equal(link.expiresAt, NOW + 7 * 24 * 3_600_000);
  const stored = everythingStored(t.db);
  assert.ok(!stored.includes(token), "the address is not in the database");
  assert.ok(!stored.includes("482913"), "neither is the PIN");
  assert.ok(stored.includes(hashToken(token)));
  assert.equal(findLink(t.db, token)?.id, link.id);
  assert.ok(!JSON.stringify(listLinks(t.db, 1, NOW)).includes(token), "the list never carries a token");
  t.cleanup();
});

test("a token finds its link; a changed, malformed or unknown one finds nothing", async () => {
  const t = tempDb();
  const { token } = await createLink(t.db, base, NOW);
  for (const wrong of [token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"), token.slice(1), `${token}x`, "", "' OR 1=1 --", "../../etc/passwd"]) assert.equal(findLink(t.db, wrong), null, wrong);
  t.cleanup();
});

test("how long a link works: an hour, a day, a week or never, and not anything else", async () => {
  const t = tempDb();
  const HOUR = 3_600_000;
  const expiry = async (expires: NewLink["expires"]) => (await createLink(t.db, { ...base, expires }, NOW)).link.expiresAt;
  assert.equal(await expiry("1h"), NOW + HOUR);
  assert.equal(await expiry("1d"), NOW + 24 * HOUR);
  assert.equal(await expiry("never"), null);
  assert.equal(await expiry("7d"), NOW + 7 * 24 * HOUR);
  assert.equal(isExpired({ expiresAt: NOW + HOUR }, NOW + HOUR - 1), false);
  assert.equal(isExpired({ expiresAt: NOW + HOUR }, NOW + HOUR), true);
  assert.equal(isExpired({ expiresAt: null }, NOW * 10), false);
  // the end is exclusive: at the stroke of the hour the link is over
  for (const bad of ["2d", "forever", "", 7, null, undefined]) assert.throws(() => parseNewLink({ ...base, expires: bad }), refused(400), String(bad));
  t.cleanup();
});


test("a plan can have 10 links; an eleventh is refused until one is revoked; every plan counts for itself", async () => {
  const t = tempDb();
  const second = createDashboard(t.db, parseCreateBody({ name: "Beach house" }), NOW);
  const ids: string[] = [];
  for (let i = 0; i < MAX_LINKS_PER_PLAN; i++) ids.push((await createLink(t.db, base, NOW)).link.id);
  await assert.rejects(createLink(t.db, base, NOW), refused(409, "too_many"));
  assert.equal((await createLink(t.db, { ...base, dashboardId: second.id }, NOW)).link.label, "");
  assert.equal(revokeLink(t.db, ids[0]), true);
  await createLink(t.db, base, NOW);
  t.cleanup();
});

test("revoking removes the link at once; a second try, or an id that is not one, says no", async () => {
  const t = tempDb();
  const { link, token } = await createLink(t.db, base, NOW);
  assert.equal(revokeLink(t.db, link.id), true);
  assert.equal(findLink(t.db, token), null);
  assert.equal(revokeLink(t.db, link.id), false);
  assert.equal(revokeLink(t.db, "x'; DROP TABLE guest_links; --"), false);
  assert.deepEqual(listLinks(t.db, 1, NOW), []);
  t.cleanup();
});

test("the list is newest first, shows who has used a link, and `last used` is written at most once a minute", async () => {
  const t = tempDb();
  const a = await createLink(t.db, { ...base, label: "A" }, NOW);
  const b = await createLink(t.db, { ...base, label: "B", live: true, location: true }, NOW + 5);
  assert.deepEqual(listLinks(t.db, 1, NOW + 10).map((l) => l.label), ["B", "A"]);
  assert.deepEqual([b.link.live, b.link.location, a.link.live], [true, true, false]);
  const row = findLink(t.db, a.token)!;
  touchLink(t.db, row, NOW + 100);
  assert.equal(listLinks(t.db, 1, NOW + 200).find((l) => l.label === "A")?.lastUsedAt, NOW + 100);
  touchLink(t.db, findLink(t.db, a.token)!, NOW + 100 + TOUCH_EVERY_MS - 1);
  assert.equal(listLinks(t.db, 1, NOW + 200).find((l) => l.label === "A")?.lastUsedAt, NOW + 100, "not again within a minute");
  touchLink(t.db, findLink(t.db, a.token)!, NOW + 100 + TOUCH_EVERY_MS);
  assert.equal(listLinks(t.db, 1, NOW + 200).find((l) => l.label === "A")?.lastUsedAt, NOW + 100 + TOUCH_EVERY_MS);
  t.cleanup();
});

test("an expired link stays visible as expired for a week, then goes", async () => {
  const t = tempDb();
  const { link } = await createLink(t.db, { ...base, expires: "1h" }, NOW);
  const later = NOW + 3 * 3_600_000;
  assert.equal(listLinks(t.db, 1, later)[0].expired, true);
  await createLink(t.db, base, NOW + 8 * 24 * 3_600_000);
  assert.ok(!listLinks(t.db, 1, NOW).some((l) => l.id === link.id), "dropped when the next link is made");
  t.cleanup();
});

test("links belong to a plan: none for a plan that does not exist; they go when the plan is purged", async () => {
  const t = tempDb();
  await assert.rejects(createLink(t.db, { ...base, dashboardId: 99 }, NOW), refused(404));
  assert.throws(() => listLinks(t.db, 99), refused(404));
  const d = createDashboard(t.db, parseCreateBody({ name: "Temp" }), NOW);
  const { token } = await createLink(t.db, { ...base, dashboardId: d.id }, NOW);
  softDeleteDashboard(t.db, d.id, NOW);
  assert.equal(purgeDashboards(t.db, NOW + UNDO_WINDOW_MS + 1), 1);
  assert.equal(findLink(t.db, token), null, "no orphan row keeps a working token");
  t.cleanup();
});

test("a create request is checked: the plan, the PIN's digits, the choices, the types; the name is plain text; unknown fields are ignored", () => {
  const named = parseNewLink({ ...base, label: "  <b>Hi</b>\n there  ", extra: { __proto__: 1 } });
  assert.doesNotMatch(named.label, /[<>\n]/, "markup and line breaks are taken out of what the owner types");
  assert.deepEqual({ ...named, label: "" }, base);
  assert.equal(parseNewLink({ ...base, pin: "" }).pin, null);
  assert.equal(parseNewLink({ ...base, pin: "12345678" }).pin, "12345678");
  for (const body of [null, [], "x", 5, {}, { ...base, dashboardId: "1" }, { ...base, dashboardId: 0 }, { ...base, dashboardId: 1.5 }, { ...base, pin: "123" }, { ...base, pin: "123456789" }, { ...base, pin: "12ab" }, { ...base, pin: 1234 }, { ...base, label: 5 }, { ...base, live: "yes" }, { ...base, location: 1 }]) {
    assert.throws(() => parseNewLink(body), refused(400), JSON.stringify(body));
  }
});
