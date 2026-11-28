// The charge of a car's battery, for the ring on the car in the 3D view. Pure.
import type { EnergySources, EStates } from "./energy.ts";

/** Words a device tracker's name ends in that its battery sensor does not ("my_tesla_location" -> sensor "my_tesla_battery_level"). */
const TRACKER_TAIL = /_(location|tracker|gps|position|device_tracker|presence)$/;
const MIN_SLUG = 3;

/**
 * The battery sensor that belongs to a car's tracker: a percent sensor of device class "battery" whose id starts with the tracker's name
 * ("level" or "charge" in the id wins over other battery sensors). Undefined when none fits.
 */
export function carSocEntity(tracker: string, states: EStates): string | undefined {
  const slug = tracker.slice(tracker.indexOf(".") + 1).replace(TRACKER_TAIL, "");
  if (slug.length < MIN_SLUG) return undefined;
  const ids = Object.keys(states).filter((id) => {
    const a = states[id]?.attributes;
    return id.startsWith(`sensor.${slug}`) && a?.device_class === "battery" && a.unit_of_measurement === "%";
  });
  const score = (id: string) => (/level|charge|soc/.test(id) ? 0 : 1);
  return ids.sort((a, b) => score(a) - score(b) || a.length - b.length || a.localeCompare(b))[0];
}

const pct = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : undefined;
};

/** The car's charge in percent: the sensor picked in the energy sources, else the tracker's `battery_level` attribute, else its matching battery sensor. */
export function carSoc(sources: EnergySources, tracker: string, states: EStates): number | undefined {
  const picked = sources.carSoc ? pct(states[sources.carSoc]?.state) : undefined;
  if (picked !== undefined) return picked;
  const attr = pct(states[tracker]?.attributes?.battery_level);
  if (attr !== undefined) return attr;
  const sensor = carSocEntity(tracker, states);
  return sensor ? pct(states[sensor]?.state) : undefined;
}
