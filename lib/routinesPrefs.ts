// What the person told the routine finder: ideas never to show again, ideas to leave alone for a while, and what the last scan found (so "3 routine ideas" can show without
// scanning again). Tiny, and checked field by field whenever it is read (it is stored in the settings row `housey-routines`). Pure.
import { isRecord } from "./guards.ts";

export const SNOOZE_MS = 30 * 86_400_000;
const MAX_IDS = 400;
const ID = /^r[0-9a-f]{8}$/;

export type RoutinePrefs = {
  dismissed: string[];
  /** idea id -> when it may come back (ms) */
  snoozed: Record<string, number>;
  /** the last scan: when, and the ideas it found (ids only) */
  scan: { at: number; found: string[] } | null;
};

export const EMPTY_PREFS: RoutinePrefs = { dismissed: [], snoozed: {}, scan: null };

const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && ID.test(x)))].slice(0, MAX_IDS) : []);

/** Stored data from anywhere (a copy from another device, an older version): whatever is not a valid id or time is dropped. */
export function parsePrefs(raw: unknown): RoutinePrefs {
  if (!isRecord(raw)) return EMPTY_PREFS;
  const snoozed: Record<string, number> = {};
  if (isRecord(raw.snoozed)) {
    for (const [id, until] of Object.entries(raw.snoozed).slice(0, MAX_IDS)) if (ID.test(id) && typeof until === "number" && Number.isFinite(until)) snoozed[id] = until;
  }
  const scan = isRecord(raw.scan) && typeof raw.scan.at === "number" && Number.isFinite(raw.scan.at) ? { at: raw.scan.at, found: ids(raw.scan.found).slice(0, 20) } : null;
  return { dismissed: ids(raw.dismissed), snoozed, scan };
}

/** True when the idea should not be shown now: dismissed for good, or snoozed and not yet due. */
export const isHidden = (p: RoutinePrefs, id: string, now: number): boolean => p.dismissed.includes(id) || (p.snoozed[id] ?? 0) > now;

export const dismiss = (p: RoutinePrefs, id: string): RoutinePrefs => (p.dismissed.includes(id) ? p : { ...p, dismissed: [...p.dismissed, id].slice(-MAX_IDS) });

/** Leave an idea alone for 30 days. Snoozes that are over are dropped on the way. */
export function snooze(p: RoutinePrefs, id: string, now: number): RoutinePrefs {
  const live = Object.entries(p.snoozed).filter(([, until]) => until > now);
  return { ...p, snoozed: { ...Object.fromEntries(live), [id]: now + SNOOZE_MS } };
}

/** "Not now" or "Never suggest this" taken back for one idea (Undo), or for all of them. */
export function restore(p: RoutinePrefs, id: string): RoutinePrefs {
  const { [id]: _later, ...snoozed } = p.snoozed;
  return { ...p, dismissed: p.dismissed.filter((d) => d !== id), snoozed };
}

export const restoreAll = (p: RoutinePrefs): RoutinePrefs => ({ ...p, dismissed: [], snoozed: {} });

export const withScan = (p: RoutinePrefs, at: number, found: readonly string[]): RoutinePrefs => ({ ...p, scan: { at, found: found.slice(0, 20) } });

/** How many of the last scan's ideas are still worth mentioning (not dismissed, not snoozed). */
export const pendingCount = (p: RoutinePrefs, now: number): number => (p.scan ? p.scan.found.filter((id) => !isHidden(p, id, now)).length : 0);
