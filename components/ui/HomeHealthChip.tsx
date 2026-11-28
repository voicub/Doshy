"use client";
import { useEffect } from "react";
import { HeartbeatIcon } from "@phosphor-icons/react";
import { useQuality } from "@/lib/quality";
import { useAnomaly, startAnomalyWatch } from "@/lib/anomalyStore";
import { visible } from "@/lib/anomalyPrefs";
import { useHealthUi } from "./healthUi";
import "./homeHealth.css";

export function HomeHealthDriver() {
  const eco = useQuality((s) => s.tier === "eco");
  useEffect(() => {
    return eco ? undefined : startAnomalyWatch();
  }, [eco]);
  return null;
}
export default function HomeHealthChip() {
  const { raw, prefs, scannedAt, status } = useAnomaly();
  const count = visible(prefs, raw, Date.now()).length;
  const label = count ? `${count} unusual` : scannedAt ? "All normal" : status === "scanning" ? "Checking" : "Not checked";
  return <button className="hh-chip" data-normal={count === 0 && scannedAt !== null} onClick={() => useHealthUi.getState().show()} aria-label={`Home health: ${label}`}><HeartbeatIcon size={16} aria-hidden /><span>{label}</span></button>;
}
