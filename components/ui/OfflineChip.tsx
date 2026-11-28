"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { currentStaleAt, offlineNote, subscribeStale } from "@/lib/offlineStatus";
import { usePoll, useStore } from "@/lib/store";
import "./offline.css";

const TICK_MS = 30_000;

const onlineEvents = (notify: () => void) => {
  addEventListener("online", notify);
  addEventListener("offline", notify);
  return () => {
    removeEventListener("online", notify);
    removeEventListener("offline", notify);
  };
};

/** "Offline: showing the last known state (12 min ago)": drawn only while the browser is offline, the states poll fails or the worker answered with a stored copy. Nothing when all is live. */
export default function OfflineChip() {
  const online = useSyncExternalStore(onlineEvents, () => navigator.onLine, () => true);
  const staleAt = useSyncExternalStore(subscribeStale, currentStaleAt, () => null);
  const haError = useStore((s) => s.haError);
  const lastLiveAt = usePoll((s) => s.at);
  const [now, setNow] = useState(Date.now);
  const note = offlineNote({ online, haError, staleAt, lastLiveAt }, now);
  const shown = note !== null;

  useEffect(() => {
    if (!shown) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), TICK_MS); // only while the chip is up: "12 min ago" moves on
    return () => clearInterval(t);
  }, [shown]);

  if (note === null) return null;
  return (
    <div className="ofl-chip hud" role="status" aria-live="polite">
      <i className="ofl-dot" aria-hidden />
      <span>{note}</span>
    </div>
  );
}
