// Which Home Assistant the dashboard is showing right now (docs/multi-home.md). Every plan names one (`Dashboard.haConnection`, null = the main home the server was set up with);
// this module follows the plan on screen, puts that choice on every request to /api/ha/* as `X-Doshy-Home`, and tells the places that hold data of the old home to let go of it.
// Pure and dependency-light (lib/planState.ts only): lib/ha.ts, the store and every Home Assistant fetch use it, so it must never import them.
import { onPlanState, type PlanSnapshot } from "./planState.ts";

/** The header the server reads (lib/haServer.ts `HOME_HEADER`; written out here because that file is server-only). */
export const HOME_HEADER = "X-Doshy-Home";
/** What the server calls the built-in home. */
export const MAIN_HOME = "main";

let home: string | null = null;
let known = typeof window === "undefined"; // tests and server rendering have no plan list to wait for
const listeners = new Set<(id: string | null) => void>();

/** A server that never says which plan is on screen (offline at start, no database) must not leave the dashboard without Home Assistant for ever: after this long the main home is assumed. */
const KNOWN_FALLBACK_MS = 4000;

/** The connection id of the home on screen, or null for the main home. */
export const currentHome = (): string | null => home;

/** The request headers for the home on screen: none for the main home (a request without the header IS the main home, as before there were several). */
export const homeHeaders = (): Record<string, string> => (home === null ? {} : { [HOME_HEADER]: home });

/** `fetch` for a /api/ha/* route: the same call with the home of the plan on screen added. Waits (at most a few seconds, once per page load) until the plan on screen has said which home that is. */
export async function haFetch(input: string, init: RequestInit = {}): Promise<Response> {
  await homeKnown();
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(homeHeaders())) headers.set(k, v);
  return fetch(input, { ...init, headers });
}

/** Be told when another home comes on screen (never for a switch between two plans of the same home). Returns the unsubscribe. */
export function onHomeChange(fn: (id: string | null) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

// Everything that asks Home Assistant waits here until the plan on screen has said which home it shows (see `homeKnown`).
const gate = Promise.withResolvers<void>();
if (known) gate.resolve();
let fallback: NodeJS.Timeout | undefined;

function release() {
  known = true;
  clearTimeout(fallback);
  gate.resolve();
}

/** Say which home the plan on screen shows. The first call also releases everything waiting in `homeKnown`. Returns true when the home changed. */
export function setHome(id: string | null): boolean {
  const changed = home !== id;
  home = id;
  if (!known) release();
  if (changed) for (const l of listeners) l(id);
  return changed;
}

/** Resolves once the plan on screen has said which home it shows, so the first poll asks the right one (not the main home for a plan that lives elsewhere). */
export function homeKnown(): Promise<void> {
  if (!known) fallback ??= setTimeout(release, KNOWN_FALLBACK_MS);
  return gate.promise;
}

/** The home the plan on screen shows, from the plan list. Null while the list does not have it (the main home). */
export function homeOfSnapshot(s: Pick<PlanSnapshot, "id" | "list">): string | null {
  return s.list?.find((d) => d.id === s.id)?.haConnection ?? null;
}

// Follow the plan on screen. Not while the first sync is still deciding which plan that is, and not mid-switch: the old home stays until the new plan is there.
onPlanState((s) => {
  if (s.status === "booting" || s.status === "switching") return;
  setHome(homeOfSnapshot(s));
});
