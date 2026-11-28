import assert from "node:assert/strict";
import test from "node:test";
import type { HAState } from "./ha.ts";
import {
  MAX_HISTORY, MAX_TASKS, addTask, effectiveDue, ignoreAuto, markDone, patchTask, removeTask, restoreAuto, sanitizeMaintenance, setBatteryBelow, snoozeAuto, snoozeTask, withMaintenance,
  type MaintenanceTask,
} from "./maintenance.ts";
import { deriveAutoItems } from "./maintenanceAuto.ts";
import { buildBoard, dueWords, reminder, wrenchSpots } from "./maintenanceBoard.ts";
import { addDays, addInterval, addMonths, dayOf, daysBetween, isDay, nextMonthStart } from "./maintenanceDates.ts";
import { TEMPLATES, taskFromTemplate } from "./maintenanceTemplates.ts";
import type { Plan } from "./types.ts";

const plan = (extra: Partial<Plan> = {}): Plan => ({
  walls: [], openings: [], items: [],
  rooms: [{ id: "kit", name: "Kitchen", x: 0, y: 0, w: 4, h: 3, color: "#fff", floor: "wood" }, { id: "hall", name: "Hall", x: 4, y: 0, w: 2, h: 3, color: "#fff", floor: "wood" }],
  ...extra,
});
const task = (over: Partial<MaintenanceTask> = {}): MaintenanceTask => ({ id: "t1", name: "Replace the HVAC filter", every: 90, unit: "day", due: "2026-03-01", ...over });
// attributes of any shape, as Home Assistant sends them (a purifier's `filter_life` is not among the ones the app types)
const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}, last_changed?: string): HAState => ({ entity_id, state, attributes: attributes as HAState["attributes"], ...(last_changed ? { last_changed } : {}) });

// ---- calendar maths ----------------------------------------------------------------------------------------------------------------------------------------

test("a month added to the 31st lands on the last day of a shorter month, and a leap day survives only in leap years", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addInterval("2028-02-29", 1, "year"), "2029-02-28");
  assert.equal(addInterval("2028-02-29", 4, "year"), "2032-02-29");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
  assert.equal(addMonths("2026-03-15", -3), "2025-12-15");
});

test("days, weeks and years count calendar days across year ends and leap days", () => {
  assert.equal(addInterval("2026-12-30", 3, "day"), "2027-01-02");
  assert.equal(addInterval("2028-02-27", 2, "day"), "2028-02-29");
  assert.equal(addInterval("2026-02-27", 1, "week"), "2026-03-06");
  assert.equal(daysBetween("2026-01-01", "2027-01-01"), 365);
  assert.equal(daysBetween("2028-01-01", "2029-01-01"), 366);
  assert.equal(daysBetween("2026-03-10", "2026-03-01"), -9);
});

test("a clock change never makes a day count wrong: the schedule is calendar days, not 24-hour blocks", () => {
  // the spring and autumn clock changes of 2026 in Europe and America: local noon on each side of one
  for (const [before, after] of [[new Date(2026, 2, 28, 12), new Date(2026, 2, 30, 12)], [new Date(2026, 9, 24, 12), new Date(2026, 9, 26, 12)], [new Date(2026, 10, 1, 12), new Date(2026, 10, 3, 12)]]) {
    assert.equal(daysBetween(dayOf(before.getTime()), dayOf(after.getTime())), 2);
  }
  const start = dayOf(new Date(2026, 2, 20, 23, 30).getTime()); // late evening, a week before the clocks change
  assert.equal(addInterval(start, 90, "day"), "2026-06-18");
});

test("only real calendar days in 2000..2100 are days", () => {
  for (const bad of ["2026-02-30", "2026-2-3", "2026-13-01", "1999-12-31", "2101-01-01", "", "tomorrow", 5, null]) assert.equal(isDay(bad), false, String(bad));
  assert.equal(isDay("2028-02-29"), true);
  assert.equal(isDay("2026-02-29"), false);
  assert.equal(addDays("2100-12-31", 10), "2100-12-31", "the edge of the calendar holds");
});

test("a seasonal job starts on the first of its month, always in the future", () => {
  assert.equal(nextMonthStart("2026-06-15", 10), "2026-10-01");
  assert.equal(nextMonthStart("2026-10-01", 10), "2027-10-01");
  assert.equal(nextMonthStart("2026-12-20", 10), "2027-10-01");
});

// ---- task edits --------------------------------------------------------------------------------------------------------------------------------------------

test("Done records the day and counts the next job from it, so early or late work moves the schedule", () => {
  const p = addTask(plan(), task());
  const done = markDone(p, "t1", "2026-03-10");
  const t = done.maintenance?.tasks?.[0];
  assert.equal(t?.last, "2026-03-10");
  assert.equal(t?.due, "2026-06-08");
  assert.deepEqual(t?.history, ["2026-03-10"]);
  assert.equal(markDone(p, "t1", "2026-03-10", "2026-03-07").maintenance?.tasks?.[0].due, "2026-06-05", "done a few days ago: counted from then");
  assert.equal(markDone(p, "t1", "2026-03-10", "2026-04-01").maintenance?.tasks?.[0].last, "2026-03-10", "never done in the future");
});

test("the history keeps the newest 20 completions", () => {
  let p = addTask(plan(), task({ every: 1, unit: "day" }));
  for (let i = 0; i < 25; i++) p = markDone(p, "t1", addDays("2026-01-01", i));
  const h = p.maintenance?.tasks?.[0].history ?? [];
  assert.equal(h.length, MAX_HISTORY);
  assert.equal(h[h.length - 1], addDays("2026-01-01", 24));
  assert.equal(h[0], addDays("2026-01-01", 5));
});

test("a snooze puts a task off without moving its schedule, and Done ends it", () => {
  const p = addTask(plan(), task({ due: "2026-03-01" }));
  const s = snoozeTask(p, "t1", "2026-03-05", 7);
  const t = s.maintenance?.tasks?.[0];
  assert.equal(t?.due, "2026-03-01");
  assert.equal(t && effectiveDue(t), "2026-03-12");
  assert.equal(effectiveDue({ due: "2026-03-20", snooze: "2026-03-12" }), "2026-03-20", "a snooze never brings a job forward");
  assert.equal(markDone(s, "t1", "2026-03-08").maintenance?.tasks?.[0].snooze, undefined);
});

test("add, edit and delete round-trip, a broken edit is refused, and an empty board leaves no field", () => {
  let p = addTask(plan(), task());
  assert.equal(addTask(p, task()), p, "the same id twice changes nothing");
  assert.equal(patchTask(p, "t1", { name: "  " }), p);
  assert.equal(patchTask(p, "t1", { every: 0 }), p);
  assert.equal(patchTask(p, "t1", { due: "soon" as never }), p);
  p = patchTask(p, "t1", { name: "Swap the filter", room: "kit", notes: "Size 20x25" });
  assert.deepEqual(p.maintenance?.tasks?.[0], task({ name: "Swap the filter", room: "kit", notes: "Size 20x25" }));
  assert.equal(removeTask(p, "t1").maintenance, undefined);
  assert.equal(removeTask(p, "nope"), p);
});

test("at most MAX_TASKS tasks", () => {
  let p = plan();
  for (let i = 0; i < MAX_TASKS + 5; i++) p = addTask(p, task({ id: `t${i}` }));
  assert.equal(p.maintenance?.tasks?.length, MAX_TASKS);
});

test("a saved plan keeps what is valid and loses the rest, and survives a copy through JSON", () => {
  const mine = addTask(addTask(plan(), task()), task({ id: "t2", name: "Descale", every: 3, unit: "month", due: "2026-05-01", last: "2026-02-01", history: ["2026-02-01"], item: "kettle" }));
  assert.equal(withMaintenance(mine), mine, "already clean: the same object");
  assert.deepEqual(withMaintenance(JSON.parse(JSON.stringify(mine)) as Plan).maintenance, mine.maintenance);
  const dirty = sanitizeMaintenance({
    tasks: [task(), task({ id: "bad id" }), { id: "x" }, task({ id: "t1" }), task({ id: "t9", unit: "decade" as never }), task({ id: "t8", due: "2026-02-31" })],
    snoozed: { "auto:battery:sensor.a_battery": "2026-04-01", "not-auto": "2026-04-01", "auto:battery:sensor.b": "yesterday" },
    ignored: ["auto:filter:sensor.f_filter_life", "junk", 4],
    batteryBelow: 999,
  });
  assert.deepEqual(dirty?.tasks?.map((t) => t.id), ["t1"]);
  assert.deepEqual(dirty?.snoozed, { "auto:battery:sensor.a_battery": "2026-04-01" });
  assert.deepEqual(dirty?.ignored, ["auto:filter:sensor.f_filter_life"]);
  assert.equal(dirty?.batteryBelow, 50);
  assert.equal(sanitizeMaintenance({ tasks: [] }), undefined);
  assert.equal(sanitizeMaintenance("x"), undefined);
});

test("every template makes a valid task, and a seasonal one waits for its season", () => {
  for (const t of TEMPLATES) assert.ok(addTask(plan(), taskFromTemplate(t, "n1", "2026-06-15")).maintenance?.tasks?.length === 1, t.id);
  const gutters = TEMPLATES.find((t) => t.id === "gutters");
  assert.ok(gutters);
  assert.equal(taskFromTemplate(gutters, "g", "2026-06-15").due, "2026-10-01");
  const hvac = TEMPLATES.find((t) => t.id === "hvac");
  assert.ok(hvac);
  assert.equal(taskFromTemplate(hvac, "h", "2026-06-15").due, "2026-09-13");
});

// ---- automatic items ---------------------------------------------------------------------------------------------------------------------------------------

const NOW = Date.parse("2026-03-10T12:00:00Z");
const states = (list: HAState[]): Record<string, HAState> => Object.fromEntries(list.map((s) => [s.entity_id, s]));

test("batteries: at or below the threshold is due, within ten points is soon, a phone is not house upkeep", () => {
  const s = states([
    st("sensor.hall_smoke_battery", "12", { device_class: "battery", unit_of_measurement: "%", friendly_name: "Hall smoke alarm battery" }),
    st("sensor.door_battery", "27", { device_class: "battery", unit_of_measurement: "%", friendly_name: "Door battery" }),
    st("sensor.window_battery", "80", { device_class: "battery", unit_of_measurement: "%" }),
    st("binary_sensor.lock_battery", "on", { device_class: "battery", friendly_name: "Lock battery" }),
    st("sensor.pixel_9_battery_level", "5", { device_class: "battery", unit_of_measurement: "%" }),
    st("sensor.kids_battery_level", "4", { device_class: "battery", unit_of_measurement: "%" }),
    st("sensor.kids_battery_state", "discharging"),
    st("sensor.dead_battery", "unavailable", { device_class: "battery" }),
    st("sensor.odd_battery", "250", { device_class: "battery" }),
  ]);
  const items = deriveAutoItems({ plan: plan(), states: s, now: NOW });
  const by = (id: string) => items.find((i) => i.id === `auto:battery:${id}`);
  assert.deepEqual([by("sensor.hall_smoke_battery")?.status, by("sensor.hall_smoke_battery")?.name, by("sensor.hall_smoke_battery")?.text], ["due", "Hall smoke alarm", "Battery 12%"]);
  assert.equal(by("sensor.door_battery")?.status, "soon");
  assert.equal(by("sensor.window_battery")?.status, "ok");
  assert.equal(by("binary_sensor.lock_battery")?.status, "due");
  for (const gone of ["sensor.pixel_9_battery_level", "sensor.kids_battery_level", "sensor.dead_battery", "sensor.odd_battery"]) assert.equal(by(gone), undefined, gone);
  assert.equal(deriveAutoItems({ plan: plan(), states: s, now: NOW, batteryBelow: 30 }).find((i) => i.id === "auto:battery:sensor.door_battery")?.status, "due", "the owner's threshold applies");
});

test("filters and brushes: percent, hours, days and the attributes of a purifier or vacuum", () => {
  const s = states([
    st("sensor.purifier_filter_life", "8", { unit_of_measurement: "%", friendly_name: "Purifier filter life" }),
    st("sensor.roborock_main_brush_left", "12", { unit_of_measurement: "h", friendly_name: "Roborock Main brush left" }),
    st("sensor.roborock_side_brush_left", "120", { unit_of_measurement: "h" }),
    st("sensor.mop_pad_remaining", "30000", { unit_of_measurement: "s" }),
    st("sensor.water_filter_days_left", "10", { unit_of_measurement: "d" }),
    st("sensor.temperature_left", "21", { unit_of_measurement: "°C" }),
    st("sensor.filter_pressure_left", "3", { unit_of_measurement: "bar" }),
    st("fan.bedroom_purifier", "on", { friendly_name: "Bedroom purifier", filter_life: 15, filter_hours_used: 600 }),
  ]);
  const items = deriveAutoItems({ plan: plan(), states: s, now: NOW });
  const by = (id: string) => items.find((i) => i.id === id);
  assert.deepEqual([by("auto:filter:sensor.purifier_filter_life")?.status, by("auto:filter:sensor.purifier_filter_life")?.text], ["due", "8% left"]);
  assert.equal(by("auto:filter:sensor.roborock_main_brush_left")?.status, "due");
  assert.equal(by("auto:filter:sensor.roborock_side_brush_left")?.status, "ok");
  assert.equal(by("auto:filter:sensor.mop_pad_remaining")?.text, "8 hours left");
  assert.equal(by("auto:filter:sensor.water_filter_days_left")?.status, "soon");
  assert.equal(by("auto:filter:sensor.temperature_left"), undefined, "not a consumable");
  assert.equal(by("auto:filter:sensor.filter_pressure_left"), undefined, "an unknown unit is not guessed at");
  assert.equal(by("auto:filter:fan.bedroom_purifier:filter_life")?.status, "soon");
  assert.equal(items.filter((i) => i.id.startsWith("auto:filter:fan.")).length, 1, "hours used is not a remaining life");
});

test("devices on the plan that have been unavailable for more than a day are listed, with days, in their room", () => {
  const p = plan({ items: [{ id: "i1", kind: "lamp", x: 1, y: 1, rot: 0, w: 0.3, d: 0.3, h: 1, entity: "light.kitchen" }, { id: "i2", kind: "lamp", x: 1, y: 2, rot: 0, w: 0.3, d: 0.3, h: 1, entity: "light.recent" }, { id: "i3", kind: "lamp", x: 1, y: 2, rot: 0, w: 0.3, d: 0.3, h: 1, entity: "light.other" }] });
  const s = states([
    st("light.kitchen", "unavailable", { friendly_name: "Kitchen light" }, "2026-03-07T12:00:00Z"),
    st("light.recent", "unavailable", {}, "2026-03-10T06:00:00Z"),
    st("light.unlinked", "unavailable", {}, "2026-01-01T00:00:00Z"),
    st("light.other", "on", {}, "2026-01-01T00:00:00Z"),
  ]);
  const items = deriveAutoItems({ plan: p, states: s, now: NOW });
  assert.deepEqual(items.filter((i) => i.kind === "offline").map((i) => [i.entity, i.text, i.roomName, i.itemId]), [["light.kitchen", "Offline for 3 days", "Kitchen", "i1"]]);
});

test("pending updates are soon, and a washer's service flag is due with its cycle count", () => {
  const s = states([
    st("update.hacs_update", "on", { title: "HACS", installed_version: "1.0", latest_version: "1.1" }),
    st("sensor.washer_state", "idle"), st("sensor.washer_progress", "0"), st("binary_sensor.washer_running", "off"), st("sensor.washer_cycle_count", "112"), st("binary_sensor.washer_maintenance_due", "on"),
  ]);
  const items = deriveAutoItems({ plan: plan(), states: s, now: NOW });
  assert.equal(items.find((i) => i.kind === "update")?.status, "soon");
  const wash = items.find((i) => i.kind === "wash");
  assert.equal(wash?.status, "due");
  assert.match(wash?.text ?? "", /112 cycles/);
});

test("an item's id is stable between runs and a linked piece of furniture puts it in its room", () => {
  const p = plan({ items: [{ id: "smoke", kind: "sn_smoke", x: 5, y: 1, rot: 0, w: 0.1, d: 0.1, h: 2.4, entity: "binary_sensor.hall_smoke" }] });
  const s = states([st("sensor.hall_smoke_battery", "9", { device_class: "battery", unit_of_measurement: "%" })]);
  const a = deriveAutoItems({ plan: p, states: s, now: NOW, entityArea: { "sensor.hall_smoke_battery": "hall_area" } });
  const b = deriveAutoItems({ plan: p, states: s, now: NOW + 5000, entityArea: { "sensor.hall_smoke_battery": "hall_area" } });
  assert.deepEqual(a.map((i) => i.id), b.map((i) => i.id));
  assert.equal(a[0].roomId, undefined, "the battery is not the linked entity and has no area on a room");
  const withArea = plan({ rooms: [{ ...p.rooms[1], areas: ["hall_area"] }] });
  assert.equal(deriveAutoItems({ plan: withArea, states: s, now: NOW, entityArea: { "sensor.hall_smoke_battery": "hall_area" } })[0].roomName, "Hall");
});

// ---- the board ---------------------------------------------------------------------------------------------------------------------------------------------

test("tasks fall into Due now, Soon (14 days), Later, and automatic items into Due now, Soon and Healthy, worst first", () => {
  const p = [
    task({ id: "over", name: "Overdue job", due: "2026-03-07" }),
    task({ id: "today", name: "Today job", due: "2026-03-10" }),
    task({ id: "week", name: "Week job", due: "2026-03-17" }),
    task({ id: "edge", name: "Edge job", due: "2026-03-24" }),
    task({ id: "far", name: "Far job", due: "2026-03-25" }),
  ].reduce(addTask, plan());
  const s = states([st("sensor.a_battery", "5", { device_class: "battery" }), st("sensor.b_battery", "60", { device_class: "battery" }), st("sensor.c_battery", "2", { device_class: "battery" })]);
  const board = buildBoard({ plan: p, states: s, now: NOW, today: "2026-03-10" });
  const section = (sec: string) => board.items.filter((i) => i.section === sec).map((i) => i.id);
  assert.deepEqual(section("now"), ["over", "today", "auto:battery:sensor.c_battery", "auto:battery:sensor.a_battery"]);
  assert.deepEqual(section("soon"), ["week", "edge"]);
  assert.deepEqual(section("later"), ["far"]);
  assert.deepEqual(section("healthy"), ["auto:battery:sensor.b_battery"]);
  assert.deepEqual(board.counts, { now: 4, soon: 2, later: 1, healthy: 1 });
  assert.deepEqual(board.items.filter((i) => i.source === "user").map((i) => i.text), ["Overdue 3 days", "Due today", "Due in 7 days", "Due in 14 days", "Due in 15 days"]);
});

test("a snoozed or switched-off automatic item leaves the board, and comes back when restored or when the snooze ends", () => {
  const s = states([st("sensor.a_battery", "5", { device_class: "battery" }), st("sensor.c_battery", "2", { device_class: "battery" })]);
  let p = snoozeAuto(plan(), "auto:battery:sensor.a_battery", "2026-03-10", 7);
  p = ignoreAuto(p, "auto:battery:sensor.c_battery");
  const on = (day: string) => buildBoard({ plan: p, states: s, now: NOW, today: day });
  assert.deepEqual(on("2026-03-10").items, []);
  assert.deepEqual(on("2026-03-10").hidden.map((h) => [h.item.id, h.until]), [["auto:battery:sensor.a_battery", "2026-03-17"], ["auto:battery:sensor.c_battery", undefined]]);
  assert.deepEqual(on("2026-03-17").items.map((i) => i.id), ["auto:battery:sensor.a_battery"], "the snooze is over");
  assert.deepEqual(restoreAuto(p, "auto:battery:sensor.c_battery").maintenance?.ignored ?? [], []);
  assert.equal(setBatteryBelow(plan(), 20).maintenance, undefined, "the default is not stored");
});

test("old snoozes are dropped the next time the data change", () => {
  let p = snoozeAuto(plan(), "auto:battery:sensor.old", "2026-01-01", 1);
  p = snoozeAuto(p, "auto:battery:sensor.new", "2026-03-10", 1);
  assert.deepEqual(Object.keys(p.maintenance?.snoozed ?? {}), ["auto:battery:sensor.new"]);
});

test("words for how late or near a job is", () => {
  assert.deepEqual([-3, -1, 0, 1, 5, 90].map(dueWords), ["Overdue 3 days", "Overdue 1 day", "Due today", "Due tomorrow", "Due in 5 days", "Due in about 3 months"]);
});

test("a task takes its room from its piece of furniture's room link, and a deleted room only means no place on the model", () => {
  const p = addTask(plan({ items: [{ id: "k", kind: "kettle", x: 1, y: 1, rot: 0, w: 0.2, d: 0.2, h: 0.2 }] }), task({ id: "a", room: "kit", item: "k", due: "2026-03-01" }));
  const spots = wrenchSpots(p, buildBoard({ plan: p, states: {}, now: NOW, today: "2026-03-10" }).items);
  assert.deepEqual(spots.map((s) => [s.key, s.x, s.y, s.count, s.first]), [["item:k", 1, 1, 1, "a"]]);
  const gone = addTask(plan(), task({ id: "b", room: "ghost", due: "2026-03-01" }));
  assert.deepEqual(wrenchSpots(gone, buildBoard({ plan: gone, states: {}, now: NOW, today: "2026-03-10" }).items), []);
});

test("several due things in one room share one dot with a count; only due things get a dot", () => {
  const p = [task({ id: "a", room: "kit", due: "2026-03-01" }), task({ id: "b", room: "kit", due: "2026-03-09" }), task({ id: "c", room: "hall", due: "2026-04-30" })].reduce(addTask, plan());
  const spots = wrenchSpots(p, buildBoard({ plan: p, states: {}, now: NOW, today: "2026-03-10" }).items);
  assert.deepEqual(spots.map((s) => [s.key, s.count]), [["room:kit", 2]]);
});

// ---- the reminder ------------------------------------------------------------------------------------------------------------------------------------------

test("one reminder a day at most, only for something new, and a job that stays due is never repeated", () => {
  const due = (...ids: string[]) => ids.map((id) => ({ id, name: id }) as never);
  const first = reminder({ ids: [] }, due("a"), "2026-03-10");
  assert.match(first.toast?.message ?? "", /1 thing needs attention: a/);
  const same = reminder(first.next, due("a"), "2026-03-11");
  assert.equal(same.toast, null, "still due, already told");
  const another = reminder(first.next, due("a", "b"), "2026-03-10");
  assert.equal(another.toast, null, "a second one the same day waits");
  const tomorrow = reminder(another.next, due("a", "b"), "2026-03-11");
  assert.equal(tomorrow.toast, null, "it was folded in, so tomorrow is quiet too");
  const later = reminder(tomorrow.next, due("a", "b", "c"), "2026-03-12");
  assert.match(later.toast?.message ?? "", /3 things need attention/);
  assert.equal(reminder(later.next, [], "2026-03-13").toast, null);
  const returned = reminder(reminder(later.next, [], "2026-03-13").next, due("a"), "2026-03-14");
  assert.ok(returned.toast, "done and due again is a new reminder");
});

test("stale linked readings use reported/updated timestamps, never last_changed alone", () => {
  const p = plan({ rooms: [{ ...plan().rooms[0], tempEntity: "sensor.stale", humidityEntity: "sensor.fresh" }] });
  const old = "2026-03-07T12:00:00Z";
  const values = states([
    { ...st("sensor.stale", "20"), last_updated: old },
    { ...st("sensor.fresh", "40"), last_updated: old, last_reported: "2026-03-10T11:00:00Z" },
    st("sensor.unchanging", "off", {}, old),
  ]);
  const offline = deriveAutoItems({ plan: p, states: values, now: NOW }).filter((i) => i.kind === "offline");
  assert.deepEqual(offline.map((i) => [i.entity, i.text]), [["sensor.stale", "No reading for 3 days"]]);
});
