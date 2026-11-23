"use client";
import { CalendarBlankIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import { calendarColors, cardEvents, describeWhen, fmtDay, LOCAL_CALENDAR, timeLabel, untilText } from "@/lib/calendar";
import { CLOCK_TICK_MS, useCalendar } from "./calendarStore";
import { useNow } from "../useNow";
import "./calendar.css";


/** A small card on the Live view: today's events (or the next ones), from every calendar. Tapping it opens the full calendar. Hidden when nothing is coming up or the owner switched it off in the calendar. */
export default function CalendarCard() {
  const card = useCalendar((s) => s.card);
  const upcoming = useCalendar((s) => s.upcoming);
  const calendars = useCalendar((s) => s.calendars);
  const now = useNow(CLOCK_TICK_MS);
  useEffect(() => { useCalendar.getState().hydrateCard(); }, []);
  const colors = useMemo(() => calendarColors([LOCAL_CALENDAR, ...calendars.map((c) => c.entity_id)]), [calendars]);
  const view = useMemo(() => cardEvents(upcoming, now), [upcoming, now]);
  if (!card || !view) return null;

  const open = () => {
    const st = useCalendar.getState();
    st.setOpen(true);
  };
  return (
    <section className="hud brackets cal-card" aria-label="Calendar">
      <header className="cal-card-head">
        <button type="button" className="cal-card-title" onClick={open} aria-label={`${view.title}: open the calendar`}>
          <CalendarBlankIcon size={13} />
          <span>{view.title}</span>
          <small>{fmtDay(new Date(now))}</small>
        </button>
        <button type="button" className="cal-icon" aria-label="Hide the calendar card" title="Hide (switch back on in the calendar)" onClick={() => useCalendar.getState().setCard(false)}><XIcon size={12} /></button>
      </header>
      <ul className="cal-card-list">
        {view.list.map((ev) => {
          const live = !ev.allDay && ev.start <= now && ev.end > now;
          return (
            <li key={ev.id} className="cal-card-ev" data-live={live ? "" : undefined} style={{ ["--c" as string]: colors[ev.calendar] ?? colors[LOCAL_CALENDAR] }}>
              <button type="button" onClick={open} aria-label={`${ev.title}, ${describeWhen(ev)}`}>
                <span className="cal-card-time">{view.title === "Today" ? timeLabel(ev) : untilText(ev, now)}</span>
                <span className="cal-card-name">{ev.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {view.more > 0 && <button type="button" className="cal-card-more" onClick={open}>+{view.more} more</button>}
    </section>
  );
}
