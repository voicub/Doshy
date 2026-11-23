import { CATALOG } from "./catalog";
import { useCarModels } from "./carModelStore";
import { isCarKind } from "./cars";
import { useStore } from "./store";

/**
 * "Fetch a real model automatically when I place a car" (off by default): when one or two new cars appear in the plan and the setting is on,
 * the car's catalogue model gets its automatic pick. A plan that arrives from storage, the server or an import adds many items at once and
 * during start-up, so only small, later changes count. A car whose automatic pick already failed this session is not retried by itself.
 */
const SETTLE_MS = 6000;
const MAX_NEW = 2;

let seen: Set<string> | null = null;
const startedAt = Date.now();

const carIds = () => new Set(useStore.getState().plan.items.filter((i) => isCarKind(i.kind)).map((i) => i.id));

if (typeof window !== "undefined") {
  useStore.subscribe((s, prev) => {
    if (s.plan.items === prev.plan.items) return;
    const now = carIds();
    const before = seen;
    seen = now;
    if (!before || Date.now() - startedAt < SETTLE_MS || !useCarModels.getState().autoFetch) return;
    const fresh = s.plan.items.filter((i) => isCarKind(i.kind) && !before.has(i.id));
    if (!fresh.length || fresh.length > MAX_NEW) return;
    const have = useCarModels.getState().models;
    const kinds = new Set(fresh.map((i) => i.kind).filter((k) => CATALOG[k]?.car && !have[k]));
    if (!kinds.size) return;
    void import("./carAuto").then(({ upgradeCar, useCarJobs }) => {
      for (const k of kinds) if (!useCarJobs.getState().jobs[k]) upgradeCar(k);
    });
  });
  seen = carIds();
}
