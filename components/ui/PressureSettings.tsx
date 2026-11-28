"use client";
import { useStore } from "@/lib/store";
import { useDisplay } from "@/lib/displayStore";
import { PRESSURE_PREFS, isPressureEntity, isPressurePref } from "@/lib/pressure";
import { ALTITUDE_RANGE, homeAltitude } from "@/lib/pressurePrefs";
import { usePressurePrefs } from "@/lib/pressureStore";
import { useSiteState } from "@/lib/siteStore";
import Segmented from "./Segmented";

export default function PressureSettings() {
  const unit = useDisplay((s) => s.pressureUnit);
  const setUnit = useDisplay((s) => s.setPressureUnit);
  const states = useStore((s) => s.states);
  const p = usePressurePrefs();
  const terrain = useSiteState((s) => s.data?.terrain?.base);
  const altitude = homeAltitude(p, terrain);
  const sensors = Object.values(states).filter(isPressureEntity);
  return <section className="disp-sec pr-set">
    <h3 className="label disp-h">Units</h3>
    <label className="field">Pressure
      <select aria-label="Pressure unit" value={unit} onChange={(e) => { if (isPressurePref(e.target.value)) setUnit(e.target.value); }}>
        {PRESSURE_PREFS.map((u) => <option key={u} value={u}>{u === "auto" ? "Auto (Home Assistant)" : u}</option>)}
      </select>
    </label>
    <label className="field">Barometer source
      <select aria-label="Barometer source" value={p.entity ?? ""} onChange={(e) => p.set({ entity: e.target.value || null })}>
        <option value="">Automatic</option>
        {p.entity && !sensors.some((s) => s.entity_id === p.entity) && <option value={p.entity}>{p.entity} (not available)</option>}
        {sensors.map((s) => <option key={s.entity_id} value={s.entity_id}>{s.attributes.friendly_name ?? s.entity_id}</option>)}
      </select>
    </label>
    <label className="field"><span><input type="checkbox" checked={p.correct} onChange={(e) => p.set({ correct: e.target.checked })} /> This sensor shows pressure at my altitude: correct to sea level</span></label>
    {p.correct && <label className="field">Altitude above sea level (m)
      <input aria-label="Altitude above sea level (m)" type="number" min={ALTITUDE_RANGE.min} max={ALTITUDE_RANGE.max} step="1" value={altitude ?? ""} placeholder="Enter altitude" onChange={(e) => p.set({ altitudeM: e.target.value === "" ? null : Number(e.target.value) })} />
      <small className="hint">{terrain !== undefined ? "Prefilled from Site elevation; clearing restores that elevation." : "Set a Site location or enter your station altitude."}</small>
    </label>}
    <Segmented label="Pressure alerts" value={p.alerts ? "on" : "off"} options={["off", "on"] as const} onChange={(v) => p.set({ alerts: v === "on" })} format={(v) => v === "on" ? "On" : "Off"} />
    <p className="hint">A very rapid fall can suggest unsettled weather. Barometer indications are not forecasts or safety warnings.</p>
  </section>;
}
