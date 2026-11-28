
"use client";
import { create } from "zustand";
import {
  addDays, createEventData, deleteBody, LOCAL_CALENDAR, mergeEvents, normaliseAll, panelRange, rangeQuery, startOfDay,
  type CalEvent, type CalView, type DeleteScope, type EventInput, type Range,
} from "@/lib/calendar";
import { callService } from "@/lib/ha";
import { errorMessage } from "@/lib/guards";
import { haFetch, onHomeChange } from "@/lib/haHome";
import { REQUEST_TIMEOUT_MS, within } from "@/lib/requestTimeout";

export type HaCalendar = { entity_id: string; name: string };

const HIDDEN_KEY = "housey-calendar-hidden";
const VIEW_KEY = "housey-calendar-view";
const CARD_KEY = "housey-calendar-card";
/** How often the calendar views re-read the clock (the "in 5 min" texts and the now-line). */
export const CLOCK_TICK_MS = 30_000;
/** The HUD chip looks this many days ahead. */
const UPCOMING_DAYS = 14;
const SAY = "Could not reach the calendar. Try again in a moment.";

function readHidden(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}
function readView(): CalView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "week" || v === "agenda" || v === "month" ? v : "month";
  } catch {
    return "month";
  }
}
const remember = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* private mode: it just resets next visit */ }
};

async function getJson<T>(url: string): Promise<T> {
  const res = await (url.startsWith("/api/ha/") ? haFetch : fetch)(url, { cache: "no-store", signal: within(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** The sentence a failed request carries (our routes answer `{ error }` in plain words), else a generic one. */
async function failure(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const msg = body && typeof body === "object" && "error" in body ? body.error : undefined;
  return typeof msg === "string" && msg ? msg : SAY;
}

type Loaded = { calendars: HaCalendar[]; haKnown: boolean; events: CalEvent[]; failed: string[]; local: boolean };

/** Everything in a range: the HA calendars that are not hidden, plus the dashboard's own calendar. One source failing does not hide the others. */
async function load(range: Range, hidden: string[], fresh: boolean): Promise<Loaded> {
  const q = rangeQuery(range);
  const params = `start=${encodeURIComponent(q.start)}&end=${encodeURIComponent(q.end)}`;
  let calendars: HaCalendar[] = [];
  let haKnown = true;
  try {
    const l = await getJson<{ calendars: HaCalendar[]; error?: boolean }>("/api/ha/calendar/list");
    calendars = l.calendars;
    haKnown = !l.error;
  } catch {
    haKnown = false;
  }
  const wanted = calendars.map((c) => c.entity_id).filter((id) => !hidden.includes(id));
  const failed: string[] = [];
  const lists: CalEvent[][] = [];
  if (wanted.length) {
    try {
      const r = await getJson<{ calendars: Record<string, unknown[]>; failed: string[] }>(`/api/ha/calendar/events?${wanted.map((e) => `entity=${e}`).join("&")}&${params}${fresh ? "&fresh=1" : ""}`);
      for (const [id, raw] of Object.entries(r.calendars)) lists.push(normaliseAll(raw, id));
      failed.push(...r.failed);
    } catch {
      failed.push(...wanted);
    }
  }
  let local = true;
  if (!hidden.includes(LOCAL_CALENDAR)) {
    try {
      lists.push(normaliseAll((await getJson<{ events: unknown[] }>(`/api/db/events?${params}`)).events, LOCAL_CALENDAR));
    } catch {
      local = false;
    }
  }
  return { calendars, haKnown, events: mergeEvents(...lists), failed, local };
}

type Calendar = {
  open: boolean;
  view: CalView;
  /** The day the views are built around (local midnight, epoch ms). */
  anchor: number;
  /** The day picked in the month view (local midnight, epoch ms). */
  day: number;
  hidden: string[];
  calendars: HaCalendar[];
  /** False when Home Assistant could not be asked for its calendar list. */
  haKnown: boolean;
  events: CalEvent[];
  upcoming: CalEvent[];
  loaded: boolean;
  loading: boolean;
  failed: string[];
  localFailed: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
  setView: (v: CalView) => void;
  setAnchor: (d: Date) => void;
  setDay: (d: Date) => void;
  toggleCalendar: (id: string) => void;
  /** Show the glanceable card on the Live view (when something is coming up). Remembered on this device. */
  card: boolean;
  setCard: (on: boolean) => void;
  hydrateCard: () => void;
  refresh: (fresh?: boolean) => Promise<void>;
  loadUpcoming: (fresh?: boolean) => Promise<void>;
  /** Adds an event to the dashboard calendar or to a Home Assistant calendar (a service call, only from the form). Resolves to a sentence on failure, null on success. */
  add: (calendar: string, input: EventInput) => Promise<string | null>;
  /** Deletes an event (HA calendars through our server, the dashboard calendar from the database), only from a confirmed click. */
  remove: (ev: CalEvent, scope: DeleteScope) => Promise<string | null>;
};

let seq = 0;
let upSeq = 0;

export const useCalendar = create<Calendar>()((set, get) => {
  const today = () => startOfDay(new Date()).getTime();
  const reload = async () => {
    await Promise.all([get().refresh(true), get().loadUpcoming(true)]);
  };
  return {
    open: false,
    view: "month",
    anchor: today(),
    day: today(),
    hidden: [],
    card: true,
    calendars: [],
    haKnown: true,
    events: [],
    upcoming: [],
    loaded: false,
    loading: false,
    failed: [],
    localFailed: false,
    setOpen: (open) => {
      if (open) set({ open, view: readView(), hidden: readHidden(), anchor: today(), day: today() });
      else set({ open });
    },
    toggle: () => get().setOpen(!get().open),
    close: () => set({ open: false }),
    setView: (view) => { remember(VIEW_KEY, view); set({ view }); void get().refresh(); },
    setAnchor: (d) => { set({ anchor: startOfDay(d).getTime() }); void get().refresh(); },
    setDay: (d) => {
      const day = startOfDay(d).getTime();
      const a = new Date(get().anchor);
      const monthChanged = get().view === "month" && (d.getMonth() !== a.getMonth() || d.getFullYear() !== a.getFullYear());
      set(monthChanged ? { day, anchor: day } : { day });
      if (monthChanged) void get().refresh();
    },
    setCard: (card) => { remember(CARD_KEY, card ? "1" : "0"); set({ card }); },
    hydrateCard: () => {
      try { set({ card: localStorage.getItem(CARD_KEY) !== "0" }); } catch { /* private mode: stays on */ }
    },
    toggleCalendar: (id) => {
      const hidden = get().hidden.includes(id) ? get().hidden.filter((h) => h !== id) : [...get().hidden, id];
      remember(HIDDEN_KEY, JSON.stringify(hidden));
      set({ hidden });
      void get().refresh();
      void get().loadUpcoming();
    },
    refresh: async (fresh = false) => {
      const mine = ++seq;
      set({ loading: true });
      const { view, anchor, hidden } = get();
      const loaded = await load(panelRange(view, new Date(anchor)), hidden, fresh);
      if (mine !== seq) return;
      set({ calendars: loaded.calendars, haKnown: loaded.haKnown, events: loaded.events, failed: loaded.failed, localFailed: !loaded.local, loaded: true, loading: false });
    },
    loadUpcoming: async (fresh = false) => {
      const mine = ++upSeq;
      const start = startOfDay(new Date());
      const loaded = await load({ start, end: addDays(start, UPCOMING_DAYS) }, get().hidden.length ? get().hidden : readHidden(), fresh);
      if (mine !== upSeq) return;
      set({ upcoming: loaded.events, calendars: loaded.calendars, haKnown: loaded.haKnown });
    },
    add: async (calendar, input) => {
      try {
        if (calendar === LOCAL_CALENDAR) {
          const res = await fetch("/api/db/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: within(REQUEST_TIMEOUT_MS) });
          if (!res.ok) return await failure(res);
        } else {
          await callService({ domain: "calendar", service: "create_event", entity_id: calendar, data: createEventData(input) });
        }
      } catch (e) {
        return errorMessage(e) || SAY;
      }
      if (get().hidden.includes(calendar)) get().toggleCalendar(calendar); // a new event on a hidden calendar would not show: show it
      else setTimeout(() => void reload(), calendar === LOCAL_CALENDAR ? 0 : 700); // HA stores a new event a moment after the call
      return null;
    },
    remove: async (ev, scope) => {
      try {
        if (ev.calendar === LOCAL_CALENDAR) {
          if (!ev.uid) return SAY;
          const res = await fetch(`/api/db/events/${encodeURIComponent(ev.uid)}`, { method: "DELETE", signal: within(REQUEST_TIMEOUT_MS) });
          if (!res.ok) return await failure(res);
        } else {
          const body = deleteBody(ev, scope);
          if (!body) return "That event cannot be deleted from here.";
          const res = await haFetch("/api/ha/calendar/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: within(REQUEST_TIMEOUT_MS) });
          if (!res.ok) return await failure(res);
        }
      } catch {
        return SAY;
      }
      await reload();
      return null;
    },
  };
});

// Another home on screen: its calendars and events are not this home's. (The dashboard's own calendar is the same for every home; it is simply read again with the rest.)
onHomeChange(() => {
  seq++; // an answer still on its way is from the old home
  upSeq++;
  useCalendar.setState({ calendars: [], events: [], upcoming: [], failed: [], loaded: false, loading: false, haKnown: true });
  void useCalendar.getState().loadUpcoming(true);
  if (useCalendar.getState().open) void useCalendar.getState().refresh(true);
});
