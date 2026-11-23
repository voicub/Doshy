import { create } from "zustand";

/** Transient state of the Connect tool of the Home Assistant view (never saved, never undone). */
type FlowUi = {
  /** The Connect panel is open: clicking an item picks it as an end of a new line instead of selecting it. */
  on: boolean;
  /** The two items picked so far for a new line. */
  from: string | null;
  to: string | null;
  /** The line being edited (selected by its label or in the list). */
  flow: string | null;
  setOn: (on: boolean) => void;
  /** An item was clicked with the tool on: first click = start, second = end, same item again = start over. */
  pick: (id: string) => void;
  /** Start over with a new line. */
  resetDraft: () => void;
  selectFlow: (id: string | null) => void;
};

export const useFlowUi = create<FlowUi>()((set) => ({
  on: false,
  from: null,
  to: null,
  flow: null,
  setOn: (on) => set({ on, from: null, to: null, flow: null }),
  pick: (id) => set((s) => (s.to ? { from: id, to: null, flow: null } : !s.from ? { from: id, flow: null } : id === s.from ? { from: null } : { to: id })),
  resetDraft: () => set({ from: null, to: null }),
  selectFlow: (flow) => set((s) => ({ flow, from: null, to: null, on: s.on || !!flow })),
}));
