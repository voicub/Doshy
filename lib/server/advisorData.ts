import { createHash } from "node:crypto";
import type { AdvisorSettings } from "../advisorSettings.ts";
import { AWATTAR_HOSTS, entsoeStamp, parseAwattar, parseEntsoe } from "../advisorFeeds.ts";
import { entityPrices, tariffSlots, type PriceSlot } from "../advisorPrices.ts";
import { parseOpenMeteo, parseWeatherForecast, pvFromForecast, pvFromPeriods, pvFromDailyTotal, type HourPoint, type PvSlot } from "../advisorForecast.ts";
import { dayStart, validZone } from "../advisorTime.ts";
import type { WeatherChange } from "../advisor.ts";
import { isRecord } from "../guards.ts";
import type { HaFetch } from "./haCall.ts";
import { ttlCache, type TtlCache } from "./ttlCache.ts";
import { readCapped } from "./readCapped.ts";
import { HttpError } from "../db/errors.ts";

export function advisorQueryPlace(query: URLSearchParams): { lat: number; lon: number } | undefined {
  const latText = query.get("lat");
  const lonText = query.get("lon");
  if (latText === null && lonText === null) return undefined;
  const lat = Number(latText);
  const lon = Number(lonText);
  if (!latText?.trim() || !lonText?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, "bad_location", "Send valid latitude and longitude together.");
  return { lat, lon };
}

export type AdvisorData = { prices: PriceSlot[]; pv: PvSlot[]; hours: HourPoint[]; zone: string; place: { lat: number; lon: number } | null; updatedAt: number; notes: string[]; currency: string; weatherChange: WeatherChange | null };
export function createAdvisorDataService(fetchExternal: typeof fetch, now: () => number = Date.now) {
  const external = ttlCache<string>(30 * 60_000, 32, now);
  const homes = new WeakMap<HaFetch, TtlCache<string>>();
  async function text(response: Response): Promise<string> {
    if (!response.ok || !response.body) throw new Error("Source unavailable");
    const bytes = await readCapped(response.body, 2_000_000);
    if (!bytes) throw new Error("Source response too large");
    return new TextDecoder().decode(bytes);
  }
  return async (settings: AdvisorSettings, ha: HaFetch, token: string | null, options: { external: boolean; forecastService: boolean; place?: { lat: number; lon: number } }): Promise<AdvisorData> => {
    let cache = homes.get(ha);
    if (!cache) { cache = ttlCache<string>(30 * 60_000, 16, now); homes.set(ha, cache); }
    const jsonHa = async (path: string, init?: RequestInit): Promise<unknown> => JSON.parse(await cache.get(path + (init?.body ?? ""), async () => text(await ha(path, init))));
    const jsonExternal = async (url: URL): Promise<string> => {
      if (!options.external) throw new Error("External data disabled");
      const key = createHash("sha256").update(url.href).digest("hex");
      return external.get(key, async () => text(await fetchExternal(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) })));
    };
    const notes: string[] = [];
    let states: Record<string, unknown>[] = [];
    let zone = "UTC";
    try { const config = await jsonHa("config"); if (isRecord(config)) zone = validZone(config.time_zone) ?? zone; } catch { notes.push("Home time zone unavailable; using UTC."); }
    try { const raw = await jsonHa("states"); if (Array.isArray(raw)) states = raw.filter(isRecord); } catch { notes.push("Home Assistant states unavailable."); }
    const attrs = (entity: string): Record<string, unknown> => { const state = states.find((s) => s.entity_id === entity); return state && isRecord(state.attributes) ? state.attributes : {}; };
    const home = attrs("zone.home");
    const place = options.place ?? (typeof home.latitude === "number" && Number.isFinite(home.latitude) && Math.abs(home.latitude) <= 90 && typeof home.longitude === "number" && Number.isFinite(home.longitude) && Math.abs(home.longitude) <= 180 ? { lat: home.latitude, lon: home.longitude } : settings.place);
    const stamp = now();
    let prices: PriceSlot[] = [];
    let currency = settings.currency;
    try {
      const p = settings.price;
      if (p.source === "tariff") prices = tariffSlots(p.tariff, stamp, 3, zone);
      if (p.source === "entity") { const result = entityPrices(attrs(p.entity), stamp, zone, p.unit); prices = result.slots; currency = result.currency ?? currency; }
      if (p.source === "awattar-at" || p.source === "awattar-de") {
        const url = new URL("/v1/marketdata", AWATTAR_HOSTS[p.source === "awattar-at" ? "at" : "de"]);
        prices = parseAwattar(JSON.parse(await jsonExternal(url)), p); currency = "EUR";
      }
      if (p.source === "entsoe") {
        if (!token) throw new Error("Token required");
        const url = new URL("https://web-api.tp.entsoe.eu/api");
        url.search = new URLSearchParams({ securityToken: token, documentType: "A44", in_Domain: p.zone, out_Domain: p.zone, periodStart: entsoeStamp(dayStart(stamp, zone)), periodEnd: entsoeStamp(stamp + 72 * 3_600_000) }).toString();
        const parsed = parseEntsoe(await jsonExternal(url), p);
        if (!parsed) throw new Error("Invalid prices");
        prices = parsed.slots; currency = parsed.currency ?? currency;
        // Upstream text is not exposed: an error response can echo its request token.
        if (parsed.note) notes.push("ENTSO-E has no published prices for this period.");
      }
      if (p.source !== "none" && !prices.length) notes.push("No usable electricity price slots are available.");
    } catch { notes.push(settings.price.source === "entsoe" && !token ? "Save an ENTSO-E token to read prices." : "Electricity price source unavailable; other sources remain usable."); }
    let hours: HourPoint[] = [];
    const weatherEntity = settings.weather.entity || String(states.find((s) => typeof s.entity_id === "string" && s.entity_id.startsWith("weather."))?.entity_id ?? "");
    if (settings.weather.source === "entity" || settings.weather.source === "auto") {
      try {
        const a = attrs(weatherEntity);
        let list: unknown = a.forecast;
        if (!Array.isArray(list) && weatherEntity && options.forecastService) {
          const raw = await jsonHa("services/weather/get_forecasts?return_response", { method: "POST", body: JSON.stringify({ entity_id: weatherEntity, type: "hourly" }) });
          const response = isRecord(raw) && isRecord(raw.service_response) ? raw.service_response : raw;
          const entry = isRecord(response) ? response[weatherEntity] : null;
          list = isRecord(entry) ? entry.forecast : null;
        }
        hours = parseWeatherForecast(list, zone, a.temperature_unit === "°F")?.hours ?? [];
      } catch { notes.push("Home Assistant weather forecast unavailable."); }
    }
    let solarHours: HourPoint[] = [];
    if ((settings.weather.source === "openmeteo" || (settings.weather.source === "auto" && !hours.length)) || settings.solar.source === "openmeteo" || settings.solar.source === "auto") {
      if (!place) notes.push("Set a home location to use Open-Meteo forecasts.");
      else try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.search = new URLSearchParams({ latitude: String(place.lat), longitude: String(place.lon), hourly: "temperature_2m,cloud_cover,shortwave_radiation,precipitation_probability,pressure_msl", timeformat: "unixtime", timezone: "UTC", forecast_days: "3" }).toString();
        solarHours = parseOpenMeteo(JSON.parse(await jsonExternal(url)))?.hours ?? [];
        if (settings.weather.source === "openmeteo" || (settings.weather.source === "auto" && !hours.length)) hours = solarHours;
        if (!solarHours.length) notes.push("Open-Meteo returned no usable forecast hours.");
      } catch { notes.push(options.external ? "Open-Meteo forecast unavailable." : "External forecasts are switched off (DOSHY_EXTERNAL_DATA=0)."); }
    }
    let pv: PvSlot[] = [];
    if (settings.solar.source === "entity" || settings.solar.source === "auto") {
      const entity = settings.solar.entity || String(states.find((s) => { const a = isRecord(s.attributes) ? s.attributes : {}; return Array.isArray(a.detailedHourly) || Array.isArray(a.detailedForecast); })?.entity_id ?? "");
      const a = attrs(entity);
      pv = pvFromPeriods(a.detailedHourly ?? a.detailedForecast, zone);
      if (!pv.length && place) { const state = states.find((s) => s.entity_id === entity); const total = Number(state?.state); if (Number.isFinite(total)) pv = pvFromDailyTotal(total, typeof a.unit_of_measurement === "string" ? a.unit_of_measurement : undefined, dayStart(stamp, zone), zone, place.lat, place.lon); }
    }
    if (!pv.length && place && (settings.solar.source === "openmeteo" || settings.solar.source === "auto")) pv = pvFromForecast(solarHours, settings.solar.pv, place.lat, place.lon);
    if (settings.solar.source !== "none" && !pv.length) notes.push("No usable solar forecast is available.");
    if (settings.weather.source !== "none" && !hours.length) notes.push("No usable weather forecast is available.");
    return { prices, pv, hours, zone, place, updatedAt: stamp, notes, currency, weatherChange: null };
  };
}
