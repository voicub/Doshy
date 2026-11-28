// Weather and solar forecasts as the advisor reads them: hourly outside temperature and sun, from Open-Meteo (the server fetches, this parses and checks), from a Home Assistant
// weather entity's `weather.get_forecasts` answer, or from a solar-forecast entity (Solcast's hourly list, Forecast.Solar's daily total). Plus the simple model that turns
// "sun on the ground" into "kW from your panels". Everything from outside is checked; bad entries are dropped. Pure.
import { isRecord } from "./guards.ts";
import { addDays, dayStart, parseTime } from "./advisorTime.ts";
import { sunPosition } from "./sky.ts";

const HOUR_MS = 3_600_000;
const RAD = Math.PI / 180;

/** One hour of outside weather. `t` is the end of the hour for the sun figures (Open-Meteo reports the hour BEFORE its time stamp) and the moment itself for the temperature. */
export type HourPoint = { t: number; tempC: number | null; cloud: number | null; /** global horizontal sun, W/m2, mean of the hour before `t` */ ghi: number | null; rainChance: number | null; pressureHpa: number | null };
export type Forecast = { hours: HourPoint[]; source: "openmeteo" | "entity" };

/** Panel power over one stretch of time, kW. */
export type PvSlot = { start: number; end: number; kw: number };

const finite = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const MAX_HOURS = 24 * 8;

/**
 * Open-Meteo's `/v1/forecast` answer asked with `timeformat=unixtime` (every time stamp is then an exact UTC second) and the hourly variables temperature_2m, cloud_cover,
 * shortwave_radiation, precipitation_probability and pressure_msl. A column that is missing or the wrong length is `null` all the way; a value out of any sane range is `null`.
 */
export function parseOpenMeteo(json: unknown): Forecast | null {
  if (!isRecord(json) || !isRecord(json.hourly) || !Array.isArray(json.hourly.time)) return null;
  const h = json.hourly;
  const timestamps: unknown[] = json.hourly.time;
  const time = timestamps.slice(0, MAX_HOURS);
  const column = (key: string, lo: number, hi: number): (number | null)[] => {
    const a = h[key];
    return Array.isArray(a) && a.length === timestamps.length ? a.slice(0, MAX_HOURS).map((v) => finite(v, lo, hi)) : time.map(() => null);
  };
  const temp = column("temperature_2m", -90, 65);
  const cloud = column("cloud_cover", 0, 100);
  const ghi = column("shortwave_radiation", 0, 1500);
  const rain = column("precipitation_probability", 0, 100);
  const pressure = column("pressure_msl", 850, 1090);
  const hours: HourPoint[] = [];
  time.forEach((s, i) => {
    if (typeof s !== "number" || !Number.isFinite(s) || s < 1e9 || s > 4e9) return;
    hours.push({ t: s * 1000, tempC: temp[i], cloud: cloud[i], ghi: ghi[i], rainChance: rain[i], pressureHpa: pressure[i] });
  });
  hours.sort((a, b) => a.t - b.t);
  return hours.length ? { hours, source: "openmeteo" } : null;
}

const CONDITION_RAIN = /rain|pour|snow|hail|lightning|storm|sleet/;

/**
 * Home Assistant's `weather.get_forecasts` answer for one entity (`{ forecast: [{ datetime, temperature, condition, precipitation_probability, cloud_coverage }] }`) as hours.
 * Hourly lists are used as they are; a twice-daily or daily list gives the hour of each entry only (the advisor then skips what needs hours). Temperatures are in the unit
 * the entity reports (°C unless `fahrenheit`).
 */
export function parseWeatherForecast(list: unknown, zone: string, fahrenheit = false): Forecast | null {
  if (!Array.isArray(list)) return null;
  const hours: HourPoint[] = [];
  for (const row of list.slice(0, MAX_HOURS)) {
    if (!isRecord(row)) continue;
    const t = parseTime(row.datetime, zone);
    const raw = finite(row.temperature, -200, 200);
    if (t === null || raw === null) continue;
    const rain = finite(row.precipitation_probability, 0, 100) ?? (typeof row.condition === "string" && CONDITION_RAIN.test(row.condition) ? 70 : null);
    hours.push({ t, tempC: fahrenheit ? Math.round(((raw - 32) * 5) / 9 * 10) / 10 : raw, cloud: finite(row.cloud_coverage, 0, 100), ghi: null, rainChance: rain, pressureHpa: finite(row.pressure, 850, 1090) });
  }
  hours.sort((a, b) => a.t - b.t);
  return hours.length ? { hours, source: "entity" } : null;
}

// ---- the panel model --------------------------------------------------------------------------------------------------------------------------------

export type PvSetup = {
  /** peak power of the panels, kW */
  kwp: number;
  /** degrees from flat (0) to upright (90) */
  tilt: number;
  /** compass direction the panels face, degrees clockwise from north (180 = south) */
  azimuth: number;
  /** share of the panels' rating that reaches the house after losses (dirt, heat, the inverter), 0.5 to 1 */
  efficiency: number;
};
export const DEFAULT_PV: PvSetup = { kwp: 5, tilt: 30, azimuth: 180, efficiency: 0.8 };

/** Share of the sunshine that is scattered light (comes from the whole sky): a clear sky still scatters a fifth, a fully clouded one nearly all of it. */
const diffuseShare = (cloud: number | null): number => 0.2 + 0.8 * ((cloud ?? 50) / 100);

/**
 * kW from the panels for every hour of the forecast that has sun figures. The straight sunlight on the ground (what Open-Meteo reports) is turned to the panel's own plane
 * by the sun's height and bearing (beam part, at most 3 times: a low sun on an upright panel), and the scattered part by the panel's tilt. Rough on purpose: it follows the
 * shape of the day well, the absolute kWh to within a quarter on a typical day. `efficiency` is the knob to tune it against what your panels really made.
 */
export function pvFromForecast(hours: readonly HourPoint[], pv: PvSetup, lat: number, lon: number): PvSlot[] {
  const tilt = pv.tilt * RAD;
  const out: PvSlot[] = [];
  for (const h of hours) {
    if (h.ghi === null) continue;
    const mid = h.t - HOUR_MS / 2;
    const sun = sunPosition(new Date(mid), lat, lon);
    let kw = 0;
    if (sun.elevation > 2 && h.ghi > 0) {
      const el = sun.elevation * RAD;
      const cosIncidence = Math.sin(el) * Math.cos(tilt) + Math.cos(el) * Math.sin(tilt) * Math.cos((sun.azimuth - pv.azimuth) * RAD);
      const beam = Math.min(3, Math.max(0, cosIncidence) / Math.max(Math.sin(el), 0.087));
      const d = diffuseShare(h.cloud);
      const plane = h.ghi * ((1 - d) * beam + d * ((1 + Math.cos(tilt)) / 2));
      kw = Math.max(0, (pv.kwp * plane * pv.efficiency) / 1000);
    }
    out.push({ start: h.t - HOUR_MS, end: h.t, kw: Math.round(kw * 1000) / 1000 });
  }
  return out;
}

// ---- solar forecast entities --------------------------------------------------------------------------------------------------------------------------

/**
 * Solcast's `detailedHourly` / `detailedForecast` attribute (`[{ period_start, pv_estimate }]`, kW). A period is as long as the gap to the next one (the last one as long as the one before).
 */
export function pvFromPeriods(list: unknown, zone: string): PvSlot[] {
  if (!Array.isArray(list)) return [];
  const rows: { start: number; kw: number }[] = [];
  for (const item of list.slice(0, 400)) {
    if (!isRecord(item)) continue;
    const start = parseTime(item.period_start ?? item.start ?? item.datetime, zone);
    const kw = finite(item.pv_estimate ?? item.kw ?? item.value, 0, 500);
    if (start !== null && kw !== null) rows.push({ start, kw });
  }
  rows.sort((a, b) => a.start - b.start);
  return rows.flatMap((r, i) => {
    const next = rows[i + 1]?.start ?? (rows[i - 1] ? r.start + (r.start - rows[i - 1].start) : r.start + HOUR_MS);
    return next > r.start && next - r.start <= 3 * HOUR_MS ? [{ start: r.start, end: next, kw: r.kw }] : [];
  });
}

const KWH_PER: Record<string, number> = { wh: 0.001, kwh: 1, mwh: 1000 };

/**
 * One day's energy total from an entity (Forecast.Solar's `energy_production_today` / `_tomorrow`: a single kWh figure per day) spread over that day's daylight hours by the
 * sun's height, so the advisor still knows WHEN the sun is strongest. The shape is a clear-day curve; the total is what the forecast service said (clouds included).
 */
export function pvFromDailyTotal(total: number, unit: string | undefined, dayStartMs: number, zone: string, lat: number, lon: number): PvSlot[] {
  const kwh = total * (KWH_PER[(unit ?? "kWh").toLowerCase()] ?? 1);
  if (!Number.isFinite(kwh) || kwh <= 0 || kwh > 5000) return [];
  const end = addDays(dayStartMs, 1, zone);
  const shape: { start: number; end: number; weight: number }[] = [];
  for (let start = dayStartMs; start < end; start += HOUR_MS) {
    const el = sunPosition(new Date(start + HOUR_MS / 2), lat, lon).elevation;
    shape.push({ start, end: Math.min(end, start + HOUR_MS), weight: el > 0 ? Math.sin(el * RAD) ** 1.2 : 0 });
  }
  const sum = shape.reduce((s, x) => s + x.weight * ((x.end - x.start) / HOUR_MS), 0);
  return sum > 0 ? shape.filter((s) => s.weight > 0).map((s) => ({ start: s.start, end: s.end, kw: Math.round(((kwh * s.weight) / sum) * 1000) / 1000 })) : [];
}

/** The slot of a solar list that holds `t`. */
export const pvAt = (slots: readonly PvSlot[], t: number): PvSlot | undefined => slots.find((s) => s.start <= t && t < s.end);

/** The local day (start of day) a time falls in, for grouping. */
export const localDay = dayStart;
