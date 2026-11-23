"use client";
import { useEffect, useState } from "react";
import { fetchHistory } from "@/lib/stats";

export type Line = { t: number[]; v: number[] };

/** Numeric history of the given entities over the last `hours` (time-weighted, ~60 points). Entities without numeric history are absent. Refreshes every 5 min. */
export function useSeries(entities: string[], hours: number): Record<string, Line> {
  const [out, setOut] = useState<Record<string, Line>>({});
  const key = entities.join(",");
  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    const load = async () => {
      try {
        const r = await fetchHistory(key.split(","), hours, { points: 60, signal: ctl.signal });
        const next: Record<string, Line> = {};
        for (const [id, s] of Object.entries(r.series)) if (s.kind === "num" && s.v.length > 1) next[id] = { t: s.t, v: s.v };
        setOut(next);
      } catch {
        /* history is optional: the panel simply shows no trend */
      }
    };
    void load();
    const timer = setInterval(load, 300_000);
    return () => { ctl.abort(); clearInterval(timer); };
  }, [key, hours]);
  return out;
}

/** Tiny inline trend line. Decorative: the value next to it carries the information. */
export default function Sparkline({ line, width = 96, height = 22, className = "" }: { line?: Line; width?: number; height?: number; className?: string }) {
  if (!line || line.v.length < 2) return <svg className={`spark ${className}`} width={width} height={height} aria-hidden />;
  const lo = Math.min(...line.v);
  const hi = Math.max(...line.v);
  const t0 = line.t[0];
  const span = line.t[line.t.length - 1] - t0 || 1;
  const pts = line.v.map((v, i) => `${(((line.t[i] - t0) / span) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - lo) / (hi - lo || 1)) * (height - 4)).toFixed(1)}`);
  return (
    <svg className={`spark ${className}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts.join(" ")} />
    </svg>
  );
}
