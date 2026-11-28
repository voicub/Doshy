import { workerData } from "node:worker_threads";
import { openDb } from "./connection.ts";
import { getPlan, putPlan } from "./plans.ts";

/** Test helper (run in a worker thread): a writer that increments the marker of one dashboard's plan `times` times with compare-and-set, retrying on conflict. */
const { file, times, dashboardId } = workerData as { file: string; times: number; dashboardId: number };
const db = openDb(file);
let done = 0;
while (done < times) {
  const cur = getPlan(db, dashboardId)!;
  const next = JSON.stringify({ ...JSON.parse(cur.json), marker: Number(JSON.parse(cur.json).marker) + 1 });
  if (putPlan(db, dashboardId, { json: next, baseRev: cur.rev, format: 3 }).ok) done++;
}
db.close();
