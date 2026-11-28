"use client";
import { useEffect } from "react";
import { type Alert } from "@/lib/alerts";
import { focusTarget } from "@/lib/alertsQueue";
import { startAlertEngine, useAlerts } from "@/lib/alertsStore";
import { WAKE_EVENT } from "@/lib/display";
import { useStore } from "@/lib/store";
import { playBeep, watchForGesture } from "./alertBeep";
import { useInbox } from "./inboxStore";

const BEEP_EVERY_MS = 20_000;
const toastId = (a: Alert) => `alert:${a.id}:${a.since}`;

/** Where the camera may not be taken from the owner: a finger down (an orbit or a drag), or a dialog open. */
const busyNow = (pointerDown: boolean): boolean => pointerDown || useStore.getState().gesture || document.querySelector('[aria-modal="true"]') !== null;

/**
 * Runs the alerts: keeps them up to date, and when one starts, wakes a sleeping screen, takes the camera to its room (Focus mode, once per alert, never while editing or
 * dragging), leaves a note in the inbox's toast and, if the owner wants it, beeps while a critical one waits. Renders nothing.
 */
export default function AlertDriver() {
  const sound = useAlerts((s) => s.sound);
  const critical = useAlerts((s) => s.queue.some((a) => a.severity === "critical"));

  useEffect(() => {
    let down = false;
    const press = (e: PointerEvent) => { down = e.type === "pointerdown"; };
    const types = ["pointerdown", "pointerup", "pointercancel"] as const;
    for (const t of types) window.addEventListener(t, press, { capture: true, passive: true });
    const stopGesture = watchForGesture();
    const stopEngine = startAlertEngine({
      onStarted: (started) => {
        const s = useStore.getState();
        const room = focusTarget(started, { mode: useAlerts.getState().mode, live: s.view === "live", busy: busyNow(down), current: s.isolatedRoom, hasRoom: (id) => s.plan.rooms.some((r) => r.id === id) });
        if (room) s.setIsolatedRoom(room);
        if (started.some((a) => a.severity === "critical")) {
          window.dispatchEvent(new Event(WAKE_EVENT)); // an alarm must not wait behind the screensaver
          if (s.cinema) s.setCinema(false); // nor behind the cinema view, which hides the whole HUD
        }
        const a = started[0];
        useInbox.setState({ toast: { id: toastId(a), title: a.title, message: a.message, created_at: new Date(a.since).toISOString(), entity: a.entity } });
      },
      // the note for something that cleared must not linger
      onGone: (ids) => {
        const toast = useInbox.getState().toast;
        if (toast && ids.some((id) => toast.id.startsWith(`alert:${id}:`))) useInbox.getState().clearToast();
      },
    });
    return () => {
      for (const t of types) window.removeEventListener(t, press, true);
      stopGesture();
      stopEngine();
    };
  }, []);

  useEffect(() => {
    if (!sound || !critical) return;
    playBeep();
    const t = window.setInterval(playBeep, BEEP_EVERY_MS);
    return () => window.clearInterval(t);
  }, [sound, critical]);

  return null;
}
