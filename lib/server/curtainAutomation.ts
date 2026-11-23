// The dawn rule for the sun-blocking curtains, running on the dashboard server so it works with no browser open. Every minute it reads the
// working plan, and for each window curtain with a linked sun-blocking cover (and the rule on) asks lib/curtainAuto.ts what to do. It only ever
// calls `cover.close_cover` / `cover.open_cover` on that cover, through the same validated path as POST /api/ha/service (lib/server/haCall.ts).
// Started once from instrumentation.ts. What it remembers, and the last thing it did per curtain, lives in the settings table (key below).
import type { DatabaseSync } from "node:sqlite";
import { errorMessage } from "../guards.ts";
import { curtainLayers } from "../curtain.ts";
import { decide, type CoverReading, type Memory, type Rule, type SunReading } from "../curtainAuto.ts";
import { getDb } from "../db/connection.ts";
import { getPlan, getPlanRev } from "../db/plans.ts";
import { setSettings } from "../db/settings.ts";
import { one } from "../db/sql.ts";
import { ha } from "../haServer.ts";
import { callHaService, type HaFetch } from "./haCall.ts";

export const KEY = "curtain-automation";
export const TICK_MS = 60_000;
export const MAX_BACKOFF_MS = 15 * 60_000;
const FIRST_TICK_MS = 10_000;
const HA_TIMEOUT_MS = 10_000;
const MAX_CURTAINS = 100;
const MAX_WHY = 160;
const ENTITY = /^cover\.[a-z0-9_]+$/;

/** What the dashboard shows as "the last automatic action" of a curtain. `skip` = the rule looked and left it alone for a reason worth saying. */
export type Last = { at: number; action: "close" | "open" | "skip"; why: string };
type Entry = { memory: Memory; last?: Last };
export type Store = { items: Record<string, Entry> };
export type Curtain = { id: string; entity: string; rule: Rule };

export type Deps = {
  db: () => DatabaseSync;
  /** Home Assistant (`path` after /api/). The real one is lib/haServer.ts `ha`; tests pass a fake. */
  ha: HaFetch;
  now: () => Date;
  configured: () => boolean;
  log: { info: (msg: string) => void; error: (msg: string) => void };
};
type Outcome = "idle" | "ok" | "error";

/** HOUSEY_AUTOMATION=off switches the whole thing off (the dashboard still shows the cards; nothing is ever called by itself). */
export const automationOff = () => process.env.HOUSEY_AUTOMATION?.trim().toLowerCase() === "off";
export const haConfigured = () => !!process.env.HA_URL && !!process.env.HA_TOKEN;

const realDeps = (): Deps => ({
  db: getDb,
  ha: (path, init) => ha(path, { ...init, signal: AbortSignal.timeout(HA_TIMEOUT_MS) }),
  now: () => new Date(),
  configured: haConfigured,
  log: { info: (m) => console.info(m), error: (m) => console.error(m) },
});

/** The window curtains of a plan that have a linked cover and the dawn rule on. Anything odd in the plan is ignored. */
export function curtainsOf(planJson: string): Curtain[] {
  let plan: unknown;
  try {
    plan = JSON.parse(planJson);
  } catch {
    return [];
  }
  const items: unknown = plan && typeof plan === "object" && "items" in plan ? plan.items : undefined;
  if (!Array.isArray(items)) return [];
  const out: Curtain[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object" || typeof it.id !== "string" || typeof it.kind !== "string" || !it.kind.includes("curtain")) continue;
    const params = it.params && typeof it.params === "object" && !Array.isArray(it.params) ? it.params : undefined;
    const b = curtainLayers({ entity: typeof it.entity === "string" ? it.entity : undefined, params }).blackout;
    if (b.entity && ENTITY.test(b.entity) && b.dawn && out.length < MAX_CURTAINS) out.push({ id: it.id, entity: b.entity, rule: { dawn: true, openAt: b.openAt } });
  }
  return out;
}

/** The stored memory and last actions (empty when there are none or the row is damaged: the rule then starts fresh, which never acts by itself). */
export function loadStore(db: DatabaseSync): Store {
  try {
    const r = one(db, "SELECT value FROM settings WHERE key = ?", KEY);
    const v: unknown = r ? JSON.parse(String(r.value)) : null;
    if (v && typeof v === "object" && "items" in v && v.items && typeof v.items === "object" && !Array.isArray(v.items)) return { items: { ...v.items } as Store["items"] };
  } catch {
    /* fall through */
  }
  return { items: {} };
}

/** The last automatic action per curtain, for GET /api/automation/curtains. */
export function lastActions(db: DatabaseSync): Record<string, Last> {
  const out: Record<string, Last> = {};
  for (const [id, e] of Object.entries(loadStore(db).items)) if (e && typeof e === "object" && e.last && typeof e.last.at === "number") out[id] = e.last;
  return out;
}

/** Keep only the curtains that are still in the plan, and keep every text short. */
function saveStore(db: DatabaseSync, store: Store, keep: string[]) {
  const items: Store["items"] = {};
  for (const id of keep.slice(0, MAX_CURTAINS)) {
    const e = store.items[id];
    if (e) items[id] = e.last ? { ...e, last: { ...e.last, why: e.last.why.slice(0, MAX_WHY) } } : e;
  }
  setSettings(db, { [KEY]: { items } });
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? { ...v } : {});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

type Reading = { state: string; attributes: Record<string, unknown> };

const reading = (s: unknown): [string, Reading] | null =>
  s && typeof s === "object" && "entity_id" in s && typeof s.entity_id === "string" && "state" in s && typeof s.state === "string" ? [s.entity_id, { state: s.state, attributes: asRecord("attributes" in s ? s.attributes : undefined) }] : null;

// Few entities are needed (the sun and the curtains' covers): asking for just those is a handful of tiny requests, where the full list is ~1000 entities
// Home Assistant must serialise every minute, for ever. Past this many it is cheaper to take the list once.
const MAX_SINGLE_READS = 8;

/** The current state of each entity (a missing one is just absent from the result). */
async function readEntities(fetchHa: HaFetch, ids: string[]): Promise<Map<string, Reading>> {
  const want = new Set(ids);
  const seen = new Map<string, Reading>();
  if (want.size <= MAX_SINGLE_READS) {
    await Promise.all(
      [...want].map(async (id) => {
        const res = await fetchHa(`states/${id}`);
        if (res.status === 404) return;
        if (!res.ok) throw new Error(`Home Assistant HTTP ${res.status}`);
        const r = reading(await res.json());
        if (!r || r[0] !== id) throw new Error("Home Assistant sent something unexpected");
        seen.set(...r);
      }),
    );
    return seen;
  }
  const res = await fetchHa("states");
  if (!res.ok) throw new Error(`Home Assistant HTTP ${res.status}`);
  const all: unknown = await res.json();
  if (!Array.isArray(all)) throw new Error("Home Assistant sent something unexpected");
  for (const s of all) {
    const r = reading(s);
    if (r && want.has(r[0])) seen.set(...r);
  }
  return seen;
}

type Cache = { rev: number | null; curtains: Curtain[] };

/** One look: read the plan, ask Home Assistant for the sun and the covers, decide per curtain, act. Never throws: a problem is logged and reported as "error". */
export async function tick(deps: Deps, cache: Cache = { rev: null, curtains: [] }): Promise<Outcome> {
  try {
    if (!deps.configured()) return "idle";
    const db = deps.db();
    const rev = getPlanRev(db);
    if (rev !== cache.rev) {
      const plan = rev === null ? null : getPlan(db);
      cache.rev = rev;
      cache.curtains = plan ? curtainsOf(plan.json) : [];
    }
    if (!cache.curtains.length) return "idle";

    const seen = await readEntities(deps.ha, ["sun.sun", ...cache.curtains.map((c) => c.entity)]);
    const sunRaw = seen.get("sun.sun");
    const sun: SunReading | undefined = sunRaw && { state: sunRaw.state, elevation: num(sunRaw.attributes.elevation), rising: typeof sunRaw.attributes.rising === "boolean" ? sunRaw.attributes.rising : undefined };
    const store = loadStore(db);
    const keep = cache.curtains.map((c) => c.id);
    let outcome: Outcome = "ok";

    for (const c of cache.curtains) {
      const now = deps.now();
      const coverRaw = seen.get(c.entity);
      const cover: CoverReading | undefined = coverRaw && { state: coverRaw.state, current_position: num(coverRaw.attributes.current_position) };
      const entry = store.items[c.id] ?? { memory: {} };
      const d = decide({ now, sun, cover, rule: c.rule, memory: entry.memory });
      if (d.action === "none") {
        store.items[c.id] = { memory: d.memory, last: d.log ? { at: now.getTime(), action: "skip", why: d.why } : entry.last };
        if (d.log) deps.log.info(`curtain automation: ${c.entity}: ${d.why}`);
        continue;
      }
      // Remember first, call second: if the database fails here nothing is sent, and a call that is repeated after an error cannot happen twice.
      store.items[c.id] = { memory: d.memory, last: entry.last };
      saveStore(db, store, keep);
      const r = await callHaService({ domain: "cover", service: d.action === "close" ? "close_cover" : "open_cover", entity_id: c.entity }, deps.ha);
      if (r.ok) {
        store.items[c.id] = { memory: d.memory, last: { at: now.getTime(), action: d.action, why: d.why } };
        deps.log.info(`curtain automation: ${d.action === "close" ? "closed" : "opened"} ${c.entity}: ${d.why}`);
      } else {
        outcome = "error";
        store.items[c.id] = { memory: d.ifFailed, last: { at: now.getTime(), action: "skip", why: `Could not ${d.action} the curtain: ${r.error}` } };
        deps.log.error(`curtain automation: could not ${d.action} ${c.entity}: ${r.error}`);
      }
    }
    saveStore(db, store, keep);
    return outcome;
  } catch (e) {
    deps.log.error(`curtain automation: ${errorMessage(e)}`);
    return "error";
  }
}

/** Delay before the next look: a minute, doubling after each failed look up to 15 minutes. */
export const nextDelay = (failures: number) => Math.min(TICK_MS * 2 ** failures, MAX_BACKOFF_MS);

// Next dev re-evaluates modules on hot reload: the one loop lives on globalThis so a reload can never start a second one.
const g = globalThis as typeof globalThis & { __houseyCurtainAuto?: { timer: NodeJS.Timeout | undefined; stopped: boolean } };

/** Is the loop running in this server process? (GET /api/automation/curtains tells the dashboard.) */
export const isRunning = () => !!g.__houseyCurtainAuto && !g.__houseyCurtainAuto.stopped;

/** Start the loop once. Returns false (and says why in the log) when it is switched off or Home Assistant is not set up, or when it already runs. */
export function startCurtainAutomation(deps: Deps = realDeps(), firstTickMs = FIRST_TICK_MS): boolean {
  if (isRunning()) return false;
  if (automationOff()) {
    deps.log.info("curtain automation: off (HOUSEY_AUTOMATION=off)");
    return false;
  }
  if (!deps.configured()) {
    deps.log.info("curtain automation: not started, Home Assistant is not set up (HA_URL / HA_TOKEN)");
    return false;
  }
  const loop = { timer: undefined as NodeJS.Timeout | undefined, stopped: false };
  g.__houseyCurtainAuto = loop;
  const cache: Cache = { rev: null, curtains: [] };
  let failures = 0;
  const run = async () => {
    const outcome = await tick(deps, cache);
    if (loop.stopped) return;
    failures = outcome === "error" ? failures + 1 : 0;
    loop.timer = setTimeout(run, nextDelay(failures));
    loop.timer.unref();
  };
  loop.timer = setTimeout(run, firstTickMs);
  loop.timer.unref();
  deps.log.info("curtain automation: running (looks at the sun every minute; only acts on sun-blocking curtains linked to a cover)");
  return true;
}

/** Stop the loop (tests, and a clean shutdown). */
export function stopCurtainAutomation() {
  const loop = g.__houseyCurtainAuto;
  if (!loop) return;
  loop.stopped = true;
  clearTimeout(loop.timer);
  g.__houseyCurtainAuto = undefined;
}
