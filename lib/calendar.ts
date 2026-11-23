// Calendar: pure helpers shared by the panel, the HUD chip, the server routes and their tests. No I/O.
// Times are shown in the browser's local zone. An all-day event is whole local days with an exclusive end (HA and iCalendar do the same).
import { isRecord } from "./guards.ts";

export const LOCAL_CALENDAR = "local";
export const LOCAL_NAME = "Dashboard calendar";
const MAX_RANGE_DAYS = 100;
export const MAX_TITLE = 200;
export const MAX_LOCATION = 200;
export const MAX_DESCRIPTION = 2000;
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** One event as the dashboard shows it. `start`/`end` are epoch ms; an all-day event runs from local midnight to the local midnight after its last day. */
export type CalEvent = {
  id: string;
  calendar: string;
  uid?: string;
  recurrenceId?: string;
  rrule?: string;
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  start: number;
  end: number;
};

// ---- dates (always local, DST-safe: days are built from y/m/d, never by adding 24 h) -------------------------------------------------

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const startOfDay = (d: Date | number) => {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
};
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
/** Monday of the week holding `d`. */
const weekStart = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);
/** Whole calendar days from `a` to `b` (23 and 25 hour days count as one). */
export const daysBetween = (a: Date, b: Date) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);

/** `YYYY-MM-DD` as a local midnight, or null when it is not a real date (Feb 30, year 0050, text). */
export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/** Local time with its UTC offset, `2026-11-21T14:00:00+02:00`: an instant HA reads the same whatever its own zone is. */
export function toOffsetIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const abs = Math.abs(off);
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off < 0 ? "-" : "+"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtDay = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
const fmtMonth = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

// ---- views and ranges ----------------------------------------------------------------------------------------------------------------

export type CalView = "month" | "week" | "agenda";
const AGENDA_DAYS = 30;
export type Range = { start: Date; end: Date }; // end exclusive, both local midnights

/** The days a view needs events for. Month is the full 6 week grid (it shows the neighbouring months' days too). */
export function viewRange(view: CalView, anchor: Date): Range {
  if (view === "month") {
    const start = weekStart(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    return { start, end: addDays(start, 42) };
  }
  if (view === "week") {
    const start = weekStart(anchor);
    return { start, end: addDays(start, 7) };
  }
  const start = startOfDay(anchor);
  return { start, end: addDays(start, AGENDA_DAYS) };
}

export const daysOf = (r: Range): Date[] => Array.from({ length: daysBetween(r.start, r.end) }, (_, i) => addDays(r.start, i));

/** Everything the panel needs for a view: the month grid around the anchor (day dots, the mini month), widened to the view's own days. At most 72 days. */
export function panelRange(view: CalView, anchor: Date): Range {
  const grid = viewRange("month", anchor);
  const own = viewRange(view, anchor);
  return { start: own.start < grid.start ? own.start : grid.start, end: own.end > grid.end ? own.end : grid.end };
}

/** Previous/next page of a view: a month, a week or a month of agenda. */
export function stepAnchor(view: CalView, anchor: Date, dir: 1 | -1): Date {
  if (view === "month") return addMonths(anchor, dir);
  return addDays(anchor, dir * (view === "week" ? 7 : AGENDA_DAYS));
}

/** Title above a view. */
export function viewTitle(view: CalView, anchor: Date): string {
  if (view === "month") return fmtMonth(anchor);
  const { start, end } = viewRange(view, anchor);
  const last = addDays(end, -1);
  return `${fmtDay(start)} - ${fmtDay(last)}`;
}

/** Query-string pair for an events request. */
export const rangeQuery = (r: Range) => ({ start: r.start.toISOString(), end: r.end.toISOString() });

/** A requested range: ISO times, end after start, at most 100 days (plus an hour for DST), sensible years. */
export function checkRange(startRaw: unknown, endRaw: unknown): { ok: true; start: number; end: number } | { ok: false; error: string } {
  if (typeof startRaw !== "string" || typeof endRaw !== "string") return { ok: false, error: "start and end are required" };
  const start = Date.parse(startRaw);
  const end = Date.parse(endRaw);
  if (Number.isNaN(start) || Number.isNaN(end)) return { ok: false, error: "start and end must be dates" };
  if (end <= start) return { ok: false, error: "end must be after start" };
  if (end - start > MAX_RANGE_DAYS * DAY_MS + 3_600_000) return { ok: false, error: `ask for at most ${MAX_RANGE_DAYS} days at a time` };
  const lo = Date.UTC(2000, 0, 1);
  const hi = Date.UTC(2101, 0, 1);
  if (start < lo || end > hi) return { ok: false, error: "that date range is not supported" };
  return { ok: true, start, end };
}

// ---- events from Home Assistant ------------------------------------------------------------------------------------------------------

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function when(v: unknown): { ms: number; allDay: boolean } | null {
  const o = typeof v === "string" ? (v.length === 10 ? { date: v } : { dateTime: v }) : v;
  if (!isRecord(o)) return null;
  const w = o;
  if (typeof w.date === "string") {
    const d = parseYmd(w.date);
    return d ? { ms: d.getTime(), allDay: true } : null;
  }
  if (typeof w.dateTime === "string") {
    const ms = Date.parse(w.dateTime.replace(" ", "T")); // Safari does not read "2026-11-21 14:00"
    return Number.isNaN(ms) ? null : { ms, allDay: false };
  }
  return null;
}

/** An event in HA's calendar format (`start`/`end` as `{ date }` or `{ dateTime }`) to ours. Null when it has no readable start. */
export function normaliseEvent(raw: unknown, calendar: string): CalEvent | null {
  if (!isRecord(raw)) return null;
  const r = raw;
  const s = when(r.start);
  if (!s) return null;
  const e = when(r.end);
  let end = e && e.allDay === s.allDay ? e.ms : s.ms;
  if (s.allDay ? end <= s.ms : end < s.ms) end = s.allDay ? addDays(new Date(s.ms), 1).getTime() : s.ms; // a whole-day event lasts at least its day
  const title = str(r.summary, MAX_TITLE).trim() || "(no title)";
  const uid = str(r.uid, 255) || undefined;
  const recurrenceId = str(r.recurrence_id, 100) || undefined;
  return {
    id: [calendar, uid ?? "", recurrenceId ?? "", s.ms, title].join("|"),
    calendar,
    uid,
    recurrenceId,
    rrule: str(r.rrule, 200) || undefined,
    title,
    description: str(r.description, MAX_DESCRIPTION),
    location: str(r.location, MAX_LOCATION),
    allDay: s.allDay,
    start: s.ms,
    end,
  };
}

export const normaliseAll = (raw: unknown, calendar: string): CalEvent[] => (Array.isArray(raw) ? raw.flatMap((r) => normaliseEvent(r, calendar) ?? []) : []);

const byTitle = (a: CalEvent, b: CalEvent) => a.title.localeCompare(b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** Inside one day: whole-day events first, then by start time. */
const compareInDay = (a: CalEvent, b: CalEvent) => Number(b.allDay) - Number(a.allDay) || a.start - b.start || byTitle(a, b);
/** Across days: by start, a whole-day event before a timed one that starts at the same moment. */
const compareByStart = (a: CalEvent, b: CalEvent) => a.start - b.start || Number(b.allDay) - Number(a.allDay) || byTitle(a, b);

/** Several lists into one: the same event (same id) once, in start order. */
export function mergeEvents(...lists: CalEvent[][]): CalEvent[] {
  const seen = new Map<string, CalEvent>();
  for (const list of lists) for (const ev of list) if (!seen.has(ev.id)) seen.set(ev.id, ev);
  return [...seen.values()].sort(compareByStart);
}

/** Does the event touch this local day? An all-day event ends at midnight exclusive, so it never leaks into the next day. */
export function overlapsDay(ev: CalEvent, day: Date): boolean {
  const lo = startOfDay(day).getTime();
  const hi = addDays(day, 1).getTime();
  return ev.start < hi && (ev.end > lo || (ev.end === ev.start && ev.start >= lo));
}

/** Events per local day (`YYYY-MM-DD`), each day sorted. A multi-day event appears on every day it covers. */
export function groupByDay(events: CalEvent[], days: Date[]): Map<string, CalEvent[]> {
  const out = new Map<string, CalEvent[]>();
  for (const d of days) out.set(ymd(d), events.filter((ev) => overlapsDay(ev, d)).sort(compareInDay));
  return out;
}

export const isRecurring = (ev: CalEvent) => !!(ev.rrule || ev.recurrenceId);

/** "Repeats weekly", "Repeats every 2 weeks" from an iCalendar rule; "Repeats" when the rule is unusual. */
export function rruleText(rrule?: string): string {
  if (!rrule) return "";
  const p: Record<string, string> = {};
  for (const part of rrule.split(";")) {
    const [k, v = ""] = part.split("=");
    p[k.trim().toUpperCase()] = v.trim().toUpperCase();
  }
  const units: Record<string, [string, string]> = { DAILY: ["daily", "day"], WEEKLY: ["weekly", "week"], MONTHLY: ["monthly", "month"], YEARLY: ["yearly", "year"] };
  const unit = Object.hasOwn(units, p.FREQ ?? "") ? units[p.FREQ] : null;
  if (!unit) return "Repeats";
  const n = Math.floor(Number(p.INTERVAL));
  return n > 1 ? `Repeats every ${n} ${unit[1]}s` : `Repeats ${unit[0]}`;
}

// ---- wording -------------------------------------------------------------------------------------------------------------------------

/** "Fri 21 Nov, 14:00 - 15:30", "Fri 21 Nov, all day", "Fri 21 Nov to Sun 23 Nov, all day". */
export function describeWhen(ev: CalEvent): string {
  const s = new Date(ev.start);
  if (ev.allDay) {
    const last = addDays(new Date(ev.end), -1);
    return sameDay(s, last) ? `${fmtDay(s)}, all day` : `${fmtDay(s)} to ${fmtDay(last)}, all day`;
  }
  if (ev.end === ev.start) return `${fmtDay(s)}, ${hm(s)}`;
  const e = new Date(ev.end);
  return sameDay(s, e) ? `${fmtDay(s)}, ${hm(s)} - ${hm(e)}` : `${fmtDay(s)} ${hm(s)} - ${fmtDay(e)} ${hm(e)}`;
}

/** The short time label on a day: the start time, or "All day". */
export const timeLabel = (ev: CalEvent) => (ev.allDay ? "All day" : hm(new Date(ev.start)));

/** "now", "in 35 min", "in 2 h", "tomorrow 09:00", "Mon 24 Nov 09:00" (no time for an all-day event). */
export function untilText(ev: CalEvent, now: number): string {
  const m = Math.round((ev.start - now) / 60_000);
  if (!ev.allDay) {
    if (m <= 0) return "now";
    if (m < 60) return `in ${m} min`;
    if (sameDay(new Date(ev.start), new Date(now))) return `in ${Math.round(m / 60)} h`;
  }
  const s = new Date(ev.start);
  const day = daysBetween(new Date(now), s) === 1 ? "tomorrow" : fmtDay(s);
  return ev.allDay ? day : `${day} ${hm(s)}`;
}

type NextUp = { event: CalEvent; kind: "now" | "today" | "next" };

/**
 * What the HUD chip shows: a timed event happening now, else a timed one still to come today, else a whole-day event covering today,
 * else the next event of any kind. Ended events are ignored. Null when nothing is coming.
 */
export function nextUp(events: CalEvent[], now: number): NextUp | null {
  const today = new Date(now);
  let best: { rank: number; ev: CalEvent } | null = null;
  for (const ev of events) {
    if (ev.end <= now && !(ev.end === ev.start && ev.start >= now)) continue;
    const timed = !ev.allDay;
    const rank = timed && ev.start <= now ? 0 : timed && sameDay(new Date(ev.start), today) ? 1 : ev.allDay && ev.start <= now ? 2 : 3;
    if (!best || rank < best.rank || (rank === best.rank && compareByStart(ev, best.ev) < 0)) best = { rank, ev };
  }
  if (!best) return null;
  return { event: best.ev, kind: best.rank === 0 ? "now" : best.rank === 2 ? "today" : "next" };
}

export function chipText(n: NextUp, now: number): string {
  if (n.kind === "now") return `Now: ${n.event.title}`;
  if (n.kind === "today") return `Today: ${n.event.title}`;
  return `Next: ${n.event.title} ${untilText(n.event, now)}`;
}

const CARD_TODAY_ROWS = 4;
const CARD_NEXT_ROWS = 3;

/** What the Live-view card lists: today's events that have not ended (whole-day ones first), or - when today is clear - the next few after it. Null when nothing is coming. */
export function cardEvents(events: CalEvent[], now: number): { title: "Today" | "Coming up"; list: CalEvent[]; more: number } | null {
  const today = new Date(now);
  const todays = events.filter((e) => overlapsDay(e, today) && (e.allDay || e.end > now || e.start >= now)).sort(compareInDay);
  if (todays.length) return { title: "Today", list: todays.slice(0, CARD_TODAY_ROWS), more: Math.max(0, todays.length - CARD_TODAY_ROWS) };
  const tomorrow = addDays(startOfDay(today), 1).getTime();
  const later = events.filter((e) => e.start >= tomorrow).sort(compareByStart);
  return later.length ? { title: "Coming up", list: later.slice(0, CARD_NEXT_ROWS), more: Math.max(0, later.length - CARD_NEXT_ROWS) } : null;
}

// ---- colours -------------------------------------------------------------------------------------------------------------------------

export const LOCAL_COLOR = "#5ad7ff";
/** Readable on the dark HUD (all at least 4.5:1 against the panel). */
const PALETTE = ["#ffb454", "#7bd88f", "#c792ea", "#ff7a9c", "#f2e16b", "#ff8a5c", "#6ea8ff", "#4fd1c5"];

/** One colour per calendar. The dashboard calendar is the accent; the others take the palette in name order, so a colour does not move when another calendar is hidden. */
export function calendarColors(ids: string[]): Record<string, string> {
  const out: Record<string, string> = { [LOCAL_CALENDAR]: LOCAL_COLOR };
  [...new Set(ids)].filter((id) => id !== LOCAL_CALENDAR).sort().forEach((id, i) => (out[id] = PALETTE[i % PALETTE.length]));
  return out;
}

// ---- adding and deleting -------------------------------------------------------------------------------------------------------------

/** A new event, ready to store. All-day: `start`/`end` are `YYYY-MM-DD` with `end` the day after the last day. Timed: ISO times with an offset. */
export type EventInput = { title: string; allDay: boolean; start: string; end: string; description: string; location: string };
type Checked<T> = { ok: true; value: T } | { ok: false; error: string };
const OFFSET_ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const YEAR_LO = Date.UTC(2000, 0, 1);
const YEAR_HI = Date.UTC(2101, 0, 1);

/** The one place an event is judged, used by the form before sending and by the server before storing. Messages are for the person. */
export function checkEventInput(raw: unknown): Checked<EventInput> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Something is missing from this event." };
  const r = isRecord(raw) ? raw : {};
  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title) return { ok: false, error: "Give the event a name." };
  if (title.length > MAX_TITLE || CONTROL.test(title)) return { ok: false, error: `The name must be one line of at most ${MAX_TITLE} characters.` };
  const location = typeof r.location === "string" ? r.location.trim() : "";
  if (location.length > MAX_LOCATION || CONTROL.test(location)) return { ok: false, error: `The place must be one line of at most ${MAX_LOCATION} characters.` };
  const description = typeof r.description === "string" ? r.description.trim() : "";
  if (description.length > MAX_DESCRIPTION || CONTROL_EXCEPT_NEWLINE.test(description)) return { ok: false, error: `The notes are too long (${MAX_DESCRIPTION} characters at most).` };
  if (typeof r.allDay !== "boolean") return { ok: false, error: "Say whether the event lasts all day." };
  if (typeof r.start !== "string" || typeof r.end !== "string") return { ok: false, error: "Pick when the event starts and ends." };
  let start: number;
  let end: number;
  if (r.allDay) {
    const s = parseYmd(r.start);
    const e = parseYmd(r.end);
    if (!s || !e) return { ok: false, error: "Pick a start and an end date." };
    [start, end] = [s.getTime(), e.getTime()];
    if (end <= start) return { ok: false, error: "The last day must not be before the first day." };
  } else {
    if (!OFFSET_ISO.test(r.start) || !OFFSET_ISO.test(r.end)) return { ok: false, error: "Pick a start and an end time." };
    [start, end] = [Date.parse(r.start), Date.parse(r.end)];
    if (Number.isNaN(start) || Number.isNaN(end)) return { ok: false, error: "Pick a start and an end time." };
    if (end <= start) return { ok: false, error: "The event must end after it starts." };
  }
  if (start < YEAR_LO || end > YEAR_HI) return { ok: false, error: "Pick a date between 2000 and 2100." };
  return { ok: true, value: { title, allDay: r.allDay, start: r.start, end: r.end, description, location } };
}

/** What the "Add event" form holds: native date and time input values. For an all-day event `endDate` is the last day (inclusive). */
export type EventForm = { title: string; allDay: boolean; startDate: string; startTime: string; endDate: string; endTime: string; description: string; location: string };

/** A fresh form for `day`: starts at the next full hour when `day` is today, else at 09:00, and lasts an hour. */
export function defaultForm(day: Date, now: Date = new Date()): EventForm {
  const start = sameDay(day, now) ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1) : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours() + 1);
  return { title: "", allDay: false, startDate: ymd(start), startTime: hm(start), endDate: ymd(end), endTime: hm(end), description: "", location: "" };
}

function localTime(date: string, time: string): Date | null {
  const d = parseYmd(date);
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(m[1]), Number(m[2]));
}

/** Change some fields of the form. Moving the start moves the end with it (the event keeps its length); a one-day-or-more event never ends before it starts. */
export function editForm(f: EventForm, patch: Partial<EventForm>): EventForm {
  const next = { ...f, ...patch };
  const movedStart = patch.startDate !== undefined || patch.startTime !== undefined;
  if (!movedStart && patch.allDay === undefined) return next;
  if (next.allDay) {
    const [s, e, oldS] = [parseYmd(next.startDate), parseYmd(next.endDate), parseYmd(f.startDate)];
    const oldE = parseYmd(f.endDate);
    if (!s) return next;
    if (movedStart && oldS && oldE && !f.allDay === false) return { ...next, endDate: ymd(addDays(s, Math.max(0, daysBetween(oldS, oldE)))) };
    return !e || e < s ? { ...next, endDate: next.startDate } : next;
  }
  const s = localTime(next.startDate, next.startTime);
  if (!s) return next;
  const [oldS, oldE] = [localTime(f.startDate, f.startTime), localTime(f.endDate, f.endTime)];
  const length = movedStart && oldS && oldE && oldE > oldS ? oldE.getTime() - oldS.getTime() : 60 * 60_000;
  const e = localTime(next.endDate, next.endTime);
  if (!movedStart && e && e > s) return next;
  const end = new Date(s.getTime() + length);
  return { ...next, endDate: ymd(end), endTime: hm(end) };
}

/** The form to an event to send, or the sentence to show the person. */
export function formToInput(f: EventForm): Checked<EventInput> {
  let start: string;
  let end: string;
  if (f.allDay) {
    const s = parseYmd(f.startDate);
    const e = parseYmd(f.endDate);
    if (!s || !e) return { ok: false, error: "Pick a start and an end date." };
    if (e < s) return { ok: false, error: "The last day must not be before the first day." };
    [start, end] = [ymd(s), ymd(addDays(e, 1))];
  } else {
    const s = localTime(f.startDate, f.startTime);
    const e = localTime(f.endDate, f.endTime);
    if (!s || !e) return { ok: false, error: "Pick a start and an end time." };
    if (e <= s) return { ok: false, error: "The event must end after it starts." };
    [start, end] = [toOffsetIso(s), toOffsetIso(e)];
  }
  return checkEventInput({ title: f.title, allDay: f.allDay, start, end, description: f.description, location: f.location });
}

/** The `calendar.create_event` service data for a checked event (HA's own field names). */
export function createEventData(e: EventInput): Record<string, unknown> {
  return {
    summary: e.title,
    ...(e.allDay ? { start_date: e.start, end_date: e.end } : { start_date_time: e.start, end_date_time: e.end }),
    ...(e.description ? { description: e.description } : {}),
    ...(e.location ? { location: e.location } : {}),
  };
}

export type DeleteScope = "this" | "future" | "all";
type DeleteBody = { entity_id: string; uid: string; recurrence_id?: string; recurrence_range?: "THIS_AND_FUTURE" };

/** The body for POST /api/ha/calendar/delete. A one-off event ignores `scope`; for a repeating one: this occurrence, this and later ones, or the whole series. */
export function deleteBody(ev: CalEvent, scope: DeleteScope): DeleteBody | null {
  if (!ev.uid || !ev.calendar.startsWith("calendar.")) return null;
  const base = { entity_id: ev.calendar, uid: ev.uid };
  if (!ev.recurrenceId || scope === "all") return base;
  return scope === "future" ? { ...base, recurrence_id: ev.recurrenceId, recurrence_range: "THIS_AND_FUTURE" } : { ...base, recurrence_id: ev.recurrenceId };
}

const CALENDAR_ENTITY = /^calendar\.[a-z0-9_]{1,80}$/;
export const isCalendarEntity = (v: unknown): v is string => typeof v === "string" && CALENDAR_ENTITY.test(v);

/** Strict check of a delete request; returns the WebSocket message to send to HA. */
export function validateDelete(body: unknown): Checked<{ type: "calendar/event/delete" } & DeleteBody> {
  const b = isRecord(body) ? body : {};
  if (!isCalendarEntity(b.entity_id)) return { ok: false, error: "entity_id must be a calendar entity" };
  if (typeof b.uid !== "string" || b.uid.length < 1 || b.uid.length > 255 || CONTROL.test(b.uid)) return { ok: false, error: "uid must be 1-255 characters" };
  const out: { type: "calendar/event/delete" } & DeleteBody = { type: "calendar/event/delete", entity_id: b.entity_id, uid: b.uid };
  if (b.recurrence_id !== undefined) {
    if (typeof b.recurrence_id !== "string" || b.recurrence_id.length < 1 || b.recurrence_id.length > 100 || CONTROL.test(b.recurrence_id)) return { ok: false, error: "recurrence_id must be 1-100 characters" };
    out.recurrence_id = b.recurrence_id;
  }
  if (b.recurrence_range !== undefined) {
    if (b.recurrence_range !== "THIS_AND_FUTURE" || out.recurrence_id === undefined) return { ok: false, error: "recurrence_range must be THIS_AND_FUTURE and needs a recurrence_id" };
    out.recurrence_range = "THIS_AND_FUTURE";
  }
  const extra = Object.keys(b).filter((k) => !["entity_id", "uid", "recurrence_id", "recurrence_range"].includes(k));
  return extra.length ? { ok: false, error: `unexpected field "${extra[0]}"` } : { ok: true, value: out };
}

type StateLike = { state: string; attributes: object };
/** Changes whenever a calendar entity's current/next event changes: the chip refetches when it does. */
export function calendarStateKey(states: Record<string, StateLike>): string {
  return Object.keys(states)
    .filter((id) => id.startsWith("calendar."))
    .sort()
    .map((id) => {
      const { state, attributes } = states[id];
      const a = isRecord(attributes) ? attributes : {};
      return `${id}|${state}|${String(a.message ?? "")}|${String(a.start_time ?? "")}`;
    })
    .join("\n");
}
