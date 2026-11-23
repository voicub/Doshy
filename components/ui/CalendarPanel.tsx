"use client";
import { PlusIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { calendarColors, daysOf, groupByDay, LOCAL_CALENDAR, LOCAL_NAME, viewRange, viewTitle, type CalEvent } from "@/lib/calendar";
import HudPanel from "./HudPanel";
import { isTypingTarget } from "./isTypingTarget";
import { CLOCK_TICK_MS, useCalendar, type HaCalendar } from "./calendarStore";
import { AddForm, EventRow } from "./CalendarParts";
import { CalendarBar, DaysView, MonthView } from "./CalendarViews";
import { useNow } from "../useNow";
import "./calendar.css";

const REFRESH_MS = 60_000;

const nameOf = (id: string, calendars: HaCalendar[]) => (id === LOCAL_CALENDAR ? LOCAL_NAME : (calendars.find((c) => c.entity_id === id)?.name ?? id));

/** While the panel is open: load now, refresh every minute (not while the tab is hidden), Escape closes. */
function useCalendarOpen() {
  useEffect(() => {
    const st = useCalendar.getState();
    void st.refresh();
    void st.loadUpcoming();
    const t = setInterval(() => { if (!document.hidden) void useCalendar.getState().refresh(); }, REFRESH_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isTypingTarget(e.target)) return;
      useCalendar.getState().close();
    };
    window.addEventListener("keydown", onKey);
    return () => { clearInterval(t); window.removeEventListener("keydown", onKey); };
  }, []);
}

/** Calendar slide-over: the dashboard calendar plus every Home Assistant calendar, as a month grid, a week or an agenda. Nothing is written to Home Assistant except from the Add and Delete buttons. */
export default function CalendarPanel() {
  const view = useCalendar((s) => s.view);
  const anchor = useCalendar((s) => s.anchor);
  const day = useCalendar((s) => s.day);
  const events = useCalendar((s) => s.events);
  const calendars = useCalendar((s) => s.calendars);
  const hidden = useCalendar((s) => s.hidden);
  const loaded = useCalendar((s) => s.loaded);
  const failed = useCalendar((s) => s.failed);
  const haKnown = useCalendar((s) => s.haKnown);
  const localFailed = useCalendar((s) => s.localFailed);
  const card = useCalendar((s) => s.card);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const now = useNow(CLOCK_TICK_MS);
  useCalendarOpen();

  const anchorDate = useMemo(() => new Date(anchor), [anchor]);
  const dayDate = useMemo(() => new Date(day), [day]);
  const ids = useMemo(() => [LOCAL_CALENDAR, ...calendars.map((c) => c.entity_id)], [calendars]);
  const colors = useMemo(() => calendarColors(ids), [ids]);
  const range = useMemo(() => viewRange(view, anchorDate), [view, anchorDate]);
  const days = useMemo(() => daysOf(range), [range]);
  const byDay = useMemo(() => groupByDay(events, days), [events, days]);
  const today = new Date(now);
  const st = useCalendar.getState;

  const notes: string[] = [];
  if (!haKnown) notes.push("Home Assistant could not be asked for its calendars. The dashboard calendar still works.");
  else if (!calendars.length) notes.push("Home Assistant has no calendar set up (Settings, Devices & services, add the Local Calendar). Events you add here are kept in the dashboard.");
  if (failed.length) notes.push(`Could not load: ${failed.map((f) => nameOf(f, calendars)).join(", ")}.`);
  if (localFailed) notes.push("The dashboard calendar could not be read.");

  const renderRow = (ev: CalEvent) => (
    <EventRow key={ev.id} ev={ev} color={colors[ev.calendar] ?? colors[LOCAL_CALENDAR]} calendar={nameOf(ev.calendar, calendars)} open={open === ev.id} onToggle={() => setOpen(open === ev.id ? null : ev.id)} now={now} />
  );
  const listProps = { days, byDay, today, loaded, renderRow };

  return (
    <HudPanel title="Calendar" meta={viewTitle(view, anchorDate)} onClose={() => st().close()} className="cal sheet">
      <CalendarBar view={view} anchorDate={anchorDate} />

      <div className="cal-filters" role="group" aria-label="Calendars">
        {ids.map((id) => (
          <button key={id} type="button" className="cal-filter" aria-pressed={!hidden.includes(id)} onClick={() => st().toggleCalendar(id)} style={{ ["--c" as string]: colors[id] }}>
            <i aria-hidden />{nameOf(id, calendars)}
          </button>
        ))}
      </div>
      <label className="cal-check cal-cardsw">
        <input type="checkbox" checked={card} onChange={(e) => st().setCard(e.target.checked)} /> Show today&rsquo;s events as a card on the home view
      </label>
      {notes.map((n) => <p key={n} className="cal-note" role="status">{n}</p>)}

      <div className="cal-body" aria-busy={!loaded}>
        {view === "month" ? <MonthView {...listProps} anchorDate={anchorDate} dayDate={dayDate} colors={colors} /> : <DaysView {...listProps} view={view} />}
      </div>

      {adding ? (
        <AddForm key={day} day={dayDate} calendars={calendars} hidden={hidden} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className="cal-add" onClick={() => setAdding(true)}><PlusIcon size={14} /> Add event</button>
      )}
    </HudPanel>
  );
}
