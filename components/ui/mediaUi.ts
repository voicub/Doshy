"use client";
import { create } from "zustand";
import type { HAState } from "@/lib/ha";
import { useStore } from "@/lib/store";
import { patchState, runService, type ServiceData } from "./serviceActions";

/** Media panel state: whether it is open, which player the user tapped (shown even when idle), and the last failed command. */
export const useMediaUi = create<{
  open: boolean;
  focus: string | null;
  error: string | null;
  show: (focus?: string) => void;
  toggle: () => void;
  close: () => void;
}>((set) => ({
  open: false,
  focus: null,
  error: null,
  show: (focus) => set({ open: true, focus: focus ?? null, error: null }),
  toggle: () => set((s) => ({ open: !s.open, focus: null, error: null })),
  close: () => set({ open: false, focus: null, error: null }),
}));

let errorTimer: number | undefined;

/**
 * Send one media_player service call. `optimistic` is shown right away; when Home Assistant refuses it is rolled back
 * and the reason lands in `useMediaUi.error`. Nothing is sent unless a user control calls this.
 */
export async function mediaCall(entity: string, service: string, data?: ServiceData, optimistic?: { attrs?: Partial<HAState["attributes"]>; state?: string }): Promise<boolean> {
  const before = useStore.getState().states[entity];
  if (optimistic && before) patchState(entity, optimistic.attrs ?? {}, optimistic.state);
  const err = await runService({ domain: "media_player", service, entity_id: entity, data });
  if (!err) return true;
  if (before) useStore.setState((s) => ({ states: { ...s.states, [entity]: before } }));
  useMediaUi.setState({ error: err });
  clearTimeout(errorTimer);
  errorTimer = window.setTimeout(() => useMediaUi.setState({ error: null }), 6000);
  return false;
}

/** How often a progress bar re-reads the clock while its player is playing. */
export const PROGRESS_TICK_MS = 500;
