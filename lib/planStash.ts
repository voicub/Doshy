/**
 * A rotating stash of plans that were about to be replaced on this device. Whatever overwrites the plan in localStorage (loading the server's
 * version, a restore, a backup import, taking the server's plan at start) puts the plan it replaces here first, so nothing the user drew can
 * be lost by a sync decision. The newest `SLOTS` are kept in `housey-plan-before-load-1..10`, with a small index (time, reason, counts).
 * `housey-plan-before-load` is the older single slot: it is read, listed and never written, moved or deleted.
 */
export const LEGACY_KEY = "housey-plan-before-load";
export const INDEX_KEY = "housey-plan-stash-index";
export const SEEN_KEY = "housey-plan-stash-seen";
export const SLOTS = 10;

/** The bits of `Storage` used here (so tests can pass a fake, quota errors included). */
export type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type PlanCounts = { items: number; walls: number; rooms: number };
/** `slot` is 1..10, or "legacy" for the older single slot (no time known). */
export type StashEntry = PlanCounts & { slot: number | "legacy"; at: number | null; reason: string; bytes: number };

const slotKey = (slot: number | "legacy") => (slot === "legacy" ? LEGACY_KEY : `${LEGACY_KEY}-${slot}`);

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/** Item, wall and room counts of a plan object. */
export function planCounts(plan: unknown): PlanCounts {
  const p = plan && typeof plan === "object" ? plan : {};
  return { items: "items" in p ? len(p.items) : 0, walls: "walls" in p ? len(p.walls) : 0, rooms: "rooms" in p ? len(p.rooms) : 0 };
}

/** What a persisted plan-store value holds: item, wall and room counts; null when it is not a persisted plan. */
export function countsOf(text: string): PlanCounts | null {
  try {
    const p: unknown = JSON.parse(text);
    if (!p || typeof p !== "object" || !("state" in p) || !p.state || typeof p.state !== "object" || !("plan" in p.state) || !p.state.plan || typeof p.state.plan !== "object") return null;
    return planCounts(p.state.plan);
  } catch {
    return null;
  }
}

function readIndex(store: Store): StashEntry[] {
  try {
    const v: unknown = JSON.parse(store.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e): e is StashEntry => !!e && typeof e === "object" && typeof e.slot === "number" && e.slot >= 1 && e.slot <= SLOTS) : [];
  } catch {
    return [];
  }
}

const writeIndex = (store: Store, list: StashEntry[]) => store.setItem(INDEX_KEY, JSON.stringify(list));

function legacyEntry(store: Store): StashEntry | null {
  const text = store.getItem(LEGACY_KEY);
  const c = text ? countsOf(text) : null;
  return text && c ? { slot: "legacy", at: null, reason: "Kept earlier from this device", bytes: text.length, ...c } : null;
}

/** Newest first; the older single slot (if it holds a plan not already copied into a slot) comes last. Entries whose text is gone are left out. */
export function listStash(store: Store): StashEntry[] {
  const kept = readIndex(store).filter((e) => store.getItem(slotKey(e.slot)) !== null);
  const legacy = legacyEntry(store);
  const text = legacy ? store.getItem(LEGACY_KEY) : null;
  const copied = !!legacy && kept.some((e) => e.bytes === legacy.bytes && store.getItem(slotKey(e.slot)) === text);
  return legacy && !copied ? [...kept, legacy] : kept;
}

export const readStash = (store: Store, slot: number | "legacy"): string | null => store.getItem(slotKey(slot));

/**
 * Keep `text` (a persisted plan-store value) as the newest stash entry. Returns the entry, or null when it was not worth keeping (not a plan,
 * or the very same text is already the newest entry) or could not be stored. When storage is full the oldest entries are dropped to make room:
 * the newest is the one that matters.
 */
export function stashPlan(store: Store, text: string, reason: string, now: number | null = Date.now()): StashEntry | null {
  const counts = countsOf(text);
  if (!counts) return null;
  let index = readIndex(store);
  if (index[0] && store.getItem(slotKey(index[0].slot)) === text) return null;
  for (;;) {
    const used = new Set(index.map((e) => e.slot));
    const slot = index.length >= SLOTS ? index[index.length - 1].slot : ([...Array(SLOTS).keys()].map((i) => i + 1).find((s) => !used.has(s)) ?? 1);
    const kept = index.filter((e) => e.slot !== slot);
    try {
      store.setItem(slotKey(slot), text);
      const entry: StashEntry = { slot, at: now, reason, bytes: text.length, ...counts };
      writeIndex(store, [entry, ...kept]);
      return entry;
    } catch {
      // storage is full: give up the oldest entry and try again; with nothing left to give up, the plan is not stashed
      const oldest = kept.length ? kept[kept.length - 1] : null;
      if (!oldest) return null;
      store.removeItem(slotKey(oldest.slot));
      index = kept.filter((e) => e.slot !== oldest.slot);
      try {
        writeIndex(store, index);
      } catch {
        /* the index is rebuilt from what is there next time */
      }
    }
  }
}

/** Copy (never move) the older single slot into the rotating stash, once: it then rotates like the rest and is mirrored to the server. The old key stays exactly as it is. */
export function mirrorLegacy(store: Store): StashEntry | null {
  const text = store.getItem(LEGACY_KEY);
  if (!text || !countsOf(text)) return null;
  if (readIndex(store).some((e) => store.getItem(slotKey(e.slot)) === text)) return null;
  return stashPlan(store, text, "Plan this device kept earlier", null);
}

/** Which stash entries the user has already dealt with (restored, or dismissed the banner for), by `slot:at`. */
function seenSet(store: Store): Set<string> {
  try {
    const v: unknown = JSON.parse(store.getItem(SEEN_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

const idOf = (e: StashEntry) => `${e.slot}:${e.at ?? 0}`;

export function markSeen(store: Store, e: StashEntry): void {
  try {
    store.setItem(SEEN_KEY, JSON.stringify([...seenSet(store), idOf(e)].slice(-50)));
  } catch {
    /* the banner may come back: harmless */
  }
}

/**
 * The newest stash entry the user has not dealt with whose plan differs from the plan on screen (`activeText`, the persisted value now in use),
 * or null. This is what the "We kept your previous plan" banner offers.
 */
export function unseenStash(store: Store, activeText: string | null): StashEntry | null {
  const seen = seenSet(store);
  const planOf = (text: string | null): string | null => {
    try {
      const p: unknown = JSON.parse(text ?? "null");
      return p && typeof p === "object" && "state" in p && p.state && typeof p.state === "object" && "plan" in p.state ? JSON.stringify(p.state.plan) : null;
    } catch {
      return null;
    }
  };
  const active = planOf(activeText);
  for (const e of listStash(store)) {
    if (seen.has(idOf(e))) continue;
    const text = readStash(store, e.slot);
    if (text !== null && planOf(text) !== active) return e;
  }
  return null;
}
