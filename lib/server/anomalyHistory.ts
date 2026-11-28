// The anomaly watch's history, the server side: check the request, build the Home Assistant history queries and shape its answer into one number per hour per sensor (the
// time-weighted mean, so a sensor that reports every second and one that reports on change weigh the same). Pure (no fetch, no Next): the node test runner loads this file directly.
import { isRecord } from "../guards.ts";
import { DEFAULT_DAYS, HOUR_MS, MAX_DAYS, MAX_ENTITIES, MAX_HOURS, MIN_DAYS, type Series } from "../anomalyWire.ts";
import { ENTITY_ID } from "../timeline.ts";

export { DEFAULT_DAYS };
/** Home Assistant is asked for this many sensors at a time: a month of a hundred sensors in one query makes the recorder (and a Raspberry Pi running it) stall. */
export const CHUNK = 25;

export type AnomalyQuery = { ok: true; entities: string[]; days: number } | { ok: false; error: string };

/** The request's `entities` (comma separated sensor ids) and `days` (7 to 30), checked. Only `sensor.*` is read: that is where hours of numbers live. */
export function parseAnomalyQuery(sp: URLSearchParams): AnomalyQuery {
  const entities = [...new Set((sp.get("entities") ?? "").split(",").filter(Boolean))];
  if (!entities.length) return { ok: false, error: "entities is required" };
  if (entities.length > MAX_ENTITIES) return { ok: false, error: `at most ${MAX_ENTITIES} entities` };
  if (!entities.every((e) => ENTITY_ID.test(e) && e.startsWith("sensor."))) return { ok: false, error: "only sensors can be read" };
  const raw = sp.get("days");
  const days = raw === null ? DEFAULT_DAYS : Number(raw);
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) return { ok: false, error: `days must be a whole number from ${MIN_DAYS} to ${MAX_DAYS}` };
  return { ok: true, entities, days };
}

/** The grid: whole UTC hours, from the hour `days` ago to the hour `now` falls in (that one is part way through). */
export function gridFor(days: number, now: number): { fromHour: number; toHour: number } {
  const toHour = Math.floor(now / HOUR_MS);
  return { fromHour: toHour - days * 24, toHour };
}

/** One history query for these sensors (ids are validated: their commas stay literal). Minimal response, no attributes: a far smaller answer. */
export function historyPath(entities: readonly string[], fromMs: number, toMs: number): string {
  return `history/period/${new Date(fromMs).toISOString()}?filter_entity_id=${entities.join(",")}&minimal_response&no_attributes&end_time=${encodeURIComponent(new Date(toMs).toISOString())}`;
}

const NUMBER = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;

/** A state as a reading: only a plain number counts (`unavailable`, `unknown` and text are gaps). */
const reading = (state: string): number | null => (NUMBER.test(state) ? Number(state) : null);

/**
 * One sensor's rows as hours: each state holds from its time until the next one's (the last until `now`), and an hour's value is the mean of what it held weighted by how long.
 * An hour with less than a minute of usable readings is null. Hours before the first row are null (Home Assistant has no history there).
 */
export function hourlyMeans(rows: readonly unknown[], fromHour: number, toHour: number, now: number): (number | null)[] {
  const n = toHour - fromHour + 1;
  const sums = new Float64Array(n);
  const weights = new Float64Array(n);
  const points: { t: number; v: number | null }[] = [];
  for (const row of rows) {
    if (!isRecord(row) || typeof row.state !== "string") continue;
    const stamp = row.last_updated ?? row.last_changed;
    const t = Date.parse(typeof stamp === "string" ? stamp : "");
    if (Number.isFinite(t)) points.push({ t: Math.max(fromHour * HOUR_MS, t), v: reading(row.state) });
  }
  points.sort((a, b) => a.t - b.t);
  for (let i = 0; i < points.length; i++) {
    const { t, v } = points[i];
    const end = Math.min(now, points[i + 1]?.t ?? now);
    if (v === null || end <= t) continue;
    for (let h = Math.floor(t / HOUR_MS); h * HOUR_MS < end; h++) {
      const k = h - fromHour;
      if (k < 0 || k >= n) continue;
      const overlap = Math.min(end, (h + 1) * HOUR_MS) - Math.max(t, h * HOUR_MS);
      sums[k] += v * overlap;
      weights[k] += overlap;
    }
  }
  return Array.from(sums, (s, k) => (weights[k] >= 60_000 ? Math.round((s / weights[k]) * 1000) / 1000 : null));
}

/** Home Assistant's history answers (one per query: a list of per-sensor row lists) as hourly series. Rows of entities that were not asked for are ignored; a sensor with no number at all is left out. */
export function shapeSeries(answers: readonly unknown[], wanted: readonly string[], fromHour: number, toHour: number, now: number): Record<string, Series> {
  const want = new Set(wanted);
  const out: Record<string, Series> = {};
  for (const answer of answers) {
    if (!Array.isArray(answer)) continue;
    for (const rows of answer as unknown[]) {
      if (!Array.isArray(rows) || !rows.length) continue;
      const first: unknown = rows[0];
      const id = isRecord(first) && typeof first.entity_id === "string" ? first.entity_id : "";
      if (!want.has(id) || out[id]) continue;
      const v = hourlyMeans(rows, fromHour, toHour, now);
      if (v.length <= MAX_HOURS && v.some((x) => x !== null)) out[id] = { h0: fromHour, v };
    }
  }
  return out;
}

/** When Home Assistant last heard from each asked-for sensor: `last_reported` (it moves even when the value did not), else `last_updated`, else `last_changed`. */
export function seenOf(states: unknown, wanted: readonly string[]): Record<string, number> {
  const want = new Set(wanted);
  const out: Record<string, number> = {};
  if (!Array.isArray(states)) return out;
  for (const s of states as unknown[]) {
    if (!isRecord(s) || typeof s.entity_id !== "string" || !want.has(s.entity_id)) continue;
    const times = [s.last_reported, s.last_updated, s.last_changed].map((x) => (typeof x === "string" ? Date.parse(x) : NaN)).filter(Number.isFinite);
    if (times.length) out[s.entity_id] = Math.max(...times);
  }
  return out;
}
