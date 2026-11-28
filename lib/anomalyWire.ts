// What GET /api/ha/anomalies sends and the browser checks: for each sensor one number per hour (the time-weighted mean of what it read in that hour, null when it read
// nothing usable), the moment Home Assistant last heard from each sensor, and the home's time zone. Hours, not raw readings, so a month of a hundred sensors stays under
// a megabyte and the detector's cost does not depend on how chatty a sensor is. Pure; the server code (lib/server/anomalyHistory.ts) shares these types.
import { isRecord } from "./guards.ts";
import { ENTITY_ID } from "./timeline.ts";

export const HOUR_MS = 3_600_000;
export const MIN_DAYS = 7;
export const MAX_DAYS = 30;
export const DEFAULT_DAYS = 21;
export const MAX_ENTITIES = 100;
/** 30 days plus the hour in progress and a day of slack. */
export const MAX_HOURS = (MAX_DAYS + 2) * 24 + 1;

/** One sensor's hours: `v[i]` is the mean over the hour that starts at `(h0 + i)` hours since 1970 (UTC aligned, so every sensor shares one grid). */
export type Series = { h0: number; v: (number | null)[] };

export type AnomalyWire = {
  from: number;
  to: number;
  days: number;
  zone: string | null;
  series: Record<string, Series>;
  /** When Home Assistant last heard from the sensor (ms): `last_reported` when it has one, else `last_updated`. */
  seen: Record<string, number>;
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseSeries(raw: unknown): Series | null {
  if (!isRecord(raw) || !finite(raw.h0) || !Array.isArray(raw.v) || raw.v.length === 0 || raw.v.length > MAX_HOURS) return null;
  return { h0: Math.round(raw.h0), v: (raw.v as unknown[]).map((x) => (finite(x) ? x : null)) };
}

/** The server's answer, checked: a bad sensor is dropped, a bad whole throws. */
export function parseAnomalyWire(raw: unknown): AnomalyWire {
  if (!isRecord(raw) || !isRecord(raw.series) || !finite(raw.from) || !finite(raw.to) || raw.to <= raw.from || !finite(raw.days)) throw new Error("The history answer was not in the expected shape");
  const series: Record<string, Series> = {};
  for (const [id, s] of Object.entries(raw.series).slice(0, MAX_ENTITIES)) {
    const parsed = ENTITY_ID.test(id) ? parseSeries(s) : null;
    if (parsed) series[id] = parsed;
  }
  const seen: Record<string, number> = {};
  if (isRecord(raw.seen)) for (const [id, t] of Object.entries(raw.seen).slice(0, MAX_ENTITIES)) if (ENTITY_ID.test(id) && finite(t)) seen[id] = t;
  return { from: raw.from, to: raw.to, days: Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(raw.days))), zone: typeof raw.zone === "string" ? raw.zone : null, series, seen };
}
