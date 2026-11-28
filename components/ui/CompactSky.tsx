"use client";
import { FilmSlateIcon } from "@phosphor-icons/react";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { toggleReplay, useReplay } from "@/lib/replay";
import { useChromeUi } from "./chromeUi";
import type { ReactNode } from "react";
import { HOLIDAY_IDS, HOLIDAY_LABEL, SEASONS } from "@/lib/season";
import { useSkySettings } from "@/lib/sky";
import { useSky } from "@/lib/useSky";
import { useStore, type Environment } from "@/lib/store";
import { WIND_PRESETS, compass8 } from "@/lib/wind";
import { useDeclutter } from "../scene/declutterState";
import LevelViewToggle from "./LevelViewToggle";
import LiveLayerSwitch from "./LiveLayerSwitch";
import Segmented from "./Segmented";
import { TIME_CHOICES, WEATHER_CHOICES, setTimeChoice, type TimeChoice } from "./skyControls";
import { RealSkyRow, WeatherSourceChoices, moonText } from "./RealSky";
import SeasonPreview from "./SeasonPreview";

const ENVS: readonly Environment[] = ["studio", "garden"];
const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const HOLIDAY_CHOICES = ["auto", "none", ...HOLIDAY_IDS] as const;
const SEASON_CHOICES = ["auto", ...SEASONS] as const;

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="cm-group" role="group" aria-label={label}>
    <span className="label">{label}</span>
    {children}
  </div>
);

/** Time of day, weather, wind and season as plain inline choices (the desktop bar hides these in pop-up menus). */
export function SkyControls() {
  const sky = useSky();
  const s = useSkySettings();
  const time = useStore((st) => st.time);
  const timeValue: TimeChoice = s.timeMode === "auto" ? "auto" : time;
  const el = Math.round(sky.elevation);
  const windValue = s.windMode === "auto" ? "auto" : (WIND_PRESETS.find((p) => Math.abs(p.speed - s.windSpeed) < 0.5)?.label.toLowerCase() ?? "");
  const windOptions = ["auto", ...WIND_PRESETS.map((p) => p.label.toLowerCase())] as const;
  return (
    <>
      <div className="more-grid"><RealSkyRow /></div>
      <Group label={`Time of day${s.timeMode === "auto" ? `, sun ${el >= 0 ? "+" : "-"}${Math.abs(el)} degrees` : ""}${sky.phase !== "day" ? `, ${moonText(sky.moon, sky.moonSource)}` : ""}`}>
        <Segmented className="cm-seg" label="Time of day" value={timeValue} options={TIME_CHOICES} onChange={setTimeChoice} />
      </Group>
      <Group label="Weather">
        <Segmented className="cm-seg" label="Weather" value={s.weatherMode} options={WEATHER_CHOICES} onChange={s.setWeatherMode} format={(c) => (c === "auto" ? "auto (from HA)" : c)} />
        <WeatherSourceChoices />
      </Group>
      <Group label="Wind">
        <Segmented className="cm-seg" label="Wind strength" value={windValue} options={windOptions} onChange={(v) => (v === "auto" ? s.setWindMode("auto") : s.setWind({ windSpeed: WIND_PRESETS.find((p) => p.label.toLowerCase() === v)?.speed ?? s.windSpeed }))} />
        {s.windMode === "manual" && <Segmented className="cm-seg" label="Wind comes from" value={compass8(s.windFrom)} options={DIRS} onChange={(d) => s.setWind({ windFrom: DIRS.indexOf(d) * 45 })} />}
      </Group>
      <Group label="Season">
        <Segmented className="cm-seg" label="Season" value={s.seasonMode} options={SEASON_CHOICES} onChange={s.setSeasonMode} format={(c) => (c === "auto" ? "follow the real date" : c)} />
        <SeasonPreview />
      </Group>
      <details className="cm-details">
        <summary>Holidays</summary>
        <Segmented className="cm-seg" label="Holiday decoration" value={s.holidayMode} options={HOLIDAY_CHOICES} onChange={s.setHolidayMode} format={(c) => (c === "auto" || c === "none" ? c : HOLIDAY_LABEL[c])} />
        <Segmented className="cm-seg" label="Easter rite" value={s.easterRite} options={["orthodox", "western"] as const} onChange={s.setEasterRite} />
      </details>
    </>
  );
}

/** Scene options of the Live view: layer, levels, environment, cut-away, declutter and cinema. */
export function SceneControls({ onCinema }: { onCinema: () => void }) {
  const environment = useStore((s) => s.environment);
  const setEnvironment = useStore((s) => s.setEnvironment);
  const cutaway = useStore((s) => s.cutaway);
  const replayOpen = useReplay((s) => s.open);
  const setCutaway = useStore((s) => s.setCutaway);
  const declutter = useDeclutter((s) => s.on);
  const setDeclutter = useDeclutter((s) => s.set);
  return (
    <>
      <div className="cm-embed"><LiveLayerSwitch /></div>
      <div className="cm-embed"><LevelViewToggle /></div>
      <Group label="Surroundings">
        <Segmented className="cm-seg" label="Environment" value={environment} options={ENVS} onChange={setEnvironment} />
      </Group>
      <div className="more-grid">
        <button type="button" className={`more-row ${cutaway ? "active" : ""}`} aria-pressed={cutaway} onClick={() => setCutaway(!cutaway)}>
          <span className="more-text">Cut-away walls<small>{cutaway ? "All walls low" : "Auto: walls facing you are cut"}</small></span>
        </button>
        <button type="button" className={`more-row ${declutter ? "active" : ""}`} aria-pressed={declutter} onClick={() => setDeclutter(!declutter)}>
          <span className="more-text">Tidy labels</span>
        </button>
        <button type="button" className={`more-row ${replayOpen ? "active" : ""}`} aria-pressed={replayOpen} onClick={() => { toggleReplay(); useChromeUi.getState().setMenu(false); }}>
          <ClockCounterClockwiseIcon size={18} />
          <span className="more-text">History replay<small>Scrub the last 24 hours or 7 days</small></span>
        </button>
        <button type="button" className="more-row" onClick={onCinema}>
          <FilmSlateIcon size={18} />
          <span className="more-text">Cinema</span>
        </button>
      </div>
    </>
  );
}
