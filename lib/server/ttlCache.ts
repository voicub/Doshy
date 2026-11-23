// A small in-memory cache of async results for the Home Assistant routes: answers are reused for `ttlMs`, and callers that ask while the same
// answer is still being fetched share that one fetch (so several browsers polling together cost Home Assistant one request, not one each).
// A failed fetch is never kept. At most `maxEntries` keys are held, so a client cycling through parameters cannot grow it.
export type TtlCache<T> = {
  /** The cached answer for `key`, or the result of `load()` (stored for next time). `fresh` skips a stored answer but still joins a fetch already running. */
  get(key: string, load: () => Promise<T>, opts?: { fresh?: boolean }): Promise<T>;
  /** Forget every stored answer (something changed that makes them stale). A fetch already running still answers its own callers, but is not stored. */
  clear(): void;
};

type Entry<T> = { at: number; settled: boolean; value: Promise<T> };

export function ttlCache<T>(ttlMs: number, maxEntries: number, now: () => number = Date.now): TtlCache<T> {
  const entries = new Map<string, Entry<T>>();
  return {
    get(key, load, opts) {
      const hit = entries.get(key);
      if (hit && (!hit.settled || (!opts?.fresh && now() - hit.at < ttlMs))) return hit.value;
      if (!hit && entries.size >= maxEntries) {
        for (const [k, e] of entries) if (e.settled && now() - e.at >= ttlMs) entries.delete(k);
        if (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string); // oldest first (a Map keeps insertion order)
      }
      const value = load().then(
        (v) => {
          entry.at = now();
          entry.settled = true;
          return v;
        },
        (e: unknown) => {
          if (entries.get(key) === entry) entries.delete(key);
          throw e;
        },
      );
      const entry: Entry<T> = { at: now(), settled: false, value };
      entries.delete(key); // re-inserting moves a refreshed key to the back of the eviction order
      entries.set(key, entry);
      return value;
    },
    clear: () => entries.clear(),
  };
}
