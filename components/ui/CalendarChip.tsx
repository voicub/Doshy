"use client";
import { CalendarBlankIcon } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import { calendarStateKey, chipText, nextUp } from "@/lib/calendar";
import { useStore } from "@/lib/store";
import { selectStates } from "@/lib/statesMerge";
import { CLOCK_TICK_MS, useCalendar } from "./calendarStore";
import { useNow } from "../useNow";
import "./calendar.css";

const POLL_MS = 5 * 60_000;
const calendarKey = selectStates(calendarStateKey);

/** Calendar button for the top bar: the event happening now or next, from the dashboard calendar and every Home Assistant calendar. Opens the panel. */
export default function CalendarChip() {
  const open = useCalendar((s) => s.open);
  const upcoming = useCalendar((s) => s.upcoming);
  const now = useNow(CLOCK_TICK_MS);
  const key = useStore(calendarKey);

  useEffect(() => {
    const load = () => { if (!document.hidden) void useCalendar.getState().loadUpcoming(true); };
    load(); // the "key" below also re-runs this when HA reports another current or next event
    const t = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, [key]);

  const next = useMemo(() => nextUp(upcoming, now), [upcoming, now]);
  const text = next ? chipText(next, now) : "";
  return (
    <button className="t-btn t-cal" aria-pressed={open} aria-label={text ? `Calendar. ${text}. Open calendar` : "Calendar. Nothing coming up. Open calendar"} title="Calendar (D)" onClick={() => useCalendar.getState().toggle()}>
      <CalendarBlankIcon size={15} />
      {text && <span className="t-cal-text">{text}</span>}
    </button>
  );
}
