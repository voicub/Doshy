"use client";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { isHidden } from "@/lib/routinesPrefs";
import { routinePlan } from "@/lib/routinesPlan";
import { scanKeyOf, useRoutines } from "@/lib/routinesStore";
import { agoWords } from "@/lib/routinesWords";
import { useStore } from "@/lib/store";
import HudPanel from "./HudPanel";
import RoutineCard from "./RoutineCard";
import "./automation.css";
import "./routines.css";

/** A scan this old is made again when the panel opens (the server keeps its answer 10 minutes, so this is cheap). */
const STALE_MS = 10 * 60_000;

/** A clock that ticks once a minute, for "Last scanned 2 h ago". */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Routines slide-over: habits Doshy found in the last weeks of the home's own history (turned off at about the same time every night, curtains opened on weekdays, a light left on
 * after everybody left), each as a card with a button that makes it an automation. All of it is worked out in this browser from read-only history; nothing changes in Home Assistant
 * until the person confirms one card.
 */
export default function RoutinesPanel({ onClose }: { onClose: () => void }) {
  const { prefs, status, suggestions, scannedAt, notes, error, scannedFor, scan, later, never, bringBack, bringBackAll } = useRoutines();
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const linked = Object.keys(states).length > 0;
  const rp = useMemo(() => routinePlan(plan, useStore.getState().states), [plan, linked]);
  const now = useMinute();
  const [recent, setRecent] = useState<Record<string, "later" | "never">>({});
  const [made, setMade] = useState<Record<string, true>>({});

  useEffect(() => {
    const stale = scannedAt === null || Date.now() - scannedAt > STALE_MS || scannedFor !== scanKeyOf(rp);
    if (status !== "scanning" && stale && linked) void scan(false);
    // opening the panel is the one trigger: a later state poll must not start another scan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = suggestions.filter((s) => made[s.id] || recent[s.id] || !isHidden(prefs, s.id, Date.now()));
  const hiddenCount = prefs.dismissed.length + Object.values(prefs.snoozed).filter((until) => until > now).length;
  const scanning = status === "scanning";

  return (
    <HudPanel title="Routines" meta={shown.length ? `${shown.length}` : undefined} onClose={onClose} className="rt drawer">
      <div className="rt-body">
        <p className="field-note">Doshy looks at what your home did over the last few weeks and suggests automations for the habits it finds. Nothing is made until you say yes.</p>
        <div className="rt-bar">
          <span className="rt-when" aria-live="polite">{scanning ? "Reading your home's history..." : scannedAt ? `Last scanned ${agoWords(scannedAt, now)}` : "Not scanned yet"}</span>
          <button type="button" className="btn" disabled={scanning || !linked} onClick={() => void scan(true)}><ArrowsClockwiseIcon size={14} aria-hidden /> Scan again</button>
        </div>
        {error && <p className="field-note warn" role="alert">{error}</p>}
        {notes.map((n) => <p key={n} className="field-note">{n}</p>)}
        {!scanning && !error && status === "ready" && shown.length === 0 && <p className="field-note">No routines found right now. Doshy needs a habit it has seen at about the same time on most days or nights; check again after a week or so.</p>}
        <ul className="rt-list">
          {shown.map((s) =>
            recent[s.id] ? (
              <li key={s.id} className="rt-card rt-hidden">
                <span>{recent[s.id] === "later" ? "Hidden for 30 days." : "Hidden. Doshy will not suggest this again."}</span>
                <button type="button" className="btn" onClick={() => { bringBack(s.id); setRecent(({ [s.id]: _undone, ...rest }) => rest); }}>Undo</button>
              </li>
            ) : (
              <RoutineCard
                key={s.id}
                s={s}
                device={rp.devices.get(s.entity)}
                states={states}
                onLater={() => { later(s.id); setRecent((r) => ({ ...r, [s.id]: "later" })); }}
                onNever={() => { never(s.id); setRecent((r) => ({ ...r, [s.id]: "never" })); }}
                onCreated={() => { never(s.id); setMade((m) => ({ ...m, [s.id]: true })); }}
              />
            ),
          )}
        </ul>
        {hiddenCount > 0 && !scanning && <button type="button" className="rt-link" onClick={bringBackAll}>{`Show the ${hiddenCount} idea${hiddenCount === 1 ? "" : "s"} I hid`}</button>}
      </div>
    </HudPanel>
  );
}
