import { create } from "zustand";
import {
  ApiError,
  NetError,
  createDashboard,
  deleteDashboard,
  patchDashboard,
  setDashboardOrder,
  setDefaultDashboard,
  undeleteDashboard,
  type Dashboard,
  type NewPlanBody,
  type PlanIdentityPatch,
} from "./dbApi";
import { SwitchRefused, dismissPlanNotice, flushNow, refreshPlans, switchPlanTo } from "./dbClient";
import { withPlanParam } from "./dbMerge";
import { freeName } from "./planIdentity";
import { onPlanState, type PlanNotice } from "./planState";
import { STARTER_VERSION, starterPlan } from "./starterPlan";
import { useStore } from "./store";
import { TEMPLATES } from "./templates";
import type { Plan } from "./types";

/**
 * Several plans ("dashboards" in the code and the API): the plan on screen, the list of plans, and everything the UI can do with them.
 *
 * STATE  `useActivePlan` (zustand):
 *   id        the plan on screen; null until the first sync has decided it
 *   list      every plan that is not deleted, in the owner's order (null until loaded); refreshed every 15 s and after every action below
 *   defaultId the home plan (what a device without a choice shows; the only plan the curtain automation reads)
 *   status    "booting" until the first sync, "switching" while another plan loads, else "ready"
 *   notice    one-time: "plan-missing" (the plan asked for no longer exists, the home plan is shown) or "plan-removed" (the plan on screen was
 *             deleted on another device; this device's copy is kept in the stash). Clear with `dismissNotice()`.
 *   error     the last action that failed, `{ code, message }` (message is plain words); cleared by the next action or `clearError()`
 *   undo      the plan just deleted here, for the 10 s Undo toast (`undoDeletePlan()`); the server keeps it for 7 days
 *
 * ACTIONS (all async, all reject with the error that is also put in `error`: `ApiError` (`code` name_taken, too_many, is_default, last_plan,
 * gone, not_found ...), `NetError` (offline), `SwitchRefused` (unsaved edits are still waiting: never lose an edit)):
 *   switchPlan(id)          show another plan: unsaved edits are sent first, the rest of the device's view (camera focus, room isolation) resets
 *   createPlan(input)       a new plan from "blank" | "starter" | "duplicate" | "import"; shown at once unless `switchTo: false`
 *   renamePlan(id, name) / editPlan(id, { name?, icon?, color?, description? })
 *   deletePlan(id)          soft delete (the home plan and the last plan are refused); if it is the plan on screen the home plan is shown first
 *   undoDeletePlan()        bring the plan back that `undo` names
 *   setDefaultPlan(id)      make it the home plan
 *   reorderPlans(ids)       the order to list the plans in
 *   reloadPlans()           read the list now
 *   dismissNotice() / clearError()
 *
 * A device is pinned to one plan with `?plan=<id>` in the URL (kiosk): it wins over the device's last choice, and switching rewrites it.
 */

export type PlanProblem = { code: string; message: string };

export type ActivePlanState = {
  id: number | null;
  list: Dashboard[] | null;
  defaultId: number | null;
  status: "booting" | "ready" | "switching";
  notice: PlanNotice | null;
  error: PlanProblem | null;
  undo: { id: number; name: string } | null;
};

export const useActivePlan = create<ActivePlanState>(() => ({ id: null, list: null, defaultId: null, status: "booting", notice: null, error: null, undo: null }));

onPlanState((s) => useActivePlan.setState(s));

const UNDO_MS = 10_000;

/** The plan on screen as listed (name, icon, colour...), or null. */
export const activeDashboard = (): Dashboard | null => {
  const { id, list } = useActivePlan.getState();
  return list?.find((d) => d.id === id) ?? null;
};

export const dismissNotice = (): void => dismissPlanNotice();
export const clearError = (): void => useActivePlan.setState({ error: null });

function problemOf(e: unknown): PlanProblem {
  if (e instanceof SwitchRefused || e instanceof ApiError) return { code: e instanceof ApiError ? e.code : "unsaved", message: e.message };
  if (e instanceof NetError) return { code: "offline", message: "The server cannot be reached. Try again when it is back." };
  return { code: "error", message: "Something went wrong. Please try again." };
}

/** Run one action: clear the last error, and when it fails remember why (and rethrow, so the caller can react too). */
async function act<T>(fn: () => Promise<T>): Promise<T> {
  useActivePlan.setState({ error: null });
  try {
    return await fn();
  } catch (e) {
    useActivePlan.setState({ error: problemOf(e) });
    throw e;
  }
}

/** After another plan is on screen: the view of the old plan (room focus, isolation) does not apply, and a kiosk URL follows. */
function leftPlan(id: number) {
  const s = useStore.getState();
  s.setIsolatedRoom(null);
  s.setFocusRoom(null);
  const search = typeof location === "undefined" ? null : withPlanParam(location.search, id);
  if (search !== null) history.replaceState(history.state, "", `${location.pathname}${search}${location.hash}`);
}

async function show(id: number): Promise<void> {
  try {
    await switchPlanTo(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) await refreshPlans().catch(() => undefined); // the plan is gone: the list says so
    throw e;
  }
  leftPlan(id);
}

export const switchPlan = (id: number): Promise<void> => act(() => show(id));

type Look = { icon?: string; color?: string; description?: string; switchTo?: boolean; /** the home (connection id) the plan shows; null or absent = the main home */ haConnection?: string | null };
export type NewPlan =
  | ({ from: "blank" | "starter"; name: string } & Look)
  /** a copy of another plan's drawing (not its versions); the name defaults to "<name> copy" */
  | { from: "duplicate"; sourceId: number; name?: string; switchTo?: boolean; /** absent = the copy keeps the source's home */ haConnection?: string | null }
  /** a plan read from a file (components/ui/planIO `readPlanImport`); a name that is taken becomes "name 2" */
  | ({ from: "import"; plan: Plan; name: string } & Look);

async function bodyFor(input: NewPlan): Promise<NewPlanBody> {
  switch (input.from) {
    case "duplicate":
      await flushNow(); // a copy of the plan on screen must hold its latest edits
      return { fromId: input.sourceId, ...(input.name ? { name: input.name } : {}) };
    case "import":
      return { name: freeName(input.name, useActivePlan.getState().list?.map((d) => d.name) ?? []), plan: input.plan, format: STARTER_VERSION, icon: input.icon, color: input.color, description: input.description, haConnection: input.haConnection };
    case "starter":
      return { name: input.name, plan: starterPlan(), format: STARTER_VERSION, icon: input.icon, color: input.color, description: input.description, haConnection: input.haConnection };
    case "blank":
      return { name: input.name, plan: (TEMPLATES.find((t) => t.id === "blank-apartment") ?? TEMPLATES[0]).build(), format: STARTER_VERSION, icon: input.icon, color: input.color, description: input.description, haConnection: input.haConnection };
  }
}

export const createPlan = (input: NewPlan): Promise<Dashboard> =>
  act(async () => {
    let dashboard = await createDashboard(await bodyFor(input));
    // a copy takes its source's home on the server; a different choice is applied right after
    if (input.from === "duplicate" && input.haConnection !== undefined && input.haConnection !== dashboard.haConnection) dashboard = await patchDashboard(dashboard.id, { haConnection: input.haConnection });
    await refreshPlans();
    if (input.switchTo !== false) await show(dashboard.id);
    return dashboard;
  });

export const editPlan = (id: number, patch: PlanIdentityPatch): Promise<Dashboard> =>
  act(async () => {
    const dashboard = await patchDashboard(id, patch);
    await refreshPlans();
    return dashboard;
  });

export const renamePlan = (id: number, name: string): Promise<Dashboard> => editPlan(id, { name });

let undoTimer: ReturnType<typeof setTimeout> | undefined;

export const deletePlan = (id: number): Promise<void> =>
  act(async () => {
    const { id: shown, list, defaultId } = useActivePlan.getState();
    const plan = list?.find((d) => d.id === id);
    // refused here, before anything moves: the server would refuse it too, but only after the screen had already left this plan
    if (id === defaultId) throw new ApiError(409, "is_default", "This is the home plan. Make another plan the home plan first.");
    if (list && list.length <= 1) throw new ApiError(409, "last_plan", "You need at least one plan.");
    if (shown === id && defaultId !== null) await show(defaultId);
    await deleteDashboard(id);
    await refreshPlans();
    clearTimeout(undoTimer);
    useActivePlan.setState({ undo: { id, name: plan?.name ?? "Plan" } });
    undoTimer = setTimeout(() => useActivePlan.setState((s) => (s.undo?.id === id ? { undo: null } : {})), UNDO_MS);
  });

export const undoDeletePlan = (): Promise<Dashboard | null> =>
  act(async () => {
    const pending = useActivePlan.getState().undo;
    if (!pending) return null;
    const dashboard = await undeleteDashboard(pending.id);
    clearTimeout(undoTimer);
    useActivePlan.setState({ undo: null });
    await refreshPlans();
    return dashboard;
  });

export const setDefaultPlan = (id: number): Promise<void> =>
  act(async () => {
    await setDefaultDashboard(id);
    await refreshPlans();
  });

export const reorderPlans = (ids: number[]): Promise<void> =>
  act(async () => {
    await setDashboardOrder(ids);
    await refreshPlans();
  });

export const reloadPlans = (): Promise<void> => act(async () => void (await refreshPlans()));

// Development only (compiled out of production builds): the actions can be driven from the browser console and headless tests.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  Object.assign(window, { doshyPlans: { useActivePlan, switchPlan, createPlan, editPlan, deletePlan, undoDeletePlan, setDefaultPlan, reloadPlans } });
}
