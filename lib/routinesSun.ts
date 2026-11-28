// Sunrise and sunset as instants, for "you close the curtains within 10 minutes of sunset" routines. Built on the same sun model as the sky (lib/sky.ts sunPosition). Pure.
import type { SunEvent } from "./automationsDevice.ts";
import { MIN_MS } from "./routinesTime.ts";
import { sunPosition } from "./sky.ts";

/** The sun counts as risen when its centre is this far below the geometric horizon (what a calendar and Home Assistant call sunrise). */
const HORIZON = -0.833;
const SPAN_MS = 13 * 3_600_000;
const STEP_MS = 15 * MIN_MS;

/**
 * The sunrise or sunset nearest to `t` (within 13 hours), as an instant in ms; null when the sun does not cross the horizon that way (polar day or night).
 * Scans every 15 minutes for a crossing and narrows it to the second by bisection.
 */
export function sunEventNear(t: number, lat: number, lon: number, event: SunEvent): number | null {
  const rising = event === "sunrise";
  const above = (at: number) => sunPosition(new Date(at), lat, lon).elevation - HORIZON;
  let best: number | null = null;
  let prev = above(t - SPAN_MS);
  for (let at = t - SPAN_MS + STEP_MS; at <= t + SPAN_MS; at += STEP_MS) {
    const cur = above(at);
    if (rising ? prev < 0 && cur >= 0 : prev >= 0 && cur < 0) {
      let lo = at - STEP_MS;
      let hi = at;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        const sunUp = above(mid) >= 0;
        if (sunUp === rising) hi = mid;
        else lo = mid;
      }
      const crossing = (lo + hi) / 2;
      if (best === null || Math.abs(crossing - t) < Math.abs(best - t)) best = crossing;
    }
    prev = cur;
  }
  return best;
}
