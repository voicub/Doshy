"use client";
import { BellIcon, CalendarBlankIcon, KeyboardIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";
import { chipText, nextUp } from "@/lib/calendar";
import { updatesAvailable } from "@/lib/haUpdates";
import { useStore } from "@/lib/store";
import { useCalendar } from "./calendarStore";
import { useChromeUi } from "./chromeUi";
import useRestoreFocus from "./useRestoreFocus";
import { SceneControls, SkyControls } from "./CompactSky";
import DisplaySettings from "./DisplaySettings";
import { useInbox } from "./inboxStore";
import MonoLabel from "./MonoLabel";
import { RowsCtx } from "./rowsCtx";
import useReportInset from "./useReportInset";
import useSwipeClose from "./useSwipeClose";
import "./compactChrome.css";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Calendar and inbox rows with the same glanceable summary the desktop bar shows as chips. */
function PanelRows({ done }: { done: () => void }) {
  const calOpen = useCalendar((s) => s.open);
  const upcoming = useCalendar((s) => s.upcoming);
  const inboxOpen = useInbox((s) => s.open);
  const count = useInbox((s) => s.notifications.length);
  const next = nextUp(upcoming, Date.now());
  const updates = useStore(updatesAvailable);
  return (
    <>
      <button type="button" className={`more-row ${calOpen ? "active" : ""}`} aria-pressed={calOpen} onClick={() => { useCalendar.getState().toggle(); done(); }}>
        <CalendarBlankIcon size={18} />
        <span className="more-text">Calendar<small>{next ? chipText(next, Date.now()) : "Nothing coming up"}</small></span>
      </button>
      <button type="button" className={`more-row ${inboxOpen ? "active" : ""}`} aria-pressed={inboxOpen} onClick={() => { useInbox.getState().toggle(); done(); }}>
        <BellIcon size={18} />
        <span className="more-text">Notifications<small>{`${plural(count, "message")}, ${plural(updates, "update")}`}</small></span>
      </button>
    </>
  );
}

/**
 * The menu sheet of the compact layout, opened from the strip's Menu button and the dock's More. First what you do in this mode (the dock's buttons as large rows, plus calendar and notifications),
 * then, in Live, the scene and sky choices, then settings. A side sheet in landscape, a bottom sheet in portrait. Esc (the dashboard), the Close button, a tap outside (the dashboard's scrim) or a swipe closes it.
 */
export default function CompactMenu({ actions, settings, onHelp }: { actions: ReactNode; settings: ReactNode; onHelp: () => void }) {
  const view = useStore((s) => s.view);
  const close = () => useChromeUi.getState().setMenu(false);
  const root = useRef<HTMLElement>(null);
  const swipe = useSwipeClose(close);
  useReportInset(root);

  useRestoreFocus();
  useEffect(() => root.current?.focus(), []);

  return (
    <aside ref={root} className="csheet cmenu hud brackets" role="dialog" aria-label="Menu" tabIndex={-1}>
      <header className="csheet-head" {...swipe}>
        <MonoLabel>Menu</MonoLabel>
        <button type="button" className="icon-btn csheet-close" aria-label="Close menu" onClick={close}><XIcon size={18} /></button>
      </header>
      <div className="csheet-body">
        <RowsCtx.Provider value={{ done: close }}>
          <section className="cm-sec" aria-label="Open">
            <div className="more-grid">
              {actions}
              <PanelRows done={close} />
            </div>
          </section>
          {view === "live" && (
            <section className="cm-sec" aria-label="Scene and sky">
              <MonoLabel className="cm-title">Scene</MonoLabel>
              <SceneControls onCinema={() => { useStore.getState().setCinema(true); close(); }} />
              <SkyControls />
            </section>
          )}
          <section className="cm-sec" aria-label="Settings">
            <MonoLabel className="cm-title">Settings</MonoLabel>
            <div className="more-grid">
              {settings}
              <DisplaySettings />
              <button type="button" className="more-row" data-dev="" onClick={() => { onHelp(); close(); }}>
                <KeyboardIcon size={18} />
                <span className="more-text">Keyboard shortcuts</span>
              </button>
            </div>
          </section>
        </RowsCtx.Provider>
      </div>
    </aside>
  );
}
