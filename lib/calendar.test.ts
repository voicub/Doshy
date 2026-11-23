import test from "node:test";
import assert from "node:assert/strict";

process.env.TZ = "Europe/Bucharest"; // DST starts Sun 29 Mar 2026 and ends Sun 25 Oct 2026; set before any Date is built
import {
  addDays, calendarColors, calendarStateKey, cardEvents, checkEventInput, checkRange, createEventData, daysBetween, daysOf, defaultForm, deleteBody, formToInput, groupByDay, isRecurring, mergeEvents, nextUp,
  normaliseAll, normaliseEvent, overlapsDay, parseYmd, rangeQuery, rruleText, stepAnchor, toOffsetIso, validateDelete, viewRange, ymd, LOCAL_COLOR, type CalEvent, type EventForm,
} from "./calendar.ts";

const at = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
let seq = 0;
const ev = (over: Partial<CalEvent>): CalEvent => ({ id: `e${seq++}`, calendar: "calendar.family", title: "T", description: "", location: "", allDay: false, start: 0, end: 0, ...over });

test("zone for these tests really is Bucharest with the DST days of 2026", () => {
  assert.equal((at(2026, 10, 26) - at(2026, 10, 25)) / 3_600_000, 25);
  assert.equal((at(2026, 3, 30) - at(2026, 3, 29)) / 3_600_000, 23);
});

test("day maths counts calendar days across the DST changes, never 24 h blocks", () => {
  assert.equal(ymd(addDays(d(2026, 10, 24), 1)), "2026-10-25");
  assert.equal(ymd(addDays(d(2026, 10, 25), 1)), "2026-10-26");
  assert.equal(ymd(addDays(d(2026, 3, 28), 2)), "2026-03-30");
  assert.equal(daysBetween(d(2026, 10, 25), d(2026, 10, 26)), 1);
  assert.equal(daysBetween(d(2026, 3, 29), d(2026, 3, 30)), 1);
  assert.equal(daysBetween(d(2026, 1, 1), d(2027, 1, 1)), 365);
  assert.equal(ymd(addDays(d(2026, 12, 31), 1)), "2027-01-01");
});

test("parseYmd accepts real dates only", () => {
  assert.equal(ymd(parseYmd("2026-02-28")!), "2026-02-28");
  for (const bad of ["2026-02-30", "2026-13-01", "26-01-01", "0050-01-01", "2026-1-1", "", "2026-01-01T00:00"]) assert.equal(parseYmd(bad), null, bad);
  assert.ok(parseYmd("2028-02-29"));
  assert.equal(parseYmd("2027-02-29"), null);
});

test("month view is a Monday-first 6 week grid, also across a year end and a month that starts on Monday", () => {
  const nov = viewRange("month", d(2026, 11, 21)); // 1 Nov 2026 is a Sunday
  assert.deepEqual([ymd(nov.start), ymd(nov.end)], ["2026-10-26", "2026-12-07"]);
  const dec = viewRange("month", d(2026, 12, 5));
  assert.deepEqual([ymd(dec.start), ymd(dec.end)], ["2026-11-30", "2027-01-11"]);
  const feb = viewRange("month", d(2027, 2, 14)); // 1 Feb 2027 is a Monday: the grid starts that day
  assert.deepEqual([ymd(feb.start), ymd(feb.end)], ["2027-02-01", "2027-03-15"]);
  const oct = viewRange("month", d(2026, 10, 3)); // holds the DST end
  const days = daysOf(oct);
  assert.equal(days.length, 42);
  assert.equal(new Set(days.map(ymd)).size, 42);
  assert.equal(ymd(days[27]), "2026-10-25");
  assert.equal(days.every((x) => x.getHours() === 0), true, "every day is a local midnight");
});

test("week and agenda ranges; every view stays within the 100 day limit", () => {
  const wk = viewRange("week", d(2026, 11, 21)); // a Saturday
  assert.deepEqual([ymd(wk.start), ymd(wk.end)], ["2026-11-16", "2026-11-23"]);
  const sun = viewRange("week", d(2026, 11, 22));
  assert.equal(ymd(sun.start), "2026-11-16");
  const ag = viewRange("agenda", d(2026, 11, 21));
  assert.deepEqual([ymd(ag.start), ymd(ag.end)], ["2026-11-21", "2026-12-21"]);
  for (const v of ["month", "week", "agenda"] as const) for (const m of [1, 3, 10, 12]) {
    const r = viewRange(v, d(2026, m, 15));
    const q = rangeQuery(r);
    assert.equal(checkRange(q.start, q.end).ok, true, `${v} ${m}`);
  }
});

test("stepping the anchor by view", () => {
  assert.equal(ymd(stepAnchor("month", d(2026, 12, 31), 1)), "2027-01-01");
  assert.equal(ymd(stepAnchor("month", d(2026, 1, 31), -1)), "2025-12-01");
  assert.equal(ymd(stepAnchor("week", d(2026, 10, 24), 1)), "2026-10-31");
  assert.equal(ymd(stepAnchor("agenda", d(2026, 11, 21), -1)), "2026-10-22");
});

test("a requested range: 100 days at most, ordered, readable, in a sane century", () => {
  const iso = (a: Date, b: Date) => [a.toISOString(), b.toISOString()] as const;
  assert.equal(checkRange(...iso(d(2026, 1, 1), d(2026, 4, 11))).ok, true); // 100 days
  const over = checkRange(...iso(d(2026, 1, 1), d(2026, 4, 12)));
  assert.equal(over.ok, false);
  assert.equal(checkRange(...iso(d(2026, 5, 1), d(2026, 5, 1))).ok, false);
  assert.equal(checkRange(...iso(d(2026, 5, 2), d(2026, 5, 1))).ok, false);
  assert.equal(checkRange("nope", "2026-01-01").ok, false);
  assert.equal(checkRange(undefined, "2026-01-01").ok, false);
  assert.equal(checkRange("1970-01-01T00:00:00Z", "1970-01-10T00:00:00Z").ok, false);
  assert.equal(checkRange("2026-01-01", "2026-01-31").ok, true);
});

test("HA events: all-day start/end are local days with an exclusive end; timed ones keep their instant", () => {
  const allDay = normaliseEvent({ summary: "Holiday", start: { date: "2026-12-24" }, end: { date: "2026-12-27" }, uid: "u" }, "calendar.family")!;
  assert.equal(allDay.allDay, true);
  assert.equal(allDay.start, at(2026, 12, 24));
  assert.equal(allDay.end, at(2026, 12, 27));
  assert.equal(overlapsDay(allDay, d(2026, 12, 26)), true);
  assert.equal(overlapsDay(allDay, d(2026, 12, 27)), false, "end is exclusive");
  const timed = normaliseEvent({ summary: "Dentist", start: { dateTime: "2026-11-21T14:00:00+02:00" }, end: { dateTime: "2026-11-21T15:30:00+02:00" }, location: "Main St", description: "Bring card" }, "calendar.family")!;
  assert.equal(timed.allDay, false);
  assert.equal(timed.start, Date.parse("2026-11-21T12:00:00Z"));
  assert.equal(timed.end - timed.start, 90 * 60_000);
  assert.equal(timed.location, "Main St");
  assert.equal(timed.description, "Bring card");
});

test("HA events: odd input is tolerated or dropped, never thrown", () => {
  assert.equal(normaliseEvent(null, "c"), null);
  assert.equal(normaliseEvent({ summary: "x" }, "c"), null);
  assert.equal(normaliseEvent({ summary: "x", start: { date: "2026-02-30" } }, "c"), null);
  assert.equal(normaliseEvent({ summary: "x", start: { dateTime: "not a time" } }, "c"), null);
  const noEnd = normaliseEvent({ summary: "x", start: { date: "2026-11-21" } }, "c")!;
  assert.equal(noEnd.end, at(2026, 11, 22), "an all-day event with no end lasts its day");
  const backwards = normaliseEvent({ summary: "x", start: { dateTime: "2026-11-21T14:00:00+02:00" }, end: { dateTime: "2026-11-21T13:00:00+02:00" } }, "c")!;
  assert.equal(backwards.end, backwards.start);
  const mixed = normaliseEvent({ summary: "x", start: { date: "2026-11-21" }, end: { dateTime: "2026-11-21T10:00:00+02:00" } }, "c")!;
  assert.equal(mixed.end, at(2026, 11, 22));
  assert.equal(normaliseEvent({ start: { date: "2026-11-21" }, summary: "   " }, "c")!.title, "(no title)");
  assert.equal(normaliseEvent({ start: "2026-11-21 14:00:00", summary: "naive" }, "c")!.start, at(2026, 11, 21, 14), "a naive time is local");
  assert.equal(normaliseEvent({ start: "2026-11-21", summary: "d" }, "c")!.allDay, true);
  assert.equal(normaliseEvent({ start: { date: "2026-11-21" }, summary: "x".repeat(500), description: "y".repeat(5000) }, "c")!.title.length, 200);
  assert.deepEqual(normaliseAll("nope", "c"), []);
  assert.equal(normaliseAll([null, { summary: "a", start: { date: "2026-11-21" } }, 5], "c").length, 1);
});

test("recurring events as HA expands them stay separate instances sharing a uid", () => {
  const raw = (rid: string, date: string) => ({ summary: "Bins", start: { date }, end: { date }, uid: "series-1", recurrence_id: rid, rrule: "FREQ=WEEKLY;BYDAY=TH" });
  const list = normaliseAll([raw("20261119", "2026-11-19"), raw("20261126", "2026-11-26"), raw("20261119", "2026-11-19")], "calendar.family");
  assert.equal(list.length, 3);
  assert.equal(mergeEvents(list).length, 2, "an instance listed twice is shown once");
  assert.equal(list.every(isRecurring), true);
  assert.equal(isRecurring(ev({})), false);
  assert.equal(list[0].end, at(2026, 11, 20), "a same-day all-day instance still lasts one day");
});

test("rrule text: the interval changes it, unknown or hostile frequencies get the generic text", () => {
  const weekly = rruleText("FREQ=WEEKLY");
  assert.notEqual(rruleText("FREQ=WEEKLY;INTERVAL=2"), weekly);
  assert.notEqual(rruleText("FREQ=DAILY"), weekly);
  assert.equal(rruleText("freq=monthly;interval=3"), rruleText("FREQ=MONTHLY;INTERVAL=3"));
  assert.equal(rruleText("FREQ=constructor"), rruleText("FREQ=HOURLY"));
  assert.equal(rruleText(undefined), "");
});

test("a day holds timed and all-day events, multi-day spans, and not the event that ended at midnight", () => {
  const night = ev({ id: "night", title: "Late", start: at(2026, 11, 21, 22), end: at(2026, 11, 22, 0) }); // ends exactly at midnight
  const across = ev({ id: "across", title: "Flight", start: at(2026, 11, 21, 23), end: at(2026, 11, 22, 6) });
  const week = ev({ id: "trip", title: "Trip", allDay: true, start: at(2026, 11, 20), end: at(2026, 11, 24) });
  const early = ev({ id: "a", title: "Breakfast", start: at(2026, 11, 22, 8), end: at(2026, 11, 22, 9) });
  const all = [early, night, across, week];
  const g = groupByDay(all, [d(2026, 11, 20), d(2026, 11, 21), d(2026, 11, 22), d(2026, 11, 23), d(2026, 11, 24)]);
  assert.deepEqual(g.get("2026-11-21")!.map((e) => e.id), ["trip", "night", "across"]);
  assert.deepEqual(g.get("2026-11-22")!.map((e) => e.id), ["trip", "across", "a"], "whole-day first, then by start");
  assert.deepEqual(g.get("2026-11-23")!.map((e) => e.id), ["trip"]);
  assert.deepEqual(g.get("2026-11-24")!.map((e) => e.id), []);
});

test("events on the 25 hour and 23 hour days land on the right day", () => {
  const late = ev({ title: "x", start: at(2026, 10, 25, 23, 30), end: at(2026, 10, 25, 23, 59) });
  assert.equal(overlapsDay(late, d(2026, 10, 25)), true);
  assert.equal(overlapsDay(late, d(2026, 10, 26)), false);
  const spring = ev({ title: "y", start: at(2026, 3, 29, 0), end: at(2026, 3, 30, 0) }); // the 23 hour day
  assert.equal(overlapsDay(spring, d(2026, 3, 29)), true);
  assert.equal(overlapsDay(spring, d(2026, 3, 30)), false);
});

test("merging several calendars sorts by start, whole-day first on ties, and keeps one of a duplicate", () => {
  const a = ev({ id: "1", title: "B", start: 20, end: 30 });
  const b = ev({ id: "2", title: "A", start: 10, end: 30 });
  const c = ev({ id: "3", title: "C", allDay: true, start: 20, end: 90 });
  assert.deepEqual(mergeEvents([a, b], [c, a]).map((e) => e.id), ["2", "3", "1"]);
  assert.deepEqual(mergeEvents(), []);
});

test("what the chip shows: now, then later today, then a whole-day event, then the next one", () => {
  const now = at(2026, 11, 21, 10, 0);
  const current = ev({ id: "cur", title: "Standup", start: at(2026, 11, 21, 9, 30), end: at(2026, 11, 21, 10, 30) });
  const later = ev({ id: "later", title: "Dentist", start: at(2026, 11, 21, 12, 0), end: at(2026, 11, 21, 13, 0) });
  const bins = ev({ id: "bins", title: "Bins", allDay: true, start: at(2026, 11, 21), end: at(2026, 11, 22) });
  const tomorrow = ev({ id: "tom", title: "Party", start: at(2026, 11, 22, 19), end: at(2026, 11, 22, 23) });
  const ended = ev({ id: "old", title: "Old", start: at(2026, 11, 21, 7), end: at(2026, 11, 21, 8) });
  assert.equal(nextUp([ended, bins, later, current], now)!.event.id, "cur");
  assert.equal(nextUp([ended, bins, later, current], now)!.kind, "now");
  assert.deepEqual([nextUp([ended, bins, later, tomorrow], now)!.event.id, nextUp([ended, bins, later, tomorrow], now)!.kind], ["later", "next"]);
  assert.deepEqual([nextUp([ended, bins, tomorrow], now)!.event.id, nextUp([ended, bins, tomorrow], now)!.kind], ["bins", "today"]);
  assert.equal(nextUp([ended, tomorrow], now)!.event.id, "tom");
  assert.equal(nextUp([ended], now), null);
  assert.equal(nextUp([], now), null);
});

test("one colour per calendar: the dashboard one is the accent, the rest are stable and distinct", () => {
  const c = calendarColors(["calendar.work", "local", "calendar.family"]);
  assert.equal(c.local, LOCAL_COLOR);
  assert.notEqual(c["calendar.work"], c["calendar.family"]);
  assert.deepEqual(calendarColors(["calendar.family", "calendar.work", "local"]), c, "order of the input does not matter");
  const many = calendarColors(Array.from({ length: 12 }, (_, i) => `calendar.c${i}`));
  assert.equal(Object.keys(many).length, 13);
  assert.ok(Object.values(many).every((x) => /^#[0-9a-f]{6}$/.test(x)));
});

test("invalid events are refused and valid ones are trimmed", () => {
  const ok = { title: "  Dentist ", allDay: false, start: "2026-11-21T14:00:00+02:00", end: "2026-11-21T15:00:00+02:00", description: " notes\nline 2 ", location: "" };
  const r = checkEventInput(ok);
  assert.ok(r.ok);
  assert.equal(r.ok && r.value.title, "Dentist");
  assert.equal(r.ok && r.value.description, "notes\nline 2");
  const refused = (over: Record<string, unknown>) => !checkEventInput({ ...ok, ...over }).ok;
  for (const over of [
    { title: "   " }, { title: "x".repeat(201) }, { title: "a\nb" }, { location: "x".repeat(201) }, { description: "x".repeat(2001) },
    { end: "2026-11-21T13:00:00+02:00" }, { end: ok.start }, { end: "2026-11-21T15:00:00" }, { allDay: "yes" },
    { start: "1999-01-01T00:00:00Z", end: "1999-01-01T01:00:00Z" }, { allDay: true, start: "2026-11-21", end: "2026-11-21" }, { allDay: true, start: "2026-02-30", end: "2026-03-01" },
  ]) assert.ok(refused(over), JSON.stringify(over));
  assert.equal(checkEventInput(null).ok, false);
  assert.equal(checkEventInput({ ...ok, allDay: true, start: "2026-11-21", end: "2026-11-22" }).ok, true);
});

const form = (over: Partial<EventForm> = {}): EventForm => ({ title: "Dentist", allDay: false, startDate: "2026-11-21", startTime: "14:00", endDate: "2026-11-21", endTime: "15:00", description: "", location: "", ...over });

test("the form becomes an event: timed events carry the local offset, all-day end is the day after the last day", () => {
  const t = formToInput(form());
  assert.ok(t.ok);
  assert.deepEqual(t.ok && [t.value.start, t.value.end], ["2026-11-21T14:00:00+02:00", "2026-11-21T15:00:00+02:00"]);
  const summer = formToInput(form({ startDate: "2026-07-01", endDate: "2026-07-01" }));
  assert.equal(summer.ok && summer.value.start, "2026-07-01T14:00:00+03:00", "the offset follows DST");
  const a = formToInput(form({ allDay: true, endDate: "2026-11-23" }));
  assert.deepEqual(a.ok && [a.value.start, a.value.end], ["2026-11-21", "2026-11-24"]);
  const one = formToInput(form({ allDay: true }));
  assert.deepEqual(one.ok && [one.value.start, one.value.end], ["2026-11-21", "2026-11-22"]);
});

test("form mistakes are refused", () => {
  for (const f of [form({ title: "" }), form({ endTime: "13:00" }), form({ endTime: "14:00" }), form({ startTime: "" }), form({ startTime: "25:00" }), form({ startDate: "" }), form({ allDay: true, endDate: "2026-11-20" }), form({ allDay: true, startDate: "" })])
    assert.equal(formToInput(f).ok, false, JSON.stringify(f));
});

test("a new form starts at the next full hour today, else 09:00, and lasts an hour (also over midnight)", () => {
  const today = defaultForm(d(2026, 11, 21), new Date(2026, 10, 21, 10, 20));
  assert.deepEqual([today.startDate, today.startTime, today.endDate, today.endTime], ["2026-11-21", "11:00", "2026-11-21", "12:00"]);
  const late = defaultForm(d(2026, 11, 21), new Date(2026, 10, 21, 23, 40));
  assert.deepEqual([late.startDate, late.startTime, late.endDate, late.endTime], ["2026-11-22", "00:00", "2026-11-22", "01:00"]);
  const other = defaultForm(d(2026, 12, 3), new Date(2026, 10, 21, 10, 20));
  assert.deepEqual([other.startDate, other.startTime, other.endTime], ["2026-12-03", "09:00", "10:00"]);
});

test("offset ISO keeps the instant", () => {
  const x = new Date(2026, 6, 1, 14, 5, 9);
  assert.equal(toOffsetIso(x), "2026-07-01T14:05:09+03:00");
  assert.equal(Date.parse(toOffsetIso(x)), x.getTime());
});

test("create_event service data uses HA's field names and leaves out empty extras", () => {
  const timed = formToInput(form({ description: "Bring card", location: "Main St" }));
  assert.ok(timed.ok);
  assert.deepEqual(createEventData(timed.value), { summary: "Dentist", start_date_time: "2026-11-21T14:00:00+02:00", end_date_time: "2026-11-21T15:00:00+02:00", description: "Bring card", location: "Main St" });
  const day = formToInput(form({ allDay: true }));
  assert.ok(day.ok);
  assert.deepEqual(createEventData(day.value), { summary: "Dentist", start_date: "2026-11-21", end_date: "2026-11-22" });
});

test("delete: one-off, this occurrence, this and later, the whole series", () => {
  const one = ev({ uid: "u1", calendar: "calendar.family" });
  assert.deepEqual(deleteBody(one, "this"), { entity_id: "calendar.family", uid: "u1" });
  const rec = ev({ uid: "u2", calendar: "calendar.family", recurrenceId: "20261121", rrule: "FREQ=DAILY" });
  assert.deepEqual(deleteBody(rec, "this"), { entity_id: "calendar.family", uid: "u2", recurrence_id: "20261121" });
  assert.deepEqual(deleteBody(rec, "future"), { entity_id: "calendar.family", uid: "u2", recurrence_id: "20261121", recurrence_range: "THIS_AND_FUTURE" });
  assert.deepEqual(deleteBody(rec, "all"), { entity_id: "calendar.family", uid: "u2" });
  assert.equal(deleteBody(ev({ calendar: "calendar.family" }), "this"), null, "no uid, nothing to delete");
  assert.equal(deleteBody(ev({ uid: "u", calendar: "local" }), "this"), null, "the dashboard calendar is not deleted through HA");
});

test("the delete request is checked strictly before anything reaches Home Assistant", () => {
  const good = { entity_id: "calendar.family", uid: "abc@google.com" };
  assert.deepEqual(validateDelete(good), { ok: true, value: { type: "calendar/event/delete", ...good } });
  assert.deepEqual(validateDelete({ ...good, recurrence_id: "20261121T100000Z", recurrence_range: "THIS_AND_FUTURE" }), { ok: true, value: { type: "calendar/event/delete", ...good, recurrence_id: "20261121T100000Z", recurrence_range: "THIS_AND_FUTURE" } });
  const bad: unknown[] = [
    null, "x", {}, { uid: "u" },
    { ...good, entity_id: "light.kitchen" }, { ...good, entity_id: "calendar." }, { ...good, entity_id: "calendar.a b" }, { ...good, entity_id: "calendar.A" },
    { ...good, uid: "" }, { ...good, uid: "x".repeat(256) }, { ...good, uid: "a\nb" }, { ...good, uid: 5 },
    { ...good, recurrence_id: "" }, { ...good, recurrence_id: 5 }, { ...good, recurrence_id: "x".repeat(101) },
    { ...good, recurrence_range: "THIS_AND_FUTURE" }, { ...good, recurrence_id: "1", recurrence_range: "ALL" },
    { ...good, type: "auth" }, { ...good, evil: 1 },
  ];
  for (const b of bad) assert.equal(validateDelete(b).ok, false, JSON.stringify(b));
});

test("the calendar state key changes when a calendar's current event changes, and only then", () => {
  const st = (state: string, message: string) => ({ state, attributes: { message, start_time: "2026-11-21 10:00:00" } });
  const a = calendarStateKey({ "calendar.family": st("on", "Standup"), "light.a": { state: "on", attributes: {} } });
  assert.equal(calendarStateKey({ "calendar.family": st("on", "Standup"), "light.a": { state: "off", attributes: {} } }), a);
  assert.notEqual(calendarStateKey({ "calendar.family": st("on", "Dentist") }), a);
  assert.notEqual(calendarStateKey({ "calendar.family": st("off", "Standup") }), a);
  assert.equal(calendarStateKey({}), "");
});

test("the card lists today's unfinished events, whole-day first, and falls back to what comes next", () => {
  const now = at(2026, 11, 22, 10);
  const done = ev({ title: "Breakfast", start: at(2026, 11, 22, 8), end: at(2026, 11, 22, 9) });
  const live = ev({ title: "Standup", start: at(2026, 11, 22, 9, 30), end: at(2026, 11, 22, 10, 30) });
  const later = ev({ title: "Dentist", start: at(2026, 11, 22, 16), end: at(2026, 11, 22, 17) });
  const day = ev({ title: "Holiday", allDay: true, start: at(2026, 11, 22), end: at(2026, 11, 23) });
  const card = cardEvents([later, done, live, day], now)!;
  assert.deepEqual(card.list.map((e) => e.title), ["Holiday", "Standup", "Dentist"]);
  const tomorrow = ev({ title: "Trip", start: at(2026, 11, 24, 9), end: at(2026, 11, 24, 10) });
  const next = cardEvents([done, tomorrow], now)!;
  assert.notEqual(next.title, card.title);
  assert.deepEqual(next.list.map((e) => e.title), ["Trip"]);
  assert.equal(cardEvents([done], now), null);
  const many = Array.from({ length: 6 }, (_, i) => ev({ title: `E${i}`, start: at(2026, 11, 22, 11 + i), end: at(2026, 11, 22, 12 + i) }));
  assert.equal(cardEvents(many, now)!.more, 2);
});
