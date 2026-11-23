import { workerData } from "node:worker_threads";
import { openDb } from "./connection.ts";
import { getPlan, putPlan } from "./plans.ts";

/** Test helper (run in a worker thread): a writer that increments the plan's marker `times` times with compare-and-set, retrying on conflict. */
const { file, times } = workerData as { file: string; times: number };
const db = openDb(file);
let done = 0;
while (done < times) {
  const cur = getPlan(db)!;
  const next = JSON.stringify({ ...JSON.parse(cur.json), marker: Number(JSON.parse(cur.json).marker) + 1 });
  if (putPlan(db, { json: next, baseRev: cur.rev, format: 3 }).ok) done++;
}
db.close();
