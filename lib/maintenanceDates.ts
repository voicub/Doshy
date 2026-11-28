// Calendar days for the maintenance board. A day is the text "YYYY-MM-DD" (the owner's local calendar date), never a time: a task due "in 90 days" must stay
// 90 calendar days when a clock change makes one of them 23 or 25 hours long, and adding a month must land on a real date. Everything here counts days with
// UTC arithmetic on the year / month / day numbers, so no local time zone or daylight saving rule can move a result. Pure: the node test runner loads this file directly.

export type Day = string;
export type IntervalUnit = "day" | "week" | "month" | "year";

const DAY_MS = 86_400_000;
const FIRST_YEAR = 2000;
const LAST_YEAR = 2100;
const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1..12

/** The day text as numbers when it is a real calendar date in 2000..2100 (so `2026-02-30` and `2026-2-3` are not days), else null. */
export function parseDay(value: unknown): { y: number; m: number; d: number } | null {
  if (typeof value !== "string") return null;
  const hit = PATTERN.exec(value);
  if (!hit) return null;
  const [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  return y >= FIRST_YEAR && y <= LAST_YEAR && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m) ? { y, m, d } : null;
}

export const isDay = (value: unknown): value is Day => parseDay(value) !== null;

const text = (y: number, m: number, d: number): Day => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The local calendar date of a moment (ms since 1970): what the wall calendar in the house says. */
export function dayOf(ms: number): Day {
  const t = new Date(ms);
  return text(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

/** Whole days since 1970 of a valid day. */
function dayNumber(day: Day): number {
  const p = parseDay(day);
  if (!p) throw new RangeError(`not a calendar day: ${day}`);
  return Date.UTC(p.y, p.m - 1, p.d) / DAY_MS;
}

/** Days from `from` to `to`: positive when `to` is later. */
export const daysBetween = (from: Day, to: Day): number => dayNumber(to) - dayNumber(from);

/** The day `n` days later (earlier when negative). Stays inside 2000..2100: beyond that the edge day. */
export function addDays(day: Day, n: number): Day {
  const t = new Date((dayNumber(day) + Math.trunc(n)) * DAY_MS);
  return clampYear(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function clampYear(y: number, m: number, d: number): Day {
  if (y < FIRST_YEAR) return text(FIRST_YEAR, 1, 1);
  if (y > LAST_YEAR) return text(LAST_YEAR, 12, 31);
  return text(y, m, d);
}

/** The same date `n` calendar months later; a day the target month does not have becomes its last day (31 Jan + 1 month = 28 or 29 Feb, 29 Feb + 1 year = 28 Feb). */
export function addMonths(day: Day, n: number): Day {
  const p = parseDay(day);
  if (!p) throw new RangeError(`not a calendar day: ${day}`);
  const total = p.y * 12 + (p.m - 1) + Math.trunc(n);
  const y = Math.floor(total / 12);
  const m = (total % 12 + 12) % 12 + 1;
  return clampYear(y, m, Math.min(p.d, daysIn(y, m)));
}

/** `every` days, weeks, months or years after `day`. */
export function addInterval(day: Day, every: number, unit: IntervalUnit): Day {
  switch (unit) {
    case "day": return addDays(day, every);
    case "week": return addDays(day, every * 7);
    case "month": return addMonths(day, every);
    case "year": return addMonths(day, every * 12);
  }
}

/** The first `month` (1..12) the 1st of which is after `day`: "next October" for a task that belongs to a season. */
export function nextMonthStart(day: Day, month: number): Day {
  const p = parseDay(day);
  if (!p) throw new RangeError(`not a calendar day: ${day}`);
  return clampYear(p.m < month ? p.y : p.y + 1, month, 1);
}

/** The later of two days. */
export const laterDay = (a: Day, b: Day): Day => (dayNumber(a) >= dayNumber(b) ? a : b);
