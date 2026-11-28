process.env.TZ = "Europe/Bucharest";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createHome, parseNewHome } from "../db/connections.ts";
import { createDashboard, parseCreateBody, patchDashboard, setDefaultDashboard } from "../db/dashboards.ts";
import { putPlan } from "../db/plans.ts";
import { tempDb } from "../db/testDb.ts";
import { MAX_TRIES } from "../curtainAuto.ts";
import { KEY, MAX_BACKOFF_MS, TICK_MS, curtainsOf, type Curtain, isRunning, lastActions, loadStore, nextDelay, startCurtainAutomation, stopCurtainAutomation, tick, type Deps } from "./curtainAutomation.ts";
import type { HaFetch } from "./haCall.ts";

const HOME = 1; // the plan every database starts with: also the default (home) plan
const freshCache = () => ({ id: null as number | null, rev: null as number | null, curtains: [] as Curtain[] });
afterEach(() => {
  stopCurtainAutomation();
  delete process.env.HOUSEY_AUTOMATION;
});

const item = (id: string, over: Record<string, unknown> = {}) => ({ id, kind: "lv_sheer_curtain_door", x: 0, y: 0, rot: 0, w: 1, d: 0.1, h: 2.4, entity: "cover.sheer", params: { blackoutEntity: "cover.blind" }, ...over });
const planWith = (items: unknown[]) => JSON.stringify({ walls: [], openings: [], rooms: [], items });

const entityOf = (body: unknown) => (body && typeof body === "object" && "entity_id" in body && typeof body.entity_id === "string" ? body.entity_id : "");

/** A fake Home Assistant: a sun, covers, and a record of every request. Nothing here can reach the network. */
function fakeHa(covers: Record<string, string> = { "cover.blind": "open" }) {
  const w = {
    sun: { state: "below_horizon", attributes: { elevation: -30, rising: true } } as { state: string; attributes: Record<string, unknown> } | undefined,
    covers: { ...covers },
    calls: [] as { path: string; method: string; body: unknown }[],
    down: false,
    refuse: false,
  };
  const ha: HaFetch = async (path, init) => {
    w.calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (w.down) throw new Error("fetch failed");
    const states = () => {
      const list: Record<string, unknown>[] = [{ entity_id: "light.kitchen", state: "on", attributes: {} }];
      if (w.sun) list.push({ entity_id: "sun.sun", ...w.sun });
      for (const [id, state] of Object.entries(w.covers)) list.push({ entity_id: id, state, attributes: state === "open" ? { current_position: 100 } : {} });
      return list;
    };
    if (path === "states") return Response.json(states());
    const single = /^states\/(.+)$/.exec(path);
    if (single) {
      const s = states().find((e) => e.entity_id === single[1]);
      return s ? Response.json(s) : new Response("not found", { status: 404 });
    }
    const m = /^services\/cover\/(close|open)_cover$/.exec(path);
    if (!m || init?.method !== "POST") return new Response("no", { status: 404 });
    if (w.refuse) return new Response("no", { status: 500 });
    const id = entityOf(JSON.parse(String(init.body)));
    w.covers[id] = m[1] === "close" ? "closed" : "open";
    return Response.json([]);
  };
  const services = () => w.calls.filter((c) => c.method === "POST").map((c) => `${c.path} ${entityOf(c.body)}`);
  return Object.assign(w, { ha, services });
}

function rig(items: unknown[] = [item("c1")], covers?: Record<string, string>) {
  const t = tempDb();
  putPlan(t.db, HOME, { json: planWith(items), baseRev: 0, format: 1 });
  const h = fakeHa(covers);
  const logs: string[] = [];
  let clock = new Date(2026, 5, 10, 3, 0);
  const deps: Deps = { db: () => t.db, ha: () => h.ha, now: () => clock, configured: () => true, log: { info: (m) => logs.push(`i ${m}`), error: (m) => logs.push(`e ${m}`) } };
  const cache = freshCache();
  return {
    t,
    h,
    logs,
    deps,
    /** Move the fake clock to day/time with the sun at `elevation`, and look once. */
    async look(day: number, hh: number, mm: number, elevation: number, rising: boolean) {
      clock = new Date(2026, 5, day, hh, mm);
      h.sun = { state: elevation >= 0 ? "above_horizon" : "below_horizon", attributes: { elevation, rising } };
      return tick(deps, cache);
    },
    cleanup: t.cleanup,
  };
}

test("curtainsOf takes window curtains with a linked cover and the dawn rule on, and nothing else", () => {
  const plan = planWith([
    item("a"),
    item("b", { params: { blackoutEntity: "cover.b2", blackoutOpenAt: "18:30" } }),
    item("off", { params: { blackoutEntity: "cover.x", blackoutDawn: false } }),
    item("sw", { params: { blackoutEntity: "switch.motor" } }),
    item("none", { params: {} }),
    item("noparams", { params: undefined }),
    item("badid", { params: { blackoutEntity: "cover.Bad Id" } }),
    item("sofa", { kind: "lv_sofa" }),
    { kind: "lv_sheer_curtain_door", params: { blackoutEntity: "cover.noid" } },
    null,
    "junk",
  ]);
  assert.deepEqual(curtainsOf(plan), [
    { id: "a", entity: "cover.blind", rule: { dawn: true, openAt: undefined } },
    { id: "b", entity: "cover.b2", rule: { dawn: true, openAt: "18:30" } },
  ]);
  assert.deepEqual(curtainsOf("not json"), []);
  assert.deepEqual(curtainsOf("{}"), []);
  assert.deepEqual(curtainsOf('{"items":5}'), []);
});

test("a full day: night, dawn closes once, the owner opens it by hand, no re-close, open at 20:00, the next day closes again", async () => {
  const r = rig([item("c1", { params: { blackoutEntity: "cover.blind", blackoutOpenAt: "20:00" } })]);
  const e = (m: number) => -9 + m * 0.1; // minutes since 03:30: crosses -6 at 04:00
  assert.equal(await r.look(10, 3, 0, -30, true), "ok");
  assert.deepEqual(r.h.services(), []);
  for (let m = 0; m < 60; m++) await r.look(10, 3, 30 + m, e(m), true);
  assert.deepEqual(r.h.services(), ["services/cover/close_cover cover.blind"], "closed exactly once, at dawn");
  assert.equal(r.h.covers["cover.blind"], "closed");
  assert.equal(lastActions(r.t.db).c1.action, "close");
  assert.match(lastActions(r.t.db).c1.why, /Closed at dawn/);

  r.h.covers["cover.blind"] = "open"; // the owner opens it at 08:00
  for (let h = 8; h < 20; h++) for (const m of [0, 20, 40]) await r.look(10, h, m, 20 + h, true);
  assert.equal(r.h.services().length, 1, "never fights the owner");

  await r.look(10, 19, 59, 5, false);
  assert.equal(r.h.services().length, 1);
  r.h.covers["cover.blind"] = "closed"; // closed again by hand in the evening
  await r.look(10, 20, 0, 4, false);
  assert.deepEqual(r.h.services().slice(1), ["services/cover/open_cover cover.blind"], "open at 20:00 because the rule closed it today");
  await r.look(10, 20, 5, 3, false);
  assert.equal(r.h.services().length, 2, "once");

  // the next day closes again, nothing carried over
  for (let m = 0; m < 60; m++) await r.look(11, 3, 30 + m, e(m), true);
  assert.deepEqual(r.h.services().slice(2), ["services/cover/close_cover cover.blind"]);
  r.cleanup();
});

test("a curtain that was already closed is left alone, noted, and never opened at the set time", async () => {
  const r = rig([item("c1", { params: { blackoutEntity: "cover.blind", blackoutOpenAt: "18:00" } })], { "cover.blind": "closed" });
  await r.look(10, 3, 59, -7, true);
  await r.look(10, 4, 1, -5, true);
  await r.look(10, 18, 30, 5, false);
  assert.deepEqual(r.h.services(), []);
  assert.match(lastActions(r.t.db).c1.why, /already closed/);
  assert.equal(lastActions(r.t.db).c1.action, "skip");
  r.cleanup();
});

test("the sun missing from Home Assistant, or the cover missing: no action, no error", async () => {
  const r = rig();
  r.h.sun = undefined;
  r.h.covers = {};
  const cache = freshCache();
  for (const m of [0, 1, 2]) {
    assert.equal(await tick({ ...r.deps, now: () => new Date(2026, 5, 10, 4, m) }, cache), "ok");
  }
  assert.deepEqual(r.h.services(), []);
  r.cleanup();
});

test("only cover.close_cover / cover.open_cover on the linked cover are ever sent; the rest is reads", async () => {
  const r = rig([item("a"), item("b", { params: { blackoutEntity: "cover.other" } })], { "cover.blind": "open", "cover.other": "open", "cover.sheer": "open" });
  await r.look(10, 3, 59, -7, true);
  await r.look(10, 4, 1, -5, true);
  assert.deepEqual(r.h.services().sort(), ["services/cover/close_cover cover.blind", "services/cover/close_cover cover.other"]);
  assert.equal(r.h.covers["cover.sheer"], "open", "the sheer layer is never touched");
  for (const c of r.h.calls.filter((c) => c.method === "POST")) assert.deepEqual(Object.keys(c.body as object), ["entity_id"]);
  assert.ok(r.h.calls.filter((c) => c.method !== "POST").every((c) => /^states\/(sun\.sun|cover\.\w+)$/.test(c.path)), "only the sun and the covers are asked for, never the whole list");
  r.cleanup();
});

test("with many covers the dawn rule reads the entity list once instead of one request each", async () => {
  const covers = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`cover.c${i}`, "open"]));
  const r = rig(Array.from({ length: 10 }, (_, i) => item(`i${i}`, { params: { blackoutEntity: `cover.c${i}` } })), covers);
  await r.look(10, 4, 1, -5, true);
  assert.deepEqual(r.h.calls.filter((c) => c.method !== "POST").map((c) => c.path), ["states"]);
  assert.equal(r.h.services().length, 10);
  r.cleanup();
});

test("no such curtains in the plan: the automation is idle and never asks Home Assistant anything", async () => {
  for (const items of [[], [item("x", { params: {} })], [item("y", { params: { blackoutEntity: "cover.blind", blackoutDawn: false } })], [item("z", { kind: "lv_sofa" })]]) {
    const r = rig(items);
    assert.equal(await r.look(10, 4, 1, -5, true), "idle");
    assert.equal(r.h.calls.length, 0);
    r.cleanup();
  }
});

test("no plan at all, or Home Assistant not set up: idle, no calls", async () => {
  const t = tempDb();
  const h = fakeHa();
  const deps: Deps = { db: () => t.db, ha: () => h.ha, now: () => new Date(2026, 5, 10, 3, 0), configured: () => true, log: { info: () => undefined, error: () => undefined } };
  assert.equal(await tick(deps), "idle");
  putPlan(t.db, HOME, { json: planWith([item("a")]), baseRev: 0, format: 1 });
  assert.equal(await tick({ ...deps, configured: () => false }), "idle");
  assert.equal(h.calls.length, 0);
  t.cleanup();
});

test("a change to the plan (curtain added, rule switched off) is picked up on the next look", async () => {
  const r = rig([item("a", { params: {} })]);
  const cache = freshCache();
  assert.equal(await tick(r.deps, cache), "idle");
  putPlan(r.t.db, HOME, { json: planWith([item("a")]), baseRev: 1, format: 1 });
  r.h.sun = { state: "below_horizon", attributes: { elevation: -30, rising: true } };
  assert.equal(await tick(r.deps, cache), "ok");
  assert.ok(r.h.calls.length > 0);
  putPlan(r.t.db, HOME, { json: planWith([item("a", { params: { blackoutEntity: "cover.blind", blackoutDawn: false } })]), baseRev: 2, format: 1 });
  const n = r.h.calls.length;
  assert.equal(await tick(r.deps, cache), "idle");
  assert.equal(r.h.calls.length, n);
  r.cleanup();
});

test("only the home plan's curtains are driven, and making another plan the home plan switches the rule to it even at the same revision", async () => {
  const r = rig([item("a")], { "cover.blind": "open", "cover.other": "open" });
  const second = createDashboard(r.t.db, parseCreateBody({ name: "Second", plan: JSON.parse(planWith([item("b", { params: { blackoutEntity: "cover.other" } })])), format: 1 })).id;
  assert.equal(await r.look(10, 4, 1, -5, true), "ok");
  assert.deepEqual(r.h.services(), ["services/cover/close_cover cover.blind"], "the second plan's curtain is left alone");
  setDefaultDashboard(r.t.db, second); // both plans are at revision 1
  r.h.covers["cover.blind"] = "open";
  assert.equal(await r.look(11, 4, 1, -5, true), "ok");
  assert.deepEqual(r.h.services().slice(1), ["services/cover/close_cover cover.other"], "now it drives the new home plan's curtain only");
  r.cleanup();
});

test("Home Assistant unreachable: never throws, no action, one error line, and the next look still works", async () => {
  const r = rig();
  r.h.down = true;
  assert.equal(await r.look(10, 4, 1, -5, true), "error");
  assert.equal(r.logs.filter((l) => l.startsWith("e ")).length, 1);
  assert.match(r.logs[0], /fetch failed/);
  assert.ok(!r.logs.join("\n").includes("HA_TOKEN"));
  assert.deepEqual(r.h.services(), []);
  r.h.down = false;
  // it came back 10 minutes after the crossing: the rising window catches dawn, once
  assert.equal(await r.look(10, 4, 11, -3, true), "ok");
  assert.deepEqual(r.h.services(), ["services/cover/close_cover cover.blind"]);
  r.cleanup();
});

test("Home Assistant answering 500 to the states read is an error, not an exception", async () => {
  const r = rig();
  const bad: Deps = { ...r.deps, ha: () => async () => new Response("boom", { status: 500 }) };
  assert.equal(await tick(bad), "error");
  assert.match(r.logs[0], /Home Assistant HTTP 500/);
  const odd: Deps = { ...r.deps, ha: () => async () => Response.json({ not: "a list" }) };
  assert.equal(await tick(odd), "error");
  r.cleanup();
});

test("a refused service call is retried a few times, then given up for the day; no action repeats after that", async () => {
  const r = rig();
  r.h.refuse = true;
  await r.look(10, 3, 59, -7, true);
  assert.equal(await r.look(10, 4, 1, -5, true), "error");
  for (let m = 2; m < 30; m++) await r.look(10, 4, m, -5 + m / 20, true);
  assert.equal(r.h.services().length, MAX_TRIES, "bounded");
  assert.equal(r.logs.filter((l) => l.startsWith("e ")).length, MAX_TRIES);
  assert.ok(r.logs.filter((l) => l.startsWith("e ")).every((l) => /could not close cover\.blind: Home Assistant HTTP 500/.test(l)));
  assert.equal(lastActions(r.t.db).c1.action, "skip");
  r.h.refuse = false;
  await r.look(10, 4, 40, -1, true);
  assert.equal(r.h.services().length, MAX_TRIES, "given up for today");
  await r.look(11, 3, 59, -7, true);
  await r.look(11, 4, 1, -5, true);
  assert.equal(r.h.services().length, MAX_TRIES + 1, "tomorrow is a fresh start");
  r.cleanup();
});

test("a database that cannot be written: the action is not sent (so it cannot be repeated either)", async () => {
  const r = rig();
  await r.look(10, 3, 59, -7, true); // the row exists after this look
  r.t.db.exec("DROP TABLE settings");
  r.t.db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  r.t.db.exec("CREATE TRIGGER nowrite BEFORE INSERT ON settings BEGIN SELECT RAISE(ABORT, 'read only'); END");
  assert.equal(await r.look(10, 4, 1, -5, true), "error");
  assert.deepEqual(r.h.services(), []);
  r.cleanup();
});

test("memory survives a restart: a new loop does not close what the owner opened after dawn", async () => {
  const r = rig();
  await r.look(10, 3, 59, -7, true);
  await r.look(10, 4, 1, -5, true);
  assert.equal(r.h.services().length, 1);
  r.h.covers["cover.blind"] = "open";
  // restart: a fresh cache, the same database; the sun is still in the dawn window
  const cache = freshCache();
  r.h.sun = { state: "below_horizon", attributes: { elevation: -4, rising: true } };
  await tick({ ...r.deps, now: () => new Date(2026, 5, 10, 4, 10) }, cache);
  await tick({ ...r.deps, now: () => new Date(2026, 5, 10, 9, 30) }, cache);
  assert.equal(r.h.services().length, 1);
  r.cleanup();
});

test("the stored row stays small, drops curtains that left the plan, and keeps the last action readable", async () => {
  const r = rig([item("a"), item("b", { params: { blackoutEntity: "cover.other" } })], { "cover.blind": "open", "cover.other": "closed" });
  await r.look(10, 3, 59, -7, true);
  await r.look(10, 4, 1, -5, true);
  assert.deepEqual(Object.keys(loadStore(r.t.db).items).sort(), ["a", "b"]);
  assert.ok(JSON.stringify(loadStore(r.t.db)).length < 1500);
  assert.equal(lastActions(r.t.db).a.action, "close");
  assert.equal(lastActions(r.t.db).b.action, "skip");
  putPlan(r.t.db, HOME, { json: planWith([item("b", { params: { blackoutEntity: "cover.other" } })]), baseRev: 1, format: 1 });
  await tick(r.deps, freshCache());
  assert.deepEqual(Object.keys(loadStore(r.t.db).items), ["b"]);
  r.t.db.exec(`UPDATE settings SET value = 'garbage' WHERE key = '${KEY}'`);
  assert.deepEqual(loadStore(r.t.db), { items: {} }, "a damaged row means a fresh start, never an action");
  r.cleanup();
});

test("backoff: a minute, doubling after each failed look, at most 15 minutes", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 20].map(nextDelay), [TICK_MS, 2 * TICK_MS, 4 * TICK_MS, 8 * TICK_MS, MAX_BACKOFF_MS, MAX_BACKOFF_MS, MAX_BACKOFF_MS]);
});

test("the loop starts once, never twice, and stops cleanly", () => {
  const logs: string[] = [];
  const deps: Deps = { db: () => { throw new Error("no db in this test"); }, ha: () => async () => new Response("no", { status: 500 }), now: () => new Date(2026, 5, 10, 3, 0), configured: () => true, log: { info: (m) => logs.push(m), error: (m) => logs.push(m) } };
  assert.equal(isRunning(), false);
  assert.equal(startCurtainAutomation(deps, 3_600_000), true);
  assert.equal(isRunning(), true);
  assert.equal(startCurtainAutomation(deps, 3_600_000), false, "a hot reload cannot start a second loop");
  stopCurtainAutomation();
  assert.equal(isRunning(), false);
});

test("HOUSEY_AUTOMATION=off, or no Home Assistant: the loop does not start", () => {
  const logs: string[] = [];
  const deps: Deps = { db: () => { throw new Error("no db"); }, ha: () => async () => new Response("no", { status: 500 }), now: () => new Date(2026, 5, 10, 3, 0), configured: () => true, log: { info: (m) => logs.push(m), error: (m) => logs.push(m) } };
  process.env.HOUSEY_AUTOMATION = " OFF ";
  assert.equal(startCurtainAutomation(deps, 3_600_000), false);
  assert.match(logs[0], /off/);
  delete process.env.HOUSEY_AUTOMATION;
  assert.equal(startCurtainAutomation({ ...deps, configured: () => false }, 3_600_000), false);
  assert.match(logs[1], /not set up/);
  assert.equal(isRunning(), false);
});

test("the running loop looks on its own timer and survives a failing database", async () => {
  const failed = Promise.withResolvers<string>();
  const deps: Deps = { db: () => { throw new Error("db down"); }, ha: () => async () => new Response("no", { status: 500 }), now: () => new Date(2026, 5, 10, 3, 0), configured: () => true, log: { info: () => undefined, error: failed.resolve } };
  assert.equal(startCurtainAutomation(deps, 0), true);
  assert.match(await failed.promise, /db down/); // the loop's own first look, no guessed wait
  assert.equal(isRunning(), true);
});

test("the loop asks the home that the home plan shows, and no other plan's home", async () => {
  const r = rig();
  const asked: (string | null)[] = [];
  const home = createHome(r.t.db, parseNewHome({ name: "Holiday house", url: "http://127.0.0.1:9", token: "tok-aaaa-1111" }));
  const other = createHome(r.t.db, parseNewHome({ name: "Parents", url: "http://127.0.0.1:9", token: "tok-bbbb-2222" }));
  putPlan(r.t.db, HOME, { json: planWith([item("a")]), baseRev: 0, format: 1 });
  patchDashboard(r.t.db, HOME, { haConnection: home.id });
  const second = createDashboard(r.t.db, parseCreateBody({ name: "Annex", haConnection: other.id }));
  const deps: Deps = { ...r.deps, ha: (id) => (asked.push(id), r.deps.ha(id)) };
  await tick(deps);
  assert.deepEqual(asked, [home.id], "the default plan's home, once");
  setDefaultDashboard(r.t.db, second.id);
  await tick(deps, freshCache()); // the Annex has no curtains: nothing is asked
  assert.deepEqual(asked, [home.id]);
  setDefaultDashboard(r.t.db, HOME);
  patchDashboard(r.t.db, HOME, { haConnection: null });
  await tick(deps, freshCache());
  assert.deepEqual(asked, [home.id, null], "no link = the main home");
  r.cleanup();
});
