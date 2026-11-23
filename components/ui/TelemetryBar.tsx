"use client";
import { CloudFogIcon, CloudIcon, CloudLightningIcon, CloudRainIcon, CloudSnowIcon, FilmSlateIcon, MoonIcon, SunIcon, type Icon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useSkySettings, type WeatherKind } from "@/lib/sky";
import { WIND_PRESETS, beaufort, compass8 } from "@/lib/wind";
import { useSky } from "@/lib/useSky";
import { useStore, type Environment } from "@/lib/store";
import MonoLabel from "./MonoLabel";
import usePopupMenu from "./usePopupMenu";
import CalendarChip from "./CalendarChip";
import InboxChip from "./InboxChip";
import SeasonControls from "./SeasonControls";
import Segmented from "./Segmented";
import { ClimateChip, OpenChip } from "./StatusChips";
import LaundryChip from "./LaundryChip";
import { TIME_CHOICES, WEATHER_CHOICES, setTimeChoice, type TimeChoice, type WeatherChoice } from "./skyControls";
import { useDeclutter } from "../scene/declutterState";

const ENVS: readonly Environment[] = ["studio", "garden"];
export const WEATHER_ICON: Record<WeatherKind, Icon> = { clear: SunIcon, cloudy: CloudIcon, fog: CloudFogIcon, rain: CloudRainIcon, storm: CloudLightningIcon, snow: CloudSnowIcon };

function Clock() {
  const [now, setNow] = useState<Date | null>(null); // null until mounted, keeps SSR markup stable
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="t-cell t-clock">
      <MonoLabel>Local</MonoLabel>
      <time className="t-val">{now ? now.toLocaleTimeString("en-GB") : "--:--:--"}</time>
    </div>
  );
}

/** Weather chip: icon, temperature, HA condition. Opens a menu to follow Home Assistant or force a weather. */
function WeatherChip() {
  const sky = useSky();
  const mode = useSkySettings((s) => s.weatherMode);
  const setMode = useSkySettings((s) => s.setWeatherMode);
  const { windMode, windSpeed, windFrom, setWindMode, setWind } = useSkySettings();
  const { open, setOpen, root, btn, close, onMenuKey } = usePopupMenu('[aria-checked="true"]');

  const w = sky.weather;
  const Glyph = w.kind === "clear" && sky.phase === "night" ? MoonIcon : WEATHER_ICON[w.kind];
  const cond = w.condition === "manual" ? w.kind : w.condition.replace(/[-_]/g, " ");
  const temp = w.temp != null ? `${Math.round(w.temp)} C` : null;
  const wind = `wind ${w.wind.toFixed(1)} m/s (${beaufort(w.wind).name.toLowerCase()})${w.windFrom != null ? ` from ${compass8(w.windFrom)}` : ""}${windMode === "manual" ? ", set by you" : ""}`;
  const tip = `${cond}${temp ? `, ${temp}` : ""}, ${wind}${mode === "auto" ? " (follows Home Assistant)" : " (forced)"}`;

  const pick = (c: WeatherChoice) => { setMode(c); close(); };

  return (
    <div className="t-weather" ref={root}>
      <button ref={btn} className="t-btn t-wx" aria-haspopup="menu" aria-expanded={open} aria-label={`Weather: ${tip}`} title={tip} onClick={() => setOpen((o) => !o)}>
        <Glyph size={15} weight="regular" />
        {temp && <span className="t-val">{temp}</span>}
        <span className="t-cond">{cond}</span>
        {mode !== "auto" && <i className="t-forced" aria-hidden />}
      </button>
      {open && (
        <div className="t-menu hud" role="menu" aria-label="Weather source" onKeyDown={onMenuKey}>
          {WEATHER_CHOICES.map((c) => (
            <button key={c} role="menuitemradio" aria-checked={c === mode} className="t-item" onClick={() => pick(c)}>
              <span>{c}</span>
              {c === "auto" && <small>follows HA</small>}
            </button>
          ))}
          <div className="t-sep" role="separator" />
          <button role="menuitemradio" aria-checked={windMode === "auto"} className="t-item" onClick={() => setWindMode("auto")}>
            <span>wind: auto</span>
            <small>{`${beaufort(w.wind).name.toLowerCase()}`}</small>
          </button>
          {WIND_PRESETS.map((p) => (
            <button key={p.label} role="menuitemradio" aria-checked={windMode === "manual" && Math.abs(windSpeed - p.speed) < 0.5} className="t-item" onClick={() => setWind({ windSpeed: p.speed })}>
              <span>{`wind: ${p.label.toLowerCase()}`}</span>
              <small>{`${p.speed} m/s`}</small>
            </button>
          ))}
          <div className="t-winddir" role="group" aria-label="Wind comes from">
            {(["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const).map((d, i) => (
              <button key={d} role="menuitemradio" aria-checked={windMode === "manual" && compass8(windFrom) === d} className="t-item t-dir" title={`Wind from ${d}`} onClick={() => setWind({ windFrom: i * 45 })}>
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Time of day: AUTO follows the real sun, the rest pin a preset. */
function TimeControl() {
  const timeMode = useSkySettings((s) => s.timeMode);
  const time = useStore((s) => s.time);
  const sky = useSky();
  const value: TimeChoice = timeMode === "auto" ? "auto" : time;
  const el = Math.round(sky.elevation);
  return (
    <>
      <Segmented label="Time of day" value={value} options={TIME_CHOICES} onChange={setTimeChoice} />
      {timeMode === "auto" && (
        <div className="t-cell t-sun" title={`Sun elevation, ${sky.source === "sun.sun" ? "from Home Assistant sun.sun" : "computed from the home position"}`} aria-label={`Sun elevation ${el} degrees`}>
          <MonoLabel>Sun</MonoLabel>
          <span className="t-val">{`${el >= 0 ? "+" : "-"}${Math.abs(el)} DEG`}</span>
        </div>
      )}
    </>
  );
}

export default function TelemetryBar({ lit, total, climate, onClimate }: { lit: number; total: number; climate: boolean; onClimate: () => void }) {
  const view = useStore((s) => s.view);
  const environment = useStore((s) => s.environment);
  const setEnvironment = useStore((s) => s.setEnvironment);
  const cutaway = useStore((s) => s.cutaway);
  const setCutaway = useStore((s) => s.setCutaway);
  const setCinema = useStore((s) => s.setCinema);
  const declutter = useDeclutter((s) => s.on);
  const setDeclutter = useDeclutter((s) => s.set);
  const declutterBtn = (
    <button className="t-btn" aria-pressed={declutter} onClick={() => setDeclutter(!declutter)} title="Keeps labels apart, folds piles into a numbered marker and shrinks calm sensors to dots. Turn off to see every label exactly over its device.">
      Declutter
    </button>
  );
  return (
    <div className="telemetry hud brackets" role="toolbar" aria-label="Telemetry and scene controls">
      <Clock />
      {total > 0 && (
        <div className="t-cell" aria-label={`${lit} of ${total} lights on`}>
          <MonoLabel>Lights</MonoLabel>
          <span className="t-val">{lit}<i>/</i>{total}</span>
        </div>
      )}
      {view === "live" && (
        <>
          <OpenChip />
          <LaundryChip max={1} />
          <ClimateChip active={climate} onClick={onClimate} />
          <TimeControl />
          <WeatherChip />
          <SeasonControls />
          <Segmented className="t-env" label="Environment" value={environment} options={ENVS} onChange={setEnvironment} />
          {declutterBtn}
          <button className="t-btn" aria-pressed={cutaway} onClick={() => setCutaway(!cutaway)}>Cut-away</button>
          <button className="t-btn" onClick={() => setCinema(true)} aria-label="Cinema mode">
            <FilmSlateIcon size={14} /> <span className="t-lbl">Cinema</span>
          </button>
        </>
      )}
      {view === "ha" && declutterBtn}
      <CalendarChip />
      <InboxChip />
    </div>
  );
}
