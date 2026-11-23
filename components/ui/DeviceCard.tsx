"use client";
import { CaretLeftIcon, CaretRightIcon, PauseIcon, PlayIcon, PowerIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { domainOf, isOpenState, type HAState, type ServiceCall } from "@/lib/ha";
import { hexToRgb, lightInfo, rgbCss } from "@/lib/light";
import { useStore } from "@/lib/store";
import { hudScale, hudViewport } from "@/lib/displayStore";
import HudPanel from "./HudPanel";
import MonoLabel from "./MonoLabel";
import { patchState, runService, type DeviceTarget, type ServiceData } from "./serviceActions";
import { useDismiss } from "./useDismiss";
import Sparkline, { useSeries } from "./Sparkline";
import VacuumNote from "./VacuumNote";

const COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];
const SWATCHES = ["#ffe2b5", "#ff4a3d", "#ff9d2e", "#ffe14a", "#4fe36f", "#2fd9d0", "#2f9bff", "#8a5cff", "#ff5fb0"];
const WIDTH = 320;

/** hue 0..360, saturation 0..100 -> rgb 0..255 (value fixed at 1; brightness is a separate control) */
function hsToRgb(h: number, s: number): [number, number, number] {
  const k = (n: number) => (n + h / 60) % 6;
  const f = (n: number) => 1 - (s / 100) * Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

function ago(iso?: string): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "unknown";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Range input that shows the drag locally and sends once the user pauses. */
function Slider({ label, unit, value, min, max, step = 1, onCommit, track }: { label: string; unit?: string; value: number; min: number; max: number; step?: number; onCommit: (v: number) => void; track?: string }) {
  const [local, setLocal] = useState<number | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const shown = local ?? value;
  return (
    <label className="dc-row">
      <MonoLabel>{label}</MonoLabel>
      <input
        type="range"
        className="rng"
        style={track ? { background: track } : undefined}
        min={min}
        max={max}
        step={step}
        value={shown}
        aria-valuetext={`${Math.round(shown)}${unit ? ` ${unit}` : ""}`}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocal(v);
          clearTimeout(timer.current);
          timer.current = window.setTimeout(() => { onCommit(v); setLocal(null); }, 350);
        }}
      />
      <span className="t-val dc-val">{`${Math.round(shown)}${unit ?? ""}`}</span>
    </label>
  );
}

function Btn({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return <button className={`btn dc-btn ${active ? "active" : ""}`} aria-label={label} aria-pressed={active} onClick={onClick}>{children}</button>;
}

function LightControls({ st, send }: { st: HAState; send: Send }) {
  const a = st.attributes;
  const modes = a.supported_color_modes ?? [];
  const on = st.state === "on";
  const dimmable = modes.some((m) => m !== "onoff");
  const color = modes.some((m) => COLOR_MODES.includes(m));
  const temp = modes.includes("color_temp");
  const info = lightInfo(st, "#ffc680");
  const [hue, setHue] = useState(30);
  const [sat, setSat] = useState(100);
  const id = st.entity_id;
  const set = (data: ServiceData, patch: Partial<HAState["attributes"]>) => send({ domain: "light", service: "turn_on", entity_id: id, data }, () => patchState(id, patch, "on"));
  return (
    <>
      <div className="dc-row">
        <Btn label={on ? "Turn off" : "Turn on"} active={on} onClick={() => void (on ? send({ domain: "light", service: "turn_off", entity_id: id }, () => patchState(id, {}, "off")) : send({ domain: "light", service: "turn_on", entity_id: id }, () => patchState(id, {}, "on")))}>
          <PowerIcon size={14} /> {on ? "On" : "Off"}
        </Btn>
        <span className="dc-swatch" aria-label="Current colour" style={{ background: on ? rgbCss(info.rgb) : "transparent" }} />
      </div>
      {dimmable && on && <Slider label="Bright" unit="%" min={1} max={100} value={Math.round(((a.brightness ?? 255) / 255) * 100)} onCommit={(v) => void set({ brightness_pct: v }, { brightness: Math.round((v / 100) * 255) })} />}
      {temp && on && (
        <Slider label="Temp" unit="K" min={a.min_color_temp_kelvin ?? 2000} max={a.max_color_temp_kelvin ?? 6500} step={50} value={a.color_temp_kelvin ?? 3000} track="linear-gradient(90deg,#ff9d2e,#fff4e5,#9cc4ff)" onCommit={(v) => void set({ color_temp_kelvin: v }, { color_temp_kelvin: v })} />
      )}
      {color && on && (
        <>
          <Slider label="Hue" unit="deg" min={0} max={360} value={hue} track="linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" onCommit={(v) => { setHue(v); const rgb = hsToRgb(v, sat); void set({ rgb_color: rgb }, { rgb_color: rgb }); }} />
          <Slider label="Sat" unit="%" min={0} max={100} value={sat} track={`linear-gradient(90deg,#fff,${rgbCss(hsToRgb(hue, 100))})`} onCommit={(v) => { setSat(v); const rgb = hsToRgb(hue, v); void set({ rgb_color: rgb }, { rgb_color: rgb }); }} />
          <div className="swatches" role="group" aria-label="Colour presets">
            {SWATCHES.map((c) => (
              <button key={c} className="swatch" style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => { const rgb = hexToRgb(c); void set({ rgb_color: rgb }, { rgb_color: rgb }); }} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

type Send = (call: ServiceCall, after?: () => void) => Promise<void>;

function Controls({ st, send, onClimate }: { st: HAState; send: Send; onClimate: (id: string) => void }) {
  const id = st.entity_id;
  const a = st.attributes;
  const domain = domainOf(id);
  const on = st.state === "on" || st.state === "playing" || st.state === "open";

  if (domain === "light") return <LightControls st={st} send={send} />;
  if (domain === "switch" || domain === "humidifier" || domain === "fan") {
    return (
      <>
        <div className="dc-row">
          <Btn label={on ? "Turn off" : "Turn on"} active={on} onClick={() => void send({ domain, service: on ? "turn_off" : "turn_on", entity_id: id }, () => patchState(id, {}, on ? "off" : "on"))}>
            <PowerIcon size={14} /> {on ? "On" : "Off"}
          </Btn>
        </div>
        {domain === "humidifier" && (
          <Slider label="Target" unit="%" min={a.min_humidity ?? 30} max={a.max_humidity ?? 80} value={a.humidity ?? 50} onCommit={(v) => void send({ domain, service: "set_humidity", entity_id: id, data: { humidity: v } }, () => patchState(id, { humidity: v }))} />
        )}
        {domain === "fan" && a.percentage != null && <Slider label="Speed" unit="%" min={0} max={100} value={a.percentage} onCommit={(v) => void send({ domain, service: "set_percentage", entity_id: id, data: { percentage: v } }, () => patchState(id, { percentage: v }))} />}
      </>
    );
  }
  if (domain === "media_player") {
    const playing = st.state === "playing";
    const call = (service: string) => void send({ domain, service, entity_id: id });
    return (
      <>
        {(a.media_title || a.source) && (
          <p className="dc-title">
            {a.media_title ?? a.source}
            {a.media_artist && <small>{a.media_artist}</small>}
          </p>
        )}
        <div className="dc-row dc-transport">
          <button className="icon-btn" aria-label="Previous track" onClick={() => call("media_previous_track")}><CaretLeftIcon size={16} /></button>
          <Btn label={playing ? "Pause" : "Play"} active={playing} onClick={() => void send({ domain, service: playing ? "media_pause" : "media_play", entity_id: id }, () => patchState(id, {}, playing ? "paused" : "playing"))}>
            {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />} {playing ? "Pause" : "Play"}
          </Btn>
          <button className="icon-btn" aria-label="Next track" onClick={() => call("media_next_track")}><CaretRightIcon size={16} /></button>
        </div>
        {a.volume_level != null && <Slider label="Volume" unit="%" min={0} max={100} value={Math.round(a.volume_level * 100)} onCommit={(v) => void send({ domain, service: "volume_set", entity_id: id, data: { volume_level: v / 100 } }, () => patchState(id, { volume_level: v / 100 }))} />}
      </>
    );
  }
  if (domain === "cover") {
    return (
      <div className="dc-row dc-transport">
        <Btn label="Open" onClick={() => void send({ domain, service: "open_cover", entity_id: id })}>Open</Btn>
        <Btn label="Stop" onClick={() => void send({ domain, service: "stop_cover", entity_id: id })}>Stop</Btn>
        <Btn label="Close" onClick={() => void send({ domain, service: "close_cover", entity_id: id })}>Close</Btn>
      </div>
    );
  }
  if (domain === "climate") {
    return (
      <div className="dc-row">
        <Btn label="Open thermostat" onClick={() => onClimate(id)}>Open thermostat</Btn>
      </div>
    );
  }
  return null;
}

/** Compact HUD popover for one entity: per-domain controls through the service allowlist, read-only state for sensors. */
export default function DeviceCard({ target, onClose, onClimate }: { target: DeviceTarget; onClose: () => void; onClimate: (id: string) => void }) {
  const st = useStore((s) => s.states[target.entity]);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const numeric = domainOf(target.entity) === "sensor" && st && Number.isFinite(Number(st.state));
  const trend = useSeries(numeric ? [target.entity] : [], 6)[target.entity];

  useDismiss(root, onClose);
  useEffect(() => { setError(null); root.current?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true }); }, [target.entity]);

  const send: Send = async (call, after) => {
    const err = await runService(call);
    setError(err);
    if (!err) after?.();
  };

  const style =
    target.x != null && target.y != null
      ? { left: Math.max(12, Math.min(hudViewport().width - WIDTH - 12, target.x / hudScale() + 18)), top: Math.max(60, Math.min(hudViewport().height - 380, target.y / hudScale() - 40)) }
      : undefined;
  const domain = domainOf(target.entity);
  const bad = st?.state === "unavailable" || st?.state === "unknown";
  const unit = st?.attributes.unit_of_measurement;
  const open = domain === "binary_sensor" && isOpenState(st) ? (st?.attributes.device_class === "door" || st?.attributes.device_class === "window" ? "OPEN" : "ON") : undefined;

  return (
    <div ref={root} className={`devcard ${style ? "" : "center"}`} style={style} role="dialog" aria-label={`Device ${st?.attributes.friendly_name ?? target.entity}`}>
      <HudPanel title={domain.replace(/_/g, " ")} meta={target.entity} onClose={onClose} className="dc">
        <h2 className="hud-name">{st?.attributes.friendly_name ?? target.entity}</h2>
        {!st ? (
          <p className="field-note warn">Not reported by Home Assistant.</p>
        ) : (
          <>
            <div className="dc-state">
              <span className={`t-val ${bad ? "warn" : ""}`}>{open ?? `${st.state.replace(/_/g, " ")}${unit && !bad ? ` ${unit}` : ""}`}</span>
              <small>{`changed ${ago(st.last_changed)}`}</small>
            </div>
            {domain === "vacuum" && <VacuumNote entity={target.entity} />}
            {trend && <div className="dc-trend"><MonoLabel>Last 6 h</MonoLabel><Sparkline line={trend} width={200} height={34} /></div>}
            {!bad && <Controls st={st} send={send} onClimate={onClimate} />}
          </>
        )}
        {error && <p className="field-note warn" role="alert">{error}</p>}
      </HudPanel>
    </div>
  );
}
