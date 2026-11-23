import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "./errors.ts";
import { MAX_EVENTS, addEvent, deleteEvent, listEvents } from "./events.ts";
import { tempDb } from "./testDb.ts";

const refused = (status: number) => (e: unknown) => e instanceof HttpError && e.status === status;
const timed = (title: string, start: string, end: string, extra = {}) => ({ title, allDay: false, start, end, description: "", location: "", ...extra });
const day = (title: string, start: string, end: string) => ({ title, allDay: true, start, end, description: "", location: "" });
const ms = (iso: string) => Date.parse(iso);

test("the events table is created by the migration and starts empty", () => {
  const t = tempDb();
  assert.deepEqual(listEvents(t.db, 0, ms("2100-01-01T00:00:00Z")), []);
  t.cleanup();
});

test("an event is stored and read back in Home Assistant's event shape", () => {
  const t = tempDb();
  const made = addEvent(t.db, timed("Dentist", "2026-11-21T14:00:00+02:00", "2026-11-21T15:00:00+02:00", { description: "Bring card", location: "Main St" }));
  assert.match(made.uid, /^[0-9a-f-]{36}$/);
  const [got] = listEvents(t.db, ms("2026-11-21T00:00:00Z"), ms("2026-11-22T00:00:00Z"));
  assert.deepEqual(got, { uid: made.uid, summary: "Dentist", start: { dateTime: "2026-11-21T14:00:00+02:00" }, end: { dateTime: "2026-11-21T15:00:00+02:00" }, description: "Bring card", location: "Main St" });
  const a = addEvent(t.db, day("Holiday", "2026-12-24", "2026-12-27"));
  assert.deepEqual([a.start, a.end], [{ date: "2026-12-24" }, { date: "2026-12-27" }]);
  t.cleanup();
});

test("a range returns the events that touch it: timed exactly, whole-day ones with a day of margin for the browser's zone", () => {
  const t = tempDb();
  addEvent(t.db, timed("before", "2026-11-20T10:00:00Z", "2026-11-20T11:00:00Z"));
  addEvent(t.db, timed("inside", "2026-11-21T10:00:00Z", "2026-11-21T11:00:00Z"));
  addEvent(t.db, timed("ends at start", "2026-11-20T23:00:00Z", "2026-11-21T00:00:00Z"));
  addEvent(t.db, timed("overlaps start", "2026-11-20T23:00:00Z", "2026-11-21T01:00:00Z"));
  addEvent(t.db, timed("starts at end", "2026-11-22T00:00:00Z", "2026-11-22T01:00:00Z"));
  addEvent(t.db, day("whole day inside", "2026-11-21", "2026-11-22"));
  addEvent(t.db, day("whole day long ago", "2026-11-01", "2026-11-05"));
  addEvent(t.db, day("whole day edge", "2026-11-20", "2026-11-21"));
  const names = listEvents(t.db, ms("2026-11-21T00:00:00Z"), ms("2026-11-22T00:00:00Z")).map((e) => e.summary).sort();
  assert.deepEqual(names, ["inside", "overlaps start", "whole day edge", "whole day inside"]);
  t.cleanup();
});

test("a bad event is refused with a plain sentence and nothing is stored", () => {
  const t = tempDb();
  const bad: unknown[] = [null, {}, timed("", "2026-11-21T14:00:00Z", "2026-11-21T15:00:00Z"), timed("x", "2026-11-21T15:00:00Z", "2026-11-21T14:00:00Z"), timed("x", "2026-11-21T14:00:00", "2026-11-21T15:00:00"), day("x", "2026-11-21", "2026-11-21"), timed("x".repeat(201), "2026-11-21T14:00:00Z", "2026-11-21T15:00:00Z")];
  for (const b of bad) assert.throws(() => addEvent(t.db, b), refused(400), JSON.stringify(b));
  assert.equal(listEvents(t.db, 0, ms("2100-01-01T00:00:00Z")).length, 0);
  t.cleanup();
});

test("delete removes one event; an unknown or odd id is a plain no", () => {
  const t = tempDb();
  const a = addEvent(t.db, timed("a", "2026-11-21T10:00:00Z", "2026-11-21T11:00:00Z"));
  const b = addEvent(t.db, timed("b", "2026-11-21T12:00:00Z", "2026-11-21T13:00:00Z"));
  assert.equal(deleteEvent(t.db, a.uid), true);
  assert.equal(deleteEvent(t.db, a.uid), false);
  assert.equal(deleteEvent(t.db, "x'; DROP TABLE events; --"), false);
  assert.deepEqual(listEvents(t.db, 0, ms("2100-01-01T00:00:00Z")).map((e) => e.uid), [b.uid]);
  t.cleanup();
});

test("there is a ceiling on how many events are kept", () => {
  const t = tempDb();
  t.db.exec("BEGIN");
  const ins = t.db.prepare("INSERT INTO events (id, title, all_day, start_at, end_at, start_ms, end_ms, created_at) VALUES (?, 't', 0, 's', 'e', 1, 2, 3)");
  for (let i = 0; i < MAX_EVENTS; i++) ins.run(`e${i}`);
  t.db.exec("COMMIT");
  assert.throws(() => addEvent(t.db, timed("one too many", "2026-11-21T10:00:00Z", "2026-11-21T11:00:00Z")), refused(413));
  t.cleanup();
});
