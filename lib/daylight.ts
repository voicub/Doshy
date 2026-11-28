// Sun for the "Sunlight in this room" panel: clock time -> instant, sunrise / sunset, season dates, and the sun's direction in the plan's own frame.
// The position itself comes from lib/sky.ts `sunPosition` (a simple Meeus model: about a quarter of a degree, no refraction). Pure: no React, no browser globals.
import { sunPosition } from "./sky.ts";

export type Place = { lat: number; lon: number };
/** What lib/sky.ts `computeSky` assumes when Home Assistant has no home position. */
export const DEFAULT_PLACE: Place = { lat: 44.43, lon: 26.1 };

/** A year of the date slider: 29 Feb has no day of its own, the 365 days run 1 Jan to 31 Dec. */
export const DAYS = 365;
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

const MS_HOUR = 3600000;
const MS_DAY = 86400000;
const RAD = Math.PI / 180;
/** The sun counts as risen when its centre is this far below the geometric horizon (its upper edge plus the air's bending of the light): what a calendar calls sunrise. */
const HORIZON = -0.833;

/** 1-based day of the year of a calendar date (`month0` 0 = January). */
export const dayOfYear = (year: number, month0: number, day: number): number => Math.round((Date.UTC(year, month0, day) - Date.UTC(year, 0, 1)) / MS_DAY) + 1;

/** The calendar date of day `doy` (1-based) of `year`. */
export function dateOfDay(year: number, doy: number): { month: number; day: number } {
  const d = new Date(Date.UTC(year, 0, doy));
  return { month: d.getUTCMonth(), day: d.getUTCDate() };
}

/** "21 Jun". */
export function dayLabel(year: number, doy: number): string {
  const { month, day } = dateOfDay(year, doy);
  return `${day} ${MONTHS[month]}`;
}

/** The slider's day of the year for a real moment, in the clock's own calendar. */
export const todayOf = (now: Date): { year: number; doy: number; hour: number } => ({
  year: now.getFullYear(),
  doy: Math.min(DAYS, dayOfYear(now.getFullYear(), now.getMonth(), now.getDate())),
  hour: now.getHours() + now.getMinutes() / 60,
});

/** The UTC instant of a wall-clock time: `hour` (fractional) on day `doy` of `year` on a clock `offsetMin` minutes ahead of UTC. */
export const instantOf = (year: number, doy: number, hour: number, offsetMin: number): Date => new Date(Date.UTC(year, 0, doy) + hour * MS_HOUR - offsetMin * 60000);

/** Minutes this device's clock is ahead of UTC at noon of that day (daylight saving included). */
export function localOffsetMinutes(year: number, doy: number): number {
  const { month, day } = dateOfDay(year, doy);
  return -new Date(year, month, day, 12).getTimezoneOffset();
}

export type Sun = { elevation: number; azimuth: number };

/** Where the sun is at `hour` o'clock on day `doy`: degrees above the horizon, azimuth clockwise from true north. */
export const sunAt = (place: Place, year: number, doy: number, hour: number, offsetMin: number): Sun => sunPosition(instantOf(year, doy, hour, offsetMin), place.lat, place.lon);

export type DayLight = {
  /** Sunrise and sunset in clock hours (fractional), null when the sun does not cross the horizon that way during the day. */
  rise: number | null;
  set: number | null;
  /** "day": the sun never sets (polar day); "night": it never rises. null on an ordinary day. */
  polar: "day" | "night" | null;
};

/** Sunrise and sunset by scanning the clock day minute by minute (first rise, last set), interpolated between minutes. */
export function dayLight(place: Place, year: number, doy: number, offsetMin: number): DayLight {
  const elevationAt = (minute: number) => sunAt(place, year, doy, minute / 60, offsetMin).elevation;
  let prev = elevationAt(0);
  const startsUp = prev > HORIZON;
  let rise: number | null = null;
  let set: number | null = null;
  for (let m = 1; m <= 1440; m++) {
    const e = elevationAt(m);
    if (prev <= HORIZON && e > HORIZON && rise === null) rise = (m - 1 + (HORIZON - prev) / (e - prev)) / 60;
    if (prev > HORIZON && e <= HORIZON) set = (m - 1 + (prev - HORIZON) / (prev - e)) / 60;
    prev = e;
  }
  const polar = rise === null && set === null ? (startsUp ? "day" : "night") : null;
  return { rise, set, polar };
}

export type SunSample = { minutes: number; elevation: number; azimuth: number };

/** The sun every `stepMin` minutes of the clock day (from 00:00), only while it is above the horizon. */
export function sunSamples(place: Place, year: number, doy: number, offsetMin: number, stepMin: number): SunSample[] {
  const out: SunSample[] = [];
  for (let minutes = 0; minutes < 1440; minutes += stepMin) {
    const s = sunAt(place, year, doy, minutes / 60, offsetMin);
    if (s.elevation > 0) out.push({ minutes, ...s });
  }
  return out;
}

/** The sun as a ray direction in plan axes (x east, y south): the horizontal unit vector toward the sun and how many metres it climbs per metre of horizontal travel. */
export type SunDir = { ux: number; uy: number; slope: number };

/** Compass azimuth -> plan frame (the plan's up points at compass `bearing`, so the angle shrinks by it): the same convention as components/scene/SkyDriver.tsx. */
export function planSun(azimuth: number, elevation: number, bearing: number): SunDir {
  const az = (azimuth - bearing) * RAD;
  return { ux: Math.sin(az), uy: -Math.cos(az), slope: Math.tan(elevation * RAD) };
}

export type Season = "winter" | "equinox" | "summer";
export const SEASONS: readonly Season[] = ["winter", "equinox", "summer"];
export const SEASON_LABEL: Record<Season, string> = { winter: "Winter solstice", equinox: "Equinox", summer: "Summer solstice" };

/** The day of a season preset: the June solstice is summer in the north and winter in the south, the December one the other way round; the March equinox serves both. */
export function seasonDay(year: number, season: Season, lat: number): number {
  if (season === "equinox") return dayOfYear(year, 2, 20);
  const june = (season === "summer") === lat >= 0;
  return june ? dayOfYear(year, 5, 21) : dayOfYear(year, 11, 21);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "14:30" for clock hours (fractional); 24 shows as "24:00" so the slider's end reads right. */
export function clock(hours: number): string {
  const total = Math.round(hours * 60);
  if (total === 1440) return "24:00";
  const m = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "UTC+02:00" for an offset in minutes. */
export function offsetLabel(offsetMin: number): string {
  const a = Math.abs(offsetMin);
  return `UTC${offsetMin < 0 ? "-" : "+"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** "Sunrise 04:40 / Sunset 21:05", or what happens instead near the poles. */
export function dayLightText(d: DayLight): string {
  if (d.polar === "day") return "The sun does not set on this day";
  if (d.polar === "night") return "The sun does not rise on this day";
  const rise = d.rise === null ? "no sunrise" : `Sunrise ${clock(d.rise)}`;
  const set = d.set === null ? "no sunset" : `Sunset ${clock(d.set)}`;
  return `${rise} / ${set}`;
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;

/** "47° high in the south-east", or "below the horizon" (with how far, in degrees). */
export function sunWords(sun: Sun): string {
  if (sun.elevation <= 0) return `below the horizon (${Math.round(-sun.elevation)}° under)`;
  return `${Math.round(sun.elevation)}° high in the ${COMPASS[Math.round((((sun.azimuth % 360) + 360) % 360) / 45) % 8]}`;
}
