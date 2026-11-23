"use client";
import { TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  defaultForm, describeWhen, deleteBody, editForm, formToInput, isRecurring, LOCAL_CALENDAR, LOCAL_NAME, MAX_DESCRIPTION, MAX_LOCATION, MAX_TITLE, rruleText, startOfDay, timeLabel, WEEKDAYS,
  type CalEvent, type DeleteScope, type EventForm,
} from "@/lib/calendar";
import { useCalendar, type HaCalendar } from "./calendarStore";

export const dayHead = (d: Date, today: Date) => {
  const gap = Math.round((startOfDay(d).getTime() - startOfDay(today).getTime()) / 86_400_000);
  const label = `${WEEKDAYS[(d.getDay() + 6) % 7]} ${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}`;
  return gap === 0 ? `Today, ${label}` : gap === 1 ? `Tomorrow, ${label}` : label;
};

export function EventRow({ ev, color, calendar, open, onToggle, now }: { ev: CalEvent; color: string; calendar: string; open: boolean; onToggle: () => void; now: number }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = !ev.allDay && ev.start <= now && ev.end > now;
  const ended = ev.end <= now && ev.end > ev.start;
  const canDelete = ev.calendar === LOCAL_CALENDAR ? !!ev.uid : !!deleteBody(ev, "all");
  const remove = async (scope: DeleteScope) => {
    setBusy(true);
    setError(null);
    const err = await useCalendar.getState().remove(ev, scope);
    setBusy(false);
    if (err) setError(err);
  };
  return (
    <li className="cal-ev" data-live={live ? "" : undefined} data-ended={ended ? "" : undefined} style={{ ["--c" as string]: color }}>
      <button type="button" className="cal-ev-main" aria-expanded={open} onClick={() => { setAsk(false); setError(null); onToggle(); }}>
        <span className="cal-ev-time">{timeLabel(ev)}</span>
        <span className="cal-ev-title">{ev.title}</span>
        {isRecurring(ev) && <span className="cal-ev-rep" title={rruleText(ev.rrule)}>repeats</span>}
      </button>
      {open && (
        <div className="cal-ev-more">
          <p className="cal-ev-when">{describeWhen(ev)}</p>
          <p className="cal-ev-cal"><i aria-hidden />{calendar}{isRecurring(ev) && ev.rrule ? ` · ${rruleText(ev.rrule)}` : ""}</p>
          {ev.location && <p className="cal-ev-loc">{ev.location}</p>}
          {ev.description && <p className="cal-ev-desc">{ev.description}</p>}
          {error && <p className="cal-err" role="alert">{error}</p>}
          {canDelete && !ask && <button type="button" className="cal-del" onClick={() => setAsk(true)}><TrashIcon size={13} /> Delete</button>}
          {canDelete && ask && (
            <div className="cal-ask" role="group" aria-label="Delete this event?">
              <span>{isRecurring(ev) && ev.calendar !== LOCAL_CALENDAR ? "Delete which?" : "Delete this event?"}</span>
              {isRecurring(ev) && ev.calendar !== LOCAL_CALENDAR && ev.recurrenceId ? (
                <>
                  <button type="button" className="cal-del" disabled={busy} onClick={() => void remove("this")}>Only this one</button>
                  <button type="button" className="cal-del" disabled={busy} onClick={() => void remove("future")}>This and later</button>
                  <button type="button" className="cal-del" disabled={busy} onClick={() => void remove("all")}>Whole series</button>
                </>
              ) : (
                <button type="button" className="cal-del" disabled={busy} onClick={() => void remove("all")}>Yes, delete</button>
              )}
              <button type="button" className="cal-keep" disabled={busy} onClick={() => setAsk(false)}>Keep</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function AddForm({ day, calendars, hidden, onDone }: { day: Date; calendars: HaCalendar[]; hidden: string[]; onDone: () => void }) {
  const first = calendars.find((c) => !hidden.includes(c.entity_id))?.entity_id ?? LOCAL_CALENDAR;
  const [f, setF] = useState<EventForm>(() => defaultForm(day));
  const [target, setTarget] = useState(first);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<EventForm>) => setF((cur) => editForm(cur, patch));

  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const checked = formToInput(f);
    if (!checked.ok) return setError(checked.error);
    setBusy(true);
    const err = await useCalendar.getState().add(target, checked.value);
    setBusy(false);
    if (err) return setError(err);
    onDone();
  };
  return (
    <form className="cal-form" onSubmit={(e) => void submit(e)} aria-label="Add event">
      <label>Title<input type="text" value={f.title} maxLength={MAX_TITLE} onChange={(e) => set({ title: e.target.value })} autoFocus required /></label>
      <label className="cal-check"><input type="checkbox" checked={f.allDay} onChange={(e) => set({ allDay: e.target.checked })} /> All day</label>
      <div className="cal-row">
        <label>{f.allDay ? "First day" : "Starts"}<input type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} required /></label>
        {!f.allDay && <label>Time<input type="time" value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} required /></label>}
      </div>
      <div className="cal-row">
        <label>{f.allDay ? "Last day" : "Ends"}<input type="date" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} required /></label>
        {!f.allDay && <label>Time<input type="time" value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} required /></label>}
      </div>
      <label>Calendar
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {calendars.map((c) => <option key={c.entity_id} value={c.entity_id}>{c.name} (Home Assistant)</option>)}
          <option value={LOCAL_CALENDAR}>{LOCAL_NAME}</option>
        </select>
      </label>
      <label>Where (optional)<input type="text" value={f.location} maxLength={MAX_LOCATION} onChange={(e) => set({ location: e.target.value })} /></label>
      <label>Notes (optional)<textarea rows={2} value={f.description} maxLength={MAX_DESCRIPTION} onChange={(e) => set({ description: e.target.value })} /></label>
      {error && <p className="cal-err" role="alert">{error}</p>}
      <div className="cal-actions">
        <button type="button" className="cal-keep" onClick={onDone} disabled={busy}>Cancel</button>
        <button type="submit" className="cal-save" disabled={busy}>{busy ? "Adding..." : "Add event"}</button>
      </div>
    </form>
  );
}
