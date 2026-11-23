import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "./dbClient.ts";
import type { HAState } from "./ha";
import type { TimeOfDay } from "./store";
import { HOLIDAY_IDS, SEASONS, holidayOn, nextSeason, seasonBlend, type EasterRite, type Holiday, type HolidayId, type Season, type SeasonBlend } from "./season.ts";
import { windFromSensors } from "./wind.ts";
import { isRecord } from "./guards.ts";

/**
 * Sun position, daylight phase and weather for the scene and the HUD.
 * Auto mode follows the real sun (Home Assistant's `sun.sun`, else computed from `zone.home` coordinates, else Bucharest)
 * and the real weather (the first `weather.*` entity). Manual modes override either independently.
 */
export type WeatherKind = "clear" | "cloudy" | "fog" | "rain" | "storm" | "snow";
export const WEATHER_KINDS: WeatherKind[] = ["clear", "cloudy", "fog", "rain", "storm", "snow"];

export type Weather = {
  kind: WeatherKind;
  /** 0..1 how hard it rains / snows / how thick the fog is (0 for clear and cloudy). */
  intensity: number;
  /** 0..1 cloud cover: dims the sun and greys the light. */
  cloud: number;
  /** wind speed in m/s */
  wind: number;
  /** degrees the wind blows FROM, clockwise from north (undefined when unknown) */
  windFrom?: number;
  temp?: number;
  /** raw Home Assistant condition (e.g. "partlycloudy") or "manual" */
  condition: string;
};

export type SkyState = {
  /** degrees above the horizon, negative below */
  elevation: number;
  /** degrees clockwise from north (plan north is -y, east +x) */
  azimuth: number;
  /** smooth 0 (night) .. 1 (full day): drives the lighting blend */
  daylight: number;
  /** coarse bucket for labels */
  phase: TimeOfDay;
  weather: Weather;
  source: "sun.sun" | "computed" | "manual";
  now: Date;
  /** season for the garden: the real one (with the cross-fade into the next) or the one forced from the HUD */
  season: SeasonBlend;
  /** the active holiday decoration, or null */
  holiday: Holiday | null;
};

type SkySettings = {
  timeMode: "auto" | "manual"; // manual uses the store's `time` preset (day/dusk/night)
  weatherMode: "auto" | WeatherKind;
  seasonMode: "auto" | Season;
  holidayMode: "auto" | "none" | HolidayId;
  easterRite: EasterRite;
  /** auto follows Home Assistant (weather entity or station sensors); manual uses windSpeed / windFrom */
  windMode: "auto" | "manual";
  windSpeed: number; // m/s
  windFrom: number; // degrees the wind blows FROM, clockwise from north
  setTimeMode: (m: "auto" | "manual") => void;
  setWeatherMode: (m: "auto" | WeatherKind) => void;
  setSeasonMode: (m: "auto" | Season) => void;
  setHolidayMode: (m: "auto" | "none" | HolidayId) => void;
  setEasterRite: (r: EasterRite) => void;
  setWindMode: (m: "auto" | "manual") => void;
  /** Set the manual wind (speed in m/s and/or the bearing it blows from) and switch to manual. */
  setWind: (p: { windSpeed?: number; windFrom?: number }) => void;
};

type SkyData = Pick<SkySettings, "timeMode" | "weatherMode" | "seasonMode" | "holidayMode" | "easterRite" | "windMode" | "windSpeed" | "windFrom">;

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => allowed.find((x) => x === v) ?? fallback;

/** Stored settings of any version: every field that is still valid is kept, the rest gets its default. */
function migrateSky(old: unknown): SkyData {
  const o = isRecord(old) ? old : {};
  return {
    timeMode: oneOf(o.timeMode, ["auto", "manual"], "auto"),
    weatherMode: oneOf(o.weatherMode, ["auto", ...WEATHER_KINDS], "auto"),
    seasonMode: oneOf(o.seasonMode, ["auto", ...SEASONS], "auto"),
    holidayMode: oneOf(o.holidayMode, ["auto", "none", ...HOLIDAY_IDS], "auto"),
    easterRite: oneOf(o.easterRite, ["orthodox", "western"], "orthodox"),
    windMode: oneOf(o.windMode, ["auto", "manual"], "auto"),
    windSpeed: typeof o.windSpeed === "number" && Number.isFinite(o.windSpeed) ? o.windSpeed : 4,
    windFrom: typeof o.windFrom === "number" && Number.isFinite(o.windFrom) ? o.windFrom : 270,
  };
}

const SKY_VERSION = 3;
const storage = dbStorage("housey-sky", "settings", SKY_VERSION);

export const useSkySettings = create<SkySettings>()(
  persist(
    (set) => ({
      timeMode: "auto",
      weatherMode: "auto",
      seasonMode: "auto",
      holidayMode: "auto",
      easterRite: "orthodox",
      windMode: "auto",
      windSpeed: 4,
      windFrom: 270,
      setTimeMode: (timeMode) => set({ timeMode }),
      setWeatherMode: (weatherMode) => set({ weatherMode }),
      setSeasonMode: (seasonMode) => set({ seasonMode }),
      setHolidayMode: (holidayMode) => set({ holidayMode }),
      setEasterRite: (easterRite) => set({ easterRite }),
      setWindMode: (windMode) => set({ windMode }),
      setWind: (p) => set({ windMode: "manual", ...p }),
    }),
    {
      name: "housey-sky",
      version: SKY_VERSION,
      storage: createJSONStorage(() => storage),
      // v1 only had timeMode / weatherMode, v2 had no wind override: keep what is there, default the rest
      partialize: (s): SkyData => ({ timeMode: s.timeMode, weatherMode: s.weatherMode, seasonMode: s.seasonMode, holidayMode: s.holidayMode, easterRite: s.easterRite, windMode: s.windMode, windSpeed: s.windSpeed, windFrom: s.windFrom }),
      migrate: migrateSky,
    },
  ),
);
storage.bind(() => void useSkySettings.persist.rehydrate());

const RAD = Math.PI / 180;
const BUCHAREST = { lat: 44.43, lon: 26.1 };

/** Solar elevation and azimuth (degrees, azimuth clockwise from north) for a UTC instant and a place. No atmospheric refraction. */
export function sunPosition(date: Date, lat: number, lon: number): { elevation: number; azimuth: number } {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const meanLon = (280.46 + 0.9856474 * n) % 360;
  const g = (((357.528 + 0.9856003 * n) % 360) * Math.PI) / 180;
  const lambda = (meanLon + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmstHours = (18.697374558 + 24.06570982441908 * n) % 24;
  const hourAngle = (gmstHours * 15 + lon) * RAD - ra; // positive toward the west
  const phi = lat * RAD;
  const elevation = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle));
  const azimuth = Math.atan2(-Math.sin(hourAngle), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(hourAngle));
  return { elevation: elevation / RAD, azimuth: (((azimuth / RAD) % 360) + 360) % 360 };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 below -8 degrees (night), 1 above +10 degrees (full day), smooth between (golden hour / twilight). */
export const daylightOf = (elevation: number) => smooth(-8, 10, elevation);
const phaseOf = (daylight: number): TimeOfDay => (daylight > 0.85 ? "day" : daylight < 0.15 ? "night" : "dusk");

/** Stand-in sun for the manual day / dusk / night presets. */
const MANUAL_SUN: Record<TimeOfDay, { elevation: number; azimuth: number }> = {
  day: { elevation: 48, azimuth: 150 },
  dusk: { elevation: 3, azimuth: 262 },
  night: { elevation: -30, azimuth: 20 },
};

const KMH = 1 / 3.6;

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

/** The weather entity to follow: the first `weather.*` state (stable by entity id). */
export function findWeather(states: Record<string, HAState>): HAState | undefined {
  return Object.values(states)
    .filter((s) => s.entity_id.startsWith("weather."))
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id))[0];
}

/**
 * Weather from Home Assistant, with the wind decided in this order: a manual override from the HUD, the weather entity's own wind attributes,
 * then a weather station's wind sensors (speed in m/s after unit conversion, direction the wind blows FROM).
 */
export function weatherOf(states: Record<string, HAState>, mode: "auto" | WeatherKind, windOverride?: { speed: number; from: number }): Weather {
  const ha = findWeather(states);
  const a = ha?.attributes;
  const station = a?.wind_speed === undefined ? windFromSensors(states) : {};
  const wind = windOverride ? windOverride.speed : station.speed ?? (a?.wind_speed ?? 0) * KMH;
  const windFrom = windOverride ? windOverride.from : a?.wind_bearing ?? station.from;
  const base = { wind, windFrom, temp: a?.temperature };
  if (mode !== "auto") return { kind: mode, ...FORCED[mode], ...base, condition: "manual" };
  const c = ha ? CONDITIONS[ha.state] : undefined;
  return ha && c ? { ...c, ...base, condition: ha.state } : { kind: "clear", intensity: 0, cloud: 0.1, ...base, condition: ha?.state ?? "unknown" };
}

/** Pure: everything the scene and HUD need for `now`, from HA states and the user's overrides. */
export function computeSky(
  states: Record<string, HAState>,
  now: Date,
  settings: Pick<SkySettings, "timeMode" | "weatherMode"> & Partial<Pick<SkySettings, "seasonMode" | "holidayMode" | "easterRite" | "windMode" | "windSpeed" | "windFrom">>,
  manual: TimeOfDay,
): SkyState {
  const weather = weatherOf(states, settings.weatherMode, settings.windMode === "manual" ? { speed: settings.windSpeed ?? 0, from: settings.windFrom ?? 270 } : undefined);
  const home = states["zone.home"]?.attributes;
  const lat = typeof home?.latitude === "number" ? home.latitude : BUCHAREST.lat;
  const lon = typeof home?.longitude === "number" ? home.longitude : BUCHAREST.lon;
  let sun: { elevation: number; azimuth: number };
  let source: SkyState["source"];
  if (settings.timeMode === "manual") {
    sun = MANUAL_SUN[manual];
    source = "manual";
  } else {
    const ha = states["sun.sun"]?.attributes;
    if (typeof ha?.elevation === "number" && typeof ha?.azimuth === "number") {
      sun = { elevation: ha.elevation, azimuth: ha.azimuth };
      source = "sun.sun";
    } else {
      sun = sunPosition(now, lat, lon);
      source = "computed";
    }
  }
  const daylight = daylightOf(sun.elevation);
  const { seasonMode = "auto", holidayMode = "auto", easterRite = "orthodox" } = settings;
  const season: SeasonBlend = seasonMode === "auto" ? seasonBlend(now, lat) : { season: seasonMode, next: nextSeason(seasonMode), mix: 0 };
  const holiday: Holiday | null = holidayMode === "auto" ? holidayOn(now, easterRite) : holidayMode === "none" ? null : { id: holidayMode, strength: 1 };
  return { ...sun, daylight, phase: phaseOf(daylight), weather, source, now, season, holiday };
}
