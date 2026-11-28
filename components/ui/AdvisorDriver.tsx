"use client";
import { useEffect } from "react";
import { useAdvisor } from "@/lib/advisorStore";
import { dueReminders } from "@/lib/advisorReminders";
import { currentHome } from "@/lib/haHome";
import { useQuality } from "@/lib/quality";
import { useAdvisorReminders } from "./advisorReminderStore";
import { useInbox } from "./inboxStore";

// Settings read once; source refresh is only on panel open, an enabled Today card, or an explicit click. Eco never starts it in the background.
export default function AdvisorDriver() {
  const loaded = useAdvisor((s) => s.loaded);
  const todayCard = useAdvisor((s) => s.settings.todayCard);
  const eco = useQuality((s) => s.tier === "eco");
  const reminders = useAdvisorReminders((s) => s.reminders);
  useEffect(() => { void useAdvisor.getState().loadSettings(); }, []);
  useEffect(() => {
    if (!loaded || !todayCard || eco) return;
    void useAdvisor.getState().refresh();
    const id = setInterval(() => { if (!document.hidden) void useAdvisor.getState().refresh(); }, 30 * 60_000);
    return () => clearInterval(id);
  }, [loaded, todayCard, eco]);
  useEffect(() => {
    const home = currentHome();
    const mine = reminders.filter((r) => r.home === home);
    const deliver = () => {
      const due = dueReminders(mine, Date.now());
      for (const r of due) useInbox.getState().addLocal({ id: `advisor:${r.id}`, title: r.title, message: `${r.message}. Advisory only: nothing has been run.`, created_at: new Date(r.at).toISOString() });
      if (due.length) useAdvisorReminders.getState().delivered(due.map((r) => r.id));
    };
    deliver();
    const next = mine.filter((r) => !r.delivered && r.at > Date.now()).reduce((at, r) => Math.min(at, r.at), Infinity);
    if (!Number.isFinite(next)) return;
    const id = setTimeout(deliver, Math.min(2_147_483_647, Math.max(0, next - Date.now())));
    return () => clearTimeout(id);
  }, [reminders, loaded]);
  return null;
}
