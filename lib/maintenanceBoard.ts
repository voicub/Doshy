// The maintenance board: the owner's tasks and the automatic items brought together, sorted into "Due now", "Soon" (14 days), "Later" and "Healthy", with the words for each
// card, the spots for the wrench dots on the model, and the once-a-day reminder rule. Pure: the node test runner loads this file directly.
import { deriveAutoItems, type AutoItem, type AutoKind } from "./maintenanceAuto.ts";
import { effectiveDue, type MaintenanceTask, type TaskIcon } from "./maintenance.ts";
import { daysBetween, type Day } from "./maintenanceDates.ts";
import type { HAState } from "./ha.ts";
import { levelIdOf } from "./levels.ts";
import type { Plan } from "./types.ts";

export type Section = "now" | "soon" | "later" | "healthy";
export const SECTIONS: readonly Section[] = ["now", "soon", "later", "healthy"];
export const SOON_DAYS = 14;

export type BoardItem = {
  /** The task's id, or the automatic item's (`auto:...`). */
  id: string;
  source: "user" | "auto";
  section: Section;
  name: string;
  /** "Overdue 3 days", "Due in 5 days", "Battery 12%". */
  text: string;
  /** Days until it is due; negative when overdue. Only for the owner's tasks. */
  days?: number;
  icon: TaskIcon;
  roomId?: string;
  roomName?: string;
  itemId?: string;
  task?: MaintenanceTask;
  auto?: AutoItem;
};

export type HiddenAuto = { item: AutoItem; /** A day when it was only snoozed; absent when switched off for good. */ until?: Day };

export type Board = {
  items: BoardItem[];
  counts: Record<Section, number>;
  /** Automatic items the owner snoozed or switched off, so they can bring them back. */
  hidden: HiddenAuto[];
};

const AUTO_ICON: Record<AutoKind, TaskIcon> = { battery: "battery", filter: "filter", wash: "dryer", offline: "bulb", update: "wrench" };

/** "Overdue 3 days", "Due today", "Due tomorrow", "Due in 5 days", "Due in about 3 months". */
export function dueWords(days: number): string {
  if (days < 0) return `Overdue ${-days} ${days === -1 ? "day" : "days"}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 60) return `Due in ${days} days`;
  const months = Math.round(days / 30.4);
  return months >= 24 ? `Due in about ${Math.round(months / 12)} years` : `Due in about ${months} months`;
}

const sectionOfDays = (days: number): Section => (days <= 0 ? "now" : days <= SOON_DAYS ? "soon" : "later");
const sectionOfAuto = (a: AutoItem): Section => (a.status === "due" ? "now" : a.status === "soon" ? "soon" : "healthy");

type BoardInput = {
  plan: Plan;
  states: Record<string, HAState>;
  now: number;
  /** The owner's local calendar day for `now`. */
  today: Day;
  entityArea?: Record<string, string | null>;
};

function userItem(plan: Plan, t: MaintenanceTask, today: Day): BoardItem {
  const days = daysBetween(today, effectiveDue(t));
  const room = plan.rooms.find((r) => r.id === t.room);
  const item = plan.items.find((i) => i.id === t.item);
  const host = room && (plan.rooms.find((r) => r.id === room.parent) ?? room);
  return {
    id: t.id, source: "user", section: sectionOfDays(days), name: t.name, text: dueWords(days), days, icon: t.icon ?? "wrench", task: t,
    ...(host ? { roomId: host.id, roomName: host.name } : {}),
    ...(item ? { itemId: item.id } : {}),
  };
}

const byDays = (a: BoardItem, b: BoardItem) => (a.days ?? 0) - (b.days ?? 0) || a.name.localeCompare(b.name);

/** The sections' order inside: tasks by how late or near they are, then automatic items by how low they are. */
const order = (a: BoardItem, b: BoardItem): number => {
  if (a.source !== b.source) return a.source === "user" ? -1 : 1;
  return a.source === "user" ? byDays(a, b) : (a.auto?.level ?? 1e9) - (b.auto?.level ?? 1e9) || a.name.localeCompare(b.name);
};

export function buildBoard(input: BoardInput): Board {
  const { plan, today } = input;
  const m = plan.maintenance;
  const hidden: HiddenAuto[] = [];
  const items: BoardItem[] = (m?.tasks ?? []).map((t) => userItem(plan, t, today));
  const autos = deriveAutoItems({ plan, states: input.states, now: input.now, entityArea: input.entityArea, batteryBelow: m?.batteryBelow });
  for (const a of autos) {
    const until = m?.snoozed?.[a.id];
    if (m?.ignored?.includes(a.id)) hidden.push({ item: a });
    else if (until && daysBetween(today, until) > 0) hidden.push({ item: a, until });
    else {
      items.push({ id: a.id, source: "auto", section: sectionOfAuto(a), name: a.name, text: a.text, icon: AUTO_ICON[a.kind], auto: a, ...(a.roomId ? { roomId: a.roomId, roomName: a.roomName } : {}), ...(a.itemId ? { itemId: a.itemId } : {}) });
    }
  }
  items.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || order(a, b));
  const counts: Record<Section, number> = { now: 0, soon: 0, later: 0, healthy: 0 };
  for (const i of items) counts[i.section]++;
  return { items, counts, hidden };
}

// ---- wrench dots on the model -------------------------------------------------------------------------------------------------------------------------------

export type Spot = {
  /** `item:<id>` or `room:<id>`. */
  key: string;
  itemId?: string;
  roomId?: string;
  level: string;
  x: number;
  y: number;
  /** How many due things sit here. */
  count: number;
  /** The first (most urgent) board item here: the one the board opens on. */
  first: string;
};

/** Where the due items go on the model: on the piece of furniture when one is known, else at the centre of the room. Items with neither have no dot. */
export function wrenchSpots(plan: Plan, items: readonly BoardItem[]): Spot[] {
  const spots = new Map<string, Spot>();
  for (const b of items) {
    if (b.section !== "now") continue;
    const item = b.itemId ? plan.items.find((i) => i.id === b.itemId) : undefined;
    const room = b.roomId ? plan.rooms.find((r) => r.id === b.roomId) : undefined;
    const at = item ? { key: `item:${item.id}`, itemId: item.id, level: levelIdOf(plan, item), x: item.x, y: item.y } : room ? { key: `room:${room.id}`, roomId: room.id, level: levelIdOf(plan, room), x: room.x + room.w / 2, y: room.y + room.h / 2 } : null;
    if (!at) continue;
    const have = spots.get(at.key);
    if (have) have.count++;
    else spots.set(at.key, { ...at, count: 1, first: b.id });
  }
  return [...spots.values()];
}

// ---- the once-a-day reminder --------------------------------------------------------------------------------------------------------------------------------

export type Reminded = { day?: Day; ids: string[] };

/**
 * A reminder in the notification toast when something has become due that the owner has not been told about, and at most once per calendar day (so nothing nags): the toast
 * says what is due. `next` is what to remember: always the ids due now, so a job that is done and comes due again later is a new reminder, and one that stays due is not repeated.
 */
export function reminder(prev: Reminded, due: readonly BoardItem[], today: Day): { next: Reminded; toast: { title: string; message: string } | null } {
  const ids = due.map((i) => i.id);
  const fresh = due.filter((i) => !prev.ids.includes(i.id));
  if (!fresh.length || prev.day === today) return { next: { day: prev.day, ids }, toast: null };
  const names = due.slice(0, 3).map((i) => i.name).join(", ");
  const more = due.length > 3 ? ` and ${due.length - 3} more` : "";
  return { next: { day: today, ids }, toast: { title: "Maintenance", message: `${due.length === 1 ? "1 thing needs" : `${due.length} things need`} attention: ${names}${more}.` } };
}
