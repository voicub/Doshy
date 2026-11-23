"use client";
import { useEffect, useState } from "react";

/** `Date.now()`, refreshed every `intervalMs` while `running` (the timer is off otherwise). One timer per caller; the value only changes on a tick, so it is safe in memo deps. */
export function useNow(intervalMs: number, running = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, running]);
  return now;
}
