// Clock arithmetic in the home's time zone for the cost and comfort advisor, from `Intl` alone (no library). A day is 23, 24 or 25 hours long where the clocks change,
// so every "day" and "13:00" here is worked out from the zone's own offset at that instant, never from "86400000 ms". Pure.

export type Parts = { y: number; m: number; d: number; h: number; mi: number; /** 0 = Sunday */ wd: number };

const formats = new Map<string, Intl.DateTimeFormat>();
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function formatOf(zone: string): Intl.DateTimeFormat {
  let f = formats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" });
    formats.set(zone, f);
  }
  return f;
}

/** The zone name when `Intl` knows it, else null (a stored or typed name is never trusted). */
export function validZone(zone: unknown): string | null {
  if (typeof zone !== "string" || !zone) return null;
  try {
    formatOf(zone);
    return zone;
  } catch {
    return null;
  }
}

/** This device's own time zone. */
export const deviceZone = (): string => validZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? "UTC";

export function partsOf(ms: number, zone: string): Parts {
  const get: Record<string, string> = {};
  for (const p of formatOf(zone).formatToParts(new Date(ms))) get[p.type] = p.value;
  return { y: Number(get.year), m: Number(get.month), d: Number(get.day), h: Number(get.hour) % 24, mi: Number(get.minute), wd: WEEKDAY[get.weekday] ?? 0 };
}

/** Minutes the zone's clock is ahead of UTC at this instant. */
export function offsetMin(ms: number, zone: string): number {
  const p = partsOf(ms, zone);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60_000) * 60_000) / 60_000);
}

/** The instant a wall clock shows `y-m-d h:mi` in the zone. A time that does not exist (the hour skipped in spring) lands an hour later; one that happens twice gives the first. */
export function localTime(y: number, m: number, d: number, h: number, mi: number, zone: string): number {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - offsetMin(guess, zone) * 60_000;
  return guess - offsetMin(first, zone) * 60_000;
}

/** Midnight at the start of the local day that holds `ms`. */
export function dayStart(ms: number, zone: string): number {
  const p = partsOf(ms, zone);
  return localTime(p.y, p.m, p.d, 0, 0, zone);
}

/** Midnight `n` local days after the one that starts at `start` (negative: before). */
export function addDays(start: number, n: number, zone: string): number {
  const p = partsOf(start + 12 * 3_600_000, zone);
  return localTime(p.y, p.m, p.d + n, 0, 0, zone);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "13:00" on the zone's clock. */
export function hhmm(ms: number, zone: string): string {
  const p = partsOf(ms, zone);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** Minutes since local midnight. */
export function minuteOfDay(ms: number, zone: string): number {
  const p = partsOf(ms, zone);
  return p.h * 60 + p.mi;
}

/** "today", "tomorrow" or the weekday ("Friday"), by the zone's calendar. */
export function dayWord(ms: number, now: number, zone: string): string {
  const today = dayStart(now, zone);
  const day = dayStart(ms, zone);
  if (day === today) return "today";
  if (day === addDays(today, 1, zone)) return "tomorrow";
  return DAY_NAMES[partsOf(ms, zone).wd];
}

/** "13:00-15:00" (today), "tomorrow 01:00-03:00", or "today 22:00 - tomorrow 02:00" when it crosses midnight. The day is named only when it is not today. */
export function windowWords(start: number, end: number, now: number, zone: string): string {
  const a = dayWord(start, now, zone);
  const b = dayWord(end - 1, now, zone);
  const from = hhmm(start, zone);
  const to = hhmm(end, zone);
  if (a === b) return `${a === "today" ? "" : `${a} `}${from}-${to}`;
  return `${a} ${from} - ${b} ${to}`;
}

/** "HH:MM" -> minutes since midnight, or null. */
export function minutesOf(text: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** An instant that is a time given WITHOUT an offset ("2026-03-29 13:00", what some price integrations write) is a wall-clock time in the zone; one WITH an offset is exact. Null when it is neither. */
export function parseTime(value: unknown, zone: string): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1e11 ? Math.round(value * 1000) : Math.round(value); // seconds or milliseconds
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  const naive = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(s);
  if (naive) return localTime(Number(naive[1]), Number(naive[2]), Number(naive[3]), Number(naive[4]), Number(naive[5]), zone);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) return localTime(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]), 0, 0, zone);
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return null;
  const t = Date.parse(s.replace(" ", "T"));
  return Number.isFinite(t) ? t : null;
}
