"use client";
import { useMemo, useState } from "react";
import { HEAT_METRICS, METRICS, noSensorsText, sensorCounts } from "@/lib/heatmap";
import { showHeat, useShownHeat } from "@/lib/heatmapStore";
import { useStore } from "@/lib/store";
import MonoLabel from "./MonoLabel";
import "./live.css";
import "./heat.css";

/**
 * The "Show" row under the Layer row: Off / Temp / Humidity / CO2 / Light (/ Noise when the plan has a sound sensor), the heat map painted on the floors.
 * A map with no sensor placed stays in the row but greyed out; pressing it says why (hover text does not exist on a phone).
 */
export default function HeatPicker() {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const shown = useShownHeat();
  const counts = useMemo(() => sensorCounts(plan, states), [plan, states]);
  const [note, setNote] = useState("");

  return (
    <>
      <div className="hud livelayers heatpick brackets" role="group" aria-label="Heat map">
        <MonoLabel>Show</MonoLabel>
        <div className="seg">
          <button
            type="button"
            aria-pressed={shown === "off"}
            title="No heat map"
            onClick={() => {
              showHeat("off");
              setNote("");
            }}
          >
            Off
          </button>
          {HEAT_METRICS.filter((m) => m !== "noise" || counts.noise > 0 || shown === "noise").map((m) => {
            const none = counts[m] === 0;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={shown === m}
                aria-disabled={none || undefined}
                className={none ? "heat-none" : undefined}
                title={none ? noSensorsText(m) : `${METRICS[m].label} map`}
                onClick={() => {
                  setNote(none ? noSensorsText(m) : "");
                  if (!none) showHeat(m);
                }}
              >
                {METRICS[m].short}
              </button>
            );
          })}
        </div>
      </div>
      {note && (
        <p className="heat-note" role="status">
          {note}. Link one to a piece of furniture or a room in Home Assistant mode.
        </p>
      )}
    </>
  );
}
