import type { RawStates } from "./liveSky.ts";

/** Beaufort scale: lower bound (m/s) and the plain name of each force 0..12. */
const BEAUFORT: [number, string][] = [
  [0, "Calm"], [0.3, "Light air"], [1.6, "Light breeze"], [3.4, "Gentle breeze"], [5.5, "Moderate breeze"], [8, "Fresh breeze"],
  [10.8, "Strong breeze"], [13.9, "Near gale"], [17.2, "Gale"], [20.8, "Strong gale"], [24.5, "Storm"], [28.5, "Violent storm"], [32.7, "Hurricane"],
];

/** Beaufort force number and name for a wind speed in m/s. */
export function beaufort(speed: number): { force: number; name: string } {
  let f = 0;
  for (let i = 0; i < BEAUFORT.length; i++) if (speed >= BEAUFORT[i][0]) f = i;
  return { force: f, name: BEAUFORT[f][1] };
}

/** The wind speeds the manual control offers, in m/s. */
export const WIND_PRESETS = [
  { label: "Calm", speed: 0 },
  { label: "Breeze", speed: 4 },
  { label: "Windy", speed: 9 },
  { label: "Gale", speed: 16 },
] as const;

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
/** 8-point compass name of a bearing in degrees. */
export const compass8 = (deg: number): (typeof POINTS)[number] => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/**
 * How far things bend, 0..1, for a mean speed (m/s) and a gust factor (0..1): nothing in calm air, a gentle lean in a breeze, a hard lean in a gale.
 * The curve is deliberately steep between 2 and 12 m/s, where wind is felt, and saturates at a storm.
 */
export function windBend(speed: number, gust = 0): number {
  const s = Math.max(0, speed) * (1 + 0.6 * gust);
  const x = Math.min(1, s / 20);
  return Math.min(1, Math.sqrt(x) * 0.85 + x * 0.15);
}

/** Slow gust factor 0..1 for time `t` (seconds): a few incommensurate sines, so it never repeats audibly, and stronger swings when it is windy. */
export function gustAt(t: number, speed: number): number {
  const n = 0.5 + 0.5 * (0.55 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 0.91 + 1.7) + 0.15 * Math.sin(t * 2.3 + 0.4));
  return Math.min(1, Math.max(0, n)) * Math.min(1, speed / 8);
}

const MS_PER_UNIT: Record<string, number> = { "m/s": 1, "km/h": 1 / 3.6, kph: 1 / 3.6, kmh: 1 / 3.6, mph: 0.44704, "mi/h": 0.44704, kn: 0.514444, kt: 0.514444, kts: 0.514444, "ft/s": 0.3048 };

/** A wind speed in m/s from a reading and its unit (case-insensitive); a missing or unknown unit counts as `fallback` (sensors default to m/s, Home Assistant's weather entity to km/h). */
export function windToMs(value: number, unit: unknown, fallback: "m/s" | "km/h" = "m/s"): number {
  const key = typeof unit === "string" ? unit.trim().toLowerCase() : "";
  return value * (MS_PER_UNIT[key] ?? MS_PER_UNIT[fallback]);
}

/**
 * How gusty the wind is, 0..1, from the mean speed and the reported gust speed (both m/s): steady air (gust = mean) gives little swing,
 * a gust 60% above the mean gives the full swing. Without a gust reading it is 1, the look that was always used.
 */
export function gustiness(wind: number, gust: number | undefined): number {
  if (gust === undefined) return 1;
  return Math.min(1, Math.max(0.2, (gust - wind) / (0.6 * Math.max(wind, 2))));
}

/**
 * A weather station's own wind sensors, for homes whose weather entity has no wind attributes: a speed sensor (id mentions wind and speed,
 * or device_class wind_speed) and a direction sensor (id mentions wind and direction or bearing). Returns what it finds.
 */
export function windFromSensors(states: RawStates): { speed?: number; from?: number } {
  let speed: number | undefined;
  let from: number | undefined;
  for (const s of Object.values(states)) {
    if (!s.entity_id.startsWith("sensor.")) continue;
    const v = Number(s.state);
    if (!Number.isFinite(v)) continue;
    const id = s.entity_id;
    const cls = s.attributes.device_class;
    if (speed === undefined && (cls === "wind_speed" || /wind.*speed|speed.*wind/.test(id))) speed = windToMs(v, s.attributes.unit_of_measurement);
    else if (from === undefined && /wind.*(bearing|direction|dir)\b|wind_dir/.test(id)) from = v;
  }
  return { speed, from };
}
