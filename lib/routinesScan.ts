// One scan in the browser: ask the server for the weeks of changes, run the detector device by device with a pause between devices (so a Raspberry Pi's screen never freezes),
// keep only ideas Doshy could really make, and say in words what could not be checked. Browser only (fetch); the detector itself is lib/routines.ts.
import { validateRecipe } from "./automations.ts";
import { errorMessage } from "./guards.ts";
import { haFetch } from "./haHome.ts";
import type { HAState } from "./ha.ts";
import { finish, prepare, suggestionsFor, type Suggestion } from "./routines.ts";
import type { RoutinePlan } from "./routinesPlan.ts";
import { recipeOf } from "./routinesRecipe.ts";
import { parseRoutines } from "./routinesWire.ts";
import { within } from "./requestTimeout.ts";

/** How many whole days back the scan looks (Home Assistant's recorder keeps 10 by default; the detector uses as many as there are). */
export const SCAN_DAYS = 21;
/** The server gives Home Assistant 30 s for the history; its answer or its explanation arrives before this. */
const SCAN_TIMEOUT_MS = 45_000;
/** Work longer than this without a pause would show as a stutter. */
const SLICE_MS = 12;

export type Scan = { suggestions: Suggestion[]; scannedAt: number; notes: string[] };

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function failure(res: Response): Promise<Error> {
  const body: unknown = await res.json().catch(() => null);
  const text = body !== null && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "";
  return new Error(text || `The dashboard server answered ${res.status}.`);
}

/** Look for routines in the active plan's devices. Throws with a plain sentence when the history cannot be read. */
export async function scanRoutines(plan: RoutinePlan, states: Record<string, HAState>, opts: { fresh: boolean; signal?: AbortSignal; now?: number }): Promise<Scan> {
  if (!plan.devices.size) return { suggestions: [], scannedAt: Date.now(), notes: ["No lights, curtains, thermostats or other devices are linked in this plan yet."] };
  const params = new URLSearchParams({ entities: plan.entities.join(","), days: String(SCAN_DAYS) });
  if (opts.fresh) params.set("fresh", "1");
  const res = await haFetch(`/api/ha/routines?${params}`, { cache: "no-store", signal: within(SCAN_TIMEOUT_MS, opts.signal) }).catch((e: unknown) => {
    throw new Error(`Could not read the history: ${errorMessage(e)}`);
  });
  if (!res.ok) throw await failure(res);
  const wire = parseRoutines(await res.json());
  const now = opts.now ?? Date.now();
  const ctx = prepare({ ...wire, now, windowDays: wire.days, links: plan.links });
  const notes: string[] = [];
  if (!ctx) return { suggestions: [], scannedAt: now, notes: ["Home Assistant has too little history for these devices to see any habits yet. Try again in a few days."] };
  if (ctx.window.length < wire.days - 1) notes.push(`Home Assistant only kept ${ctx.window.length} days of history, so these ideas rest on ${ctx.window.length} days.`);
  if (wire.covers === null) notes.push("Doshy could not look at your existing automations (that needs an administrator's token), so an idea may already exist as one.");

  const all: Suggestion[] = [];
  let sliceStart = performance.now();
  for (const entity of plan.devices.keys()) {
    all.push(...suggestionsFor(ctx, entity));
    if (performance.now() - sliceStart > SLICE_MS) {
      await pause();
      opts.signal?.throwIfAborted();
      sliceStart = performance.now();
    }
  }
  // only what Doshy could really make: the same check the server runs again before creating anything
  const makeable = all.filter((s) => validateRecipe(recipeOf(s, { onlyHome: false }), { states, notify: [] }).ok);
  return { suggestions: finish(makeable), scannedAt: now, notes };
}
