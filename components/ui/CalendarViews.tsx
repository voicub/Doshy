"use client";
import type { ReactNode } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { sameDay, startOfDay, stepAnchor, viewTitle, WEEKDAYS, ymd, type CalEvent, type CalView } from "@/lib/calendar";
import { useCalendar } from "./calendarStore";
import { dayHead } from "./CalendarParts";

const VIEWS: { id: CalView; label: string }[] = [{ id: "month", label: "Month" }, { id: "week", label: "Week" }, { id: "agenda", label: "Agenda" }];
const MAX_DOTS = 3;

const st = useCalendar.getState;

/** View tabs plus previous / today / next. */
export function CalendarBar({ view, anchorDate }: { view: CalView; anchorDate: Date }) {
  const unit = view === "month" ? "month" : view === "week" ? "week" : "page";
  return (
    <div className="cal-bar">
      <div className="cal-views" role="group" aria-label="View">
        {VIEWS.map((v) => <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => st().setView(v.id)}>{v.label}</button>)}
      </div>
      <div className="cal-nav">
        <button type="button" className="cal-icon" aria-label={`Previous ${unit}`} onClick={() => st().setAnchor(stepAnchor(view, anchorDate, -1))}><CaretLeftIcon size={14} /></button>
        <button type="button" className="cal-today" onClick={() => { st().setAnchor(startOfDay(new Date())); st().setDay(startOfDay(new Date())); }}>Today</button>
        <button type="button" className="cal-icon" aria-label={`Next ${unit}`} onClick={() => st().setAnchor(stepAnchor(view, anchorDate, 1))}><CaretRightIcon size={14} /></button>
      </div>
    </div>
  );
}

type ViewProps = { days: Date[]; byDay: Map<string, CalEvent[]>; today: Date; loaded: boolean; renderRow: (ev: CalEvent) => ReactNode };

/** Month grid (a dot per calendar on each day) and the selected day's list underneath. */
export function MonthView({ days, byDay, today, loaded, renderRow, anchorDate, dayDate, colors }: ViewProps & { anchorDate: Date; dayDate: Date; colors: Record<string, string> }) {
  const dayList = (d: Date) => byDay.get(ymd(d)) ?? [];
  return (
    <>
      <div className="cal-grid" role="grid" aria-label={viewTitle("month", anchorDate)}>
        {WEEKDAYS.map((w) => <span key={w} className="cal-dow" role="columnheader">{w}</span>)}
        {days.map((d) => {
          const list = dayList(d);
          const colorsOf = [...new Set(list.map((e) => e.calendar))];
          return (
            <button
              key={ymd(d)}
              type="button"
              role="gridcell"
              className="cal-day"
              data-out={d.getMonth() !== anchorDate.getMonth() ? "" : undefined}
              data-today={sameDay(d, today) ? "" : undefined}
              aria-selected={sameDay(d, dayDate)}
              aria-label={`${d.getDate()} ${d.toLocaleString("en-GB", { month: "long" })}, ${list.length ? `${list.length} event${list.length === 1 ? "" : "s"}` : "no events"}`}
              onClick={() => st().setDay(d)}
            >
              <b>{d.getDate()}</b>
              <span className="cal-dots" aria-hidden>
                {colorsOf.slice(0, MAX_DOTS).map((c) => <i key={c} style={{ background: colors[c] }} />)}
                {list.length > MAX_DOTS && <small>{list.length}</small>}
              </span>
            </button>
          );
        })}
      </div>
      <h3 className="cal-dayhead">{dayHead(dayDate, today)}</h3>
      <ul className="cal-list">{dayList(dayDate).length ? dayList(dayDate).map(renderRow) : <li className="cal-empty">{loaded ? "Nothing planned." : "Loading..."}</li>}</ul>
    </>
  );
}

/** Week (every day) or agenda (only days with events), one section per day. */
export function DaysView({ view, days, byDay, today, loaded, renderRow }: ViewProps & { view: CalView }) {
  const dayList = (d: Date) => byDay.get(ymd(d)) ?? [];
  return (
    <div className="cal-days">
      {days.filter((d) => view === "week" || dayList(d).length).map((d) => (
        <section key={ymd(d)} className="cal-sect" data-today={sameDay(d, today) ? "" : undefined}>
          <h3 className="cal-dayhead">{dayHead(d, today)}</h3>
          <ul className="cal-list">{dayList(d).length ? dayList(d).map(renderRow) : <li className="cal-empty">Nothing planned.</li>}</ul>
        </section>
      ))}
      {view === "agenda" && !days.some((d) => dayList(d).length) && <p className="cal-empty">{loaded ? "Nothing planned in the next 30 days." : "Loading..."}</p>}
    </div>
  );
}
