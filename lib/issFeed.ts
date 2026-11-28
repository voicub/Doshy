import { isRecord } from "./guards.ts";
import { parseIssFix, type IssFix } from "./iss.ts";

export type IssReading = { fix: IssFix | null; prevFix: IssFix | null; status: "off" | "loading" | "ready" | "disabled" | "unavailable" };

function fixOf(value: unknown): IssFix | null {
  if (!isRecord(value)) return null;
  return parseIssFix({ latitude: value.lat, longitude: value.lon, altitude: value.altitudeKm, velocity: value.velocityKmh, timestamp: value.timestamp, footprint: value.footprintKm, units: "kilometers" });
}

/** Validate the dashboard server reply, not just the upstream API. Stale fixes must not masquerade as a live station. */
export function parseIssFeed(value: unknown, now = Date.now()): IssReading {
  const unavailable: IssReading = { fix: null, prevFix: null, status: "unavailable" };
  if (!isRecord(value)) return unavailable;
  if (value.disabled === true) return { ...unavailable, status: "disabled" };
  const fix = fixOf(value.fix);
  const prevFix = value.prevFix === null ? null : fixOf(value.prevFix);
  if (!fix || (value.prevFix !== null && !prevFix) || Math.abs(now / 1000 - fix.timestamp) > 120 || (prevFix && (prevFix.timestamp >= fix.timestamp || fix.timestamp - prevFix.timestamp > 120))) return unavailable;
  return { fix, prevFix, status: "ready" };
}
