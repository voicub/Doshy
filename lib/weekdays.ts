// The days of the week as Home Assistant names them (`mon`..`sun`, what a `condition: time` / `weekday` list takes) and how to say a set of them in words. Pure.

export const WEEKDAY_IDS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAY_IDS)[number];

export const WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri"];
export const WEEKEND: readonly Weekday[] = ["sat", "sun"];

const NAMES: Record<Weekday, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
export const weekdayName = (d: Weekday): string => NAMES[d];

export const isWeekday = (v: unknown): v is Weekday => typeof v === "string" && (WEEKDAY_IDS as readonly string[]).includes(v);

/** A list of days from untrusted input: every item a day, no repeats, in week order; null when it is empty or has anything else in it. */
export function normaliseDays(raw: unknown): Weekday[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 7 || !raw.every(isWeekday)) return null;
  return WEEKDAY_IDS.filter((d) => raw.includes(d));
}

const same = (a: readonly Weekday[], b: readonly Weekday[]) => a.length === b.length && a.every((d, i) => d === b[i]);

/** "every day", "on weekdays", "at the weekend" or "on Monday, Wednesday and Friday". */
export function daysWords(days: readonly Weekday[]): string {
  if (same(days, WEEKDAY_IDS)) return "every day";
  if (same(days, WEEKDAYS)) return "on weekdays";
  if (same(days, WEEKEND)) return "at the weekend";
  const names = days.map((d) => NAMES[d]);
  return `on ${names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`}`;
}
