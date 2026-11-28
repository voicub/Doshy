// What the owner chose about pressure for this home: which sensor is the barometer, whether it reads at the home's own altitude, and whether a falling barometer may raise an
// alert. The unit is a display choice of the device and lives with the other display settings (lib/display.ts). Pure; the node test runner loads this file directly.
import { isRecord } from "./guards.ts";

export type PressurePrefs = {
  /** The entity to use as the barometer; null = pick one automatically (lib/pressure.ts). */
  entity: string | null;
  /** The sensor shows pressure at the home's altitude: reduce it to sea level before showing and forecasting. */
  correct: boolean;
  /** The home's altitude in metres above sea level, typed by the owner; null = use the Surroundings ground height when there is one. */
  altitudeM: number | null;
  /** "Pressure is falling very rapidly: a storm may be coming". Off by default. */
  alerts: boolean;
};

export const PRESSURE_PREFS_DEFAULTS: PressurePrefs = { entity: null, correct: false, altitudeM: null, alerts: false };
/** Dead Sea shore to Everest base camp and a little beyond: anything else typed is a typo. */
export const ALTITUDE_RANGE = { min: -450, max: 6000 } as const;
const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** Stored settings, field by field: a missing or wrong-typed value falls back to its default, an altitude outside the range to none. */
export function cleanPressurePrefs(raw: unknown): PressurePrefs {
  const r = isRecord(raw) ? raw : {};
  const alt = typeof r.altitudeM === "number" && Number.isFinite(r.altitudeM) && r.altitudeM >= ALTITUDE_RANGE.min && r.altitudeM <= ALTITUDE_RANGE.max ? Math.round(r.altitudeM) : null;
  return {
    entity: typeof r.entity === "string" && r.entity.length <= 255 && ENTITY_ID.test(r.entity) ? r.entity : null,
    correct: typeof r.correct === "boolean" ? r.correct : PRESSURE_PREFS_DEFAULTS.correct,
    altitudeM: alt,
    alerts: typeof r.alerts === "boolean" ? r.alerts : PRESSURE_PREFS_DEFAULTS.alerts,
  };
}

/** The altitude the sea-level correction uses: the typed one, else the ground height the Surroundings data found for the home, else none. */
export const homeAltitude = (prefs: Pick<PressurePrefs, "altitudeM">, terrainBase: number | undefined): number | undefined => prefs.altitudeM ?? (terrainBase !== undefined && Number.isFinite(terrainBase) ? Math.round(terrainBase) : undefined);

// ---- one set of choices per Home Assistant ----------------------------------------------------------------------------------------------------------
// A second home has its own barometer entity, altitude and correction, so the choices are kept per home: `homes` maps the connection id ("main" for the main home) to its prefs.

export const MAIN_HOME = "main";
export const MAX_HOMES = 32;
export type PressureHomes = Record<string, PressurePrefs>;

/** What is stored: `{ homes: { id: prefs } }`. Settings saved before homes existed are one flat set of prefs: they belong to the main home. */
export function cleanPressureHomes(raw: unknown): PressureHomes {
  const r = isRecord(raw) ? raw : {};
  if (!isRecord(r.homes)) return "entity" in r || "correct" in r || "altitudeM" in r || "alerts" in r ? { [MAIN_HOME]: cleanPressurePrefs(r) } : {};
  return Object.fromEntries(Object.entries(r.homes).slice(0, MAX_HOMES).filter(([id]) => /^[A-Za-z0-9_.-]{1,64}$/.test(id)).map(([id, v]) => [id, cleanPressurePrefs(v)]));
}
