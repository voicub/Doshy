import type { StateStorage } from "zustand/middleware";
import {
  ApiError,
  ConflictError,
  NetError,
  deleteResource,
  fetchDashboards,
  fetchDashboardsIfChanged,
  fetchPlan,
  fetchResources,
  fetchSettings,
  putResource,
  savePlan,
  saveSettings,
  type DashboardList,
  type PlanReply,
  type ServerPlan,
  type ServerSettings,
} from "./dbApi.ts";
import { createStash } from "./dbStash.ts";
import { KEEPALIVE_MAX_BYTES, asPersisted, decidePlan, decidePoll, diffPieces, mergePieces, modelIds, parsePlanParam, pickPlan, putField, retryDelay, takeField, type Persisted, type Taken } from "./dbMerge.ts";
import { guestStorage, onGuestPage } from "./guestMode.ts";
import { embedded, forget, read, store, write } from "./localCopy.ts";
import { planSettingsKey } from "./planIdentity.ts";
import { countsOf, markSeen, mirrorLegacy, planCounts, readStash, type StashEntry } from "./planStash.ts";
import { publish, planStatus } from "./planState.ts";
import { retryPending, syncModels } from "./modelStore.ts";
import { setPhase, useSync } from "./syncStatus.ts";

/**
 * Persistence for the zustand stores: the browser's localStorage stays the instant, always-working copy (first paint never waits for the
 * network, and it keeps everything while the server is down); the server database is the shared copy. See docs/database.md.
 *
 *  - writes go to localStorage at once and to the server ~0.8 s later (and right away when the page is hidden);
 *  - at start the two copies are reconciled once (lib/dbMerge decides), then polled for plan changes made elsewhere;
 *  - a store is `settings` (one JSON row), `plan` (the plan in its own table with revisions, the rest as settings) or
 *    `pieces` (each custom piece as a file, the rest as settings).
 */
type DocKind = "settings" | "plan" | "pieces";
type DbStorage = StateStorage & {
  /** Called after the server's data was written into localStorage: the store should re-read it (`store.persist.rehydrate()`). */
  bind: (onData: () => void) => void;
};

const META_KEY = "housey-db-sync";
/** The plan this device last chose (lib/activePlan). Deliberately not one of the .housey device keys: another device's plan ids are not ours. */
export const ACTIVE_KEY = "housey-active-plan";
const DEBOUNCE_MS = 800;
const POLL_MS = 15_000;

type Timer = ReturnType<typeof setTimeout>;
type Doc = { name: string; kind: DocKind; version: number; isStarter?: (plan: unknown) => boolean; onData: () => void; timer: Timer | undefined; last: string | null; synced: boolean };

const docs = new Map<string, Doc>();
const dirty = new Set<string>(); // stores with edits the server has not confirmed
let planRev: number | null = null; // the revision of the plan on screen that this device last synced
let planId: number | null = null; // which plan the local copy (`housey-plan`) is of: set at start (or from an older build's meta), changed only by a switch
let planList: DashboardList | null = null; // the plans as last read
let listEtag: string | null = null;
let basePieces = new Set<string>(); // custom piece kinds that were on the server at the last sync
const onServer = new Map<string, string>(); // custom piece kind -> its JSON as last known on the server
let lastPlanJson: string | null = null; // the plan text the server is known to hold
let conflict: { server: ServerPlan | null } | null = null;
let editedAt: number | null = null; // when this device's plan was last changed here
const stashUp = new Set<number>(); // kept plans (stash slots) still waiting to be sent to the server as saved versions
let forceOverwrite = false; // the next plan save replaces the server's plan on purpose (the server keeps what it replaces as a version)
let started = false;
let polling = false;
let frozen = embedded; // after a backup import: this device's old copy must not be sent anywhere. An embedded view (`?embed=1`) never sends anything: it is read-only
let inflight = 0;
let lastPushDoneAt = 0;
let attempt = 0;
let retryTimer: Timer | undefined;
let chain: Promise<unknown> = Promise.resolve();

function loadMeta() {
  try {
    const m: unknown = JSON.parse(read(META_KEY) ?? "null");
    if (!m || typeof m !== "object") return;
    if ("rev" in m && typeof m.rev === "number") planRev = m.rev;
    if ("planId" in m && typeof m.planId === "number") planId = m.planId;
    if ("edited" in m && typeof m.edited === "number") editedAt = m.edited;
    if ("dirty" in m && Array.isArray(m.dirty)) for (const d of m.dirty) if (typeof d === "string") dirty.add(d);
    if ("pieces" in m && Array.isArray(m.pieces)) basePieces = new Set(m.pieces.filter((k): k is string => typeof k === "string"));
    if ("stashUp" in m && Array.isArray(m.stashUp)) for (const n of m.stashUp) if (typeof n === "number") stashUp.add(n);
  } catch {
    /* start clean */
  }
}
const saveMeta = () => write(META_KEY, JSON.stringify({ rev: planRev, planId, edited: editedAt, dirty: [...dirty], pieces: [...basePieces], stashUp: [...stashUp] }));
function markDirty(name: string) {
  if (dirty.has(name)) return;
  dirty.add(name);
  saveMeta();
}
function clearDirty(name: string) {
  if (dirty.delete(name)) saveMeta();
}

const { refreshBanner, stashLocal, uploadStashes, stashEntries, dismissStash } = createStash({
  stashUp,
  saveMeta: () => saveMeta(),
  frozen: () => frozen,
  ids: () => ({ planId, defaultId: planList?.defaultId ?? null }),
  planName: () => planDoc()?.name ?? PLAN_NAME,
});
export { stashEntries, dismissStash };

// ---- the storage adapter --------------------------------------------------------------------------------------------------------------

/**
 * `StateStorage` for zustand's `createJSONStorage`. Call once per persisted store with the store's persist `name` and `version`.
 * Then `bind` the store's rehydrate so server data that arrives later reaches the screen.
 */
export function dbStorage(name: string, kind: DocKind, version: number, isStarter?: (plan: unknown) => boolean): DbStorage {
  if (onGuestPage()) return guestStorage(name); // the guest page (/view/<token>) keeps everything in this tab's memory: no localStorage, no sync, no request to /api/db (docs/sharing.md)
  if (!started) loadMeta();
  clearTimeout(docs.get(name)?.timer); // a hot reload re-creates the store
  const doc: Doc = { name, kind, version, isStarter, onData: () => undefined, timer: undefined, last: read(name), synced: false };
  docs.set(name, doc);
  if (started && !frozen) void reconcileDocs([doc]).then(() => afterReconcile([doc]), fail);
  else start();
  return {
    getItem: (key) => read(key),
    setItem: (key, value) => {
      if (frozen || value === doc.last) return; // persist also writes on every unrelated state change: unchanged text costs nothing
      if (kind === "plan" && metaPlanId() !== planId) return movedAway(); // another tab of this browser opened a different plan: writing here would overwrite that tab's copy
      doc.last = value;
      write(key, value);
      if (kind === "plan") editedAt = Date.now();
      markDirty(name);
      saveMeta();
      schedule(doc, DEBOUNCE_MS);
    },
    removeItem: (key) => forget(key),
    bind: (onData) => {
      doc.onData = onData;
    },
  };
}

function schedule(doc: Doc, ms: number) {
  clearTimeout(doc.timer);
  doc.timer = setTimeout(() => void enqueue(() => flush(doc)), ms);
}

/** Saves go out one at a time, in order. */
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

// ---- sending ---------------------------------------------------------------------------------------------------------------------------

const hasKind = (p: unknown): p is { kind: string; name?: unknown } => !!p && typeof p === "object" && "kind" in p && typeof p.kind === "string";

/** The settings row a store lives under on the server: the plan's own row for the plan store, else its name. */
const serverKey = (doc: Doc) => (doc.kind === "plan" && planId !== null ? planSettingsKey(planId) : doc.name);

/** Send one store's pending changes. Returns false when part of it had to wait (a conflict, or too big for a page-hide send). */
async function push(doc: Doc, value: string, keepalive: boolean): Promise<boolean> {
  if (doc.kind === "settings") {
    await saveSettings({ [doc.name]: JSON.parse(value) }, keepalive);
    return true;
  }
  const taken = takeField(value, doc.kind === "plan" ? "plan" : "pieces");
  if (!taken) return true; // unreadable local text: nothing to send
  await saveSettings({ [serverKey(doc)]: taken.rest }, keepalive);
  return doc.kind === "plan" ? pushPlan(taken.value, taken.rest.version, keepalive) : pushPieces(taken.value, keepalive);
}

async function pushPlan(plan: unknown, format: number, keepalive: boolean): Promise<boolean> {
  const id = planId;
  if (conflict || id === null) return false; // waits for the user's choice
  if (plan === undefined) return true;
  const json = JSON.stringify(plan);
  if (json === lastPlanJson) return true;
  const body = { plan, baseRev: planRev ?? 0, format, ...(forceOverwrite ? { overwrite: true } : {}) };
  if (keepalive && JSON.stringify(body).length > KEEPALIVE_MAX_BYTES) return false;
  const r = await savePlan(id, body, keepalive);
  if (planId !== id) return true; // cannot happen while a send is queued (a switch waits for it), but never record a revision on the wrong plan
  planRev = r.rev;
  lastPlanJson = json;
  forceOverwrite = false;
  saveMeta();
  return true;
}

async function pushPieces(pieces: unknown, keepalive: boolean): Promise<boolean> {
  const { put, remove } = diffPieces((Array.isArray(pieces) ? pieces : []).filter(hasKind), onServer);
  let complete = true;
  for (const p of put) {
    const json = JSON.stringify(p);
    if (keepalive && json.length > KEEPALIVE_MAX_BYTES) {
      complete = false;
      continue;
    }
    await putResource({ id: p.kind, kind: "piece", mime: "application/json", name: typeof p.name === "string" ? p.name : p.kind }, json, keepalive);
    onServer.set(p.kind, json);
  }
  for (const kind of remove) {
    await deleteResource(kind);
    onServer.delete(kind);
  }
  basePieces = new Set(onServer.keys());
  saveMeta();
  return complete;
}

async function flush(doc: Doc, keepalive = false): Promise<void> {
  if (frozen || !doc.synced || !dirty.has(doc.name)) return;
  if (doc.kind === "plan" && metaPlanId() !== planId) return movedAway(); // another tab of this browser opened a different plan: the local copy is no longer this tab's
  const value = read(doc.name);
  if (value === null) return clearDirty(doc.name);
  inflight++;
  if (useSync.getState().phase !== "offline") setPhase("saving");
  try {
    const complete = await push(doc, value, keepalive);
    if (complete && read(doc.name) === value) clearDirty(doc.name);
    else if (complete) schedule(doc, DEBOUNCE_MS); // edited while this was on its way
    attempt = 0;
    lastPushDoneAt = Date.now();
    if (!dirty.size && !conflict) setPhase("saved");
    else if (conflict) setPhase("idle");
  } catch (e) {
    fail(e);
  } finally {
    inflight--;
  }
}

/** Another tab (same browser, same localStorage) switched plans, so `housey-plan` now holds that plan: nothing of it may be sent as this tab's plan. */
function movedAway() {
  frozen = true;
  setPhase("error", "Another tab of this browser opened a different plan. Reload this page to keep working.");
}

function metaPlanId(): number | null {
  try {
    const m: unknown = JSON.parse(read(META_KEY) ?? "null");
    return m && typeof m === "object" && "planId" in m && typeof m.planId === "number" ? m.planId : null;
  } catch {
    return null;
  }
}

function fail(e: unknown) {
  if (e instanceof ConflictError) return showConflict(e.server);
  if (e instanceof NetError) {
    setPhase("offline");
    return retryLater();
  }
  if (e instanceof ApiError && e.status === 404 && planId !== null) return void checkPlanStillThere(); // a plan another device deleted
  if (e instanceof ApiError) return setPhase("error", e.message);
  console.warn("housey: could not sync", e);
  setPhase("error", "Saving did not work. Your changes are still on this device.");
}

/** Try again after a wait that grows (1 s ... 30 s); a new edit, the browser coming back online or the next poll also try. */
function retryLater() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    void retryAll();
  }, retryDelay(attempt++));
}

async function retryAll(): Promise<void> {
  if (frozen) return;
  const waiting = [...docs.values()].filter((d) => !d.synced);
  if (waiting.length) {
    try {
      await reconcileDocs(waiting);
      afterReconcile(waiting);
    } catch (e) {
      return fail(e);
    }
  }
  await flushDirty();
  await retryPending().catch(() => undefined);
}

const flushDirty = () => Promise.all([...docs.values()].filter((d) => dirty.has(d.name)).map((d) => enqueue(() => flush(d)))).catch(() => undefined);

/** Send everything unsaved now (before saving a version, say). Never throws. */
export async function flushNow(): Promise<void> {
  for (const d of docs.values()) clearTimeout(d.timer);
  await flushDirty();
}

/** The page is going away: start the sends now, in a form that outlives it. Anything too big for that stays in the local copy and goes at the next start. */
function flushOnHide() {
  for (const d of docs.values()) {
    clearTimeout(d.timer);
    if (dirty.has(d.name)) void flush(d, true);
  }
}

// ---- reconciling at start --------------------------------------------------------------------------------------------------------------

type Remote = { settings: ServerSettings; plan: PlanReply | null; pieces: unknown[] | null; plans: DashboardList | null; choice: { id: number; fellBack: boolean } | null };

/** The plan the copy in localStorage is of: recorded since several plans exist; before that it was the one plan, which migration 4 made plan 1 'Home'. */
const localOwner = (plans: DashboardList) => planId ?? (plans.dashboards.some((d) => d.id === 1) ? 1 : plans.defaultId);

/** URL `?plan=`, else this device's last choice, else the server's home plan (see `pickPlan`). */
function choosePlan(plans: DashboardList) {
  const saved = Number(read(ACTIVE_KEY));
  return pickPlan({
    param: typeof location === "undefined" ? null : parsePlanParam(location.search),
    saved: Number.isInteger(saved) && saved > 0 ? saved : null,
    defaultId: plans.defaultId,
    plans: plans.dashboards,
    localId: localOwner(plans),
  });
}

async function fetchRemote(list: Doc[]): Promise<Remote> {
  const [settings, plans, pieces] = await Promise.all([
    fetchSettings(),
    list.some((d) => d.kind === "plan") ? fetchDashboards().then((a) => a.list) : null,
    list.some((d) => d.kind === "pieces") ? fetchResources("piece", true).then((r) => r.resources.map((x) => x.json)) : null,
  ]);
  const choice = plans ? choosePlan(plans) : null;
  return { settings, plan: choice ? await fetchPlan(choice.id) : null, pieces, plans, choice };
}

/**
 * The plan store is about to be reconciled with plan `remote.choice`. When the copy in localStorage is of ANOTHER plan (a kiosk opened with `?plan=`, a
 * restored backup that renumbered the plans) it is kept in the stash first (and sent to the server as a saved version) and the local state starts over.
 */
function bindPlan(list: Doc[], remote: Remote) {
  const doc = list.find((d) => d.kind === "plan");
  const { plans, choice } = remote;
  if (!doc || !plans || !choice) return;
  applyList(plans, null);
  const owner = localOwner(plans);
  if (owner !== choice.id) {
    planId = owner;
    if (read(doc.name) !== null) stashLocal(doc, "before opening another plan", false, true);
    forgetLocalPlan(doc);
  }
  planId = choice.id;
  saveMeta();
  publish({ id: planId, notice: choice.fellBack ? "plan-missing" : null });
}

/** Drop everything this device knows about the plan it showed (its copy, revision, unsent edits, conflict). */
function forgetLocalPlan(doc: Doc) {
  forget(doc.name);
  doc.last = null;
  clearDirty(doc.name);
  planRev = null;
  lastPlanJson = null;
  editedAt = null;
  forceOverwrite = false;
  endConflict();
}

async function reconcileDocs(list: Doc[]): Promise<void> {
  const remote = await fetchRemote(list); // nothing is applied unless everything arrived
  bindPlan(list, remote);
  const changed = list.filter((d) => reconcile(d, remote));
  for (const d of list) d.synced = true;
  for (const d of changed) d.onData();
}

function afterReconcile(list: Doc[]) {
  attempt = 0;
  for (const d of list) if (dirty.has(d.name)) schedule(d, 0);
  const pieces = list.find((d) => d.kind === "pieces");
  if (pieces && !embedded) {
    const local = takeField(read(pieces.name) ?? "", "pieces")?.value;
    void syncModels(modelIds(Array.isArray(local) ? local : []));
  }
  if (list.some((d) => d.kind === "plan")) {
    publish({ status: "ready" });
    startPolling();
  }
  if (!embedded) void retryPending().catch(() => undefined); // an embedded view is read-only: models saved while offline are sent by the owner's own tab
  void uploadStashes();
  refreshBanner();
  if (useSync.getState().phase === "offline") setPhase("idle");
}

/** Bring one store's local copy and the server's together. Returns true when the local copy was rewritten (the store must re-read it). */
function reconcile(doc: Doc, remote: Remote): boolean {
  const serverRest = asPersisted(remote.settings[serverKey(doc)]?.value);
  const local = read(doc.name);
  const isDirty = dirty.has(doc.name);

  if (doc.kind === "settings") {
    if (isDirty) return false; // this device's edits win and are sent next
    if (!serverRest) {
      if (local !== null) markDirty(doc.name); // the database has nothing yet: the one-time move of what this device has
      return false;
    }
    const text = JSON.stringify(serverRest);
    if (text === local) return false;
    write(doc.name, text);
    doc.last = text;
    return true;
  }

  const field = doc.kind === "plan" ? "plan" : "pieces";
  const taken = local ? takeField(local, field) : null;
  const rest = isDirty ? (taken?.rest ?? null) : (serverRest ?? taken?.rest ?? null);
  const restChanged = !isDirty && !!serverRest && JSON.stringify(serverRest) !== JSON.stringify(taken?.rest ?? null);
  if (!isDirty && !serverRest && taken) markDirty(doc.name); // the settings part: the one-time move too

  const next = doc.kind === "plan" ? reconcilePlan(doc, remote.plan, taken, isDirty) : reconcilePieces(doc, remote.pieces ?? [], taken, isDirty);
  if (!next.changed && !restChanged) return false;
  const text = putField(rest, field, next.value, next.version ?? rest?.version ?? doc.version);
  write(doc.name, text);
  doc.last = text;
  return true;
}

type Next = { changed: boolean; value: unknown; version?: number };

function reconcilePlan(doc: Doc, reply: PlanReply | null, taken: Taken | null, isDirty: boolean): Next {
  const localPlan = taken?.value;
  const server = reply && "format" in reply ? reply : null;
  const decision = decidePlan({
    serverRev: reply?.rev ?? 0,
    localRev: planRev,
    hasLocal: localPlan !== undefined,
    dirty: isDirty,
    sameContent: () => !!server && JSON.stringify(localPlan) === JSON.stringify(server.plan),
    serverPristine: () => !!server && !!doc.isStarter?.(server.plan),
    localPristine: () => localPlan !== undefined && !!doc.isStarter?.(localPlan),
  });
  switch (decision) {
    case "apply":
      if (!server) break;
      if (localPlan !== undefined) stashLocal(doc, "before taking the server's plan", false, false); // never replace a plan without keeping it
      planRev = server.rev;
      lastPlanJson = JSON.stringify(server.plan);
      endConflict();
      saveMeta();
      return { changed: true, value: server.plan, version: server.format };
    case "adopt":
    case "same":
      if (server) {
        planRev = server.rev;
        lastPlanJson = JSON.stringify(server.plan);
        saveMeta();
      }
      break;
    case "keep-local": // this device's own plan wins over a server that only has the untouched starter; the server's plan is kept as a version
      if (server) planRev = server.rev;
      lastPlanJson = null;
      forceOverwrite = true;
      markDirty(doc.name);
      saveMeta();
      break;
    case "upload":
      markDirty(doc.name);
      break;
    case "conflict":
      showConflict(server);
      break;
    default:
      break; // "push" is sent next; "none" has nothing to do
  }
  return { changed: false, value: localPlan };
}

function reconcilePieces(doc: Doc, serverList: unknown[], taken: Taken | null, isDirty: boolean): Next {
  const localList = (Array.isArray(taken?.value) ? taken.value : []).filter(hasKind);
  const serverPieces = serverList.filter(hasKind);
  onServer.clear();
  for (const p of serverPieces) onServer.set(p.kind, JSON.stringify(p));
  const merged = mergePieces(localList, serverPieces, basePieces, isDirty);
  if (!isDirty) basePieces = new Set(onServer.keys());
  const { put, remove } = diffPieces(merged, onServer);
  if (put.length || remove.length) markDirty(doc.name); // pieces only this device has: the one-time move
  saveMeta();
  return { changed: JSON.stringify(merged) !== JSON.stringify(localList), value: merged };
}

// ---- a newer plan on the server -------------------------------------------------------------------------------------------------------

const planDoc = () => [...docs.values()].find((d) => d.kind === "plan");

function showConflict(server: ServerPlan | null) {
  const local = countsOf(read(planDoc()?.name ?? PLAN_NAME) ?? "") ?? { items: 0, walls: 0, rooms: 0 };
  conflict = { server };
  useSync.setState({ conflict: { server: { ...planCounts(server?.plan), at: server?.updatedAt ?? null }, local: { ...local, at: editedAt } }, phase: "idle", message: "" });
}

function endConflict() {
  conflict = null;
  useSync.setState({ conflict: null });
}

// ---- plans this device kept before replacing them ---------------------------------------------------------------------------------------
// (keeping them, sending them to the server and the banner live in lib/dbStash; here is what changes the plan on screen)

const PLAN_NAME = "housey-plan";

/** Make a kept plan the plan on screen again. The plan being replaced is kept first, and the server keeps its own working plan as a saved version. */
export function restoreStash(e: StashEntry): void {
  const doc = planDoc();
  const s = store();
  const text = s ? readStash(s, e.slot) : null;
  const taken = text ? takeField(text, "plan") : null;
  if (!doc || !s || !taken || taken.value === undefined) return;
  stashLocal(doc, "before restoring an earlier version", false, true);
  const local = read(doc.name);
  const next = putField((local ? takeField(local, "plan")?.rest : null) ?? taken.rest, "plan", taken.value, doc.version);
  write(doc.name, next);
  doc.last = next;
  lastPlanJson = null; // send it even if it looks like what the server has
  forceOverwrite = true;
  editedAt = Date.now();
  endConflict();
  markDirty(doc.name);
  markSeen(s, e);
  saveMeta();
  doc.onData();
  schedule(doc, 0);
  refreshBanner();
}

/** Write a plan from the server into the local copy and tell the store. `stash`: the plan now on this device is kept (and maybe sent to the server) first. */
function applyServerPlan(s: ServerPlan, stash: { reason: string; loud: boolean; upload: boolean } | null) {
  const doc = planDoc();
  if (!doc) return;
  if (stash) stashLocal(doc, stash.reason, stash.loud, stash.upload);
  const local = read(doc.name);
  const text = putField(local ? (takeField(local, "plan")?.rest ?? null) : null, "plan", s.plan, s.format);
  write(doc.name, text);
  doc.last = text;
  planRev = s.rev;
  lastPlanJson = JSON.stringify(s.plan);
  endConflict();
  clearDirty(doc.name);
  doc.onData();
  refreshBanner();
}

/** Show a plan the server just returned (after "Restore" in the Data panel). */
export const adoptServerPlan = (p: ServerPlan): void => applyServerPlan(p, { reason: "before restoring a version", loud: false, upload: false });

/**
 * The two choices when this device and the server hold different plans. "mine" keeps this device's plan and saves it over the server's (the server's
 * is kept as a saved version). "server" loads the server's plan; this device's plan is kept first (rotating stash + a saved version on the server).
 */
export async function resolveConflict(choice: "server" | "mine"): Promise<void> {
  const pending = conflict;
  const doc = planDoc();
  if (!pending || !doc) return;
  if (choice === "server") {
    if (pending.server) applyServerPlan(pending.server, { reason: "before loading", loud: true, upload: true });
    else endConflict();
    return;
  }
  const id = planId;
  const taken = takeField(read(doc.name) ?? "", "plan");
  if (!taken || taken.value === undefined || id === null) return;
  try {
    const r = await savePlan(id, { plan: taken.value, baseRev: pending.server?.rev ?? 0, format: taken.rest.version, overwrite: true });
    planRev = r.rev;
    lastPlanJson = JSON.stringify(taken.value);
    endConflict();
    clearDirty(doc.name);
    setPhase("saved");
  } catch (e) {
    fail(e); // another device saved again: the choice now offers that newer copy
  }
}

// ---- polling for plans saved on other devices ------------------------------------------------------------------------------------------

async function poll(): Promise<void> {
  const doc = planDoc();
  const id = planId;
  if (!doc?.synced || id === null || frozen || document.visibilityState !== "visible") return;
  const startedAt = Date.now();
  try {
    const answer = await fetchDashboardsIfChanged(listEtag); // one small conditional request per poll: a 304 when nothing changed anywhere
    if (useSync.getState().phase === "offline") {
      setPhase("idle");
      void retryAll();
    }
    if (answer) applyList(answer.list, answer.etag);
    if (!planList || planId !== id) return;
    const entry = planList.dashboards.find((d) => d.id === id);
    if (!entry) return void leaveMissingPlan();
    if (entry.rev === planRev) return;
    const r = await fetchPlan(id, planRev ?? undefined);
    if (planId !== id || "unchanged" in r || !("format" in r)) return;
    if (conflict) {
      if (conflict.server?.rev !== r.rev) showConflict(r); // already asking: just offer the newest copy
      return;
    }
    const verdict = decidePoll({ serverRev: r.rev, localRev: planRev, dirty: dirty.has(doc.name), busy: inflight > 0, staleAnswer: lastPushDoneAt > startedAt });
    if (verdict === "apply") applyServerPlan(r, { reason: "before taking another device's change", loud: false, upload: false });
    else if (verdict === "conflict") showConflict(r);
  } catch (e) {
    if (e instanceof NetError) {
      setPhase("offline");
      retryLater();
    }
  }
}

function startPolling() {
  if (polling) return;
  polling = true;
  setInterval(() => void poll(), POLL_MS);
}

// ---- which plan is on screen -----------------------------------------------------------------------------------------------------------

/** The plan on screen, null until the first sync decided it. */
export const activePlanId = (): number | null => planId;

export const dismissPlanNotice = (): void => publish({ notice: null });

function applyList(list: DashboardList, etag: string | null) {
  planList = list;
  listEtag = etag;
  publish({ list: list.dashboards, defaultId: list.defaultId });
}

/** Read the plan list now (after this device changed a plan). When the plan on screen is gone the screen moves to the home plan. */
export async function refreshPlans(): Promise<DashboardList> {
  const a = await fetchDashboards();
  applyList(a.list, a.etag);
  if (planId !== null && !a.list.dashboards.some((d) => d.id === planId)) void leaveMissingPlan();
  return a.list;
}

/** A save was answered "not found": either the plan was deleted on another device (then the screen moves to the home plan) or something else is wrong. */
async function checkPlanStillThere(): Promise<void> {
  try {
    const list = await refreshPlans();
    if (planId !== null && list.dashboards.some((d) => d.id === planId)) setPhase("error", "The server could not find this plan. Your changes are still on this device.");
  } catch (e) {
    if (e instanceof NetError) {
      setPhase("offline");
      retryLater();
    }
  }
}

let leaving = false;
/** The plan on screen was deleted on another device: keep this device's copy (stash, and a saved version of the home plan), then show the home plan. */
async function leaveMissingPlan(): Promise<void> {
  const doc = planDoc();
  const home = planList?.defaultId;
  if (leaving || !doc || home === undefined) return;
  leaving = true;
  try {
    stashLocal(doc, "plan deleted on another device", false, true);
    bindLoaded(doc, home, await loadPlan(doc, home));
    publish({ notice: "plan-removed" });
  } catch (e) {
    fail(e);
  } finally {
    leaving = false;
  }
}

/** A plan's working plan and its own settings row, as the screen needs them. A plan that has no drawing yet starts empty. */
async function loadPlan(doc: Doc, id: number): Promise<{ plan: ServerPlan; rest: Persisted | null }> {
  const [reply, settings] = await Promise.all([fetchPlan(id), fetchSettings()]);
  const plan = "format" in reply ? reply : await startEmpty(doc, id);
  return { plan, rest: asPersisted(settings[planSettingsKey(id)]?.value) };
}

async function startEmpty(doc: Doc, id: number): Promise<ServerPlan> {
  const plan = { walls: [], openings: [], rooms: [], items: [] };
  const saved = await savePlan(id, { plan, baseRev: 0, format: doc.version });
  return { rev: saved.rev, updatedAt: saved.updatedAt, format: doc.version, plan };
}

/** Make plan `id` the plan on screen: its plan and settings row go into the local copy, the sync state is rebound and the store re-reads. No awaits, so all of it changes together. */
function bindLoaded(doc: Doc, id: number, loaded: { plan: ServerPlan; rest: Persisted | null }) {
  planId = id;
  planRev = loaded.plan.rev;
  lastPlanJson = JSON.stringify(loaded.plan.plan);
  forceOverwrite = false;
  editedAt = null;
  endConflict();
  clearDirty(doc.name);
  const text = putField(loaded.rest, "plan", loaded.plan.plan, loaded.plan.format);
  write(doc.name, text);
  doc.last = text;
  write(ACTIVE_KEY, String(id));
  saveMeta();
  publish({ id, notice: null });
  doc.onData();
  refreshBanner();
}

/** The switch cannot happen now; the message is in words for the user. */
export class SwitchRefused extends Error {}

const unsaved = (doc: Doc) => dirty.has(doc.name) || !!conflict;

/**
 * Show another plan. Everything unsaved is sent first and a switch is refused while anything is still waiting (never lose an edit); then the other plan
 * and its settings row are fetched and swapped in. The previous plan is safe on the server, so nothing needs stashing. An `ApiError` 404 means the plan is gone.
 */
export async function switchPlanTo(id: number): Promise<void> {
  const doc = planDoc();
  if (!doc?.synced || planId === null || frozen || planStatus() !== "ready") throw new SwitchRefused("Doshy is still busy. Try again in a moment.");
  if (id === planId) return;
  await flushNow();
  if (unsaved(doc)) throw new SwitchRefused("Can't switch plans while changes are waiting to be saved.");
  publish({ status: "switching" });
  try {
    const loaded = await loadPlan(doc, id);
    if (unsaved(doc)) throw new SwitchRefused("Can't switch plans while changes are waiting to be saved."); // edited while the other plan was loading
    bindLoaded(doc, id, loaded);
  } finally {
    publish({ status: "ready" });
  }
}

// ---- start -----------------------------------------------------------------------------------------------------------------------------

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("pagehide", flushOnHide);
  window.addEventListener("online", () => void retryAll());
  document.addEventListener("visibilitychange", () => (document.visibilityState === "visible" ? void poll() : flushOnHide()));
  const s = store();
  const earlier = s ? mirrorLegacy(s) : null; // the older single stash slot is copied (not moved) into the rotating stash
  if (typeof earlier?.slot === "number") {
    stashUp.add(earlier.slot);
    saveMeta();
  }
  refreshBanner(); // from localStorage alone: the banner does not wait for the server
  // after the current task, so every store module has registered (they are all imported together)
  setTimeout(() => {
    const all = [...docs.values()];
    void reconcileDocs(all).then(() => afterReconcile(all), fail);
  }, 0);
}

/** After a backup import: forget this device's copy (it must not overwrite the restored data) and load everything fresh from the server. The plan on this device is stashed first and sent to the restored database as a saved version. */
export function discardLocalAndReload(): void {
  const doc = planDoc();
  if (doc) stashLocal(doc, "before a backup import", true, true);
  frozen = true;
  for (const d of docs.values()) clearTimeout(d.timer);
  for (const key of [...docs.keys(), ACTIVE_KEY]) forget(key);
  planRev = null;
  planId = null; // the restored database may number its plans differently: the next start chooses again
  planList = null;
  listEtag = null;
  editedAt = null;
  dirty.clear();
  basePieces = new Set();
  saveMeta(); // keeps what is still waiting to be sent to the server (stashed plans)
  location.reload();
}
