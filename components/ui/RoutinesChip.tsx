"use client";
import { LightbulbFilamentIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { useQuality } from "@/lib/quality";
import { pendingCount } from "@/lib/routinesPrefs";
import { useRoutines } from "@/lib/routinesStore";
import { useStore } from "@/lib/store";
import { useRoutinesUi } from "./routinesUi";
import "./routines.css";

/** How long a scan stays good enough to mention its ideas without looking again. */
const QUIET_SCAN_MS = 24 * 3_600_000;

/**
 * "3 routine ideas": a quiet button in the Scenes panel and the Automations sheet, there only when the last scan found something the person has not hidden. It never pops up on its
 * own. When the last scan is a day old it looks again once, in the background; not on the Eco tier (a Raspberry Pi kiosk), which only scans when somebody opens Routines.
 */
export default function RoutinesChip({ onOpen }: { onOpen?: () => void }) {
  const prefs = useRoutines((s) => s.prefs);
  const eco = useQuality((s) => s.tier) === "eco";
  const linked = useStore((s) => Object.keys(s.states).length > 0);

  useEffect(() => {
    const { status, scan, prefs: p } = useRoutines.getState();
    if (!eco && linked && status === "idle" && Date.now() - (p.scan?.at ?? 0) > QUIET_SCAN_MS) void scan(false);
  }, [eco, linked]);

  const n = pendingCount(prefs, Date.now());
  if (!n) return null;
  return (
    <button type="button" className="btn rt-chip" onClick={() => { onOpen?.(); useRoutinesUi.getState().show(); }}>
      <LightbulbFilamentIcon size={14} aria-hidden /> {`${n} routine idea${n === 1 ? "" : "s"}`}
    </button>
  );
}
