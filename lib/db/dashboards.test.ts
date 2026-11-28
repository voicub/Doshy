import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_DASHBOARDS,
  UNDO_WINDOW_MS,
  createDashboard,
  defaultDashboardId,
  getThumb,
  listDashboards,
  parseCreateBody,
  parseDashboardId,
  parseOrderBody,
  parsePatchBody,
  patchDashboard,
  purgeDashboards,
  setDashboardOrder,
  setDefaultDashboard,
  setThumb,
  softDeleteDashboard,
  undeleteDashboard,
  type Dashboard,
} from "./dashboards.ts";
import { dbInfo } from "./info.ts";
import { HttpError } from "./errors.ts";
import { MIGRATIONS } from "./migrations.ts";
import { getPlan, listVersions, putPlan, saveVersion } from "./plans.ts";
import { getSettings, setSettings } from "./settings.ts";
import { planJson, tempDb } from "./testDb.ts";

const refused = (status: number, code?: string) => (e: unknown) => e instanceof HttpError && e.status === status && (code === undefined || e.code === code);
const create = (db: Parameters<typeof createDashboard>[0], name: string, now = 1000) => createDashboard(db, parseCreateBody({ name }), now);
const names = (db: Parameters<typeof listDashboards>[0]) => listDashboards(db).dashboards.map((d) => d.name);
/** The smallest valid WebP header: enough for the "is it a WebP" check. */
const webp = (extra = 0) => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(extra)]);

test("a new database has one plan, 'Home', which is the home plan", () => {
  const t = tempDb();
  const { defaultId, dashboards } = listDashboards(t.db);
  assert.equal(defaultId, 1);
  assert.deepEqual(dashboards.map((d) => [d.id, d.name, d.rev, d.bytes, d.summary]), [[1, "Home", 0, 0, null]]);
  t.cleanup();
});

test("a new plan can start blank or with a plan, and the list shows the plan's revision, size and counts without reading it", () => {
  const t = tempDb();
  const blank = createDashboard(t.db, parseCreateBody({ name: "  Garden <b>house</b> ", icon: "tree", color: "#ABCDEF", description: "out back" }), 5000);
  assert.deepEqual({ name: blank.name, icon: blank.icon, color: blank.color, description: blank.description, rev: blank.rev }, { name: "Garden b house /b", icon: "tree", color: "#abcdef", description: "out back", rev: 0 });
  const plan = { walls: [{ id: "w" }], openings: [], rooms: [], items: [{ id: "a" }, { id: "b" }] };
  const withPlan = createDashboard(t.db, parseCreateBody({ name: "Flat", plan, format: 15 }), 6000);
  assert.deepEqual({ rev: withPlan.rev, format: withPlan.format, summary: withPlan.summary, bytes: withPlan.bytes }, { rev: 1, format: 15, summary: { items: 2, walls: 1, rooms: 0 }, bytes: JSON.stringify(plan).length });
  assert.deepEqual(JSON.parse(getPlan(t.db, withPlan.id)!.json), plan);
  assert.equal(getPlan(t.db, 1), null, "the home plan was not touched");
  t.cleanup();
});

test("names are 1 to 60 characters and unique ignoring case, among plans that are not deleted", () => {
  const t = tempDb();
  assert.throws(() => create(t.db, "home"), refused(409, "name_taken"));
  assert.throws(() => create(t.db, "HOME"), refused(409, "name_taken"));
  const a = create(t.db, "Attic");
  assert.throws(() => patchDashboard(t.db, a.id, parsePatchBody({ name: "hOmE" })), refused(409, "name_taken"));
  assert.equal(patchDashboard(t.db, a.id, parsePatchBody({ name: "ATTIC" })).name, "ATTIC", "a plan may change the case of its own name");
  assert.throws(() => parseCreateBody({ name: "   " }), refused(400));
  assert.throws(() => parseCreateBody({ name: 5 }), refused(400));
  assert.throws(() => parseCreateBody({}), refused(400));
  assert.equal(parseCreateBody({ name: "x".repeat(100) }).name?.length, 60);
  softDeleteDashboard(t.db, a.id, 2000);
  assert.equal(create(t.db, "attic").name, "attic", "a deleted plan's name is free again");
  t.cleanup();
});

test("icon, colour and description are checked", () => {
  for (const bad of [{ icon: "Has Space" }, { icon: "x".repeat(33) }, { icon: 5 }, { color: "red" }, { color: "#12345" }, { color: "#12345g" }, { description: 5 }]) {
    assert.throws(() => parsePatchBody(bad), refused(400), JSON.stringify(bad));
  }
  assert.deepEqual(parsePatchBody({ icon: "", color: "", description: "" }), { icon: "", color: "", description: "" }, "empty clears them");
  assert.throws(() => parsePatchBody({}), refused(400));
  assert.equal(parsePatchBody({ description: "d".repeat(500) }).description?.length, 280);
});

test("at most 24 plans (deleted ones do not count)", () => {
  const t = tempDb();
  for (let i = 1; i < MAX_DASHBOARDS; i++) create(t.db, `Plan ${i}`);
  assert.equal(listDashboards(t.db).dashboards.length, MAX_DASHBOARDS);
  assert.throws(() => create(t.db, "One too many"), refused(409, "too_many"));
  const victim = listDashboards(t.db).dashboards[5];
  softDeleteDashboard(t.db, victim.id, 5000);
  const extra = create(t.db, "Fits now");
  assert.throws(() => undeleteDashboard(t.db, victim.id, 6000), refused(409, "too_many"), "bringing one back also respects the limit");
  softDeleteDashboard(t.db, extra.id, 7000);
  assert.equal(undeleteDashboard(t.db, victim.id, 8000).id, victim.id);
  t.cleanup();
});

test("a copy takes the working plan and the plan's settings row but not the versions, and gets its own unique name", () => {
  const t = tempDb();
  putPlan(t.db, 1, { json: planJson("one"), baseRev: 0, format: 7, summary: JSON.stringify({ items: 0, walls: 0, rooms: 0 }) }, 1000);
  putPlan(t.db, 1, { json: planJson("two"), baseRev: 1, format: 7, summary: JSON.stringify({ items: 0, walls: 0, rooms: 0 }) }, 2000);
  saveVersion(t.db, 1, "keep", 3000);
  setSettings(t.db, { "housey-plan.1": { state: { time: 9 }, version: 3 } }, 4000);
  assert.equal(listVersions(t.db, 1).length, 2);
  const copy = createDashboard(t.db, parseCreateBody({ fromId: 1 }), 5000);
  assert.equal(copy.name, "Home copy");
  assert.equal(createDashboard(t.db, parseCreateBody({ fromId: 1 }), 5001).name, "Home copy 2");
  assert.equal(createDashboard(t.db, parseCreateBody({ fromId: 1, name: "Mine" }), 5002).name, "Mine");
  const dup = getPlan(t.db, copy.id)!;
  assert.deepEqual({ rev: dup.rev, format: dup.format, marker: JSON.parse(dup.json).marker }, { rev: 1, format: 7, marker: "two" }, "a copy starts at revision 1");
  assert.deepEqual(listVersions(t.db, copy.id), []);
  assert.equal(listVersions(t.db, 1).length, 2, "the original keeps its versions");
  assert.deepEqual(getSettings(t.db)[`housey-plan.${copy.id}`].value, { state: { time: 9 }, version: 3 });
  assert.throws(() => createDashboard(t.db, parseCreateBody({ fromId: 99 })), refused(404));
  t.cleanup();
});

test("copying a plan copies its thumbnail inside SQLite too", () => {
  const t = tempDb();
  setThumb(t.db, 1, webp());
  const copy = createDashboard(t.db, parseCreateBody({ fromId: 1 }), 5000);
  assert.equal(getThumb(t.db, copy.id)?.data.length, webp().length);
  assert.equal(copy.thumbRev, 1);
  t.cleanup();
});

test("delete is soft: the plan disappears from the list at once and its data stays until it is purged", () => {
  const t = tempDb();
  const b = create(t.db, "Beta");
  putPlan(t.db, b.id, { json: planJson("b"), baseRev: 0, format: 1 }, 1000);
  setSettings(t.db, { [`housey-plan.${b.id}`]: { state: {}, version: 1 } });
  softDeleteDashboard(t.db, b.id, 10_000);
  assert.deepEqual(names(t.db), ["Home"]);
  assert.ok(getPlan(t.db, b.id), "the plan rows are still there");
  assert.throws(() => patchDashboard(t.db, b.id, { name: "x" }), refused(404));
  assert.equal(undeleteDashboard(t.db, b.id, 20_000).name, "Beta");
  assert.equal(getPlan(t.db, b.id)?.rev, 1, "and nothing was lost");
  assert.equal(undeleteDashboard(t.db, b.id, 30_000).name, "Beta", "undoing twice (two devices) is fine");
  t.cleanup();
});

test("the home plan and the last plan cannot be deleted", () => {
  const t = tempDb();
  assert.throws(() => softDeleteDashboard(t.db, 1), refused(409, "is_default"));
  const b = create(t.db, "Beta");
  setDefaultDashboard(t.db, b.id);
  softDeleteDashboard(t.db, 1, 5000); // no longer the home plan
  assert.throws(() => softDeleteDashboard(t.db, b.id), refused(409));
  assert.throws(() => softDeleteDashboard(t.db, 99), refused(404));
  t.cleanup();
});

test("an undo after a week is refused, and a plan whose name was taken meanwhile comes back under another name", () => {
  const t = tempDb();
  const b = create(t.db, "Beta");
  softDeleteDashboard(t.db, b.id, 1000);
  assert.throws(() => undeleteDashboard(t.db, b.id, 1000 + UNDO_WINDOW_MS + 1), refused(410, "gone"));
  assert.equal(undeleteDashboard(t.db, b.id, 1000 + UNDO_WINDOW_MS).name, "Beta");
  softDeleteDashboard(t.db, b.id, 2000);
  create(t.db, "beta");
  assert.equal(undeleteDashboard(t.db, b.id, 3000).name, "Beta 2");
  t.cleanup();
});

test("purging removes plans deleted more than a week ago with their plans, versions and settings, and nothing else", () => {
  const t = tempDb();
  const old = create(t.db, "Old");
  const recent = create(t.db, "Recent");
  for (const d of [old, recent]) {
    putPlan(t.db, d.id, { json: planJson(d.name), baseRev: 0, format: 1 }, 1000);
    saveVersion(t.db, d.id, "v", 1000);
    setSettings(t.db, { [`housey-plan.${d.id}`]: { state: {}, version: 1 } });
  }
  setSettings(t.db, { "housey-sky": { state: {}, version: 1 } });
  softDeleteDashboard(t.db, old.id, 1000);
  softDeleteDashboard(t.db, recent.id, 1000 + UNDO_WINDOW_MS);
  assert.equal(purgeDashboards(t.db, 1000 + UNDO_WINDOW_MS + 1), 1);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM dashboards WHERE id = ?").get(old.id)?.n, 0);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM plans WHERE dashboard_id = ?").get(old.id)?.n, 0);
  assert.deepEqual(Object.keys(getSettings(t.db)).sort(), ["housey-plan." + recent.id, "housey-sky"]);
  assert.equal(listVersions(t.db, recent.id).length, 1, "the plan deleted a moment ago is still restorable");
  assert.equal(undeleteDashboard(t.db, recent.id, 1000 + UNDO_WINDOW_MS + 2).name, "Recent");
  assert.equal(purgeDashboards(t.db, 1000 + 3 * UNDO_WINDOW_MS), 0);
  t.cleanup();
});

test("home plan rules: a plan can be made the home plan; a missing one falls back to the first plan that exists", () => {
  const t = tempDb();
  const b = create(t.db, "Beta");
  setDefaultDashboard(t.db, b.id);
  assert.equal(defaultDashboardId(t.db), b.id);
  assert.equal(listDashboards(t.db).defaultId, b.id);
  assert.throws(() => setDefaultDashboard(t.db, 99), refused(404));
  t.db.prepare("UPDATE dashboards SET deleted_at = 1 WHERE id = ?").run(b.id); // a restored file whose home plan is gone
  assert.equal(defaultDashboardId(t.db), 1);
  t.cleanup();
});

test("plans can be put in any order; plans not listed follow in their old order, unknown ids are ignored", () => {
  const t = tempDb();
  const [b, c, d] = ["B", "C", "D"].map((n) => create(t.db, n));
  assert.deepEqual(names(t.db), ["Home", "B", "C", "D"]);
  setDashboardOrder(t.db, [d.id, 99, b.id, d.id]);
  assert.deepEqual(names(t.db), ["D", "B", "Home", "C"]);
  assert.equal(c.sort < d.sort, true);
  assert.throws(() => parseOrderBody({ ids: [1, "2"] }), refused(400));
  assert.throws(() => parseOrderBody({ ids: Array(100).fill(1) }), refused(400));
  assert.throws(() => parseOrderBody({}), refused(400));
  t.cleanup();
});

test("thumbnails must be small WebP images, and each upload bumps thumbRev", () => {
  const t = tempDb();
  assert.equal(getThumb(t.db, 1), null);
  assert.equal(setThumb(t.db, 1, webp(10)), 1);
  assert.equal(setThumb(t.db, 1, webp(20)), 2);
  assert.equal(getThumb(t.db, 1)?.rev, 2);
  assert.equal(listDashboards(t.db).dashboards[0].thumbRev, 2);
  assert.throws(() => setThumb(t.db, 1, Buffer.from("not an image at all")), refused(400));
  assert.throws(() => setThumb(t.db, 1, webp(64 * 1024)), refused(413));
  assert.throws(() => setThumb(t.db, 99, webp()), refused(404));
  t.cleanup();
});

test("a plan id in a URL is digits only", () => {
  assert.equal(parseDashboardId("12"), 12);
  for (const bad of ["", "a", "1a", "-1", "1.5", "1e3", "12345678901"]) assert.throws(() => parseDashboardId(bad), refused(404), bad);
});

test("the Data panel numbers are per plan, and the plans list is the same as the dashboards in them", () => {
  const t = tempDb();
  const b = create(t.db, "Beta");
  putPlan(t.db, 1, { json: planJson("a"), baseRev: 0, format: 1 }, 1000);
  putPlan(t.db, b.id, { json: planJson("bb"), baseRev: 0, format: 1 }, 2000);
  saveVersion(t.db, b.id, "x", 3000);
  const info = dbInfo(t.db);
  const byId = (d: Dashboard) => [d.id, d.name];
  assert.deepEqual(info.dashboards.map((d) => [d.id, d.name]), listDashboards(t.db).dashboards.map(byId));
  assert.deepEqual(info.dashboards.map((d) => d.versions), [0, 1]);
  assert.equal(info.versions, 1);
  assert.equal(info.plan?.rev, 1, "`plan` is the home plan's");
  assert.equal(info.schema, MIGRATIONS.length);
  t.cleanup();
});
