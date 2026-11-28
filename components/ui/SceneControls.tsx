"use client";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { HAState } from "@/lib/ha";
import { lightInfo, rgbCss } from "@/lib/light";
import type { SceneDevice } from "@/lib/sceneDevices";
import type { SceneStep } from "@/lib/scenes";
import { KIND_ICON } from "./sceneIcons";
import DeviceGlyph from "./DeviceGlyph";

/** Preset colours: the first is the warm white a light has when no colour is chosen. */
const COLOURS: [number, number, number][] = [[255, 226, 181], [255, 74, 61], [255, 157, 46], [255, 225, 74], [79, 227, 111], [47, 217, 208], [47, 155, 255], [138, 92, 255], [255, 95, 176]];
const KELVIN_TRACK = "linear-gradient(90deg,#ff9d2e,#fff4e5,#9cc4ff)";

type Choice<T extends string> = { id: T; label: string };

/** A row of big buttons, one pressed: the choice a device gets in the scene. */
function Choices<T extends string>({ label, value, choices, onPick }: { label: string; value: T; choices: Choice<T>[]; onPick: (id: T) => void }) {
  return (
    <div className="scn-choices" role="group" aria-label={label}>
      {choices.map((c) => (
        <button key={c.id} type="button" className="scn-choice" aria-pressed={c.id === value} onClick={() => onPick(c.id)}>{c.label}</button>
      ))}
    </div>
  );
}

function Slider({ label, unit, value, min, max, step = 1, track, onChange }: { label: string; unit: string; value: number; min: number; max: number; step?: number; track?: string; onChange: (v: number) => void }) {
  return (
    <label className="scn-slider">
      <span className="label">{label}</span>
      <input type="range" className="rng scn-rng" min={min} max={max} step={step} value={value} style={track ? { background: track } : undefined} aria-valuetext={`${Math.round(value)}${unit}`} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="t-val scn-val">{`${Math.round(value)}${unit}`}</span>
    </label>
  );
}

/** What the device is doing now, in a few words ("on 40%", "closed", "21°"). */
function nowWords(d: SceneDevice, st?: HAState): string {
  if (!st || st.state === "unavailable" || st.state === "unknown") return "not reporting";
  if (d.kind === "light") return st.state === "on" ? (st.attributes.brightness != null ? `on ${Math.round(lightInfo(st, "#fff").level * 100)}%` : "on") : "off";
  if (d.kind === "cover") return typeof st.attributes.current_position === "number" ? (st.attributes.current_position <= 0 ? "closed" : st.attributes.current_position >= 100 ? "open" : `${Math.round(st.attributes.current_position)}% open`) : st.state;
  if (d.kind === "climate") return typeof st.attributes.temperature === "number" ? `set to ${st.attributes.temperature}°` : st.state;
  return st.state;
}

type LightMode = "leave" | "off" | "on";
type CoverMode = "leave" | "closed" | "part" | "open";
type SetMode = "leave" | "set";

/** The big controls for one device: whether the scene touches it, and what it should do. `step` null means the scene leaves it alone. */
export default function SceneControls({ device, step, state, onChange }: { device: SceneDevice; step: SceneStep | null; state?: HAState; onChange: (s: SceneStep | null) => void }) {
  const entity = device.entity;
  const set = (patch: Partial<SceneStep>) => onChange({ ...(step ?? { entity }), ...patch });
  let body: ReactNode = null;

  if (device.kind === "cover") {
    const mode: CoverMode = !step || step.position === undefined ? "leave" : step.position <= 0 ? "closed" : step.position >= 100 ? "open" : "part";
    body = (
      <>
        <Choices label={`${device.name} in this scene`} value={mode} choices={[{ id: "leave", label: "Leave" }, { id: "closed", label: "Close" }, { id: "part", label: "Part" }, { id: "open", label: "Open" }]}
          onPick={(m) => onChange(m === "leave" ? null : { entity, position: m === "closed" ? 0 : m === "open" ? 100 : 50 })} />
        {mode === "part" && step?.position !== undefined && <Slider label="Open" unit="%" min={1} max={99} value={step.position} onChange={(position) => onChange({ entity, position })} />}
      </>
    );
  } else if (device.kind === "climate") {
    const lim = device.limits ?? { min: 7, max: 30, step: 0.5 };
    const t = step?.temperature;
    const move = (by: number) => onChange({ entity, temperature: Math.min(lim.max, Math.max(lim.min, Math.round(((t ?? 21) + by) * 2) / 2)) });
    body = (
      <>
        <Choices<SetMode> label={`${device.name} in this scene`} value={t === undefined ? "leave" : "set"} choices={[{ id: "leave", label: "Leave" }, { id: "set", label: "Set" }]} onPick={(m) => onChange(m === "leave" ? null : { entity, temperature: Math.min(lim.max, Math.max(lim.min, state?.attributes.temperature ?? 21)) })} />
        {t !== undefined && (
          <div className="scn-stepper" role="group" aria-label="Target temperature">
            <button type="button" className="scn-step" aria-label="Cooler" disabled={t <= lim.min} onClick={() => move(-lim.step)}><MinusIcon size={18} /></button>
            <output className="scn-temp t-val" aria-live="polite">{`${t}°`}</output>
            <button type="button" className="scn-step" aria-label="Warmer" disabled={t >= lim.max} onClick={() => move(lim.step)}><PlusIcon size={18} /></button>
          </div>
        )}
      </>
    );
  } else {
    const mode: LightMode = !step || step.on === undefined ? "leave" : step.on ? "on" : "off";
    const on = mode === "on";
    body = (
      <>
        <Choices label={`${device.name} in this scene`} value={mode} choices={[{ id: "leave", label: "Leave" }, { id: "off", label: "Off" }, { id: "on", label: "On" }]}
          onPick={(m) => onChange(m === "leave" ? null : m === "off" ? { entity, on: false } : { entity, on: true, ...(device.kind === "light" && device.dimmable ? { brightness: step?.brightness ?? 80 } : {}) })} />
        {on && device.kind === "light" && device.dimmable && <Slider label="Bright" unit="%" min={1} max={100} value={step?.brightness ?? 80} onChange={(brightness) => set({ brightness })} />}
        {on && device.kind === "light" && device.kelvin && (
          <Slider label="Warm to cool" unit="K" min={device.kelvin[0]} max={device.kelvin[1]} step={50} value={step?.kelvin ?? Math.round((device.kelvin[0] + device.kelvin[1]) / 2)} track={KELVIN_TRACK} onChange={(kelvin) => onChange({ entity, on: true, ...(step?.brightness !== undefined ? { brightness: step.brightness } : {}), kelvin })} />
        )}
        {on && device.kind === "light" && device.colour && (
          <div className="scn-swatches" role="group" aria-label="Colour">
            {COLOURS.map((c, i) => (
              <button key={c.join()} type="button" className="swatch" style={{ background: rgbCss(c) }} aria-label={i === 0 ? "Warm white" : `Colour ${i}`} aria-pressed={step?.rgb?.join() === c.join()} onClick={() => onChange({ entity, on: true, ...(step?.brightness !== undefined ? { brightness: step.brightness } : {}), rgb: c })} />
            ))}
          </div>
        )}
        {on && device.kind === "media" && (step?.volume === undefined
          ? <button type="button" className="btn scn-small" onClick={() => set({ volume: 30 })}>Set the volume too</button>
          : <Slider label="Volume" unit="%" min={0} max={100} value={step.volume} onChange={(volume) => set({ volume })} />)}
      </>
    );
  }

  return (
    <li className="scn-dev" data-active={step ? "" : undefined}>
      <div className="scn-dev-head">
        <span className="scn-kind" aria-hidden><DeviceGlyph entity={device.entity} fallback={KIND_ICON[device.kind]} /></span>
        <span className="scn-name">{device.name}</span>
        <small className="scn-now">{`now: ${nowWords(device, state)}`}</small>
      </div>
      {body}
    </li>
  );
}
