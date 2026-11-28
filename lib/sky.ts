import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "./dbClient.ts";
import type { HAState } from "./ha";
import type { TimeOfDay } from "./store";
import { HOLIDAY_IDS, SEASONS, holidayOn, nextSeason, seasonBlend, type EasterRite, type Holiday, type HolidayId, type Season, type SeasonBlend } from "./season.ts";
import { forcedYear, yearAt, type YearLook } from "./seasonYear.ts";
import { moonFromName, moonPhase, type Moon } from "./moon.ts";
import { findWeatherId, parsePins, readInputs, weatherFromInputs, type RawStates, type SkyInputs, type SkyPins } from "./liveSky.ts";
import { isRecord } from "./guards.ts";

/**
 * Sun position, daylight phase, moon and weather for the scene and the HUD.
 * Auto mode follows the real sun (Home Assistant's `sun.sun`, else computed from `zone.home` coordinates, else Bucharest)
 * and the real weather (a `weather.*` entity, see lib/liveSky.ts). Manual modes override either independently.
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
  /** °C */
  temp?: number;
  /** reported gust speed in m/s (undefined when unknown) */
  gust?: number;
  /** id of the weather entity followed (undefined when there is none) */
  entity?: string;
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
  /** the moon: from Home Assistant's moon sensor when there is one, else computed from the date */
  moon: Moon;
  moonSource: "ha" | "computed";
  now: Date;
  /** season for the garden: the real one (with the cross-fade into the next) or the one forced from the HUD */
  season: SeasonBlend;
  /** the garden's continuous year (canopy, leaf colour, blossom, leaf litter, lawn, snow): by the day, hemisphere from the home's latitude (see lib/seasonYear.ts) */
  year: YearLook;
  /** the active holiday decoration, or null */
  holiday: Holiday | null;
};

type SkySettings = {
  timeMode: "auto" | "manual"; // manual uses the store's `time` preset (day/dusk/night)
  weatherMode: "auto" | WeatherKind;
  /** which `weather.*` entity auto follows: "auto" picks the home's own, else the first */
  weatherEntity: string;
  seasonMode: "auto" | Season;
  holidayMode: "auto" | "none" | HolidayId;
  easterRite: EasterRite;
  /** auto follows Home Assistant (weather entity or station sensors); manual uses windSpeed / windFrom */
  windMode: "auto" | "manual";
  windSpeed: number; // m/s
  windFrom: number; // degrees the wind blows FROM, clockwise from north
  /** the owner's manual choices from before "Real sky and weather" was switched on, to bring back when it is switched off */
  lastPins: SkyPins | null;
  setTimeMode: (m: "auto" | "manual") => void;
  setWeatherMode: (m: "auto" | WeatherKind) => void;
  setWeatherEntity: (id: string) => void;
  setSeasonMode: (m: "auto" | Season) => void;
  setHolidayMode: (m: "auto" | "none" | HolidayId) => void;
  setEasterRite: (r: EasterRite) => void;
  setWindMode: (m: "auto" | "manual") => void;
  /** Set the manual wind (speed in m/s and/or the bearing it blows from) and switch to manual. */
  setWind: (p: { windSpeed?: number; windFrom?: number }) => void;
  setLastPins: (p: SkyPins | null) => void;
};

type SkyData = Pick<SkySettings, "timeMode" | "weatherMode" | "weatherEntity" | "seasonMode" | "holidayMode" | "easterRite" | "windMode" | "windSpeed" | "windFrom" | "lastPins">;

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => allowed.find((x) => x === v) ?? fallback;

/** Stored settings of any version: every field that is still valid is kept, the rest gets its default. */
function migrateSky(old: unknown): SkyData {
  const o = isRecord(old) ? old : {};
  return {
    timeMode: oneOf(o.timeMode, ["auto", "manual"], "auto"),
    weatherMode: oneOf(o.weatherMode, ["auto", ...WEATHER_KINDS], "auto"),
    weatherEntity: typeof o.weatherEntity === "string" && o.weatherEntity.startsWith("weather.") ? o.weatherEntity : "auto",
    seasonMode: oneOf(o.seasonMode, ["auto", ...SEASONS], "auto"),
    holidayMode: oneOf(o.holidayMode, ["auto", "none", ...HOLIDAY_IDS], "auto"),
    easterRite: oneOf(o.easterRite, ["orthodox", "western"], "orthodox"),
    windMode: oneOf(o.windMode, ["auto", "manual"], "auto"),
    windSpeed: typeof o.windSpeed === "number" && Number.isFinite(o.windSpeed) ? o.windSpeed : 4,
    windFrom: typeof o.windFrom === "number" && Number.isFinite(o.windFrom) ? o.windFrom : 270,
    lastPins: parsePins(o.lastPins),
  };
}

const SKY_VERSION = 3;
const storage = dbStorage("housey-sky", "settings", SKY_VERSION);

export const useSkySettings = create<SkySettings>()(
  persist(
    (set) => ({
      timeMode: "auto",
      weatherMode: "auto",
      weatherEntity: "auto",
      seasonMode: "auto",
      holidayMode: "auto",
      easterRite: "orthodox",
      windMode: "auto",
      windSpeed: 4,
      windFrom: 270,
      lastPins: null,
      setTimeMode: (timeMode) => set({ timeMode }),
      setWeatherMode: (weatherMode) => set({ weatherMode }),
      setWeatherEntity: (weatherEntity) => set({ weatherEntity }),
      setSeasonMode: (seasonMode) => set({ seasonMode }),
      setHolidayMode: (holidayMode) => set({ holidayMode }),
      setEasterRite: (easterRite) => set({ easterRite }),
      setWindMode: (windMode) => set({ windMode }),
      setWind: (p) => set({ windMode: "manual", ...p }),
      setLastPins: (lastPins) => set({ lastPins }),
    }),
    {
      name: "housey-sky",
      version: SKY_VERSION,
      storage: createJSONStorage(() => storage),
      // the stored version stays 3: settings saved before the weather entity and the pins existed simply lack them and get the defaults, whatever is stored is validated field by field
      partialize: (s): SkyData => ({ timeMode: s.timeMode, weatherMode: s.weatherMode, weatherEntity: s.weatherEntity, seasonMode: s.seasonMode, holidayMode: s.holidayMode, easterRite: s.easterRite, windMode: s.windMode, windSpeed: s.windSpeed, windFrom: s.windFrom, lastPins: s.lastPins }),
      migrate: migrateSky,
      merge: (saved, current) => (isRecord(saved) ? { ...current, ...migrateSky(saved) } : current),
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
export const phaseOf = (daylight: number): TimeOfDay => (daylight > 0.85 ? "day" : daylight < 0.15 ? "night" : "dusk");

/** Stand-in sun for the manual day / dusk / night presets. */
const MANUAL_SUN: Record<TimeOfDay, { elevation: number; azimuth: number }> = {
  day: { elevation: 48, azimuth: 150 },
  dusk: { elevation: 3, azimuth: 262 },
  night: { elevation: -30, azimuth: 20 },
};

/** The weather entity to follow (see findWeatherId): the owner's pick, else the one named like the home, else the first by id. */
export function findWeather(states: Record<string, HAState>, choice = "auto"): HAState | undefined {
  const id = findWeatherId(states, choice);
  return id ? states[id] : undefined;
}

/** Weather from Home Assistant (see weatherFromInputs): `mode` forces a kind, `windOverride` replaces the wind. */
export function weatherOf(states: RawStates, mode: "auto" | WeatherKind, windOverride?: { speed: number; from: number }, weatherEntity = "auto"): Weather {
  return weatherFromInputs(readInputs(states, weatherEntity), mode, windOverride);
}

type SkyChoices = Pick<SkySettings, "timeMode" | "weatherMode"> & Partial<Pick<SkySettings, "seasonMode" | "holidayMode" | "easterRite" | "windMode" | "windSpeed" | "windFrom" | "weatherEntity">> & {
  /** `now` is a date being previewed, not today: the sun is worked out for it instead of read from Home Assistant (which only knows today's) */
  preview?: boolean;
};

/** Pure: everything the scene and HUD need for `now`, from the readings of Home Assistant (see readInputs) and the user's overrides. */
export function skyFromInputs(i: SkyInputs, now: Date, settings: SkyChoices, manual: TimeOfDay): SkyState {
  const weather = weatherFromInputs(i, settings.weatherMode, settings.windMode === "manual" ? { speed: settings.windSpeed ?? 0, from: settings.windFrom ?? 270 } : undefined);
  const lat = i.lat ?? BUCHAREST.lat;
  const lon = i.lon ?? BUCHAREST.lon;
  let sun: { elevation: number; azimuth: number };
  let source: SkyState["source"];
  if (settings.timeMode === "manual") {
    sun = MANUAL_SUN[manual];
    source = "manual";
  } else if (i.sunEl !== undefined && i.sunAz !== undefined && !settings.preview) {
    sun = { elevation: i.sunEl, azimuth: i.sunAz };
    source = "sun.sun";
  } else {
    sun = sunPosition(now, lat, lon);
    source = "computed";
  }
  const daylight = daylightOf(sun.elevation);
  const { seasonMode = "auto", holidayMode = "auto", easterRite = "orthodox" } = settings;
  const season: SeasonBlend = seasonMode === "auto" ? seasonBlend(now, lat) : { season: seasonMode, next: nextSeason(seasonMode), mix: 0 };
  const year = seasonMode === "auto" ? yearAt(now, lat, weather.temp) : forcedYear(seasonMode);
  const holiday: Holiday | null = holidayMode === "auto" ? holidayOn(now, easterRite) : holidayMode === "none" ? null : { id: holidayMode, strength: 1 };
  const fromHa = i.moon ? moonFromName(i.moon) : undefined;
  return { ...sun, daylight, phase: phaseOf(daylight), weather, source, now, season, year, holiday, moon: fromHa ?? moonPhase(now), moonSource: fromHa ? "ha" : "computed" };
}

/** Pure: the sky straight from Home Assistant states (tests and one-off callers; the app reads the states once through useSky). */
export function computeSky(states: RawStates, now: Date, settings: SkyChoices, manual: TimeOfDay): SkyState {
  return skyFromInputs(readInputs(states, settings.weatherEntity), now, settings, manual);
}
