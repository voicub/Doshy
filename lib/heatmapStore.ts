import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "./dbClient";
import { isRecord } from "./guards.ts";
import { isHeatMetric, type HeatMetric } from "./heatmap.ts";
import { PALETTES, type PaletteName } from "./heatmapPalette.ts";
import { useLiveLayer } from "./liveLayer";

type State = {
  /** The map drawn on the floors; off = none. */
  metric: HeatMetric | "off";
  palette: PaletteName;
  setMetric: (m: HeatMetric | "off") => void;
  setPalette: (p: PaletteName) => void;
};

const storage = dbStorage("housey-heatmap", "settings", 0);

/** Which heat map (temperature, humidity, CO2, light, noise) paints the floors, and with which colours. Off by default. */
export const useHeatMap = create<State>()(
  persist(
    (set) => ({
      metric: "off",
      palette: "viridis",
      setMetric: (metric) => set({ metric }),
      setPalette: (palette) => set({ palette }),
    }),
    {
      name: "housey-heatmap",
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ metric: s.metric, palette: s.palette }),
      // a stale or hand-edited value must not leave the scene on an unknown map
      merge: (persisted, current) => {
        const p = isRecord(persisted) ? persisted : {};
        return { ...current, metric: isHeatMetric(p.metric) ? p.metric : "off", palette: PALETTES.find((x) => x === p.palette) ?? "viridis" };
      },
    },
  ),
);
storage.bind(() => void useHeatMap.persist.rehydrate());

/**
 * The map that is really on screen: the chosen one, unless the older heat / humidity room tint is on (it paints the same floors, so it wins and the heat map stays out of its way).
 * Both the scene and the picker read this, so what the buttons show is what is drawn.
 */
export function useShownHeat(): HeatMetric | "off" {
  const metric = useHeatMap((s) => s.metric);
  const tint = useLiveLayer((s) => s.layer === "heat" || s.layer === "humidity");
  return tint ? "off" : metric;
}

/** Picks a map (or off). The older heat / humidity room tint paints the same floors, so choosing a map turns that tint off: one picture at a time. */
export function showHeat(metric: HeatMetric | "off"): void {
  const live = useLiveLayer.getState();
  if (metric !== "off" && (live.layer === "heat" || live.layer === "humidity")) live.setLayer("off");
  useHeatMap.getState().setMetric(metric);
}
