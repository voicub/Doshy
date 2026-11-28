"use client";
// The browser side of the Material Design icons (docs/mdi-icons.md): the Device icons setting, the drawings kept in memory and in a small bounded localStorage cache so they show
// offline, the batching loader that asks /api/icons/mdi (one request for every icon asked for within a moment), and the icon search. Pure rules: lib/mdi.ts.
// Never asks anything on the guest page: a guest sees the drawings carried by the plan (lib/mdiPlan.ts) or the dashboard's own icon.
import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { guestStorage, onGuestPage } from "./guestMode";
import { fetchMdiBatch, fetchMdiSearch } from "./mdiClient";
import { cacheWith, cleanIconSettings, EMPTY_CACHE, ICON_DEFAULTS, isMdiName, MAX_CACHED, readCache, recentWith, type IconSource, type MdiCache, type MdiIcon } from "./mdi";
import { useStore } from "./store";

type SettingsState = { source: IconSource; recent: string[]; setSource: (s: IconSource) => void; remember: (name: string) => void };

/** "Device icons": From Home Assistant (default) or Doshy's own, plus the icons chosen lately. Saved on this device. */
export const useIconSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...ICON_DEFAULTS,
      setSource: (source) => set({ source }),
      remember: (name) => set((s) => ({ recent: recentWith(s.recent, name) })),
    }),
    {
      name: "housey-icons",
      version: 1,
      storage: createJSONStorage(() => onGuestPage() ? guestStorage("housey-icons") : localStorage),
      partialize: (s) => ({ source: s.source, recent: s.recent }),
      merge: (stored, current) => ({ ...current, ...cleanIconSettings(stored) }),
    },
  ),
);

const CACHE_KEY = "housey-mdi-cache";
const BATCH = 24;
const BATCH_DELAY_MS = 40;
const RETRY_FAILED_MS = 60_000;
const RETRY_MISSING_MS = 10 * 60_000;

/** `problem`: "off" = this server has icon downloads switched off (nothing more is asked), "offline" = the last ask failed (asked again after a minute). */
type LoadedState = { icons: Record<string, MdiIcon>; problem: "off" | "offline" | null };
export const useMdiIcons = create<LoadedState>(() => ({ icons: {}, problem: null }));

let cache: MdiCache = EMPTY_CACHE;
let loaded = false;

/** Reads the saved icons once (not at import: the server render has no localStorage). */
function loadOnce() {
  if (loaded || onGuestPage() || typeof localStorage === "undefined") return;
  loaded = true;
  try {
    cache = readCache(localStorage.getItem(CACHE_KEY));
  } catch {
    cache = EMPTY_CACHE; // storage blocked
  }
  if (cache.order.length) useMdiIcons.setState({ icons: cache.icons });
}

function keep(got: Record<string, MdiIcon>) {
  const next = cacheWith(cache, got);
  if (next === cache) return;
  cache = next;
  useMdiIcons.setState({ icons: cache.icons, problem: null });
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage full or blocked: the icons still show for this visit
  }
}

const retryAt = new Map<string, number>();
const inFlight = new Set<string>();
let queue: string[] = [];
let timer: NodeJS.Timeout | undefined;

async function flush() {
  timer = undefined;
  if (onGuestPage() || useMdiIcons.getState().problem === "off") { queue = []; return; }
  const names = queue.splice(0, BATCH);
  for (const name of names) inFlight.add(name);
  try {
    const { icons: got, off } = await fetchMdiBatch(names, onGuestPage());
    if (off) { queue = []; useMdiIcons.setState({ problem: "off" }); return; }
    for (const name of names) if (!got[name]) retryAt.set(name, Date.now() + RETRY_MISSING_MS);
    keep(got);
  } catch {
    for (const name of names) retryAt.set(name, Date.now() + RETRY_FAILED_MS);
    useMdiIcons.setState({ problem: "offline" });
  } finally {
    for (const name of names) inFlight.delete(name);
    while (retryAt.size > MAX_CACHED) retryAt.delete(retryAt.keys().next().value as string);
    if (queue.length && !timer) timer = setTimeout(() => void flush(), BATCH_DELAY_MS);
  }
}

/** Ask for an icon's drawing (batched with the others asked for at the same moment). Nothing happens when it is known already, was asked for lately, or downloads are off. */
export function wantIcon(name: string) {
  if (typeof window === "undefined" || onGuestPage() || !isMdiName(name)) return;
  loadOnce();
  const st = useMdiIcons.getState();
  if (st.icons[name] || st.problem === "off" || (retryAt.get(name) ?? 0) > Date.now() || queue.includes(name) || inFlight.has(name)) return;
  queue.push(name);
  timer ??= setTimeout(() => void flush(), BATCH_DELAY_MS);
}

/** The drawing of an icon: the one stored with the plan (a hand-picked icon), else the saved or downloaded one, else undefined (and it is asked for). */
export function useMdiIcon(name: string | undefined): MdiIcon | undefined {
  const inPlan = useStore((s) => (name ? s.plan.icons?.[name] : undefined));
  const known = useMdiIcons((s) => (name ? s.icons[name] : undefined));
  useEffect(() => {
    if (name && !inPlan && !known) wantIcon(name);
  }, [name, inPlan, known]);
  return inPlan ?? known;
}

/** Search the icon service: the names that match (best first). Throws a plain sentence on failure. */
export async function searchMdi(term: string, signal?: AbortSignal): Promise<string[]> {
  return fetchMdiSearch(term, onGuestPage(), signal);
}
