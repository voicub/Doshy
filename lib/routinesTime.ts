// Clock arithmetic for the routine finder: a moment as the wall clock of the home's time zone (so a light switched off at 23:10 every night stays 23:10 across a clock
// change), local calendar days, and circular distance between times of day (23:55 and 00:05 are ten minutes apart). Pure.
import { WEEKDAY_IDS, type Weekday } from "./weekdays.ts";

export const MIN_MS = 60_000;
export const DAY_MIN = 1440;

export type Local = { /** minutes since local midnight, fractional */ minute: number; /** YYYY-MM-DD */ day: string; weekday: Weekday };

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The zone if it is a real IANA name, else the zone of this machine. */
export function usableZone(zone: string | undefined): string {
  if (zone) {
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: zone });
      return zone;
    } catch {
      /* not a zone: fall through */
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
    formatters.set(zone, f);
  }
  return f;
}

/** The wall clock of `zone` at the instant `t` (ms since 1970). */
export function localOf(t: number, zone: string): Local {
  const p: Record<string, string> = {};
  for (const part of formatter(zone).formatToParts(t)) p[part.type] = part.value;
  const weekday = p.weekday.slice(0, 3).toLowerCase();
  return {
    minute: Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60,
    day: `${p.year}-${p.month}-${p.day}`,
    weekday: (WEEKDAY_IDS as readonly string[]).includes(weekday) ? (weekday as Weekday) : "mon",
  };
}

/** The calendar day `n` days before `day` (YYYY-MM-DD), and its weekday. Plain calendar arithmetic at noon UTC: no clock change can move it. */
export function dayBefore(day: string, n: number): { day: string; weekday: Weekday } {
  const [y, m, d] = day.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d - n, 12));
  return { day: at.toISOString().slice(0, 10), weekday: WEEKDAY_IDS[(at.getUTCDay() + 6) % 7] };
}

/** Distance between two times of day on the 24 h circle, in minutes (0..720). */
export function circularGap(a: number, b: number): number {
  const d = Math.abs(a - b) % DAY_MIN;
  return Math.min(d, DAY_MIN - d);
}

/** `HH:MM` for minutes since midnight (wraps; rounds to the nearest minute). */
export function clockText(minute: number): string {
  const m = ((Math.round(minute) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes since midnight of an `HH:MM` text, or null. */
export function minutesOf(text: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The middle value of a list (the mean of the two middle ones for an even count). The list is not changed. */
export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
