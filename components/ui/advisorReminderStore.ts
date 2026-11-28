"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "@/lib/dbClient";
import { parseReminders, type AdvisorReminder } from "@/lib/advisorReminders";
import type { Advice } from "@/lib/advisor";
import { currentHome } from "@/lib/haHome";

const storage = dbStorage("housey-advisor-reminders", "settings", 0);
type Reminder = AdvisorReminder & { home: string | null };
export const useAdvisorReminders = create<{ reminders: Reminder[]; remind: (advice: Advice) => void; delivered: (ids: string[]) => void }>()(persist((set) => ({
  reminders: [],
  remind: (advice) => {
    if (advice.remindAt === null) return;
    const home = currentHome();
    set((s) => ({ reminders: [...s.reminders.filter((r) => r.id !== advice.id || r.home !== home).filter((r) => r.expires > Date.now()).slice(-39), { id: advice.id, title: advice.title, message: advice.detail, at: advice.remindAt!, expires: advice.end, delivered: false, home }] }));
  },
  delivered: (ids) => set((s) => ({ reminders: s.reminders.map((r) => r.home === currentHome() && ids.includes(r.id) ? { ...r, delivered: true } : r) })),
}), {
  name: "housey-advisor-reminders", storage: createJSONStorage(() => storage), partialize: (s) => ({ reminders: s.reminders }),
  merge: (saved, current) => {
    const raw = saved !== null && typeof saved === "object" && "reminders" in saved ? saved.reminders : [];
    const reminders = parseReminders(raw).map((r): Reminder => ({ ...r, home: "home" in r && typeof r.home === "string" ? r.home : null }));
    return { ...current, reminders };
  },
}));
storage.bind(() => void useAdvisorReminders.persist.rehydrate());
