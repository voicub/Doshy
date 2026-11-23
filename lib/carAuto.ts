import { create } from "zustand";
import { CATALOG } from "./catalog";
import { autoDownload, FinderError, keepCarModel, tokenStatus, type AutoAlt } from "./carImport";
import { useCarModels } from "./carModelStore";
import { isCarKind } from "./cars";
import { useStore } from "./store";

/**
 * Automatic real models: the server picks the best Sketchfab model for a catalogue car, we optimise and fit it and assign it. Jobs run one
 * after another in the background (the UI only shows their progress), so "Upgrade all cars in my plan" never blocks anything.
 */
type Job = {
  state: "queued" | "working" | "done" | "failed";
  f: number; // 0..1
  label: string; // what is happening, in plain words
  message?: string; // the result or the reason it failed
  needsToken?: boolean;
  alternatives: AutoAlt[];
  tried: string[]; // uids already used for this car (so "try the next one" moves on)
};

const BLANK: Job = { state: "queued", f: 0, label: "Waiting", alternatives: [], tried: [] };
const RETRY_BUSY_MS = 20_000;
const MAX_BUSY_RETRIES = 3;
const MAX_BAD_MODELS = 2; // downloads that turned out unusable before giving up on a car

export const useCarJobs = create<{ jobs: Record<string, Job> }>(() => ({ jobs: {} }));

let tokenMissing = false;
let chain: Promise<void> = Promise.resolve();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const patch = (carId: string, p: Partial<Job>) => useCarJobs.setState((s) => ({ jobs: { ...s.jobs, [carId]: { ...(s.jobs[carId] ?? BLANK), ...p } } }));

async function run(carId: string, skip: string[]) {
  if (tokenMissing) return patch(carId, { state: "failed", needsToken: true, label: "Needs a Sketchfab token", message: "Add your Sketchfab token first (see the steps), then try again." });
  patch(carId, { state: "working", f: 0.04, label: "Looking for the best model", needsToken: false, message: undefined });
  const tried = [...skip];
  let busy = 0;
  let bad = 0;
  for (;;) {
    try {
      const r = await autoDownload(carId, tried);
      tried.push(r.pick.uid);
      patch(carId, { f: 0.2, label: "Preparing the model" });
      try {
        const { entry } = await keepCarModel(r.buf, r.attribution, (f, label) => patch(carId, { f: 0.2 + f * 0.8, label }));
        useCarModels.getState().assign(carId, entry);
        patch(carId, { state: "done", f: 1, label: "Done", message: `Using "${r.attribution.name}" by ${r.attribution.author}`, alternatives: r.alternatives, tried });
        return;
      } catch (e) {
        if (++bad > MAX_BAD_MODELS) throw e;
        patch(carId, { f: 0.1, label: "That one did not work, trying the next" });
        continue;
      }
    } catch (e) {
      const err = e instanceof FinderError ? e : new FinderError("invalid_model", "That model could not be prepared.");
      if (err.code === "rate_limited" && ++busy <= MAX_BUSY_RETRIES) {
        patch(carId, { label: "Sketchfab is busy, waiting a moment" });
        await sleep(RETRY_BUSY_MS);
        continue;
      }
      if (err.code === "needs_token") tokenMissing = true;
      patch(carId, { state: "failed", f: 0, label: "Could not use a real model", message: err.message, needsToken: err.code === "needs_token", tried });
      return;
    }
  }
}

/** Queue one car's automatic pick. `skip` = models to pass over ("not right? try the next one"). A car that is already queued or working is left alone. */
export function upgradeCar(carId: string, skip: string[] = []) {
  const now = useCarJobs.getState().jobs[carId];
  if (now && (now.state === "queued" || now.state === "working")) return;
  patch(carId, { ...BLANK, tried: skip, alternatives: [] });
  chain = chain.then(() => run(carId, skip)).catch(() => undefined);
}

/** The next-best model for a car that already has one. */
export function tryNext(carId: string) {
  const uid = useCarModels.getState().models[carId]?.attribution.uid;
  const tried = useCarJobs.getState().jobs[carId]?.tried ?? [];
  upgradeCar(carId, [...new Set([...tried, ...(uid ? [uid] : [])])]);
}

/** Catalogue cars standing in the plan that have no real model yet (each kind once). */
export function carsToUpgrade(): string[] {
  const have = useCarModels.getState().models;
  const kinds = new Set(useStore.getState().plan.items.map((i) => i.kind).filter((k) => isCarKind(k) && CATALOG[k]?.car && !have[k]));
  return [...kinds];
}

/** "Upgrade all cars in my plan": queues every car kind that does not have a real model yet; returns how many were queued. */
export function upgradeAll(): number {
  const todo = carsToUpgrade().filter((k) => {
    const s = useCarJobs.getState().jobs[k]?.state;
    return s !== "queued" && s !== "working";
  });
  for (const k of todo) upgradeCar(k);
  return todo.length;
}

/** The owner added the token: forget that it was missing, so queued and new jobs may run. */
export async function recheckToken(): Promise<boolean> {
  const ok = await tokenStatus();
  if (ok) tokenMissing = false;
  return ok;
}
