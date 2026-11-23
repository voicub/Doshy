import { useEffect, useRef } from "react";
import { newestOpen, othersOf, type PanelKey } from "@/lib/onePanel";
import { useAreas } from "@/lib/haAreas";
import { useLiveLayer } from "@/lib/liveLayer";
import { useStore } from "@/lib/store";
import { useRoomSheet } from "./ui/roomSheetStore";
import { useCalendar } from "./ui/calendarStore";
import { useChromeUi } from "./ui/chromeUi";
import { useEnergyUi } from "./ui/energyUi";
import { useInbox } from "./ui/inboxStore";
import { isTypingTarget } from "./ui/isTypingTarget";
import { useMediaUi } from "./ui/mediaUi";

const POLL_MS = 3000;

/** Home Assistant states every few seconds. A hidden tab (screen off, another window in front) polls nothing; it catches up the moment it is shown again. */
export function useHaPolling(refreshStates: () => Promise<void>) {
  useEffect(() => {
    const tick = () => { if (!document.hidden) void refreshStates(); };
    tick();
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [refreshStates]);
}

/** The Home Assistant areas, loaded once. */
export function useHaAreas() {
  useEffect(() => { void useAreas.getState().load(); }, []);
}

type ViewReset = {
  setCatalog: (open: boolean) => void;
  setStats: (open: boolean) => void;
  /** Open the entity browser (HA mode) or close the left panel. */
  setLeftBrowser: (open: boolean) => void;
  closeCards: () => void;
};

/** Each mode opens with its own panel: Furniture the catalog, Home Assistant the entity browser, the rest nothing. Everything else closes. */
export function useResetOnView(view: string, { setCatalog, setStats, setLeftBrowser, closeCards }: ViewReset) {
  useEffect(() => {
    const tiny = document.documentElement.dataset.vp !== "regular"; // a sheet over the scene on entering a mode is wrong on a compact screen
    setCatalog(view === "furniture" && !tiny);
    setStats(false);
    useEnergyUi.getState().set(false);
    closeCards();
    useRoomSheet.getState().close();
    useMediaUi.getState().close();
    useChromeUi.setState({ menu: false, house: false });
    setLeftBrowser(view === "ha" && !tiny);
    // only a change of mode resets: the callbacks are stable setters
  }, [view]);
}

type RightEdge = { energy: boolean; stats: boolean; inbox: boolean; roomSheet: boolean; media: boolean; cal: boolean; setStats: (open: boolean) => void };

/** The right edge holds one slide-over at a time (statistics, energy, inbox, device sheet, media, calendar): whichever opens last wins. */
export function useRightEdge({ energy, stats, inbox, roomSheet, media, cal, setStats }: RightEdge) {
  useEffect(() => { if (energy) { setStats(false); useInbox.getState().setOpen(false); useMediaUi.getState().close(); } }, [energy]);
  useEffect(() => { if (stats) { useEnergyUi.getState().set(false); useInbox.getState().setOpen(false); useMediaUi.getState().close(); } }, [stats]);
  useEffect(() => { if (inbox) { setStats(false); useEnergyUi.getState().set(false); useRoomSheet.getState().close(); useMediaUi.getState().close(); } }, [inbox]);
  useEffect(() => { if (roomSheet) { useInbox.getState().setOpen(false); useMediaUi.getState().close(); } }, [roomSheet]);
  useEffect(() => { if (media) { setStats(false); useEnergyUi.getState().set(false); useInbox.getState().setOpen(false); useRoomSheet.getState().close(); } }, [media]);
  useEffect(() => { if (cal) { setStats(false); useEnergyUi.getState().set(false); useInbox.getState().setOpen(false); useRoomSheet.getState().close(); useMediaUi.getState().close(); useStore.getState().setIsolatedRoom(null); } }, [cal]);
  useEffect(() => { if (energy || stats || inbox || roomSheet || media) useCalendar.getState().close(); }, [energy, stats, inbox, roomSheet, media]);
}

type Keys = { palette: boolean; help: boolean; toggleBrowser: () => void; toggleClimate: () => void; togglePlex: () => void; setStats: (update: (open: boolean) => boolean) => void };

/** Single-key shortcuts that open a panel (useHotkeys owns the rest). None fire while typing, with a modifier, with the palette or help open, or in cinema mode. */
export function useDashboardKeys({ palette, help, toggleBrowser, toggleClimate, togglePlex, setStats }: Keys) {
  // E opens the entity browser, H the thermostat, S statistics, P Plex, L the live layer, N energy
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((k !== "e" && k !== "h" && k !== "s" && k !== "p" && k !== "l" && k !== "n") || e.metaKey || e.ctrlKey || e.altKey || palette || help || useStore.getState().cinema) return;
      if (isTypingTarget(e.target)) return;
      const v = useStore.getState().view;
      if (k === "e" && v !== "ha" && v !== "live") return;
      if (k !== "e" && v !== "live") return; // thermostat, statistics, Plex and live layers are Live-mode panels
      e.preventDefault();
      if (k === "e") toggleBrowser();
      else if (k === "s") setStats((x) => !x);
      else if (k === "n") useEnergyUi.getState().toggle();
      else if (k === "p") togglePlex();
      else if (k === "l") useLiveLayer.getState().cycleLayer();
      else toggleClimate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // I opens the inbox (notifications and updates) in every mode; D the calendar (D for diary, since C is cinema); M the media panel (Live mode only)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((k !== "i" && k !== "d" && k !== "m") || e.metaKey || e.ctrlKey || e.altKey || palette || help || useStore.getState().cinema) return;
      if (k === "m" && useStore.getState().view !== "live") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (k === "i") useInbox.getState().toggle();
      else if (k === "d") useCalendar.getState().toggle();
      else useMediaUi.getState().toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [palette, help]);
}

type Open = { menu: boolean; house: boolean; live: boolean; stats: boolean; energy: boolean; inbox: boolean; media: boolean; cal: boolean; roomSheet: boolean; left: boolean; catalog: boolean; device: boolean; camera: boolean; curtain: boolean };

/** Which panels are open now. */
export function openPanels(o: Open): Set<PanelKey> {
  const open = new Set<PanelKey>();
  if (o.menu) open.add("menu");
  if (o.house && o.live) open.add("house");
  if (o.stats) open.add("stats");
  if (o.energy) open.add("energy");
  if (o.inbox) open.add("inbox");
  if (o.media) open.add("media");
  if (o.cal) open.add("calendar");
  if (o.roomSheet) open.add("roomSheet");
  if (o.left) open.add("left");
  if (o.catalog) open.add("catalog");
  if (o.device) open.add("device");
  if (o.camera) open.add("camera");
  if (o.curtain) open.add("curtain");
  return open;
}

/** Compact screens: one panel at a time. Whatever opened last keeps the room, Esc closes it. */
export function useOnePanel(open: ReadonlySet<PanelKey>, closers: Record<PanelKey, () => void>, compact: boolean, modalOpen: boolean) {
  const prevOpen = useRef<ReadonlySet<PanelKey>>(new Set());
  const order = useRef<PanelKey[]>([]); // oldest first, newest last
  useEffect(() => {
    const keep = compact ? newestOpen(prevOpen.current, open) : null;
    prevOpen.current = open;
    order.current = [...order.current.filter((k) => open.has(k)), ...[...open].filter((k) => !order.current.includes(k))];
    if (keep) for (const k of othersOf(open, keep)) closers[k]();
  });
  useEffect(() => {
    if (!compact) return;
    const onKey = (e: KeyboardEvent) => {
      const top = order.current.at(-1);
      if (e.key !== "Escape" || !top || modalOpen || document.querySelector(".scrim") || isTypingTarget(e.target)) return;
      e.preventDefault();
      closers[top]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}
