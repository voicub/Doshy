import { WEATHER_KINDS, useSkySettings, type WeatherKind } from "@/lib/sky";
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
