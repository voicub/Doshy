"use client";
import { useShallow } from "zustand/react/shallow";
import { entityLabel, liveSummary, weatherIds } from "@/lib/liveSky";
import { MOON_LABEL, moonDiscPath, type Moon } from "@/lib/moon";
import { useSkySettings } from "@/lib/sky";
import { useSky } from "@/lib/useSky";
import { useStore } from "@/lib/store";
import { usePressure } from "@/lib/usePressure";
import { tendencyArrow } from "@/lib/pressure";
import Segmented from "./Segmented";
import { setRealSky, useFollowsReality } from "./skyControls";
import "./realSky.css";

/** The moon as a small disc: the lit part filled, the rest outlined. */
export function MoonGlyph({ moon, size = 14 }: { moon: Moon; size?: number }) {
  return (
    <svg className="moon-glyph" width={size} height={size} viewBox="-8 -8 16 16" aria-hidden>
      <circle r="7" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.55" />
      <path d={moonDiscPath(moon.phase, 7)} fill="currentColor" />
    </svg>
  );
}

/** The moon's phase in plain words, and where it came from. */
export const moonText = (moon: Moon, source: "ha" | "computed") => `${MOON_LABEL[moon.name]}, ${Math.round(moon.illumination * 100)}% lit${source === "ha" ? " (from Home Assistant)" : ""}`;

const switchHint = (real: boolean, summary: string) =>
  real ? `Following the real sky: ${summary}. Click to keep your own choices instead.` : "Using your own choices for time, weather and wind. Click to follow the real sun, weather and wind again.";

/** The one switch for "show what is really outside": time, weather and wind all follow reality, or the owner's own choices (restored when it is switched off). */
export function RealSkyButton() {
  const real = useFollowsReality();
  const sky = useSky();
  const tendency = usePressure((s) => s.tendency);
  return (
    <button type="button" className="t-btn t-real" aria-pressed={real} title={switchHint(real, liveSummary(sky))} onClick={() => setRealSky(!real, sky)}>
      <span>Real sky</span>
      {real && <small className="t-livetag">Live</small>}
      {real && tendency && <small title={tendency.label}>{tendencyArrow(tendency)}</small>}
    </button>
  );
}

/** The same switch as a full-width row for the compact menus. */
export function RealSkyRow() {
  const real = useFollowsReality();
  const sky = useSky();
  return (
    <button type="button" className="more-row cm-real" aria-pressed={real} onClick={() => setRealSky(!real, sky)}>
      <span className="more-text">
        Real sky and weather
        <small>{real ? `Live: ${liveSummary(sky)}` : "Off: your own choices. Tap to follow reality."}</small>
      </span>
    </button>
  );
}

/** Which `weather.*` entity auto follows: ids to pick from, "auto" first, and the one in force (a pick that vanished from Home Assistant counts as automatic). */
function useWeatherSource() {
  const ids = useStore(useShallow((s) => weatherIds(s.states)));
  const choice = useSkySettings((s) => s.weatherEntity);
  const set = useSkySettings((s) => s.setWeatherEntity);
  return { options: ["auto", ...ids], shown: ids.includes(choice) ? choice : "auto", set };
}

const sourceLabel = (id: string) => (id === "auto" ? "automatic" : entityLabel(id));

/** Weather entities as radio items for the weather menu (nothing to choose when the home has at most one). */
export function WeatherSourceItems({ onPick }: { onPick: () => void }) {
  const { options, shown, set } = useWeatherSource();
  if (options.length < 3) return null;
  return (
    <>
      <div className="t-sep" role="separator" />
      <div className="t-sect" role="presentation">Weather from</div>
      {options.map((id) => (
        <button key={id} role="menuitemradio" aria-checked={id === shown} className="t-item" onClick={() => { set(id); onPick(); }}>
          <span>{sourceLabel(id)}</span>
        </button>
      ))}
    </>
  );
}

/** The same choice as inline buttons for the compact menus. */
export function WeatherSourceChoices() {
  const { options, shown, set } = useWeatherSource();
  if (options.length < 3) return null;
  return <Segmented className="cm-seg" label="Weather from" value={shown} options={options} onChange={set} format={sourceLabel} />;
}
