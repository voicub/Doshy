"use client";
// The homes (Home Assistants) this Doshy knows, for the screen: the list for the Homes manager and the names that go with the plan on screen (docs/multi-home.md).
// The list is only fetched when it is needed: when a plan already shows an extra home, or when the manager opens. A single-home Doshy never asks.
import { create } from "zustand";
import { useActivePlan, reloadPlans } from "./activePlan";
import { useHomeId } from "./useHomeId";
import { fetchHomes, type HomesAnswer } from "./homesApi";

export const MAIN_NAME = "Main home";

type HomesState = HomesAnswer & { loaded: boolean; error: string | null };

export const useHomes = create<HomesState>(() => ({ main: { name: MAIN_NAME, configured: true }, homes: [], locked: null, loaded: false, error: null }));

let loading: Promise<void> | null = null;

/** Read the list now (the manager after every change, and now and then while it is open so the dots stay true). */
export function loadHomes(): Promise<void> {
  loading ??= fetchHomes()
    .then((a) => useHomes.setState({ ...a, loaded: true, error: null }))
    .catch((e: unknown) => useHomes.setState({ error: e instanceof Error ? e.message : "The homes could not be read." }))
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** After the homes changed: the list, and the plans (each one names its home). */
export const homesChanged = (): Promise<unknown> => Promise.all([loadHomes(), reloadPlans()]);

/** The name of a home by connection id (null = the main home). A home this device has not heard of yet is "another home". */
export const homeName = (id: string | null, s: Pick<HomesState, "homes" | "main"> = useHomes.getState()): string => (id === null ? s.main.name : (s.homes.find((h) => h.id === id)?.name ?? "Another home"));

// A plan that shows an extra home is the sign that there is more than one home: fetch their names, once.
useActivePlan.subscribe((s) => {
  if (!useHomes.getState().loaded && s.list?.some((d) => d.haConnection)) void loadHomes();
});

/**
 * What to say next to "Home Assistant" for the plan on screen: the name of its home, or null while there is only one home (nothing changes for a single-home Doshy).
 * Several homes = at least one plan shows an extra home.
 */
export function useHomeLabel(): string | null {
  const id = useHomeId();
  const several = useActivePlan((s) => !!s.list?.some((d) => d.haConnection));
  const loaded = useHomes((s) => s.loaded);
  const name = useHomes((s) => homeName(id, s));
  if (id !== null && !loaded) return null; // the names are still on their way: nothing is better than a wrong one
  return several || id !== null ? name : null;
}
