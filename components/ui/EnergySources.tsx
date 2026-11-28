"use client";
import { MagicWandIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { isKwhSensor, isPercentSensor, isPriceSensor, NO_SOURCES, parseSources, type EnergySources, type EntityKey } from "@/lib/energy";
import { fillSources } from "@/lib/energyPrefs";
import { haFetch } from "@/lib/haHome";
import { isPowerSensor, type StateLike } from "@/lib/flows";
import { useStore } from "@/lib/store";
import { useEnergy, useEnergySources } from "@/lib/useEnergy";
import EntityPicker from "./EntityPicker";
import { useEnergyUi } from "./energyUi";
import MonoLabel from "./MonoLabel";
import "./energyInsights.css";

type Row = { key: EntityKey; label: string; help: string; filter: (st: StateLike) => boolean; flip?: "gridInvert" | "batteryInvert" };

const MAIN: Row[] = [
  { key: "solar", label: "Solar power", help: "How many watts your solar panels make right now.", filter: isPowerSensor },
  { key: "grid", label: "Grid power", help: "Watts at your electricity meter. Most meters count buying from the grid as positive and selling as negative.", filter: isPowerSensor, flip: "gridInvert" },
  { key: "battery", label: "Battery power", help: "Watts going in or out of your home battery. Most batteries count powering the house as positive and charging as negative.", filter: isPowerSensor, flip: "batteryInvert" },
  { key: "batterySoc", label: "Battery charge", help: "How full your home battery is, in percent.", filter: isPercentSensor },
  { key: "ev", label: "Car charger power", help: "Watts your car charger gives to the car.", filter: isPowerSensor },
  { key: "carSoc", label: "Car battery", help: "How full your car is, in percent. A car linked in your plan often supplies this by itself, so this is optional.", filter: isPercentSensor },
];
const TOTALS: Row[] = [
  { key: "solarKwh", label: "Solar made", help: "A kWh counter of what the panels produced.", filter: isKwhSensor },
  { key: "importKwh", label: "Bought from the grid", help: "A kWh counter of what you took from the grid.", filter: isKwhSensor },
  { key: "exportKwh", label: "Sold to the grid", help: "A kWh counter of what you gave to the grid.", filter: isKwhSensor },
];

function PickRow({ row, sources }: { row: Row; sources: EnergySources }) {
  const patch = useEnergy((s) => s.patch);
  const value = sources[row.key];
  const pick = (v?: string) => {
    const next: Partial<EnergySources> = {};
    next[row.key] = v;
    patch(next);
  };
  const flip = (on: boolean) => {
    const next: Partial<EnergySources> = {};
    if (row.flip) next[row.flip] = on || undefined;
    patch(next);
  };
  return (
    <div className="en-src-row">
      <EntityPicker label={row.label} value={value} domains={["sensor"]} filter={row.filter} onChange={pick} />
      <small className="field-note">{row.help}</small>
      {row.flip && value && (
        <label className="en-check">
          <input type="checkbox" checked={!!sources[row.flip]} onChange={(e) => flip(e.target.checked)} />
          <span>My sensor counts the other way</span>
        </label>
      )}
    </div>
  );
}

const asNumber = (t: string) => Number(t.trim().replace(",", "."));

/** The price: a sensor with the price of one kWh, or a fixed number, and the currency to show. Both text fields keep their own draft so typing is never rewritten. */
function PriceRow({ sources }: { sources: EnergySources }) {
  const patch = useEnergy((s) => s.patch);
  const [draft, setDraft] = useState(sources.fixedPrice?.toString() ?? "");
  const [currency, setCurrency] = useState(sources.currency);
  useEffect(() => {
    // follow a price that "Find them for me" filled in (or "Clear all" removed)
    setDraft((d) => (sources.fixedPrice === undefined ? (Number.isFinite(asNumber(d)) ? "" : d) : asNumber(d) === sources.fixedPrice ? d : sources.fixedPrice.toString()));
  }, [sources.fixedPrice]);
  useEffect(() => setCurrency(sources.currency), [sources.currency]);
  const typePrice = (t: string) => {
    setDraft(t);
    const n = asNumber(t);
    if (t.trim() === "") patch({ fixedPrice: undefined });
    else if (Number.isFinite(n) && n >= 0) patch({ fixedPrice: n });
  };
  const typeCurrency = (t: string) => {
    setCurrency(t);
    if (t.trim()) patch({ currency: t });
  };
  return (
    <div className="en-src-row">
      <EntityPicker label="Price per kWh" value={sources.price} domains={["sensor"]} filter={isPriceSensor} onChange={(v) => patch({ price: v })} />
      <small className="field-note">A sensor holding what one kWh costs. If you have none, type a fixed price below.</small>
      <div className="en-price">
        <label className="field">
          <MonoLabel>Fixed price</MonoLabel>
          <input inputMode="decimal" value={draft} placeholder="for example 0.30" onChange={(e) => typePrice(e.target.value)} />
        </label>
        <label className="field">
          <MonoLabel>Currency</MonoLabel>
          <input value={currency} maxLength={8} onChange={(e) => typeCurrency(e.target.value)} onBlur={() => setCurrency(sources.currency)} />
        </label>
      </div>
    </div>
  );
}

/** Asks our server what Home Assistant's Energy dashboard knows; null when it could not be asked (the name guesses still work). */
async function askEnergySetup(): Promise<EnergySources | null> {
  try {
    const res = await haFetch("/api/ha/energy-prefs", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const body: unknown = res.ok ? await res.json() : null;
    return typeof body === "object" && body !== null && "guess" in body && body.guess ? parseSources(body.guess) : null;
  } catch {
    return null;
  }
}

/**
 * "Set up energy sources": which sensors say how much the panels make, what the grid and the battery do, what the car charger gives and what a kWh
 * costs. One tap finds them from Home Assistant's Energy setup and by name; nothing already picked is ever replaced. Folded; `startOpen` for a first visit.
 */
export default function EnergySourcesSection({ startOpen }: { startOpen: boolean }) {
  const sources = useEnergySources();
  const replace = useEnergy((s) => s.replace);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const wanted = useEnergyUi((s) => s.setup);
  const fold = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!wanted) return;
    if (fold.current) fold.current.open = true;
    useEnergyUi.getState().clearSetup();
  }, [wanted]);

  const find = async () => {
    setBusy(true);
    setNote("");
    const guess = await askEnergySetup();
    const { next, fromHa, byName } = fillSources(sources, guess, useStore.getState().states);
    replace(next);
    setBusy(false);
    setNote(
      fromHa + byName === 0
        ? "Nothing new found. Pick the sensors below yourself."
        : `Found ${fromHa + byName}: ${fromHa} from your Home Assistant Energy setup and ${byName} by name. Please check them below.`,
    );
  };

  return (
    <details className="en-fold" ref={fold} open={startOpen}>
      <summary>Set up energy sources</summary>
      <div className="en-src">
        <p className="field-note">Tell Doshy which sensors measure your energy. Everything is optional: pick only what you have. Nothing here changes a device.</p>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void find()}>
          <MagicWandIcon size={14} /> {busy ? "Looking" : "Find them for me"}
        </button>
        <p className="field-note" role="status" aria-live="polite">{note}</p>
        {MAIN.map((r) => <PickRow key={r.key} row={r} sources={sources} />)}
        <PriceRow sources={sources} />
        <details className="en-fold en-sub">
          <summary>Daily totals (optional)</summary>
          {TOTALS.map((r) => <PickRow key={r.key} row={r} sources={sources} />)}
        </details>
        <button type="button" className="btn" onClick={() => { replace(NO_SOURCES); setNote("Everything cleared."); }}>Clear all sources</button>
      </div>
    </details>
  );
}
