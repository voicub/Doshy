import type { StateStorage } from "zustand/middleware";
import {
  ApiError,
  ConflictError,
  NetError,
  deleteResource,
  fetchPlan,
  fetchResources,
  fetchSettings,
  putResource,
  savePlan,
  saveSettings,
  saveVersion,
  type PlanReply,
  type ServerPlan,
  type ServerSettings,
} from "./dbApi.ts";
import { KEEPALIVE_MAX_BYTES, asPersisted, decidePlan, decidePoll, diffPieces, mergePieces, modelIds, putField, retryDelay, takeField, type Taken } from "./dbMerge.ts";
import { countsOf, listStash, markSeen, mirrorLegacy, planCounts, readStash, stashPlan, unseenStash, type StashEntry } from "./planStash.ts";
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
const DEBOUNCE_MS = 800;
const POLL_MS = 15_000;

type Timer = ReturnType<typeof setTimeout>;
type Doc = { name: string; kind: DocKind; version: number; isStarter?: (plan: unknown) => boolean; onData: () => void; timer: Timer | undefined; last: string | null; synced: boolean };

const docs = new Map<string, Doc>();
const dirty = new Set<string>(); // stores with edits the server has not confirmed
let planRev: number | null = null; // the plan revision this device last synced
let basePieces = new Set<string>(); // custom piece kinds that were on the server at the last sync
const onServer = new Map<string, string>(); // custom piece kind -> its JSON as last known on the server
let lastPlanJson: string | null = null; // the plan text the server is known to hold
let conflict: { server: ServerPlan | null } | null = null;
let editedAt: number | null = null; // when this device's plan was last changed here
const stashUp = new Set<number>(); // kept plans (stash slots) still waiting to be sent to the server as saved versions
let forceOverwrite = false; // the next plan save replaces the server's plan on purpose (the server keeps what it replaces as a version)
let started = false;
let polling = false;
let frozen = false; // after a backup import: this device's old copy must not be sent anywhere
let inflight = 0;
let lastPushDoneAt = 0;
let attempt = 0;
let retryTimer: Timer | undefined;
let chain: Promise<unknown> = Promise.resolve();

// ---- the local copy -------------------------------------------------------------------------------------------------------------------

const store = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // storage blocked (private mode)
  }
};
const read = (key: string): string | null => {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    store()?.setItem(key, value);
  } catch {
    /* full or blocked: the server still gets it */
  }
};

function loadMeta() {
  try {
    const m: unknown = JSON.parse(read(META_KEY) ?? "null");
    if (!m || typeof m !== "object") return;
    if ("rev" in m && typeof m.rev === "number") planRev = m.rev;
    if ("edited" in m && typeof m.edited === "number") editedAt = m.edited;
    if ("dirty" in m && Array.isArray(m.dirty)) for (const d of m.dirty) if (typeof d === "string") dirty.add(d);
    if ("pieces" in m && Array.isArray(m.pieces)) basePieces = new Set(m.pieces.filter((k): k is string => typeof k === "string"));
    if ("stashUp" in m && Array.isArray(m.stashUp)) for (const n of m.stashUp) if (typeof n === "number") stashUp.add(n);
  } catch {
    /* start clean */
  }
}
const saveMeta = () => write(META_KEY, JSON.stringify({ rev: planRev, edited: editedAt, dirty: [...dirty], pieces: [...basePieces], stashUp: [...stashUp] }));
function markDirty(name: string) {
  if (dirty.has(name)) return;
  dirty.add(name);
  saveMeta();
}
function clearDirty(name: string) {
  if (dirty.delete(name)) saveMeta();
}

// ---- the storage adapter --------------------------------------------------------------------------------------------------------------

/**
 * `StateStorage` for zustand's `createJSONStorage`. Call once per persisted store with the store's persist `name` and `version`.
 * Then `bind` the store's rehydrate so server data that arrives later reaches the screen.
 */
export function dbStorage(name: string, kind: DocKind, version: number, isStarter?: (plan: unknown) => boolean): DbStorage {
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
      doc.last = value;
      write(key, value);
      if (kind === "plan") editedAt = Date.now();
      markDirty(name);
      saveMeta();
      schedule(doc, DEBOUNCE_MS);
    },
    removeItem: (key) => {
      try {
        store()?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
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

/** Send one store's pending changes. Returns false when part of it had to wait (a conflict, or too big for a page-hide send). */
async function push(doc: Doc, value: string, keepalive: boolean): Promise<boolean> {
  if (doc.kind === "settings") {
    await saveSettings({ [doc.name]: JSON.parse(value) }, keepalive);
    return true;
  }
  const taken = takeField(value, doc.kind === "plan" ? "plan" : "pieces");
  if (!taken) return true; // unreadable local text: nothing to send
  await saveSettings({ [doc.name]: taken.rest }, keepalive);
  return doc.kind === "plan" ? pushPlan(taken.value, taken.rest.version, keepalive) : pushPieces(taken.value, keepalive);
}

async function pushPlan(plan: unknown, format: number, keepalive: boolean): Promise<boolean> {
  if (conflict) return false; // waits for the user's choice
  if (plan === undefined) return true;
  const json = JSON.stringify(plan);
  if (json === lastPlanJson) return true;
  const body = { plan, baseRev: planRev ?? 0, format, ...(forceOverwrite ? { overwrite: true } : {}) };
  if (keepalive && JSON.stringify(body).length > KEEPALIVE_MAX_BYTES) return false;
  const r = await savePlan(body, keepalive);
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

function fail(e: unknown) {
  if (e instanceof ConflictError) return showConflict(e.server);
  if (e instanceof NetError) {
    setPhase("offline");
    return retryLater();
  }
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

type Remote = { settings: ServerSettings; plan: PlanReply | null; pieces: unknown[] | null };

async function fetchRemote(list: Doc[]): Promise<Remote> {
  const [settings, plan, pieces] = await Promise.all([
    fetchSettings(),
    list.some((d) => d.kind === "plan") ? fetchPlan() : null,
    list.some((d) => d.kind === "pieces") ? fetchResources("piece", true).then((r) => r.resources.map((x) => x.json)) : null,
  ]);
  return { settings, plan, pieces };
}

async function reconcileDocs(list: Doc[]): Promise<void> {
  const remote = await fetchRemote(list); // nothing is applied unless everything arrived
  const changed = list.filter((d) => reconcile(d, remote));
  for (const d of list) d.synced = true;
  for (const d of changed) d.onData();
}

function afterReconcile(list: Doc[]) {
  attempt = 0;
  for (const d of list) if (dirty.has(d.name)) schedule(d, 0);
  const pieces = list.find((d) => d.kind === "pieces");
  if (pieces) {
    const local = takeField(read(pieces.name) ?? "", "pieces")?.value;
    void syncModels(modelIds(Array.isArray(local) ? local : []));
  }
  if (list.some((d) => d.kind === "plan")) startPolling();
  void retryPending().catch(() => undefined);
  void uploadStashes();
  refreshBanner();
  if (useSync.getState().phase === "offline") setPhase("idle");
}

/** Bring one store's local copy and the server's together. Returns true when the local copy was rewritten (the store must re-read it). */
function reconcile(doc: Doc, remote: Remote): boolean {
  const serverRest = asPersisted(remote.settings[doc.name]?.value);
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

const PLAN_NAME = "housey-plan";
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** What the "We kept your previous plan" banner offers: the newest kept plan the user has not dealt with that differs from the plan on screen. */
function refreshBanner() {
  const s = store();
  useSync.setState({ stash: s ? unseenStash(s, read(planDoc()?.name ?? PLAN_NAME)) : null });
}

/**
 * Keep the plan now in localStorage in the rotating stash (the last 10), BEFORE anything replaces it. `loud`: the user is told about it (banner);
 * `upload`: it is also sent to the server as a saved version "This device, <reason> <time>" so any device can restore it.
 */
function stashLocal(doc: Doc, reason: string, loud: boolean, upload: boolean) {
  const s = store();
  const text = read(doc.name);
  if (!s || !text) return;
  const e = stashPlan(s, text, reason);
  if (!e) return;
  if (!loud) markSeen(s, e);
  if (upload && typeof e.slot === "number") {
    stashUp.add(e.slot);
    saveMeta();
    void uploadStashes();
  }
  refreshBanner();
}

let uploading = false;
/** Send the kept plans that are waiting to the server as saved versions. Stops quietly while it is out of reach; tried again later. */
async function uploadStashes(): Promise<void> {
  const s = store();
  if (!s || uploading || frozen || !stashUp.size) return;
  uploading = true;
  try {
    for (const slot of [...stashUp]) {
      const entry = listStash(s).find((x) => x.slot === slot);
      const text = readStash(s, slot);
      const taken = text ? takeField(text, "plan") : null;
      if (!entry || !taken || taken.value === undefined) {
        stashUp.delete(slot);
        continue;
      }
      try {
        await saveVersion(`This device, ${entry.reason}${entry.at ? ` ${hhmm(entry.at)}` : ""}`.slice(0, 60), { plan: taken.value, format: taken.rest.version });
        stashUp.delete(slot);
      } catch (e) {
        if (e instanceof NetError) return;
        stashUp.delete(slot); // the server refused it (too big...): it stays on this device
        console.warn("housey: a kept plan could not be sent to the server", e);
      }
    }
  } finally {
    uploading = false;
    saveMeta();
  }
}

/** The kept plans on this device, newest first (for "Restore my previous version"). */
export const stashEntries = (): StashEntry[] => {
  const s = store();
  return s ? listStash(s) : [];
};

/** The user has seen this kept plan and wants no banner for it. It stays in the list. */
export function dismissStash(e: StashEntry): void {
  const s = store();
  if (s) markSeen(s, e);
  refreshBanner();
}

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
  const taken = takeField(read(doc.name) ?? "", "plan");
  if (!taken || taken.value === undefined) return;
  try {
    const r = await savePlan({ plan: taken.value, baseRev: pending.server?.rev ?? 0, format: taken.rest.version, overwrite: true });
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
  if (!doc?.synced || frozen || document.visibilityState !== "visible") return;
  const startedAt = Date.now();
  try {
    const r = await fetchPlan(planRev ?? undefined);
    if (useSync.getState().phase === "offline") {
      setPhase("idle");
      void retryAll();
    }
    if ("unchanged" in r || !("format" in r)) return;
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
  for (const key of docs.keys()) {
    try {
      store()?.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  planRev = null;
  editedAt = null;
  dirty.clear();
  basePieces = new Set();
  saveMeta(); // keeps what is still waiting to be sent to the server (stashed plans)
  location.reload();
}
