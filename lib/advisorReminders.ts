import { isRecord } from "./guards.ts";
export type AdvisorReminder = { id: string; title: string; message: string; at: number; expires: number; delivered: boolean };
export function parseReminders(raw: unknown): AdvisorReminder[] {
  return Array.isArray(raw) ? raw.slice(0, 40).filter((r): r is AdvisorReminder => isRecord(r) && typeof r.id === "string" && r.id.length <= 200 && typeof r.title === "string" && r.title.length <= 1000 && typeof r.message === "string" && r.message.length <= 4000 && typeof r.at === "number" && Number.isFinite(r.at) && typeof r.expires === "number" && r.expires > r.at && typeof r.delivered === "boolean") : [];
}
export const dueReminders = (reminders: readonly AdvisorReminder[], now: number): AdvisorReminder[] => reminders.filter((r) => !r.delivered && r.at <= now && r.expires > now);
