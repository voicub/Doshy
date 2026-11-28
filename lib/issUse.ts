"use client";
import { useEffect, useState } from "react";
import { issAt, issCouldBeUp } from "./iss";
import { parseIssFeed, type IssReading } from "./issFeed";

const OFF: IssReading = { fix: null, prevFix: null, status: "off" };
const POLL_MS = 10_000;
let kept: { at: number; reading: IssReading } | null = null;
let pending: Promise<IssReading> | null = null;

async function load(): Promise<IssReading> {
  if (kept && Date.now() - kept.at < POLL_MS) return kept.reading;
  if (pending) return pending;
  pending = fetch("/api/sky/iss", { cache: "no-store" })
    .then(async (response) => parseIssFeed(response.ok ? await response.json() : null))
    .catch(() => parseIssFeed(null))
    .then((reading) => { kept = { at: Date.now(), reading }; return reading; })
    .finally(() => { pending = null; });
  return pending;
}

/** One bootstrap fix is needed to know the orbit. Thereafter only poll upstream near a possible pass, and never in a hidden tab or with the sky unmounted. */
export function useIss(enabled: boolean, place: { lat: number; lon: number }): IssReading {
  const [reading, setReading] = useState<IssReading>(OFF);
  const { lat, lon } = place;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let latest = kept?.reading ?? OFF;
    let inFlight = false;
    const tick = async () => {
      if (document.hidden || inFlight || stopped || latest.status === "disabled") return;
      if (latest.fix) {
        const current = { ...latest.fix, ...issAt(latest.fix, latest.prevFix, new Date()) };
        if (!issCouldBeUp(current, lat, lon, 1)) return;
      }
      inFlight = true;
      const next = await load();
      inFlight = false;
      if (!stopped) { latest = next; setReading(next); }
    };
    setReading(latest.status === "off" ? { ...OFF, status: "loading" } : latest);
    void tick();
    const timer = window.setInterval(() => { void tick(); }, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [enabled, lat, lon]);
  return enabled ? reading : OFF;
}
