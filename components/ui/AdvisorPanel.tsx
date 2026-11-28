"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useAdvisor } from "@/lib/advisorStore";
import { isConfigured, parseSettings, PRICE_SOURCES, SOLAR_SOURCES, UNIT_CHOICES, WEATHER_SOURCES, fromDisplayTemp, toDisplayTemp, type AdvisorSettings } from "@/lib/advisorSettings";
import { ENTSOE_ZONES } from "@/lib/advisorFeeds";
import { errorMessage } from "@/lib/guards";
import { useStore } from "@/lib/store";
import { useQuality } from "@/lib/quality";
import AdvisorCard from "./AdvisorCard";
import HudPanel from "./HudPanel";
import "./advisor.css";

const PRICE_LABEL: Record<(typeof PRICE_SOURCES)[number], string> = { none: "No prices", entity: "A Home Assistant price sensor", "awattar-de": "aWATTar Germany (no key)", "awattar-at": "aWATTar Austria (no key)", entsoe: "ENTSO-E day-ahead (free token)", tariff: "My own tariff (peak / off-peak)" };
const SOLAR_LABEL: Record<(typeof SOLAR_SOURCES)[number], string> = { auto: "Automatic", entity: "A Home Assistant forecast sensor", openmeteo: "Open-Meteo, from my panels", none: "No solar" };
const WEATHER_LABEL: Record<(typeof WEATHER_SOURCES)[number], string> = { auto: "Automatic", entity: "A Home Assistant weather entity", openmeteo: "Open-Meteo", none: "No forecast" };
const UNIT_LABEL: Record<(typeof UNIT_CHOICES)[number], string> = { auto: "Detect from the sensor", kwh: "per kWh", mwh: "per MWh", cents: "cents per kWh" };

const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="adv-field"><span>{label}</span>{children}</label>;

function Num({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return <Field label={label}><input type="number" inputMode="decimal" value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : ""} min={min} max={max} step={step} onChange={(e) => { const v = e.target.valueAsNumber; if (Number.isFinite(v)) onChange(v); }} /></Field>;
}

function Settings({ draft, set, tokenSaved }: { draft: AdvisorSettings; set: (next: AdvisorSettings) => void; tokenSaved: boolean }) {
  const states = useStore((s) => s.states);
  const sensors = Object.keys(states).filter((id) => id.startsWith("sensor.") || id.startsWith("weather.") || id.startsWith("climate.")).sort();
  const t = draft.units;
  const entity = (label: string, value: string, apply: (v: string) => void) => <Field label={label}><input list="adv-entities" value={value} placeholder="sensor.…" maxLength={120} onChange={(e) => apply(e.target.value.trim())} /></Field>;
  return <div className="adv-set">
    <datalist id="adv-entities">{sensors.slice(0, 400).map((id) => <option key={id} value={id} />)}</datalist>
    <Field label="Electricity prices"><select value={draft.price.source} onChange={(e) => set({ ...draft, price: { ...draft.price, source: PRICE_SOURCES.find((s) => s === e.target.value) ?? "none" } })}>{PRICE_SOURCES.map((s) => <option key={s} value={s}>{PRICE_LABEL[s]}</option>)}</select></Field>
    {draft.price.source === "entity" && <>{entity("Price sensor", draft.price.entity, (v) => set({ ...draft, price: { ...draft.price, entity: v } }))}
      <Field label="Price unit"><select value={draft.price.unit} onChange={(e) => set({ ...draft, price: { ...draft.price, unit: UNIT_CHOICES.find((u) => u === e.target.value) ?? "auto" } })}>{UNIT_CHOICES.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select></Field></>}
    {draft.price.source === "entsoe" && <>
      <Field label="Bidding zone"><select value={draft.price.zone} onChange={(e) => set({ ...draft, price: { ...draft.price, zone: e.target.value } })}>{ENTSOE_ZONES.map((z) => <option key={z.code} value={z.code}>{z.name}</option>)}</select></Field>
      <p className="field-note">{tokenSaved ? "A token is saved on the server." : "No token saved yet."} It is kept on the server only and never shown again.</p></>}
    {(draft.price.source === "entsoe" || draft.price.source.startsWith("awattar")) && <div className="adv-row">
      <Num label="VAT %" value={draft.price.vat} min={0} max={100} onChange={(v) => set({ ...draft, price: { ...draft.price, vat: v } })} />
      <Num label="Added per kWh" value={draft.price.add} min={-10} max={10} step={0.01} onChange={(v) => set({ ...draft, price: { ...draft.price, add: v } })} /></div>}
    {draft.price.source === "tariff" && <div className="adv-row">
      <Num label="Peak price /kWh" value={draft.price.tariff.peak} min={-10} max={10} step={0.01} onChange={(v) => set({ ...draft, price: { ...draft.price, tariff: { ...draft.price.tariff, peak: v } } })} />
      <Num label="Off-peak /kWh" value={draft.price.tariff.offPeak} min={-10} max={10} step={0.01} onChange={(v) => set({ ...draft, price: { ...draft.price, tariff: { ...draft.price.tariff, offPeak: v } } })} />
      <Field label="Off-peak from"><input type="time" value={draft.price.tariff.offFrom} onChange={(e) => set({ ...draft, price: { ...draft.price, tariff: { ...draft.price.tariff, offFrom: e.target.value } } })} /></Field>
      <Field label="Off-peak until"><input type="time" value={draft.price.tariff.offTo} onChange={(e) => set({ ...draft, price: { ...draft.price, tariff: { ...draft.price.tariff, offTo: e.target.value } } })} /></Field>
      <label className="adv-check"><input type="checkbox" checked={draft.price.tariff.weekendOffPeak} onChange={(e) => set({ ...draft, price: { ...draft.price, tariff: { ...draft.price.tariff, weekendOffPeak: e.target.checked } } })} />Weekends are all off-peak</label></div>}
    <div className="adv-row">
      <Field label="Currency"><input value={draft.currency} maxLength={3} onChange={(e) => set({ ...draft, currency: e.target.value.toUpperCase() })} /></Field>
      <Field label="Units"><select value={draft.units} onChange={(e) => set({ ...draft, units: e.target.value === "imperial" ? "imperial" : "metric" })}><option value="metric">Metric (°C)</option><option value="imperial">Imperial (°F)</option></select></Field></div>
    <Field label="Solar forecast"><select value={draft.solar.source} onChange={(e) => set({ ...draft, solar: { ...draft.solar, source: SOLAR_SOURCES.find((s) => s === e.target.value) ?? "auto" } })}>{SOLAR_SOURCES.map((s) => <option key={s} value={s}>{SOLAR_LABEL[s]}</option>)}</select></Field>
    {draft.solar.source === "entity" && entity("Forecast sensor", draft.solar.entity, (v) => set({ ...draft, solar: { ...draft.solar, entity: v } }))}
    {draft.solar.source !== "none" && <div className="adv-row">
      <Num label="Panels kWp" value={draft.solar.pv.kwp} min={0.1} max={100} step={0.1} onChange={(v) => set({ ...draft, solar: { ...draft.solar, pv: { ...draft.solar.pv, kwp: v } } })} />
      <Num label="Tilt °" value={draft.solar.pv.tilt} min={0} max={90} onChange={(v) => set({ ...draft, solar: { ...draft.solar, pv: { ...draft.solar.pv, tilt: v } } })} />
      <Num label="Facing ° (180 = south)" value={draft.solar.pv.azimuth} min={0} max={360} onChange={(v) => set({ ...draft, solar: { ...draft.solar, pv: { ...draft.solar.pv, azimuth: v } } })} />
      <Num label="House always draws W" value={draft.solar.baseLoadW} min={0} max={5000} step={50} onChange={(v) => set({ ...draft, solar: { ...draft.solar, baseLoadW: v } })} /></div>}
    <Field label="Weather forecast"><select value={draft.weather.source} onChange={(e) => set({ ...draft, weather: { ...draft.weather, source: WEATHER_SOURCES.find((s) => s === e.target.value) ?? "auto" } })}>{WEATHER_SOURCES.map((s) => <option key={s} value={s}>{WEATHER_LABEL[s]}</option>)}</select></Field>
    {draft.weather.source === "entity" && entity("Weather entity", draft.weather.entity, (v) => set({ ...draft, weather: { ...draft.weather, entity: v } }))}
    {entity("Indoor temperature (optional)", draft.climate.indoor, (v) => set({ ...draft, climate: { ...draft.climate, indoor: v } }))}
    {entity("Outdoor temperature (optional)", draft.climate.outdoor, (v) => set({ ...draft, climate: { ...draft.climate, outdoor: v } }))}
    <div className="adv-row">
      <Num label={`Comfort from ${t === "imperial" ? "°F" : "°C"}`} value={toDisplayTemp(draft.climate.min, t)} min={toDisplayTemp(5, t)} max={toDisplayTemp(30, t)} onChange={(v) => set({ ...draft, climate: { ...draft.climate, min: fromDisplayTemp(v, t) } })} />
      <Num label={`Comfort to ${t === "imperial" ? "°F" : "°C"}`} value={toDisplayTemp(draft.climate.max, t)} min={toDisplayTemp(10, t)} max={toDisplayTemp(35, t)} onChange={(v) => set({ ...draft, climate: { ...draft.climate, max: fromDisplayTemp(v, t) } })} /></div>
    <fieldset className="adv-check-set"><legend>Advise me about</legend>
      {(["dishwasher", "washer", "dryer"] as const).map((k) => <label key={k} className="adv-check"><input type="checkbox" checked={draft.appliances[k]} onChange={(e) => set({ ...draft, appliances: { ...draft.appliances, [k]: e.target.checked } })} />{k === "washer" ? "Washing machine" : k[0].toUpperCase() + k.slice(1)}</label>)}</fieldset>
    <label className="adv-check"><input type="checkbox" checked={draft.todayCard} onChange={(e) => set({ ...draft, todayCard: e.target.checked })} />Show a Today card on the Live screen</label>
  </div>;
}

export default function AdvisorPanel({ onClose }: { onClose: () => void }) {
  const { settings, loaded, tokenSaved, result, updatedAt, busy, error, loadSettings, saveSettings, refresh } = useAdvisor();
  const eco = useQuality((s) => s.tier === "eco");
  const [draft, setDraft] = useState<AdvisorSettings>(settings);
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [setup, setSetup] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!loaded) void loadSettings(); }, [loaded, loadSettings]);
  useEffect(() => { setDraft(settings); }, [settings]);
  useEffect(() => { if (loaded && isConfigured(settings)) void refresh(); else if (loaded) setSetup(true); }, [loaded, settings, refresh]);
  const save = async () => {
    try { await saveSettings(parseSettings(draft), token.trim() || undefined, clearToken); setToken(""); setClearToken(false); setMsg("Saved."); setSetup(false); }
    catch (e) { setMsg(errorMessage(e)); }
  };
  const advice = result?.advice ?? [];
  return <HudPanel title="Advisor" onClose={onClose} meta={advice.length ? String(advice.length) : undefined} className="adv drawer">
    <div className="adv-body">
      <p className="field-note">Cost and comfort ideas from prices, sun and weather. Advice only: nothing here runs a device.</p>
      <div className="adv-bar"><span role="status">{busy ? "Working it out…" : updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString()}` : "Not updated yet"}</span>
        <button className="btn" type="button" disabled={busy} onClick={() => void refresh()}>Refresh</button></div>
      {eco && <p className="field-note">Eco: updates only when you press Refresh.</p>}
      {error && <p className="field-note warn" role="alert">{error}{result ? " Showing the last result." : ""}</p>}
      {result && advice.length === 0 && <p className="adv-none" role="status">Nothing worth changing right now.</p>}
      {advice.map((a) => <AdvisorCard key={a.id} advice={a} />)}
      {result && result.notes.length > 0 && <details className="adv-notes"><summary>What it could not use</summary><ul>{result.notes.map((n) => <li key={n}>{n}</li>)}</ul></details>}
      <details open={setup} onToggle={(e) => setSetup(e.currentTarget.open)}><summary>Sources and preferences</summary>
        <Settings draft={draft} set={setDraft} tokenSaved={tokenSaved} />
        {draft.price.source === "entsoe" && <>
          <Field label="ENTSO-E security token"><input type="password" autoComplete="off" value={token} placeholder={tokenSaved ? "Saved; type to replace" : "Paste your token"} onChange={(e) => setToken(e.target.value)} /></Field>
          {tokenSaved && <label className="adv-check"><input type="checkbox" checked={clearToken} onChange={(e) => setClearToken(e.target.checked)} />Remove the saved token</label>}</>}
        <div className="adv-bar"><button className="btn primary" type="button" onClick={() => void save()}>Save</button>{msg && <span role="status">{msg}</span>}</div>
      </details>
    </div>
  </HudPanel>;
}
