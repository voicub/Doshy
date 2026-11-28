import type { Dashboard } from "./dbApi.ts";

/** A one-time message for the screen: the plan asked for (`?plan=`, or this device's last choice) does not exist any more / the plan on screen was deleted elsewhere. */
export type PlanNotice = "plan-missing" | "plan-removed";

/** What lib/activePlan shows. `status`: "booting" until the first sync, "switching" while another plan loads. */
export type PlanSnapshot = { id: number | null; list: Dashboard[] | null; defaultId: number | null; status: "booting" | "ready" | "switching"; notice: PlanNotice | null };

let snapshot: PlanSnapshot = { id: null, list: null, defaultId: null, status: "booting", notice: null };
const listeners = new Set<(s: PlanSnapshot) => void>();

export const planStatus = (): PlanSnapshot["status"] => snapshot.status;

/** Change part of the state and tell every listener. */
export function publish(patch: Partial<PlanSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) l(snapshot);
}

/** Be told whenever the plan state changes (and once now). Returns the unsubscribe. */
export function onPlanState(fn: (s: PlanSnapshot) => void): () => void {
  listeners.add(fn);
  fn(snapshot);
  return () => void listeners.delete(fn);
}
