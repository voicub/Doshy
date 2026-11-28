import { isRecord } from "./guards.ts";
import type { TimeOfDay } from "./store";
import type { SkyState, Weather, WeatherKind } from "./sky.ts";
import { moonFromName, type MoonName } from "./moon.ts";
import { windFromSensors, windToMs } from "./wind.ts";

/** Home Assistant states as the sky reads them: attributes are whatever JSON the server sent, so every value is validated before use (a `HAState` fits). */
export type RawStates = Record<string, { entity_id: string; state: string; attributes: Record<string, unknown> }>;

/**
 * What the sky needs from Home Assistant, read once and validated into plain numbers and strings (nothing nested), so two readings can be
 * compared field by field: a poll that changes nothing the sky uses never recomputes it or re-renders the scene.
 */
export type SkyInputs = {
  sunEl?: number;
  sunAz?: number;
  lat?: number;
  lon?: number;
  /** id of the weather entity followed */
  weatherId?: string;
  /** its state, e.g. "partlycloudy" */
  condition?: string;
  /** 0..100 */
  cloudPct?: number;
  /** mm per hour */
  precipMmh?: number;
  visibilityKm?: number;
  tempC?: number;
  /** m/s */
  windMs?: number;
  /** degrees the wind blows FROM */
  windFrom?: number;
  gustMs?: number;
  moon?: MoonName;
  /** Observed change in hPa over three hours; never replaces explicit weather. */
  pressureDelta3h?: number;
};

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const CONDITIONS: Record<string, { kind: WeatherKind; intensity: number; cloud: number }> = {
  sunny: { kind: "clear", intensity: 0, cloud: 0.05 },
  "clear-night": { kind: "clear", intensity: 0, cloud: 0.05 },
  windy: { kind: "clear", intensity: 0, cloud: 0.25 },
  "windy-variant": { kind: "cloudy", intensity: 0, cloud: 0.6 },
  partlycloudy: { kind: "cloudy", intensity: 0, cloud: 0.45 },
  cloudy: { kind: "cloudy", intensity: 0, cloud: 0.85 },
  exceptional: { kind: "cloudy", intensity: 0, cloud: 0.9 },
  fog: { kind: "fog", intensity: 0.7, cloud: 0.7 },
  rainy: { kind: "rain", intensity: 0.5, cloud: 0.9 },
  pouring: { kind: "rain", intensity: 1, cloud: 1 },
  hail: { kind: "storm", intensity: 0.6, cloud: 1 },
  lightning: { kind: "storm", intensity: 0.4, cloud: 0.95 },
  "lightning-rainy": { kind: "storm", intensity: 0.85, cloud: 1 },
  snowy: { kind: "snow", intensity: 0.6, cloud: 0.9 },
  "snowy-rainy": { kind: "snow", intensity: 0.7, cloud: 0.95 },
};

/** Preset used when the weather mode is forced from the HUD. */
const FORCED: Record<WeatherKind, { intensity: number; cloud: number }> = {
  clear: { intensity: 0, cloud: 0.05 },
  cloudy: { intensity: 0, cloud: 0.85 },
  fog: { intensity: 0.7, cloud: 0.7 },
  rain: { intensity: 0.7, cloud: 0.95 },
  storm: { intensity: 0.9, cloud: 1 },
  snow: { intensity: 0.6, cloud: 0.9 },
};

// A weather entity reports its numbers in the units set in Home Assistant; everything here is converted to metric first.
const toCelsius = (v: number, unit: unknown) => (typeof unit === "string" && /f/i.test(unit) ? (v - 32) / 1.8 : v);
const toMmPerHour = (v: number, unit: unknown) => (typeof unit === "string" && /^in/i.test(unit.trim()) ? v * 25.4 : v);
const VISIBILITY_KM: Record<string, number> = { km: 1, m: 0.001, mi: 1.609344, ft: 0.0003048, yd: 0.0009144 };
const toKm = (v: number, unit: unknown) => v * (typeof unit === "string" ? (VISIBILITY_KM[unit.trim().toLowerCase()] ?? 1) : 1);

/** 0..1 how hard it rains or snows for a precipitation rate: a drizzle is light, 7 mm/h is heavy, 20 mm/h and more is a downpour. */
export const precipIntensity = (mmPerHour: number): number => clamp01(0.15 + 0.85 * (1 - Math.exp(-mmPerHour / 6)));

/** 0..1 how thick the fog is for a visibility in km: 1 km is dense, 5 km is a light haze. */
export const fogThickness = (visibilityKm: number): number => clamp01(1 - visibilityKm / 6);

/** The weather entities, by id. */
export const weatherIds = (states: Record<string, unknown>): string[] => Object.keys(states).filter((id) => id.startsWith("weather.")).sort((a, b) => a.localeCompare(b));

/** `weather.home`, `weather.forecast_home`, `weather.my_home_2`: the entity Home Assistant creates for the home itself. */
const HOME_LIKE = /^weather\.(.*_)?home(_.*)?$/;

/** The entity to follow: the owner's pick when it still exists, else one named like the home, else the first by id. */
export function findWeatherId(states: Record<string, unknown>, choice: string = "auto"): string | undefined {
  if (choice !== "auto" && choice.startsWith("weather.") && states[choice]) return choice;
  const ids = weatherIds(states);
  return ids.find((id) => HOME_LIKE.test(id)) ?? ids[0];
}

const MOON_SENSORS = ["sensor.moon_phase", "sensor.moon"];

/** Home Assistant's own moon phase (sensor.moon_phase / sensor.moon / moon.*), when one reports a real phase. */
function findMoonName(states: RawStates): MoonName | undefined {
  const ids = [...MOON_SENSORS, ...Object.keys(states).filter((id) => id.startsWith("moon.")).sort((a, b) => a.localeCompare(b))];
  for (const id of ids) {
    const m = moonFromName(states[id]?.state ?? "");
    if (m) return m.name;
  }
  return undefined;
}

/** Everything the sky reads from the Home Assistant states: the sun, the home position, the weather entity (or the wind sensors) and the moon. */
export function readInputs(states: RawStates, weatherChoice: string = "auto"): SkyInputs {
  const sun = states["sun.sun"]?.attributes;
  const sunKnown = num(sun?.elevation) !== undefined && num(sun?.azimuth) !== undefined;
  const home = states["zone.home"]?.attributes;
  const weatherId = findWeatherId(states, weatherChoice);
  const ha = weatherId ? states[weatherId] : undefined;
  const a: Record<string, unknown> = ha?.attributes ?? {};
  const entityWind = num(a.wind_speed);
  const station = entityWind === undefined ? windFromSensors(states) : {};
  const gust = num(a.wind_gust_speed);
  const temp = num(a.temperature);
  const precip = num(a.precipitation) ?? num(a.precipitation_intensity);
  const visibility = num(a.visibility);
  return {
    sunEl: sunKnown ? num(sun?.elevation) : undefined,
    sunAz: sunKnown ? num(sun?.azimuth) : undefined,
    lat: num(home?.latitude),
    lon: num(home?.longitude),
    weatherId,
    condition: ha?.state,
    cloudPct: num(a.cloud_coverage),
    precipMmh: precip === undefined ? undefined : toMmPerHour(precip, a.precipitation_unit),
    visibilityKm: visibility === undefined ? undefined : toKm(visibility, a.visibility_unit),
    tempC: temp === undefined ? undefined : toCelsius(temp, a.temperature_unit),
    windMs: entityWind === undefined ? station.speed : windToMs(entityWind, a.wind_speed_unit, "km/h"),
    windFrom: num(a.wind_bearing) ?? station.from,
    gustMs: gust === undefined ? undefined : windToMs(gust, a.wind_speed_unit, "km/h"),
    moon: findMoonName(states),
  };
}

/** Rain that falls below freezing is snow, and sleet in a warm spell is rain: the entity's condition is only right in the middle. */
export function kindAtTemperature(kind: WeatherKind, condition: string, tempC: number | undefined): WeatherKind {
  if (tempC === undefined) return kind;
  if (kind === "rain" && tempC <= -1) return "snow";
  if (condition === "snowy-rainy" && tempC >= 3) return "rain";
  return kind;
}

/**
 * The weather the scene shows. The entity's condition sets the kind; its numbers refine it: cloud coverage wins over the condition's guess,
 * precipitation scales rain and snow, visibility thickens fog. The wind comes from a manual override, else the entity, else a station's sensors.
 */
export function weatherFromInputs(i: SkyInputs, mode: "auto" | WeatherKind, windOverride?: { speed: number; from: number }): Weather {
  const base = {
    wind: windOverride ? windOverride.speed : (i.windMs ?? 0),
    windFrom: windOverride ? windOverride.from : i.windFrom,
    gust: windOverride ? undefined : i.gustMs,
    temp: i.tempC,
    entity: i.weatherId,
  };
  if (mode !== "auto") return { kind: mode, ...FORCED[mode], ...base, condition: "manual" };
  // A barometer cannot predict precipitation: only add a small readiness haze/cloud nudge, never invent rain.
  if (!i.weatherId && i.pressureDelta3h !== undefined && i.pressureDelta3h < -3.5) {
    const readiness = clamp01((-i.pressureDelta3h - 3.5) / 6);
    return { kind: "cloudy", intensity: 0, cloud: 0.1 + readiness * 0.25, ...base, condition: "pressure tendency" };
  }
  const c = i.condition !== undefined && Object.hasOwn(CONDITIONS, i.condition) ? CONDITIONS[i.condition] : undefined;
  const known: { kind: WeatherKind; intensity: number; cloud: number } = c ?? { kind: "clear", intensity: 0, cloud: 0.1 };
  const kind = kindAtTemperature(known.kind, i.condition ?? "", i.tempC);
  const falling = kind === "rain" || kind === "snow";
  const intensity = falling && i.precipMmh !== undefined && i.precipMmh > 0 ? precipIntensity(i.precipMmh) : kind === "fog" && i.visibilityKm !== undefined ? fogThickness(i.visibilityKm) : known.intensity;
  const cloud = i.cloudPct === undefined ? known.cloud : clamp01(i.cloudPct / 100);
  return { kind, intensity, cloud, ...base, condition: i.condition ?? "unknown" };
}

/** The three things the "Real sky and weather" switch controls: each is either following reality ("auto") or pinned by the owner. */
export type SkyPins = {
  time: "auto" | TimeOfDay;
  weather: "auto" | WeatherKind;
  wind: "auto" | { speed: number; from: number };
};

export const REAL_PINS: SkyPins = { time: "auto", weather: "auto", wind: "auto" };

export const followsReality = (p: SkyPins): boolean => p.time === "auto" && p.weather === "auto" && p.wind === "auto";

/**
 * What the switch does when turned off: the owner's earlier manual choices when there are any, else the sky as it is right now (so switching
 * off freezes what is on screen instead of jumping to something else).
 */
export function pinsWhenOff(earlier: SkyPins | null, now: { phase: TimeOfDay; kind: WeatherKind; windSpeed: number; windFrom: number }): SkyPins {
  if (earlier && !followsReality(earlier)) return earlier;
  return { time: now.phase, weather: now.kind, wind: { speed: now.windSpeed, from: now.windFrom } };
}

const isKind = (v: unknown): v is WeatherKind => typeof v === "string" && Object.hasOwn(FORCED, v);
const isTime = (v: unknown): v is TimeOfDay => v === "day" || v === "dusk" || v === "night";

/** Stored pins of any shape: a complete valid set, or null. */
export function parsePins(v: unknown): SkyPins | null {
  if (!isRecord(v)) return null;
  const time = v.time === "auto" || isTime(v.time) ? v.time : null;
  const weather = v.weather === "auto" || isKind(v.weather) ? v.weather : null;
  const w = v.wind;
  const wind = w === "auto" ? w : isRecord(w) && num(w.speed) !== undefined && num(w.from) !== undefined ? { speed: num(w.speed) ?? 0, from: num(w.from) ?? 0 } : null;
  return time && weather && wind ? { time, weather, wind } : null;
}

/** "weather.forecast_home" -> "forecast home": the entity's id as plain words (its friendly name is not part of the sky's inputs). */
export const entityLabel = (id: string): string => id.slice(id.indexOf(".") + 1).replace(/_/g, " ");

/** Where the sun, weather and moon come from, in plain English, for the "Live" tag's tooltip. */
export function liveSummary(sky: Pick<SkyState, "source" | "weather" | "moonSource">): string {
  const sun = sky.source === "sun.sun" ? "the sun from Home Assistant" : sky.source === "computed" ? "the sun worked out from your home's position" : "a sun you picked";
  const weather = sky.weather.condition === "manual" ? "a weather you picked" : sky.weather.entity ? `the weather from "${entityLabel(sky.weather.entity)}"` : "no weather entity found (clear sky)";
  const moon = sky.moonSource === "ha" ? "the moon from Home Assistant" : "the moon worked out from the date";
  return `${sun}, ${weather}, ${moon}`;
}
