"use client";
import { useMemo } from "react";
import { effectivePalette, formatEnd, formatHeat, METRICS, type HeatMetric } from "@/lib/heatmap";
import { analyseHeat, roomExtremes, type RoomStat } from "@/lib/heatmapField";
import { PALETTES, PALETTE_LABEL, paletteGradient } from "@/lib/heatmapPalette";
import { useHeatMap, useShownHeat } from "@/lib/heatmapStore";
import { isLite, useQuality } from "@/lib/quality";
import { useStore } from "@/lib/store";
import { useLiveRooms } from "@/lib/useLive";
import MonoLabel from "./MonoLabel";
import Segmented from "./Segmented";
import "./heat.css";

const QUESTION: Record<HeatMetric, string> = {
  temperature: "Where is it cold?",
  humidity: "Where is it dry or damp?",
  co2: "Where is the air stale?",
  light: "Where is it dark?",
  noise: "Where is it quiet?",
};

function Legend({ metric }: { metric: HeatMetric }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const live = useLiveRooms();
  const lite = useQuality((s) => isLite(s.tier));
  const palette = effectivePalette(metric, useHeatMap((s) => s.palette));
  const setPalette = useHeatMap((s) => s.setPalette);
  // the same call (and the same cache) as the scene: the numbers beside the bar are the numbers that were drawn
  const a = useMemo(() => analyseHeat(plan, states, metric, lite, live), [plan, states, metric, lite, live]);
  const { low, high } = useMemo(() => roomExtremes(a.rooms), [a.rooms]);
  const def = METRICS[metric];
  const words = metric === "temperature" ? ["Coldest", "Hottest"] : ["Lowest", "Highest"];
  const list = (rs: RoomStat[]) => rs.map((r) => `${r.name} ${formatHeat(metric, r.mean as number, a.fahrenheit)}`).join(", ");
  const only = low.length + high.length === 1 ? [...low, ...high][0] : undefined;

  return (
    <div className="hud heatlegend brackets" role="region" aria-label={`${def.label} colours`}>
      <div className="hl-scale">
        <MonoLabel>{def.label}</MonoLabel>
        {a.count > 0 && (
          <>
            <span className="hl-end">{formatEnd(metric, a.range[0], a.fahrenheit)}</span>
            <div className="hl-bar" style={{ background: paletteGradient(palette) }} role="img" aria-label={`From ${formatEnd(metric, a.range[0], a.fahrenheit)} to ${formatEnd(metric, a.range[1], a.fahrenheit)}`} />
            <span className="hl-end">{formatEnd(metric, a.range[1], a.fahrenheit)}</span>
          </>
        )}
      </div>
      {a.count === 0 ? (
        <p className="hl-text">No {def.noun} yet. Add one to a room or a piece of furniture in Home Assistant mode.</p>
      ) : (
        <>
          {(low.length > 0 || high.length > 0) && (
            <div className="hl-hint">
              <MonoLabel>{QUESTION[metric]}</MonoLabel>
              {only ? (
                <p className="hl-text">
                  Only {only.name} has a sensor: {formatHeat(metric, only.mean as number, a.fahrenheit)}.
                </p>
              ) : (
                <>
                  <p className="hl-text">
                    {words[0]}: {list(low)}
                  </p>
                  <p className="hl-text">
                    {words[1]}: {list(high)}
                  </p>
                </>
              )}
            </div>
          )}
          {a.rooms.some((r) => r.estimated) && (
            <p className="hl-key">
              <i className="hl-hatch" aria-hidden />
              Striped: no sensor in that room, its colour is a guess from the rooms around it.
            </p>
          )}
        </>
      )}
      <details className="hl-more">
        <summary>Colours</summary>
        <Segmented className="hl-seg" label="Colour scheme" value={palette} options={PALETTES.filter((p) => p !== "diverging" || metric === "temperature")} onChange={setPalette} format={(p) => PALETTE_LABEL[p]} />
      </details>
    </div>
  );
}

/** The colour bar, the numbers at its ends, the coldest / hottest rooms and the colour choice of the heat map on screen; nothing while no heat map is shown. */
export default function HeatLegend() {
  const metric = useShownHeat();
  return metric === "off" ? null : <Legend metric={metric} />;
}
