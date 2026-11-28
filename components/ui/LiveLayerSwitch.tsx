"use client";
import { showHeat } from "@/lib/heatmapStore";
import { LIVE_LAYERS, useLiveLayer } from "@/lib/liveLayer";
import HeatLegend from "./HeatLegend";
import HeatPicker from "./HeatPicker";
import MonoLabel from "./MonoLabel";
import "./live.css";

/**
 * Segmented OFF / HEAT / HUMIDITY / PRESENCE / POWER / PIPES: which live layer the 3D scene paints. `L` cycles (bound by the dashboard).
 * Under it the "Show" row picks a heat map (temperature, humidity, CO2, light, noise) painted on the floors, with its colour legend above (the stack grows upward from `.layer-slot`).
 */
export default function LiveLayerSwitch() {
  const layer = useLiveLayer((s) => s.layer);
  const setLayer = useLiveLayer((s) => s.setLayer);
  return (
    <div className="livestack">
      <HeatLegend />
      <div className="hud livelayers brackets" role="group" aria-label="Live layer">
        <MonoLabel>Layer</MonoLabel>
        <div className="seg">
          {LIVE_LAYERS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={l === layer}
              title={`${l} layer (L cycles)`}
              onClick={() => {
                if (l === "heat" || l === "humidity") showHeat("off"); // the room tint and the heat map paint the same floors
                setLayer(l);
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="kbd" aria-hidden title="Press L to cycle layers">L</span>
      </div>
      <HeatPicker />
    </div>
  );
}
