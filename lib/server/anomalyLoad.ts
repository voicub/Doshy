// GET /api/ha/anomalies against Home Assistant: weeks of hourly means for the asked-for sensors, when each was last heard from, and the home's time zone. Read-only. `fetchHa` is
// `haFor(home)` in production and a fake in tests, so a test can never reach a real Home Assistant.
import type { AnomalyWire } from "../anomalyWire.ts";
import type { HaFetch } from "./haCall.ts";
import { CHUNK, gridFor, historyPath, seenOf, shapeSeries } from "./anomalyHistory.ts";
import { readCapped } from "./readCapped.ts";
import { homePlace } from "./routineLoad.ts";
import { HOUR_MS } from "../anomalyWire.ts";

const HISTORY_TIMEOUT_MS = 30_000; // weeks of a few dozen sensors take the recorder a while

const HISTORY_MAX_BYTES = 16 * 1024 * 1024; // per answer: a Pi cannot hold several of these at once
const STATES_MAX_BYTES = 4 * 1024 * 1024;

async function json(fetchHa: HaFetch, path: string, maxBytes: number): Promise<unknown> {
  const res = await fetchHa(path, { signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Home Assistant HTTP ${res.status}`);
  const bytes = res.body ? await readCapped(res.body, maxBytes) : null;
  if (!bytes) throw new Error("Home Assistant's answer was too large to read here.");
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function loadAnomalies(fetchHa: HaFetch, entities: readonly string[], days: number, now: number): Promise<AnomalyWire> {
  const { fromHour, toHour } = gridFor(days, now);
  const chunks: string[][] = [];
  for (let i = 0; i < entities.length; i += CHUNK) chunks.push(entities.slice(i, i + CHUNK));
  const [answers, states, place] = await Promise.all([
    Promise.all(chunks.map((c) => json(fetchHa, historyPath(c, fromHour * HOUR_MS, now), HISTORY_MAX_BYTES))),
    json(fetchHa, "states", STATES_MAX_BYTES).catch(() => null), // only for "last heard from": the answer is useful without it
    homePlace(fetchHa),
  ]);
  return { from: fromHour * HOUR_MS, to: now, days, zone: place.zone, series: shapeSeries(answers, entities, fromHour, toHour, now), seen: seenOf(states, entities) };
}
