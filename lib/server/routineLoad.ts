// GET /api/ha/routines against Home Assistant: the history of the asked-for devices, the home's time zone and place, and what its automations already do. Read-only. `fetchHa`
// is `haFor(home)` in production and a fake in tests, so a test can never reach a real Home Assistant.
import { isRecord } from "../guards.ts";
import type { ChangeEvent, Covered, RoutinesWire } from "../routinesWire.ts";
import type { HaFetch } from "./haCall.ts";
import { coversOfConfig } from "./routineCoverage.ts";
import { historyPaths, shapeChanges, spanFor } from "./routineHistory.ts";

const HISTORY_TIMEOUT_MS = 30_000; // weeks of a hundred devices take the recorder a while
const MAX_AUTOMATIONS = 150;
const AT_ONCE = 10;

async function history(fetchHa: HaFetch, entities: readonly string[], from: number, to: number): Promise<Record<string, ChangeEvent[]>> {
  const answers = await Promise.all(
    historyPaths(entities, from, to).map(async (path) => {
      const res = await fetchHa(path, { signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`Home Assistant HTTP ${res.status}`);
      const body: unknown = await res.json();
      return body;
    }),
  );
  return shapeChanges(answers, entities, from);
}

/** The home's time zone and place; nulls when Home Assistant does not say (the browser then uses its own zone and has no sun-relative routines). */
export async function homePlace(fetchHa: HaFetch): Promise<{ zone: string | null; lat: number | null; lon: number | null }> {
  const none = { zone: null, lat: null, lon: null };
  try {
    const res = await fetchHa("config");
    const body: unknown = res.ok ? await res.json() : null;
    if (!isRecord(body)) return none;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return { zone: typeof body.time_zone === "string" ? body.time_zone : null, lat: num(body.latitude), lon: num(body.longitude) };
  } catch {
    return none;
  }
}

/** What the switched-on automations do to devices at set times. Null when Home Assistant will not show their configs (the token is not an administrator's) or cannot be asked. */
async function existingAutomations(fetchHa: HaFetch): Promise<Covered[] | null> {
  try {
    const res = await fetchHa("states");
    const states: unknown = res.ok ? await res.json() : null;
    if (!Array.isArray(states)) return null;
    const ids = states.flatMap((s: unknown) => {
      const attrs = isRecord(s) && isRecord(s.attributes) ? s.attributes : null;
      const on = isRecord(s) && typeof s.entity_id === "string" && s.entity_id.startsWith("automation.") && s.state !== "off";
      return on && typeof attrs?.id === "string" ? [attrs.id] : [];
    }).slice(0, MAX_AUTOMATIONS);
    const covers: Covered[] = [];
    for (let i = 0; i < ids.length; i += AT_ONCE) {
      const configs = await Promise.all(ids.slice(i, i + AT_ONCE).map((id) => fetchHa(`config/automation/config/${encodeURIComponent(id)}`)));
      if (configs.some((c) => c.status === 401 || c.status === 403)) return null;
      for (const c of configs) if (c.ok) covers.push(...coversOfConfig(await c.json().catch(() => null)));
    }
    return covers;
  } catch {
    return null;
  }
}

export async function loadRoutines(fetchHa: HaFetch, entities: readonly string[], days: number, now: number): Promise<RoutinesWire> {
  const { from, to } = spanFor(days, now);
  const [entitiesWire, place, covers] = await Promise.all([history(fetchHa, entities, from, to), homePlace(fetchHa), existingAutomations(fetchHa)]);
  return { from, to, days, ...place, entities: entitiesWire, covers };
}
