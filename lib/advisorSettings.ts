// What the person chose in the Advisor settings sheet. Stored in the settings row `housey-advisor` (shared by every screen of this home) and checked field by field whenever it
// is read: a value from another device or an older version that is not valid falls back to its default. No secrets here: the ENTSO-E token lives on the server only. Pure.
import { isRecord } from "./guards.ts";
import { DEFAULT_ENTSOE_ZONE, isEntsoeZone } from "./advisorFeeds.ts";
import { DEFAULT_TARIFF, type Tariff, type UnitChoice } from "./advisorPrices.ts";
import { DEFAULT_PV, type PvSetup } from "./advisorForecast.ts";
import { minutesOf } from "./advisorTime.ts";

export const PRICE_SOURCES = ["none", "entity", "awattar-de", "awattar-at", "entsoe", "tariff"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];
export const SOLAR_SOURCES = ["auto", "entity", "openmeteo", "none"] as const;
export type SolarSource = (typeof SOLAR_SOURCES)[number];
export const WEATHER_SOURCES = ["auto", "entity", "openmeteo", "none"] as const;
export type WeatherSource = (typeof WEATHER_SOURCES)[number];
export const UNIT_CHOICES: readonly UnitChoice[] = ["auto", "kwh", "mwh", "cents"];

export type AppliancePrefs = { dishwasher: boolean; washer: boolean; dryer: boolean };

export type AdvisorSettings = {
  price: { source: PriceSource; entity: string; unit: UnitChoice; zone: string; tariff: Tariff; /** percent added to a feed's market price */ vat: number; /** added per kWh to a feed's market price */ add: number };
  /** ISO 4217 code: what amounts are written in when the price source does not say */
  currency: string;
  units: "metric" | "imperial";
  solar: { source: SolarSource; entity: string; pv: PvSetup; /** what the house always draws, W: the sun only counts above it */ baseLoadW: number };
  weather: { source: WeatherSource; entity: string };
  climate: { indoor: string; outdoor: string; /** comfort band, °C */ min: number; max: number };
  appliances: AppliancePrefs;
  /** where the home is when neither the plan's Surroundings nor Home Assistant know */
  place: { lat: number; lon: number } | null;
  /** show the compact Today card on the Live screen */
  todayCard: boolean;
};

export const DEFAULT_SETTINGS: AdvisorSettings = {
  price: { source: "none", entity: "", unit: "auto", zone: DEFAULT_ENTSOE_ZONE, tariff: DEFAULT_TARIFF, vat: 0, add: 0 },
  currency: "EUR",
  units: "metric",
  solar: { source: "auto", entity: "", pv: DEFAULT_PV, baseLoadW: 300 },
  weather: { source: "auto", entity: "" },
  climate: { indoor: "", outdoor: "", min: 20, max: 24 },
  appliances: { dishwasher: true, washer: true, dryer: false },
  place: null,
  todayCard: false,
};

const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const ENTITY = /^[a-z_]+\.[a-z0-9_]+$/;
const entity = (v: unknown): string => (typeof v === "string" && ENTITY.test(v) && v.length <= 120 ? v : "");
const range = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const clock = (v: unknown, fallback: string): string => (typeof v === "string" && minutesOf(v) !== null ? v : fallback);

function tariffOf(raw: unknown): Tariff {
  const t = isRecord(raw) ? raw : {};
  return {
    peak: range(t.peak, -10, 10, DEFAULT_TARIFF.peak),
    offPeak: range(t.offPeak, -10, 10, DEFAULT_TARIFF.offPeak),
    offFrom: clock(t.offFrom, DEFAULT_TARIFF.offFrom),
    offTo: clock(t.offTo, DEFAULT_TARIFF.offTo),
    weekendOffPeak: bool(t.weekendOffPeak, DEFAULT_TARIFF.weekendOffPeak),
  };
}

/** Whatever was stored, as valid settings. */
export function parseSettings(raw: unknown): AdvisorSettings {
  const r = isRecord(raw) ? raw : {};
  const price = isRecord(r.price) ? r.price : {};
  const solar = isRecord(r.solar) ? r.solar : {};
  const pv = isRecord(solar.pv) ? solar.pv : {};
  const weather = isRecord(r.weather) ? r.weather : {};
  const climate = isRecord(r.climate) ? r.climate : {};
  const appliances = isRecord(r.appliances) ? r.appliances : {};
  const place = isRecord(r.place) && typeof r.place.lat === "number" && typeof r.place.lon === "number" && Math.abs(r.place.lat) <= 90 && Math.abs(r.place.lon) <= 180 ? { lat: r.place.lat, lon: r.place.lon } : null;
  const min = range(climate.min, 5, 30, DEFAULT_SETTINGS.climate.min);
  const max = range(climate.max, 10, 35, DEFAULT_SETTINGS.climate.max);
  const d = DEFAULT_SETTINGS;
  return {
    price: {
      source: oneOf(price.source, PRICE_SOURCES, d.price.source),
      entity: entity(price.entity),
      unit: oneOf(price.unit, UNIT_CHOICES, d.price.unit),
      zone: isEntsoeZone(price.zone) ? price.zone : d.price.zone,
      tariff: tariffOf(price.tariff),
      vat: range(price.vat, 0, 100, 0),
      add: range(price.add, -10, 10, 0),
    },
    currency: typeof r.currency === "string" && /^[A-Za-z]{3}$/.test(r.currency) ? r.currency.toUpperCase() : d.currency,
    units: oneOf(r.units, ["metric", "imperial"] as const, d.units),
    solar: {
      source: oneOf(solar.source, SOLAR_SOURCES, d.solar.source),
      entity: entity(solar.entity),
      pv: { kwp: range(pv.kwp, 0.1, 100, d.solar.pv.kwp), tilt: range(pv.tilt, 0, 90, d.solar.pv.tilt), azimuth: range(pv.azimuth, 0, 360, d.solar.pv.azimuth), efficiency: range(pv.efficiency, 0.5, 1, d.solar.pv.efficiency) },
      baseLoadW: range(solar.baseLoadW, 0, 5000, d.solar.baseLoadW),
    },
    weather: { source: oneOf(weather.source, WEATHER_SOURCES, d.weather.source), entity: entity(weather.entity) },
    climate: { indoor: entity(climate.indoor), outdoor: entity(climate.outdoor), min: Math.min(min, max - 1), max },
    appliances: { dishwasher: bool(appliances.dishwasher, d.appliances.dishwasher), washer: bool(appliances.washer, d.appliances.washer), dryer: bool(appliances.dryer, d.appliances.dryer) },
    place,
    todayCard: bool(r.todayCard, d.todayCard),
  };
}

/** True when the advisor has at least one source to work from (the panel then asks only to refresh, not to set up). */
export const isConfigured = (s: AdvisorSettings): boolean => s.price.source !== "none" || s.solar.source !== "none" || s.weather.source !== "none";

/** Temperatures are kept in °C; these say them in the chosen unit. */
export const toDisplayTemp = (c: number, units: AdvisorSettings["units"]): number => (units === "imperial" ? (c * 9) / 5 + 32 : c);
export const fromDisplayTemp = (v: number, units: AdvisorSettings["units"]): number => (units === "imperial" ? ((v - 32) * 5) / 9 : v);
