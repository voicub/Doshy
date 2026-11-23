"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/guards";
import { fetchHistory, type Series } from "@/lib/stats";
import type { StatsSpec } from "./spec";

export type StatsData = { from: number; to: number; series: Record<string, Series>; at: number; failed: string[] };

const REFRESH_MS = 60_000;
const MAX_ENTITIES = 24; // server cap per request
const ATTRS = ["hvac_action", "temperature"];

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

/** One request per group: numeric sensors, the thermostat (with attributes), and on/off entities. Failed groups are reported, the rest still render. */
export function useStatsData(spec: StatsSpec | null, hours: number) {
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const specRef = useRef(spec);
  useEffect(() => { specRef.current = spec; });
  const key = spec ? JSON.stringify(spec) : "";

  useEffect(() => {
    const s = specRef.current;
    if (!s) return;
    const ctl = new AbortController();
    const run = async () => {
      setBusy(true);
      const numeric = [...s.temps, ...s.hums].map((e) => e.id).concat(s.power ?? [], s.energy ?? [], s.consumers.flatMap((c) => [c.power ?? [], c.energy ?? []].flat()));
      const states = [...s.lights, ...s.openings].map((e) => e.id);
      const jobs = [
        ...chunk([...new Set(numeric)], MAX_ENTITIES).map((ids) => fetchHistory(ids, hours, { signal: ctl.signal })),
        ...(s.thermostat ? [fetchHistory([s.thermostat], hours, { attrs: ATTRS, signal: ctl.signal })] : []),
        ...chunk([...new Set(states)], MAX_ENTITIES).map((ids) => fetchHistory(ids, hours, { signal: ctl.signal })),
      ];
      const res = await Promise.allSettled(jobs);
      if (ctl.signal.aborted) return;
      setBusy(false);
      const ok = res.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      const failed = res.flatMap((r) => (r.status === "rejected" ? [errorMessage(r.reason)] : []));
      if (!ok.length && failed.length) {
        setError(failed[0]);
        return;
      }
      setError(null);
      setData({ from: Math.min(...ok.map((r) => r.from)), to: Math.max(...ok.map((r) => r.to)), series: Object.assign({}, ...ok.map((r) => r.series)), at: Date.now(), failed });
    };
    void run();
    const t = setInterval(() => void run(), REFRESH_MS);
    return () => { ctl.abort(); clearInterval(t); };
  }, [key, hours, nonce]);

  // new range or entity set: drop stale charts so the skeleton shows
  useEffect(() => { setData(null); setError(null); }, [key, hours]);

  return { data, error, busy, reload: useCallback(() => setNonce((n) => n + 1), []) };
}
