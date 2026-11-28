import { ApiError, NetError, deleteResource, fetchResourceFile, fetchResources, putResource } from "./dbApi.ts";
import { fetchGuestModel } from "./guestApi.ts";
import { guestTokenOf, onGuestPage } from "./guestMode.ts";
import { setPhase } from "./syncStatus.ts";

/**
 * Imported 3D model files. The server database keeps them (resources, kind "model"); this browser's IndexedDB is a read-through copy, so a
 * model loads instantly and still works while the server is down. A model saved while the server is unreachable is kept in IndexedDB and
 * sent when it is back (`retryPending`). Models that only exist in this browser's IndexedDB (imported before the database) are sent once (`syncModels`).
 */
const DB = "housey-models";
const STORE = "models";
const PENDING_KEY = "housey-db-pending";

type StoredModel = { ext: "glb" | "gltf"; buf: ArrayBuffer };

const MIME: Record<StoredModel["ext"], string> = { glb: "model/gltf-binary", gltf: "model/gltf+json" };
const extOf = (mime: string): StoredModel["ext"] => (mime.startsWith(MIME.gltf) ? "gltf" : "glb");

// ---- this browser's copy ------------------------------------------------------------------------------------------------------------

let opened: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser cannot keep 3D models (private mode?)."));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the model storage."));
  }).catch((e) => {
    opened = null;
    throw e;
  });
  return opened;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Model storage failed."));
  });
}

const cachePut = (id: string, m: StoredModel) => run("readwrite", (s) => s.put(m, id)).then(() => undefined);
const cacheGet = (id: string) => run<StoredModel | undefined>("readonly", (s) => s.get(id)).catch(() => undefined);
const cacheDelete = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined, () => undefined);

// ---- what still has to reach the server --------------------------------------------------------------------------------------------

type Pending = { put: string[]; del: string[] };

function loadPending(): Pending {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null");
    if (p && typeof p === "object" && "put" in p && "del" in p && Array.isArray(p.put) && Array.isArray(p.del)) {
      return { put: p.put.filter((x): x is string => typeof x === "string"), del: p.del.filter((x): x is string => typeof x === "string") };
    }
  } catch {
    /* none */
  }
  return { put: [], del: [] };
}

function update(fn: (p: Pending) => Pending) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(fn(loadPending())));
  } catch {
    /* storage full or blocked: the next start re-checks which models the server lacks */
  }
}

const without = (list: string[], id: string) => list.filter((x) => x !== id);
const queue = (which: keyof Pending, id: string) =>
  update((p) => {
    const next: Pending = { put: without(p.put, id), del: without(p.del, id) };
    next[which].push(id);
    return next;
  });
const settle = (id: string) => update((p) => ({ put: without(p.put, id), del: without(p.del, id) }));

const send = (id: string, m: StoredModel, name?: string) =>
  putResource({ id, kind: "model", mime: MIME[m.ext], name: name || id, meta: { ext: m.ext, bytes: m.buf.byteLength } }, m.buf);

// ---- the public functions ------------------------------------------------------------------------------------------------------------

/** Keep a model: in this browser at once, and in the database. Throws a readable Error when the server refuses it (too big, no room). `name` is what the Data panel lists it as. */
export async function putModel(id: string, m: StoredModel, name?: string): Promise<void> {
  const cached = await cachePut(id, m).then(() => true, () => false);
  try {
    await send(id, m, name);
    settle(id);
  } catch (e) {
    if (e instanceof NetError) {
      if (!cached) throw new Error("The server cannot be reached and this browser cannot keep the model either.");
      queue("put", id); // works here now; goes to the server when it is back
      setPhase("offline");
      return;
    }
    await cacheDelete(id);
    throw new Error(e instanceof ApiError ? e.message : "The model could not be kept.");
  }
}

/** A stored model, from this browser's copy or else from the server (and then copied here). undefined when neither has it. */
export async function getModel(id: string): Promise<StoredModel | undefined> {
  if (onGuestPage()) {
    const token = guestTokenOf(location.pathname); // a guest reads a model from its link's own route, and never from or into this browser's saved models
    return token ? fetchGuestModel(token, id) : undefined;
  }
  const hit = await cacheGet(id);
  if (hit) return hit;
  try {
    const file = await fetchResourceFile(id);
    if (!file) return undefined;
    const m: StoredModel = { ext: extOf(file.mime), buf: file.buf };
    void cachePut(id, m).catch(() => undefined);
    return m;
  } catch {
    return undefined; // server unreachable and not cached here: the piece shows its stand-in box
  }
}

export async function deleteModel(id: string): Promise<void> {
  await cacheDelete(id);
  try {
    await deleteResource(id);
    settle(id);
  } catch (e) {
    if (!(e instanceof NetError)) throw e;
    queue("del", id);
  }
}

/** Send what was saved or deleted while the server was out of reach. Stops quietly at the first sign it still is. */
export async function retryPending(): Promise<void> {
  for (const id of loadPending().put) {
    const m = await cacheGet(id);
    try {
      if (m) await send(id, m);
    } catch (e) {
      if (e instanceof NetError) return;
      console.warn(`housey: model ${id} was refused by the server`, e); // stays in this browser only
    }
    settle(id);
  }
  for (const id of loadPending().del) {
    try {
      await deleteResource(id);
    } catch (e) {
      if (e instanceof NetError) return;
    }
    settle(id);
  }
}

/** The one-time move: models this browser has (for these ids) that the server does not are sent. Best effort; a model the server refuses stays in this browser. */
export async function syncModels(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const have = new Set((await fetchResources("model")).resources.map((r) => r.id));
    for (const id of ids) {
      if (have.has(id)) continue;
      const m = await cacheGet(id);
      if (m) await send(id, m).catch((e) => console.warn(`housey: model ${id} could not be moved to the database`, e));
    }
  } catch {
    /* offline: checked again at the next start */
  }
}

// ---- plan files ---------------------------------------------------------------------------------------------------------------------

const CHUNK = 0x8000;

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

export function fromBase64(b64: string): ArrayBuffer {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}
