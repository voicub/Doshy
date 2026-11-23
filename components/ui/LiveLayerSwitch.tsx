"use client";
import { LIVE_LAYERS, useLiveLayer } from "@/lib/liveLayer";
import MonoLabel from "./MonoLabel";
import "./live.css";

/** Segmented OFF / HEAT / HUMIDITY / PRESENCE / POWER: which live statistic the 3D scene paints over the rooms. `L` cycles (bound by the dashboard). */
export default function LiveLayerSwitch() {
  const layer = useLiveLayer((s) => s.layer);
  const setLayer = useLiveLayer((s) => s.setLayer);
  return (
    <div className="hud livelayers brackets" role="group" aria-label="Live layer">
      <MonoLabel>Layer</MonoLabel>
      <div className="seg">
        {LIVE_LAYERS.map((l) => (
          <button key={l} type="button" aria-pressed={l === layer} title={`${l} layer (L cycles)`} onClick={() => setLayer(l)}>
            {l}
          </button>
        ))}
      </div>
      <span className="kbd" aria-hidden title="Press L to cycle layers">L</span>
    </div>
  );
}
