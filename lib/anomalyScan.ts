// Browser orchestration only: one bounded history response, then yield between sensors.
import { prepare, inspect, finish, type Watch } from "./anomaly";
import { DEFAULT_DAYS, parseAnomalyWire, type AnomalyWire } from "./anomalyWire";
import { historyEntities } from "./anomalyPlan";
import { haFetch } from "./haHome";
import { within } from "./requestTimeout";
import { isRecord } from "./guards";
import type { Anomaly } from "./anomalyTypes";

export const ANOMALY_CACHE_MS = 15 * 60_000;
export async function scanAnomalies(watch: Watch, signal: AbortSignal, fresh: boolean): Promise<{ raw: Anomaly[]; wire: AnomalyWire | null }> {
  const entities = historyEntities(watch.subjects);
  let wire = watch.wire;
  if (entities.length) {
    const query = new URLSearchParams({ entities: entities.join(","), days: String(DEFAULT_DAYS) });
    if (fresh) query.set("fresh", "1");
    const res = await haFetch(`/api/ha/anomalies?${query}`, { cache: "no-store", signal: within(45_000, signal) });
    const body: unknown = await res.json();
    if (!res.ok) throw new Error(isRecord(body) && typeof body.error === "string" ? body.error : `History answered ${res.status}`);
    wire = parseAnomalyWire(body);
  }
  const prepared = prepare({ ...watch, wire, zone: wire?.zone ?? watch.zone });
  const all = [];
  let slice = performance.now();
  for (const subject of prepared.subjects) {
    signal.throwIfAborted();
    all.push(...inspect(prepared, subject));
    if (performance.now() - slice > 10) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      slice = performance.now();
    }
  }
  signal.throwIfAborted();
  return { raw: finish(all), wire };
}
