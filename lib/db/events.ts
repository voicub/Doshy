import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { checkEventInput } from "../calendar.ts";
import { HttpError } from "./errors.ts";
import { all, one, run } from "./sql.ts";

/** The dashboard's own calendar: events kept in the database so the calendar works even when Home Assistant has none. */
export const MAX_EVENTS = 5000;
const MAX_LISTED = 1000;
const DAY_MS = 86_400_000;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** An event the way Home Assistant's calendar API shapes it (`uid` is our id), so one reader handles both sources. */
type StoredEvent = { uid: string; summary: string; start: { date: string } | { dateTime: string }; end: { date: string } | { dateTime: string }; description: string; location: string };

const shape = (r: Record<string, unknown>): StoredEvent => {
  const allDay = r.all_day === 1;
  const [start, end] = [String(r.start_at), String(r.end_at)];
  return {
    uid: String(r.id),
    summary: String(r.title),
    start: allDay ? { date: start } : { dateTime: start },
    end: allDay ? { date: end } : { dateTime: end },
    description: String(r.description),
    location: String(r.location),
  };
};

/**
 * Events touching `[startMs, endMs)`. All-day events are compared by their UTC-midnight dates one day wider on each side (the browser's zone is
 * unknown here); the reader drops the ones that do not really touch a shown day.
 */
export function listEvents(db: DatabaseSync, startMs: number, endMs: number): StoredEvent[] {
  return all(
    db,
    `SELECT * FROM events WHERE (all_day = 0 AND start_ms < ? AND end_ms > ?) OR (all_day = 1 AND start_ms < ? AND end_ms > ?) ORDER BY start_ms, id LIMIT ${MAX_LISTED}`,
    endMs,
    startMs,
    endMs + DAY_MS,
    startMs - DAY_MS,
  ).map(shape);
}

/** Check and store a new event (see `checkEventInput` for the rules). The refusal message is plain language. */
export function addEvent(db: DatabaseSync, raw: unknown, now = Date.now()): StoredEvent {
  const c = checkEventInput(raw);
  if (!c.ok) throw new HttpError(400, "bad_event", c.error);
  const e = c.value;
  if (Number(one(db, "SELECT COUNT(*) AS n FROM events")?.n ?? 0) >= MAX_EVENTS) throw new HttpError(413, "full", "There is no room for more events. Delete some old ones first.");
  const id = randomUUID();
  const [startMs, endMs] = e.allDay ? [Date.parse(`${e.start}T00:00:00Z`), Date.parse(`${e.end}T00:00:00Z`)] : [Date.parse(e.start), Date.parse(e.end)];
  run(db, "INSERT INTO events (id, title, description, location, all_day, start_at, end_at, start_ms, end_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, e.title, e.description, e.location, e.allDay ? 1 : 0, e.start, e.end, startMs, endMs, now);
  return shape({ id, title: e.title, description: e.description, location: e.location, all_day: e.allDay ? 1 : 0, start_at: e.start, end_at: e.end });
}

/** Remove an event; false when there is none with that id. */
export function deleteEvent(db: DatabaseSync, id: string): boolean {
  if (!ID_RE.test(id)) return false;
  return Number(run(db, "DELETE FROM events WHERE id = ?", id).changes) > 0;
}
