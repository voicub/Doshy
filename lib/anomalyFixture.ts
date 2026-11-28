// Made-up weeks of hourly readings for the anomaly watch's tests (and for trying the panel against a fake Home Assistant). Not used by the app itself.
import { calendar, type Hour } from "./anomalyStats.ts";
import { HOUR_MS, type AnomalyWire, type Series } from "./anomalyWire.ts";
import type { HAState } from "./ha.ts";
import { at, seeded, ZONE } from "./routinesFixture.ts";

export { at, ZONE };

/** Thursday 20 March 2025, noon in Bucharest; the clock there changes on Sunday 30 March. */
export const NOW = at("2025-03-20", "12:00");

/**
 * `days` days of hours up to and including the one `now` falls in, each value computed from where the hour sits on the home's wall clock (`h.hod`, `h.slot`) and its index
 * (0 = oldest). A value of null is a hour with no reading.
 */
export function series(f: (h: Hour, i: number, n: number) => number | null, days = 21, now = NOW, zone = ZONE): Series {
  const h1 = Math.floor(now / HOUR_MS);
  const n = days * 24 + 1;
  const h0 = h1 - days * 24;
  const cal = calendar(h0, n, zone);
  return { h0, v: cal.map((h, i) => f(h, i, n)) };
}

/** A small repeatable wobble: -amount..+amount. */
export function wobble(seed: number, amount: number): () => number {
  const r = seeded(seed);
  return () => (r() * 2 - 1) * amount;
}

export const wire = (entries: Record<string, Series>, over: Partial<AnomalyWire> = {}, now = NOW): AnomalyWire => ({
  from: now - 21 * 24 * HOUR_MS,
  to: now,
  days: 21,
  zone: ZONE,
  series: entries,
  seen: Object.fromEntries(Object.keys(entries).map((id) => [id, now - 5 * 60_000])),
  ...over,
});

export const state = (entity_id: string, value: string, attrs: Partial<HAState["attributes"]> = {}, minutesAgo = 0, now = NOW): HAState => ({
  entity_id,
  state: value,
  attributes: attrs,
  last_changed: new Date(now - minutesAgo * 60_000).toISOString(),
});

export const statesOf = (...list: HAState[]): Record<string, HAState> => Object.fromEntries(list.map((s) => [s.entity_id, s]));
