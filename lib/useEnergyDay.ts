"use client";
// Today's energy totals (solar made, grid imported / exported, cost with a fixed price) from the kWh counters of the energy sources.
// Fetched from Home Assistant's history only while `enabled` (the Energy panel is open), then every 5 minutes.
import { useEffect, useState } from "react";
import { kwhSince } from "./energy";
import { useEnergySources } from "./useEnergy";
import { HOUR, fetchHistory } from "./stats";
import { useStore } from "./store";

const REFRESH_MS = 300_000;
/** One point every 5 minutes over a day. */
const POINTS = 288;

export type EnergyDay = { solarKwh?: number; importKwh?: number; exportKwh?: number; cost?: number };

export function useEnergyDay(enabled: boolean): EnergyDay {
  const s = useEnergySources();
  const [day, setDay] = useState<EnergyDay>({});
  const { solarKwh, importKwh, exportKwh, fixedPrice } = s;
  useEffect(() => {
    const ids = [solarKwh, importKwh, exportKwh].filter((x): x is string => !!x);
    if (!enabled || !ids.length) return;
    const ctl = new AbortController();
    const load = async () => {
      try {
        const midnight = new Date().setHours(0, 0, 0, 0);
        const hours = Math.min(168, Math.max(1, Math.ceil((Date.now() - midnight) / HOUR) + 1)); // the history route takes whole hours; one more covers the value at midnight
        const { series } = await fetchHistory(ids, hours, { points: POINTS, signal: ctl.signal });
        const states = useStore.getState().states;
        const today = (id?: string) => {
          const ser = id ? series[id] : undefined;
          if (!id || ser?.kind !== "num") return undefined;
          return kwhSince(ser, midnight, states[id]?.attributes.unit_of_measurement, Number(states[id]?.state));
        };
        const imported = today(importKwh);
        setDay({ solarKwh: today(solarKwh), importKwh: imported, exportKwh: today(exportKwh), cost: fixedPrice !== undefined && imported !== undefined ? imported * fixedPrice : undefined });
      } catch {
        /* optional: the card simply leaves today's totals out */
      }
    };
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      ctl.abort();
      clearInterval(t);
    };
  }, [enabled, solarKwh, importKwh, exportKwh, fixedPrice]);
  return enabled ? day : {};
}
