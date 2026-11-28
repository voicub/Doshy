"use client";
import { useEffect, useState } from "react";
import type { HAState } from "@/lib/ha";
import { displayUnit, entityHpa, formatChange, formatPressure, fromHpa, PRESSURE_PREFS, seaLevelFromStation, tendencyArrow, trend3h, type Sample } from "@/lib/pressure";
import { pressureSamples } from "@/lib/pressureHistory";
import { usePressurePrefs } from "@/lib/pressureStore";
import { homeAltitude } from "@/lib/pressurePrefs";
import { useSiteState } from "@/lib/siteStore";
import { useDisplay } from "@/lib/displayStore";
import { fetchHistory } from "@/lib/stats";
import Sparkline from "./Sparkline";
import Segmented from "./Segmented";

export default function PressureCard({ st }: { st: HAState }) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [error, setError] = useState("");
  const pref = useDisplay((s) => s.pressureUnit);
  const setUnit = useDisplay((s) => s.setPressureUnit);
  const p = usePressurePrefs();
  const terrain = useSiteState((s) => s.data?.terrain?.base);
  const native = st.entity_id.startsWith("weather.") ? st.attributes.pressure_unit : st.attributes.unit_of_measurement;
  useEffect(() => {
    const ctl = new AbortController();
    setSamples([]);
    const load = async () => {
      try {
        const r = await fetchHistory([st.entity_id], 24, { points: 288, attrs: st.entity_id.startsWith("weather.") ? ["pressure"] : undefined, signal: ctl.signal });
        if (!ctl.signal.aborted) { setSamples(pressureSamples(r.series, st.entity_id, native ?? "hPa")); setError(""); }
      } catch { if (!ctl.signal.aborted) setError("Pressure history is not available from Home Assistant."); }
    };
    void load();
    const timer = setInterval(() => void load(), 300_000);
    return () => { ctl.abort(); clearInterval(timer); };
  }, [st.entity_id, native]);
  const altitude = homeAltitude(p, terrain);
  const corrected = p.correct && (p.entity === null || p.entity === st.entity_id) && altitude !== undefined && !/sea.?level|mslp|qnh/i.test(`${st.entity_id} ${st.attributes.friendly_name ?? ""}`);
  const fix = (hpa: number) => corrected ? seaLevelFromStation(hpa, altitude ?? 0) : hpa;
  const series = samples.map((s) => ({ ...s, hpa: fix(s.hpa) }));
  const tendency = trend3h(series, Date.now());
  const hpa = entityHpa(st);
  const unit = displayUnit(pref, native);
  return <section className="dc-trend pr-card" aria-label="Atmospheric pressure history">
    <b>{hpa !== undefined ? formatPressure(fix(hpa), pref, native) : "Unavailable"}</b>
    {corrected && <small>Corrected to sea level</small>}
    <Segmented label="Pressure unit" value={pref} options={PRESSURE_PREFS} format={(v) => v === "auto" ? "Auto" : v} onChange={setUnit} />
    <p>{tendency ? `${tendencyArrow(tendency)} ${tendency.label} · ${formatChange(tendency.deltaHpa3h, pref, native)} / 3 h` : "Three hours of history needed for a tendency."}</p>
    <small>Last 24 h · {unit}</small>
    <Sparkline width={260} height={44} line={{ t: series.map((s) => s.t), v: series.map((s) => fromHpa(s.hpa, unit)) }} />
    {error && <p className="field-note warn" role="status">{error}</p>}
  </section>;
}
