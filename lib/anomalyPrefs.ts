// What the person told the anomaly watch: how loudly it may speak, what to leave alone for a week, what is normal for this home, and when a banner was last raised (so one oddity
// does not shout again after every reload). Tiny, and checked field by field whenever it is read (it is stored in the settings row `housey-anomaly`). Pure.
import { isRecord } from "./guards.ts";
import type { Anomaly } from "./anomalyTypes.ts";
import { ENTITY_ID } from "./timeline.ts";

export const SNOOZE_MS = 7 * 86_400_000;
/** A banner for the same oddity comes at most once a day. */
export const COOLDOWN_MS = 24 * 3_600_000;
export const MAX_TOLERANCE = 20;
const MAX_ENTRIES = 300;
const ID = /^[a-z_]{3,24}:[a-z0-9_]+\.[a-z0-9_]+$/;

export const ALERT_MODES = ["banner", "quiet", "off"] as const;
export type AnomalyAlertMode = (typeof ALERT_MODES)[number];
export const ALERT_MODE_LABEL: Record<AnomalyAlertMode, string> = { banner: "Banner for warnings", quiet: "Quiet: only here", off: "Off" };

export type AnomalyPrefs = {
  alerts: AnomalyAlertMode;
  /** oddity id -> when it may come back (ms) */
  snoozed: Record<string, number>;
  /** oddities hidden for good ("This is normal" on one that has no band to widen) */
  ignored: string[];
  /** entity -> how much wider than usual its bands are: "This is normal" widens them to cover what was seen */
  tolerance: Record<string, number>;
  /** oddity id -> when its banner was last raised */
  raised: Record<string, number>;
  /** the last scan: when, and how many things were found (so the dock can show a count before the next scan) */
  scan: { at: number; count: number } | null;
};

export const EMPTY_PREFS: AnomalyPrefs = { alerts: "banner", snoozed: {}, ignored: [], tolerance: {}, raised: {}, scan: null };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function table<T>(raw: unknown, key: RegExp, ok: (v: unknown) => v is T): Record<string, T> {
  const out: Record<string, T> = {};
  if (isRecord(raw)) for (const [k, v] of Object.entries(raw).slice(0, MAX_ENTRIES)) if (key.test(k) && ok(v)) out[k] = v;
  return out;
}

/** Stored data from anywhere (a copy from another device, an older version): whatever is not a valid id, time or factor is dropped. */
export function parsePrefs(raw: unknown): AnomalyPrefs {
  if (!isRecord(raw)) return EMPTY_PREFS;
  const scan = isRecord(raw.scan) && finite(raw.scan.at) && finite(raw.scan.count) ? { at: raw.scan.at, count: Math.max(0, Math.min(999, Math.round(raw.scan.count))) } : null;
  const alerts = ALERT_MODES.find((m) => m === raw.alerts) ?? EMPTY_PREFS.alerts;
  const tolerance = table(raw.tolerance, ENTITY_ID, (v): v is number => finite(v) && v >= 1);
  for (const k of Object.keys(tolerance)) tolerance[k] = Math.min(MAX_TOLERANCE, tolerance[k]);
  return {
    alerts,
    snoozed: table(raw.snoozed, ID, finite),
    ignored: Array.isArray(raw.ignored) ? [...new Set(raw.ignored.filter((x): x is string => typeof x === "string" && ID.test(x)))].slice(0, MAX_ENTRIES) : [],
    tolerance,
    raised: table(raw.raised, ID, finite),
    scan,
  };
}

/** True when the card should not show now: snoozed and not yet due, or ignored for good. */
export const isHidden = (p: AnomalyPrefs, id: string, now: number): boolean => p.ignored.includes(id) || (p.snoozed[id] ?? 0) > now;

/** The oddities worth showing now. */
export const visible = (p: AnomalyPrefs, list: readonly Anomaly[], now: number): Anomaly[] => list.filter((a) => !isHidden(p, a.id, now));

/** Hide this one for a week. Snoozes that are over are dropped on the way. */
export function snooze(p: AnomalyPrefs, id: string, now: number): AnomalyPrefs {
  const live = Object.entries(p.snoozed).filter(([, until]) => until > now);
  return { ...p, snoozed: { ...Object.fromEntries(live), [id]: now + SNOOZE_MS } };
}

/**
 * "This is normal". A card with a band widens that sensor's tolerance just enough to cover what was seen (and at least 1.5 times wider), so this level stops speaking but a much
 * bigger change still does; a card without a band (a battery, a quiet sensor, an open window) is ignored for good.
 */
export function markNormal(p: AnomalyPrefs, a: Pick<Anomaly, "id" | "entity" | "teachable" | "ratio">): AnomalyPrefs {
  if (!a.teachable) return { ...p, ignored: p.ignored.includes(a.id) ? p.ignored : [...p.ignored, a.id].slice(-MAX_ENTRIES) };
  const before = p.tolerance[a.entity] ?? 1;
  const widened = Math.min(MAX_TOLERANCE, before * Math.max(1.5, a.ratio * 1.25));
  return { ...p, tolerance: { ...p.tolerance, [a.entity]: widened } };
}

/** Undo for snooze and ignore (the tolerance is not undone: it is cheap to teach again). */
export function restoreAll(p: AnomalyPrefs): AnomalyPrefs {
  return { ...p, snoozed: {}, ignored: [], tolerance: {} };
}

export const withScan = (p: AnomalyPrefs, at: number, count: number): AnomalyPrefs => ({ ...p, scan: { at, count } });

/**
 * The warnings that may raise the alert banner now: only warnings, not snoozed or ignored, and each at most once in COOLDOWN_MS (`shown`: the ones already on screen this session
 * stay, so a banner is not pulled away while it is being read). Returns the list and the `raised` table with the new ones stamped.
 */
export function bannerWorthy(p: AnomalyPrefs, list: readonly Anomaly[], shown: ReadonlySet<string>, now: number): { alerts: Anomaly[]; raised: Record<string, number> } {
  const raised = Object.fromEntries(Object.entries(p.raised).filter(([, t]) => now - t < 3 * COOLDOWN_MS)); // old stamps drop out, so the table cannot grow
  const alerts = list.filter((a) => {
    if (a.severity !== "warning" || isHidden(p, a.id, now)) return false;
    if (shown.has(a.id)) return true;
    if (now - (raised[a.id] ?? 0) < COOLDOWN_MS) return false;
    raised[a.id] = now;
    return true;
  });
  return { alerts, raised };
}
