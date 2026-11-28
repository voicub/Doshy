import { REAL_PINS, followsReality, pinsWhenOff, type SkyPins } from "@/lib/liveSky";
import { WEATHER_KINDS, useSkySettings, type SkyState, type WeatherKind } from "@/lib/sky";
import { useStore, type TimeOfDay } from "@/lib/store";

export type TimeChoice = "auto" | TimeOfDay;
export type WeatherChoice = "auto" | WeatherKind;

export const TIME_CHOICES: readonly TimeChoice[] = ["auto", "day", "dusk", "night"];
export const WEATHER_CHOICES: readonly WeatherChoice[] = ["auto", ...WEATHER_KINDS];

/** AUTO follows the real sun; day / dusk / night pin the scene to that preset. */
export function setTimeChoice(c: TimeChoice) {
  const sky = useSkySettings.getState();
  if (c === "auto") return sky.setTimeMode("auto");
  sky.setTimeMode("manual");
  useStore.getState().setTime(c);
}

/** T key: day -> dusk -> night -> day. From AUTO it starts at the preset after the current store preset. */
export function cycleTime() {
  const next: Record<TimeOfDay, TimeOfDay> = { day: "dusk", dusk: "night", night: "day" };
  setTimeChoice(next[useStore.getState().time]);
}

/** W key: forced weathers in order, then back to AUTO. */
export function cycleWeather() {
  const { weatherMode, setWeatherMode } = useSkySettings.getState();
  setWeatherMode(WEATHER_CHOICES[(WEATHER_CHOICES.indexOf(weatherMode) + 1) % WEATHER_CHOICES.length]);
}

/** True while time, weather and wind all follow reality (the "Real sky and weather" switch is on). */
export const useFollowsReality = () => useSkySettings((s) => s.timeMode === "auto" && s.weatherMode === "auto" && s.windMode === "auto");

function currentPins(): SkyPins {
  const s = useSkySettings.getState();
  return { time: s.timeMode === "auto" ? "auto" : useStore.getState().time, weather: s.weatherMode, wind: s.windMode === "auto" ? "auto" : { speed: s.windSpeed, from: s.windFrom } };
}

function applyPins(p: SkyPins) {
  const sky = useSkySettings.getState();
  setTimeChoice(p.time);
  sky.setWeatherMode(p.weather);
  if (p.wind === "auto") sky.setWindMode("auto");
  else sky.setWind({ windSpeed: p.wind.speed, windFrom: p.wind.from });
}

/**
 * The "Real sky and weather" switch. On: time, weather and wind follow reality (the owner's manual choices are kept aside).
 * Off: those manual choices come back, or, when there were none, what is on screen right now stays put.
 */
export function setRealSky(on: boolean, sky: SkyState) {
  const { lastPins, windFrom, setLastPins } = useSkySettings.getState();
  if (on) {
    const pins = currentPins();
    if (!followsReality(pins)) setLastPins(pins);
    applyPins(REAL_PINS);
  } else {
    applyPins(pinsWhenOff(lastPins, { phase: sky.phase, kind: sky.weather.kind, windSpeed: sky.weather.wind, windFrom: sky.weather.windFrom ?? windFrom }));
  }
}
