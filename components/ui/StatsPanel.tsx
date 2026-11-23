"use client";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtClock } from "@/lib/stats";
import HudPanel from "./HudPanel";
import Segmented from "./Segmented";
import useRestoreFocus from "./useRestoreFocus";
import { KpiRow, LightsSection, OpeningsSection, PowerSection, SkeletonSection, HumiditySection, TemperatureSection } from "./stats/sections";
import { buildSpec } from "./stats/spec";
import { useStatsData } from "./stats/useStatsData";
import "./stats/stats.css";

const RANGES = ["6H", "24H", "7D"] as const;
type Range = (typeof RANGES)[number];
const HOURS: Record<Range, number> = { "6H": 6, "24H": 24, "7D": 168 };

/** Right-side slide-over: KPIs plus temperature, humidity, power, lights and openings history from /api/ha/history. */
export default function StatsPanel({ onClose }: { onClose: () => void }) {
  const [range, setRange] = useState<Range>("24H");
  const plan = useStore((s) => s.plan);
  const ready = useStore((s) => Object.keys(s.states).length > 0);
  const spec = useMemo(() => (ready ? buildSpec(plan, useStore.getState().states) : null), [plan, ready]);
  const { data, error, busy, reload } = useStatsData(spec, HOURS[range]);
  const slot = useRef<HTMLDivElement>(null);

  useRestoreFocus();
  useEffect(() => {
    slot.current?.querySelector<HTMLElement>(".icon-btn")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = data ? `UPDATED ${fmtClock(data.at)}` : busy ? "SYNCING" : "";
  return (
    <div ref={slot} style={{ display: "contents" }}>
      <HudPanel title="Statistics" meta={meta} onClose={onClose} className="stats sheet">
        <div className="stats-bar">
          <Segmented label="Range" value={range} options={RANGES} onChange={setRange} />
          <button className="icon-btn tip" data-tip="Refresh" aria-label="Refresh statistics" onClick={reload}><ArrowClockwiseIcon size={14} /></button>
        </div>
        <div className="stats-body" aria-busy={!data && !error}>
          {error && !data ? (
            <div className="st-error" role="alert">
              <b>Could not load history</b>
              <span>{error}</span>
              <button className="btn" onClick={reload}>Retry</button>
            </div>
          ) : !ready ? (
            <p className="st-empty">Waiting for Home Assistant entities.</p>
          ) : (
            <>
              {spec && <KpiRow spec={spec} data={data} />}
              {data && data.failed.length > 0 && <p className="st-warn" role="status">Partial data: {data.failed.length} history request(s) failed ({data.failed[0]}).</p>}
              {spec && data ? (
                <>
                  <TemperatureSection spec={spec} data={data} />
                  <HumiditySection spec={spec} data={data} />
                  <PowerSection spec={spec} data={data} />
                  <LightsSection spec={spec} data={data} />
                  <OpeningsSection spec={spec} data={data} />
                </>
              ) : (
                <>
                  <SkeletonSection title="Temperature" height={170} />
                  <SkeletonSection title="Humidity" height={140} />
                  <SkeletonSection title="Power" height={170} />
                  <SkeletonSection title="Lights" height={120} />
                  <SkeletonSection title="Openings" height={70} />
                </>
              )}
            </>
          )}
        </div>
      </HudPanel>
    </div>
  );
}
