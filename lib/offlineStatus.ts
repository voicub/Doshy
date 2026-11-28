/**
 * What the "Offline" chip says (components/ui/OfflineChip.tsx) and the one fact it needs from the network layer: whether the last states
 * answer was a copy kept by the offline worker (public/sw.js). Pure apart from a tiny listener list, so it is tested by plain node.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "just now", "12 min ago", "3 h ago", "2 days ago". A time in the future (clock skew) reads as "just now". */
export function timeAgo(thenMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - thenMs);
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  const days = Math.floor(diff / DAY);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export type OfflineFacts = {
  /** `navigator.onLine` */
  online: boolean;
  /** The states poll's last error, null while it works (store.haError). */
  haError: string | null;
  /** When the offline worker stored the copy it last served as the states answer, null for a live answer. */
  staleAt: number | null;
  /** When the states poll last succeeded in this page (store usePoll.at), 0 if it never has. */
  lastLiveAt: number;
};

/** The chip's text, or null while everything is live (the chip is then not drawn). */
export function offlineNote(f: OfflineFacts, now: number): string | null {
  if (f.online && f.haError === null && f.staleAt === null) return null;
  const since = f.staleAt ?? (f.lastLiveAt > 0 ? f.lastLiveAt : null);
  return since === null ? "Offline: no live data yet" : `Offline: showing the last known state (${timeAgo(since, now)})`;
}

let staleAt: number | null = null;
const listeners = new Set<() => void>();

/** Called with every states answer: the stored-at time of a copy the worker served, or null for a live answer. */
export function noteStaleAnswer(at: number | null): void {
  if (at === staleAt) return;
  staleAt = at;
  for (const l of listeners) l();
}
export const currentStaleAt = (): number | null => staleAt;
export function subscribeStale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
