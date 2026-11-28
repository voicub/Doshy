// Pressure samples out of what /api/ha/history returns: a numeric sensor comes back as a bucketed series, a weather entity as a change series of its `pressure` attribute
// (ask for it with attrs=pressure). Pure; the node test runner loads this file directly.
import { samplesFromSeries, type Sample } from "./pressure.ts";
import { isNumeric, type Series } from "./stats.ts";

/** The series key to read for an entity: the entity itself for a sensor, `entity|pressure` for a weather entity. */
export const seriesKey = (entity: string): string => (entity.startsWith("weather.") ? `${entity}|pressure` : entity);

/** The samples (hPa) of one barometer from a history reply; `unit` is the unit its values are in. Nothing when the reply has no usable series for it. */
export function pressureSamples(series: Readonly<Record<string, Series>>, entity: string, unit: unknown): Sample[] {
  const s = Object.hasOwn(series, seriesKey(entity)) ? series[seriesKey(entity)] : undefined;
  if (!s) return [];
  if (s.kind === "num") return samplesFromSeries(s.t, s.v, unit);
  const steps = s.changes.filter((c) => isNumeric(c.s));
  return samplesFromSeries(steps.map((c) => c.t), steps.map((c) => Number(c.s)), unit);
}
