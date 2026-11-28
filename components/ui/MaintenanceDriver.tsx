"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActivePlan } from "@/lib/activePlan";
import { useAreas } from "@/lib/haAreas";
import { isRecord } from "@/lib/guards";
import { buildBoard, reminder, type Reminded } from "@/lib/maintenanceBoard";
import { dayOf, isDay } from "@/lib/maintenanceDates";
import { useStore } from "@/lib/store";
import { useInbox } from "./inboxStore";
import { useMaintenanceUi } from "./maintenanceUi";

const readReminder = (key: string): Reminded => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (isRecord(raw) && Array.isArray(raw.ids)) return { day: isDay(raw.day) ? raw.day : undefined, ids: raw.ids.filter((v): v is string => typeof v === "string") };
  } catch { /* Private storage: the in-memory daily guard still applies. */ }
  return { ids: [] };
};

/** One slow clock for the board, chip, model dots and reminders; never writes to Home Assistant. */
export default function MaintenanceDriver() {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const entityArea = useAreas((s) => s.entityArea);
  const planId = useActivePlan((s) => s.id);
  const ready = useActivePlan((s) => s.status === "ready");
  const [now, setNow] = useState(() => Date.now());
  const memories = useRef(new Map<string, Reminded>());
  useEffect(() => {
    const tick = () => { if (!document.hidden) setNow(Date.now()); };
    const timer = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const today = dayOf(now);
  const board = useMemo(() => buildBoard({ plan, states, entityArea, now, today }), [plan, states, entityArea, now, today]);
  useEffect(() => { useMaintenanceUi.setState({ board }); }, [board]);
  useEffect(() => {
    if (!ready || planId === null || document.hidden) return;
    const key = `housey-maintenance-reminded.${planId}`;
    // An unrelated toast keeps its turn; retry on the next minute rather than losing the daily reminder.
    if (useInbox.getState().toast) return;
    const previous = memories.current.get(key) ?? readReminder(key);
    const result = reminder(previous, board.items.filter((i) => i.section === "now"), today);
    memories.current.set(key, result.next);
    try { localStorage.setItem(key, JSON.stringify(result.next)); } catch { /* In-memory guard prevents repeated reminders in this visit. */ }
    if (result.toast) useInbox.setState({ toast: { ...result.toast, id: `maintenance:${planId}:${today}`, created_at: new Date(now).toISOString() } });
  }, [board, today, now, planId, ready]);
  return null;
}
