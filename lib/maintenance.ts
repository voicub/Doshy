// The maintenance board's own data: recurring tasks the owner keeps ("Replace the HVAC filter, every 90 days"), what they snoozed or hid among the automatic items, and the
// battery threshold. It lives in the plan (`plan.maintenance`), so it is exported, imported and duplicated with the plan and every change is one undo step. A guest link
// never carries it (lib/guestPlan.ts lists the parts a guest gets). Pure: reading it safely out of a saved plan, and the edits. The node test runner loads this file directly.
import { isRecord } from "./guards.ts";
import { addDays, addInterval, daysBetween, isDay, laterDay, type Day, type IntervalUnit } from "./maintenanceDates.ts";
import type { Plan } from "./types.ts";

export const MAX_TASKS = 100;
export const MAX_HISTORY = 20;
const MAX_HIDDEN = 200; // automatic items snoozed or switched off
const NAME_MAX = 80;
const NOTES_MAX = 400;
const ID = /^[A-Za-z0-9_-]{1,60}$/;
/** Automatic items are named from what they watch (`auto:battery:binary_sensor.hall_smoke_battery`). */
const AUTO_ID = /^auto:[a-z_]{1,16}:[A-Za-z0-9_.:-]{1,160}$/;

export const UNITS: readonly IntervalUnit[] = ["day", "week", "month", "year"];
/** The longest a task may wait between two jobs, per unit (ten years). */
const MAX_EVERY: Record<IntervalUnit, number> = { day: 3650, week: 520, month: 120, year: 10 };
export const BATTERY_DEFAULT = 20;
export const BATTERY_RANGE = { min: 5, max: 50 } as const;

/** The pictures a task can wear (the board maps each to an icon). */
export const TASK_ICONS = ["filter", "alarm", "kettle", "dryer", "salt", "boiler", "gutter", "fridge", "battery", "vacuum", "wrench", "water", "plant", "window", "car", "bulb"] as const;
export type TaskIcon = (typeof TASK_ICONS)[number];

export type MaintenanceTask = {
  id: string;
  name: string;
  icon?: TaskIcon;
  every: number;
  unit: IntervalUnit;
  /** The day the job is next due. */
  due: Day;
  /** The day it was last done (absent: never, yet). */
  last?: Day;
  /** The room and the piece of furniture it is about; either may be gone from the plan later, which only means the task has no place on the model. */
  room?: string;
  item?: string;
  notes?: string;
  /** Snoozed: counts as due on this day instead, when that is later than `due`. */
  snooze?: Day;
  /** Days it was done, oldest first, at most MAX_HISTORY. */
  history?: Day[];
};

export type Maintenance = {
  tasks?: MaintenanceTask[];
  /** Automatic items snoozed until a day (by item id, lib/maintenanceAuto.ts). Past days are dropped on the next change. */
  snoozed?: Record<string, Day>;
  /** Automatic items the owner switched off for good. */
  ignored?: string[];
  /** A battery counts as low at or below this many percent (default 20). */
  batteryBelow?: number;
};

const plainText = (v: unknown, max: number, multiline = false): string | undefined => {
  if (typeof v !== "string") return undefined;
  const clean = v.replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f<>]/g : /[\u0000-\u001f\u007f<>]/g, " ").replace(multiline ? /[ \t]+/g : /\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
};

const idOf = (v: unknown): string | undefined => (typeof v === "string" && ID.test(v) ? v : undefined);

/** One task read from untrusted JSON, or undefined when it is not a usable task. */
export function taskOf(raw: unknown): MaintenanceTask | undefined {
  if (!isRecord(raw)) return undefined;
  const id = idOf(raw.id);
  const name = plainText(raw.name, NAME_MAX);
  const unit = UNITS.find((u) => u === raw.unit);
  const every = typeof raw.every === "number" && Number.isInteger(raw.every) && unit ? raw.every : 0;
  if (!id || !name || !unit || every < 1 || every > MAX_EVERY[unit] || !isDay(raw.due)) return undefined;
  const icon = TASK_ICONS.find((i) => i === raw.icon);
  const notes = plainText(raw.notes, NOTES_MAX, true);
  const history = Array.isArray(raw.history) ? raw.history.filter(isDay).slice(-MAX_HISTORY) : [];
  return {
    id, name, every, unit, due: raw.due,
    ...(icon ? { icon } : {}),
    ...(isDay(raw.last) ? { last: raw.last } : {}),
    ...(idOf(raw.room) ? { room: idOf(raw.room) } : {}),
    ...(idOf(raw.item) ? { item: idOf(raw.item) } : {}),
    ...(notes ? { notes } : {}),
    ...(isDay(raw.snooze) ? { snooze: raw.snooze } : {}),
    ...(history.length ? { history } : {}),
  };
}

/** The stored maintenance data made valid: broken tasks and repeated ids are dropped, lists are capped. Undefined when nothing is left (a plan without any stays without the field). */
export function sanitizeMaintenance(raw: unknown): Maintenance | undefined {
  if (!isRecord(raw)) return undefined;
  const seen = new Set<string>();
  const tasks: MaintenanceTask[] = [];
  for (const t of Array.isArray(raw.tasks) ? raw.tasks : []) {
    const task = taskOf(t);
    if (!task || seen.has(task.id) || tasks.length >= MAX_TASKS) continue;
    seen.add(task.id);
    tasks.push(task);
  }
  const snoozed: Record<string, Day> = {};
  if (isRecord(raw.snoozed)) {
    for (const [id, day] of Object.entries(raw.snoozed)) if (AUTO_ID.test(id) && isDay(day) && Object.keys(snoozed).length < MAX_HIDDEN) snoozed[id] = day;
  }
  const ignored = Array.isArray(raw.ignored) ? [...new Set(raw.ignored.filter((i): i is string => typeof i === "string" && AUTO_ID.test(i)))].slice(0, MAX_HIDDEN) : [];
  const below = typeof raw.batteryBelow === "number" && Number.isFinite(raw.batteryBelow) ? Math.round(Math.min(BATTERY_RANGE.max, Math.max(BATTERY_RANGE.min, raw.batteryBelow))) : undefined;
  const out: Maintenance = {
    ...(tasks.length ? { tasks } : {}),
    ...(Object.keys(snoozed).length ? { snoozed } : {}),
    ...(ignored.length ? { ignored } : {}),
    ...(below !== undefined && below !== BATTERY_DEFAULT ? { batteryBelow: below } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

/** A plan loaded from anywhere (storage, the server, a file): its maintenance data is made valid. The same plan object when it already is, and a plan without it stays without. */
export function withMaintenance(plan: Plan): Plan {
  if (plan.maintenance === undefined) return plan;
  const clean = sanitizeMaintenance(plan.maintenance);
  if (JSON.stringify(clean) === JSON.stringify(plan.maintenance)) return plan;
  const { maintenance: _dropped, ...rest } = plan;
  return clean ? { ...rest, maintenance: clean } : rest;
}

// ---- edits: each returns a new plan, or the same one when nothing would change -------------------------------------------------------------------------------

const tasksOf = (plan: Plan): MaintenanceTask[] => plan.maintenance?.tasks ?? [];

/** The plan with these maintenance data (empty = no field). */
function withData(plan: Plan, data: Maintenance): Plan {
  const clean = sanitizeMaintenance(data);
  const { maintenance: _old, ...rest } = plan;
  return clean ? { ...rest, maintenance: clean } : rest;
}

/** Snoozes that have passed are dropped whenever the data change, so the list cannot grow for ever. */
const liveSnoozes = (snoozed: Maintenance["snoozed"], today: Day): Maintenance["snoozed"] =>
  snoozed ? Object.fromEntries(Object.entries(snoozed).filter(([, day]) => daysBetween(today, day) > 0)) : undefined;

export function addTask(plan: Plan, task: MaintenanceTask): Plan {
  const clean = taskOf(task);
  if (!clean || tasksOf(plan).length >= MAX_TASKS || tasksOf(plan).some((t) => t.id === clean.id)) return plan;
  return withData(plan, { ...plan.maintenance, tasks: [...tasksOf(plan), clean] });
}

/** Change some fields of a task (never its id). A change that would make it invalid leaves the plan as it was. */
export function patchTask(plan: Plan, id: string, patch: Partial<Omit<MaintenanceTask, "id">>): Plan {
  const old = tasksOf(plan).find((t) => t.id === id);
  if (!old) return plan;
  const next = taskOf({ ...old, ...patch, id });
  if (!next || JSON.stringify(next) === JSON.stringify(old)) return plan;
  return withData(plan, { ...plan.maintenance, tasks: tasksOf(plan).map((t) => (t.id === id ? next : t)) });
}

export function removeTask(plan: Plan, id: string): Plan {
  if (!tasksOf(plan).some((t) => t.id === id)) return plan;
  return withData(plan, { ...plan.maintenance, tasks: tasksOf(plan).filter((t) => t.id !== id) });
}

/** The job was done on `today` (or on `when`, an earlier day the owner picked): it is recorded and the next one is counted from that day, so doing it early or late moves the schedule with you. */
export function markDone(plan: Plan, id: string, today: Day, when: Day = today): Plan {
  const old = tasksOf(plan).find((t) => t.id === id);
  if (!old) return plan;
  const done = daysBetween(when, today) >= 0 ? when : today; // never "done" in the future
  const { snooze: _gone, ...rest } = old;
  const next: MaintenanceTask = { ...rest, last: done, due: addInterval(done, old.every, old.unit), history: [...(old.history ?? []), done].slice(-MAX_HISTORY) };
  return withData(plan, { ...plan.maintenance, tasks: tasksOf(plan).map((t) => (t.id === id ? next : t)) });
}

/** Put a task off for `days` days from today (a later snooze replaces an earlier one; the task's own schedule is not touched). */
export function snoozeTask(plan: Plan, id: string, today: Day, days: number): Plan {
  if (!tasksOf(plan).some((t) => t.id === id)) return plan;
  return patchTask(plan, id, { snooze: addDays(today, Math.max(1, Math.trunc(days))) });
}

/** The day a task counts as due: its own day, or the end of its snooze when that is later. */
export const effectiveDue = (t: Pick<MaintenanceTask, "due" | "snooze">): Day => (t.snooze ? laterDay(t.due, t.snooze) : t.due);

// ---- automatic items: snooze, switch off, switch on again ------------------------------------------------------------------------------------------------------

export function snoozeAuto(plan: Plan, autoId: string, today: Day, days: number): Plan {
  if (!AUTO_ID.test(autoId)) return plan;
  const snoozed = { ...liveSnoozes(plan.maintenance?.snoozed, today), [autoId]: addDays(today, Math.max(1, Math.trunc(days))) };
  return withData(plan, { ...plan.maintenance, snoozed });
}

export function ignoreAuto(plan: Plan, autoId: string): Plan {
  const ignored = plan.maintenance?.ignored ?? [];
  if (!AUTO_ID.test(autoId) || ignored.includes(autoId)) return plan;
  return withData(plan, { ...plan.maintenance, ignored: [...ignored, autoId] });
}

export function restoreAuto(plan: Plan, autoId: string): Plan {
  const m = plan.maintenance;
  if (!m || (!m.ignored?.includes(autoId) && !m.snoozed?.[autoId])) return plan;
  const { [autoId]: _gone, ...snoozed } = m.snoozed ?? {};
  return withData(plan, { ...m, ignored: (m.ignored ?? []).filter((i) => i !== autoId), snoozed });
}

export function setBatteryBelow(plan: Plan, percent: number): Plan {
  return withData(plan, { ...plan.maintenance, batteryBelow: percent });
}

/** The task ids a plan uses, to make a new one that is not taken. */
export const taskIds = (plan: Plan): string[] => tasksOf(plan).map((t) => t.id);
