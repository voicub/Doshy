// History replay: the state of the time bar and the swap of `useStore.states` while a past moment is shown.
// While replaying, the saved live map waits here, `states` holds the past, and lib/replayGate.ts makes every write to Home Assistant refuse and every poll step aside.
// Nothing here is persisted and nothing here touches Home Assistant: the only request is the read-only GET /api/ha/history/replay.
import { create } from "zustand";
import type { HAState } from "./ha";
import { errorMessage } from "./guards";
import { haFetch, onHomeChange } from "./haHome";
import { setReplaying, takeLatestPoll } from "./replayGate";
import { within, timedOut } from "./requestTimeout";
import { mergeStates } from "./statesMerge";
import { useStore } from "./store";
import { advance, clampTime, createReplayer, parseReplay, replayEntities, SUN, type ReplayHours, type Timeline } from "./timeline";

export const SPEEDS = [1, 10, 60] as const;
export type Speed = (typeof SPEEDS)[number];

/** The server gives Home Assistant 30 s (app/api/ha/history/replay/route.ts): its answer, or its error, arrives before this. */
const LOAD_TIMEOUT_MS = 40_000;
const TICK_MS = 250;
/** A tab that was asleep must not jump hours ahead on waking: one tick never counts more than this much real time. */
const MAX_TICK_DT_MS = 1000;

type Status = "idle" | "loading" | "ready" | "error";

type ReplayState = {
  /** The time bar is shown. */
  open: boolean;
  hours: ReplayHours;
  status: Status;
  error: string | null;
  timeline: Timeline | null;
  /** True while a past moment is on screen (controls off). False at the live end of the bar. */
  replaying: boolean;
  /** The moment shown (ms). The end of the timeline = now. */
  at: number;
  playing: boolean;
  speed: Speed;
  show: () => void;
  close: () => void;
  setHours: (h: ReplayHours) => void;
  retry: () => void;
  seek: (t: number) => void;
  /** Back to the live view; the bar stays open. */
  goLive: () => void;
  play: () => void;
  pause: () => void;
  setSpeed: (s: Speed) => void;
};

let saved: Record<string, HAState> | null = null; // the live map while a replay shows the past
let replayAt: ((t: number) => Record<string, HAState>) | null = null;
let timer: number | undefined;
let loading: AbortController | null = null;

const stopTimer = () => {
  window.clearInterval(timer);
  timer = undefined;
};

/** Put the live map back (merged with the newest poll that arrived meanwhile), reopen the gate and ask for fresh states. Safe to call when not replaying. */
function leaveReplay() {
  stopTimer();
  if (!saved) return;
  setReplaying(false);
  const poll = takeLatestPoll();
  const live = poll ? mergeStates(saved, poll) : saved;
  saved = null;
  replayAt = null;
  useStore.setState({ states: live });
  void useStore.getState().refreshStates();
}

function showAt(t: number) {
  const states = useStore.getState().states;
  if (!replayAt) return;
  const next = replayAt(t);
  if (next !== states) useStore.setState({ states: next });
}

function enterReplay(tl: Timeline) {
  if (saved) return;
  saved = useStore.getState().states;
  replayAt = createReplayer(tl, saved);
  setReplaying(true);
}

const NOTHING = "No devices of this plan are linked to Home Assistant yet, so there is nothing to replay.";

export const useReplay = create<ReplayState>()((set, get) => {
  async function load(hours: ReplayHours) {
    loading?.abort();
    const ctl = new AbortController();
    loading = ctl;
    get().goLive();
    const { plan, states } = useStore.getState();
    const ids = replayEntities(plan, states);
    if (!Object.keys(states).length) return set({ status: "error", error: "Could not load the history: Home Assistant has not reported anything yet.", timeline: null });
    if (!ids.some((id) => id !== SUN)) return set({ status: "error", error: NOTHING, timeline: null });
    set({ status: "loading", error: null, timeline: null });
    try {
      const res = await haFetch(`/api/ha/history/replay?${new URLSearchParams({ entities: ids.join(","), hours: String(hours) })}`, { cache: "no-store", signal: within(LOAD_TIMEOUT_MS, ctl.signal) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      const timeline = parseReplay(await res.json());
      if (ctl.signal.aborted) return;
      if (!Object.keys(timeline.tracks).length) return set({ status: "error", error: hours === 24 ? "Home Assistant has no history for the last 24 hours." : "7 days is not available: Home Assistant has no history that far back.", timeline: null });
      set({ status: "ready", timeline, at: timeline.to });
    } catch (e) {
      if (ctl.signal.aborted) return; // closed, or another load took over
      set({ status: "error", error: `Could not load the history: ${timedOut(e) ? "the dashboard server did not answer" : errorMessage(e)}`, timeline: null });
    }
  }

  function tick(last: { at: number }) {
    const now = Date.now();
    const dt = Math.min(MAX_TICK_DT_MS, now - last.at);
    last.at = now;
    const { timeline, at, speed } = get();
    if (!timeline) return get().pause();
    const next = advance(at, dt, speed, timeline.to);
    if (next.end) return get().goLive();
    set({ at: next.at });
    showAt(next.at);
  }

  return {
    open: false,
    hours: 24,
    status: "idle",
    error: null,
    timeline: null,
    replaying: false,
    at: 0,
    playing: false,
    speed: 60,
    show: () => {
      if (get().open) return;
      set({ open: true });
      void load(get().hours);
    },
    close: () => {
      loading?.abort();
      loading = null;
      leaveReplay();
      set({ open: false, status: "idle", error: null, timeline: null, replaying: false, playing: false });
    },
    setHours: (hours) => {
      if (hours === get().hours) return;
      set({ hours });
      void load(hours);
    },
    retry: () => void load(get().hours),
    seek: (t) => {
      const { timeline } = get();
      if (!timeline) return;
      const at = clampTime(t, timeline.from, timeline.to);
      if (at >= timeline.to) return get().goLive(); // the live end of the bar is the live view
      enterReplay(timeline);
      set({ at, replaying: true });
      showAt(at);
    },
    goLive: () => {
      leaveReplay();
      const { timeline } = get();
      set({ replaying: false, playing: false, at: timeline?.to ?? 0 });
    },
    play: () => {
      const { timeline, at, status } = get();
      if (status !== "ready" || !timeline) return;
      stopTimer();
      get().seek(at >= timeline.to ? timeline.from : at); // from the live end it replays the whole span
      set({ playing: true });
      const last = { at: Date.now() };
      timer = window.setInterval(() => tick(last), TICK_MS); // only while playing: a paused or live bar runs nothing
    },
    pause: () => {
      stopTimer();
      set({ playing: false });
    },
    setSpeed: (speed) => set({ speed }),
  };
});

/** The dock button, the palette command and the hotkey: open the time bar, or close it (which also leaves any replay). */
export function toggleReplay() {
  const s = useReplay.getState();
  if (s.open) s.close();
  else s.show();
}

// Another home on screen: a replay of the old home's history ends, and the live map it would put back is the old home's, so it is dropped too.
onHomeChange(() => {
  useReplay.getState().close();
  useStore.setState({ states: {} });
});
