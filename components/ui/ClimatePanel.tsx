"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { climateIds, climateInfo, roomTemps, snapTarget } from "@/lib/climate";
import type { ServiceCall } from "@/lib/ha";
import { useAreas } from "@/lib/haAreas";
import { findWeather, useSkySettings } from "@/lib/sky";
import { useStore } from "@/lib/store";
import ClimateDial from "./ClimateDial";
import { ChipSection, OutsideSection, RoomsSection } from "./ClimateSections";
import HudPanel from "./HudPanel";
import { patchState, runService } from "./serviceActions";
import { useSeries } from "./Sparkline";
import "./ClimatePanel.css";
import DeviceGlyph from "./DeviceGlyph";

const DEBOUNCE_MS = 600;

/** Left slide-over: a thermostat dial (drag or arrow keys), HVAC mode, presets, outside weather and per-room temperatures. */
export default function ClimatePanel({ onClose, entity }: { onClose: () => void; entity?: string }) {
  const states = useStore((s) => s.states);
  const plan = useStore((s) => s.plan);
  const { areas, entityArea } = useAreas();
  const ids = useMemo(() => climateIds(states), [states]);
  const [picked, setPicked] = useState<string | undefined>(entity);
  const id = picked && states[picked] ? picked : ids[0];
  const st = id ? states[id] : undefined;
  const info = st ? climateInfo(st) : undefined;
  const a = st?.attributes;

  const min = a?.min_temp ?? 7;
  const max = a?.max_temp ?? 35;
  const step = a?.target_temp_step ?? 0.5;
  const [draft, setDraft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { setDraft(null); setError(null); }, [id]);

  const target = draft ?? info?.target ?? min;

  const send = async (call: ServiceCall) => {
    const err = await runService(call);
    setError(err);
    return err === null;
  };
  const commit = (v: number) => {
    if (!id) return;
    const next = snapTarget(v, step, min, max);
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      if (await send({ domain: "climate", service: "set_temperature", entity_id: id, data: { temperature: next } })) patchState(id, { temperature: next });
      setDraft(null);
    }, DEBOUNCE_MS);
  };

  const wx = findWeather(states, useSkySettings((s) => s.weatherEntity))?.attributes; // the same entity the sky follows
  const rooms = useMemo(() => roomTemps(plan, states, entityArea, areas), [plan, states, entityArea, areas]);
  const trends = useSeries(useMemo(() => rooms.map((r) => r.entity), [rooms]), 6);
  const hvacModes = a?.hvac_modes ?? [];
  const presets = a?.preset_modes ?? [];

  return (
    <HudPanel title="Climate" meta={info ? info.name.replace(/^House thermostat\s*/i, "") || info.name : "none"} onClose={onClose} className="drawer climate" >
      <div className="cl-body" onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), onClose())}>
        {ids.length > 1 && (
          <div className="eb-chips" role="group" aria-label="Thermostat">
            {ids.map((c) => (
              <button key={c} className="eb-chip" aria-pressed={c === id} onClick={() => setPicked(c)}><DeviceGlyph entity={c} /> {states[c].attributes.friendly_name?.replace(/^House thermostat\s*/i, "") || c.split(".")[1].replace(/_/g, " ")}</button>
            ))}
          </div>
        )}
        {!st || !info ? (
          <p className="empty">{ids.length === 0 && Object.keys(states).length ? "No thermostat in Home Assistant." : "Waiting for Home Assistant."}</p>
        ) : (
          <>
            {ids.length === 1 && <div aria-hidden><DeviceGlyph entity={id} size={20} /></div>}
            <ClimateDial name={info.name} current={info.current} action={info.action} target={target} min={min} max={max} step={step} isOff={st.state === "off"} onCommit={commit} />
            <p className="field-note" role="status">
              {error ? <span className="warn">{error}</span> : draft != null ? "Applying..." : `Range ${min} to ${max} C. Arrow keys ${step} C, Shift 0.5 C.`}
            </p>

            {hvacModes.length > 0 && (
              <ChipSection title="Mode" ariaLabel="HVAC mode" modes={hvacModes} isOn={(m) => st.state === m} onPick={async (m) => (await send({ domain: "climate", service: "set_hvac_mode", entity_id: st.entity_id, data: { hvac_mode: m } })) && patchState(st.entity_id, {}, m)} />
            )}
            {presets.length > 0 && (
              <ChipSection title="Preset" ariaLabel="Preset" modes={presets} isOn={(m) => (a?.preset_mode ?? "none") === m} onPick={async (m) => (await send({ domain: "climate", service: "set_preset_mode", entity_id: st.entity_id, data: { preset_mode: m } })) && patchState(st.entity_id, { preset_mode: m })} />
            )}

            <OutsideSection weather={wx} indoorHumidity={a?.current_humidity} />

            {rooms.length > 0 && <RoomsSection rooms={rooms} target={target} trends={trends} />}
          </>
        )}
      </div>
    </HudPanel>
  );
}
