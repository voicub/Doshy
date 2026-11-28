// A non-persisted visual override, using history replay's state swap and write gate. No service calls.
import { create } from "zustand";
import type { ArrivalStep } from "./arrival";
import { previewStates, previewTimes } from "./arrivalPlay";
import type { HAState } from "./ha";
import { onHomeChange } from "./haHome";
import { useReplay } from "./replay";
import { isReplaying, setReplaying, takeLatestPoll } from "./replayGate";
import { mergeStates } from "./statesMerge";
import { useStore } from "./store";

let saved: Record<string, HAState> | null = null;
let timers: ReturnType<typeof setTimeout>[] = [];

type Preview = { active: boolean; done: number; total: number; play: (steps: readonly ArrivalStep[]) => void; stop: () => void };
export const useArrivalPreview = create<Preview>((set, get) => ({
  active: false, done: 0, total: 0,
  play: (steps) => {
    get().stop();
    useReplay.getState().close();
    if (!steps.length || isReplaying()) return;
    saved = useStore.getState().states;
    const live = saved;
    setReplaying(true);
    set({ active: true, done: 0, total: steps.length });
    useStore.setState({ states: previewStates(live, steps, 0) });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Reduced motion shows the finished model immediately; otherwise only the lights change, with long waits shortened.
    if (reduce) {
      useStore.setState({ states: previewStates(live, steps, steps.length) });
      set({ done: steps.length });
      return;
    }
    timers = previewTimes(steps).map((ms, i) => setTimeout(() => {
      if (!get().active) return;
      useStore.setState({ states: previewStates(live, steps, i + 1) });
      set({ done: i + 1 });
    }, ms));
  },
  stop: () => {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
    if (saved) {
      const live = saved;
      saved = null;
      const poll = takeLatestPoll();
      setReplaying(false);
      useStore.setState({ states: poll ? mergeStates(live, poll) : live });
    }
    set({ active: false, done: 0, total: 0 });
  },
}));

// Never mix two state overlays, restore another plan's preview, or keep a timer after switching homes.
useReplay.subscribe((next, previous) => { if (next.open && !previous.open) useArrivalPreview.getState().stop(); });
useStore.subscribe((next, previous) => { if (next.plan !== previous.plan) useArrivalPreview.getState().stop(); });
onHomeChange(() => {
  useArrivalPreview.getState().stop();
  useStore.setState({ states: {} });
});
