// Ready-made tasks for "Add a task": one tap fills the name, the picture and how often. Pure: the node test runner loads this file directly.
import { addInterval, nextMonthStart, type Day, type IntervalUnit } from "./maintenanceDates.ts";
import type { MaintenanceTask, TaskIcon } from "./maintenance.ts";

export type TaskTemplate = {
  id: string;
  name: string;
  icon: TaskIcon;
  every: number;
  unit: IntervalUnit;
  /** Words under the tile ("every 3 months"). */
  blurb: string;
  /** A job that belongs to a season is first due on the 1st of this month (1..12) instead of one interval from today. */
  startMonth?: number;
};

export const TEMPLATES: readonly TaskTemplate[] = [
  { id: "hvac", name: "Replace the HVAC filter", icon: "filter", every: 90, unit: "day", blurb: "every 90 days" },
  { id: "smoke-test", name: "Test the smoke alarms", icon: "alarm", every: 6, unit: "month", blurb: "every 6 months" },
  { id: "smoke-battery", name: "Replace the smoke alarm batteries", icon: "battery", every: 1, unit: "year", blurb: "every year" },
  { id: "kettle", name: "Descale the kettle or coffee machine", icon: "kettle", every: 3, unit: "month", blurb: "every 3 months" },
  { id: "lint", name: "Clean the dryer lint trap", icon: "dryer", every: 1, unit: "month", blurb: "every month" },
  { id: "salt", name: "Check the water softener salt", icon: "salt", every: 1, unit: "month", blurb: "every month" },
  { id: "boiler", name: "Service the boiler", icon: "boiler", every: 1, unit: "year", blurb: "every year" },
  { id: "gutters", name: "Clean the gutters", icon: "gutter", every: 1, unit: "year", blurb: "every autumn", startMonth: 10 },
  { id: "fridge-filter", name: "Change the fridge water filter", icon: "fridge", every: 6, unit: "month", blurb: "every 6 months" },
  { id: "vacuum-filter", name: "Clean the vacuum filter", icon: "vacuum", every: 1, unit: "month", blurb: "every month" },
  { id: "cooker-hood", name: "Clean the cooker hood filter", icon: "filter", every: 3, unit: "month", blurb: "every 3 months" },
  { id: "windows", name: "Wash the windows", icon: "window", every: 3, unit: "month", blurb: "every 3 months" },
  { id: "plants", name: "Repot or feed the plants", icon: "plant", every: 6, unit: "month", blurb: "every 6 months" },
  { id: "dishwasher", name: "Clean the dishwasher filter", icon: "water", every: 1, unit: "month", blurb: "every month" },
];

/** A task made from a template, starting on `today`: first due one interval from now, or at the start of its season. `id` must be one the plan does not use yet. */
export function taskFromTemplate(t: TaskTemplate, id: string, today: Day): MaintenanceTask {
  return { id, name: t.name, icon: t.icon, every: t.every, unit: t.unit, due: t.startMonth ? nextMonthStart(today, t.startMonth) : addInterval(today, t.every, t.unit) };
}

/** "every 90 days", "every week", "every 2 months": an interval in words. */
export function everyWords(every: number, unit: IntervalUnit): string {
  return every === 1 ? `every ${unit}` : `every ${every} ${unit}s`;
}
