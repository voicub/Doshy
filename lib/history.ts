import type { Plan, Sel } from "./types.ts";
import { withAutoVoids } from "./voids.ts";

/** Most undo steps kept. */
export const HISTORY_LIMIT = 60;

/** The slice of the store the history works on. */
export type HistoryState = { plan: Plan; past: Plan[]; future: Plan[]; gesture: boolean };

const LIST = { wall: "walls", opening: "openings", room: "rooms", item: "items", void: "voids", ground: "ground", path: "paths" } as const;
const cap = (plans: Plan[]) => plans.slice(-HISTORY_LIMIT);

/**
 * Store a new plan. Outside a gesture this is one undo step (the previous plan is kept, redo is dropped);
 * inside a gesture the step was already taken by `beginEdit`, so only the plan changes. An identical plan is a no-op.
 */
export function commitPlan(s: HistoryState, edited: Plan): Partial<HistoryState> {
  const plan = withAutoVoids(edited); // every edit goes through here, so stair holes can never lag behind their stairs (and share the stair's undo step)
  if (plan === s.plan) return {};
  if (s.gesture) return s.future.length ? { plan, future: [] } : { plan };
  return { plan, past: cap([...s.past, s.plan]), future: [] };
}

/** Start a pointer drag / draw / placement: snapshot now, so every change until `endEdit` is a single undo step. */
export const beginEdit = (s: HistoryState): Partial<HistoryState> => ({ gesture: true, past: cap([...s.past, s.plan]) });

/** End a gesture. One that changed nothing leaves no undo step behind. */
export const endEdit = (s: HistoryState): Partial<HistoryState> => (s.past.at(-1) === s.plan ? { gesture: false, past: s.past.slice(0, -1) } : { gesture: false });

export function undoStep(s: HistoryState): Partial<HistoryState> {
  const prev = s.past.at(-1);
  return prev ? { plan: prev, past: s.past.slice(0, -1), future: cap([...s.future, s.plan]) } : {};
}

export function redoStep(s: HistoryState): Partial<HistoryState> {
  const next = s.future.at(-1);
  return next ? { plan: next, future: s.future.slice(0, -1), past: cap([...s.past, s.plan]) } : {};
}

/** The selection, or null when what it points at no longer exists in the plan. */
export function keepSel(sel: Sel, plan: Plan): Sel {
  if (!sel) return null;
  const rows: readonly { id: string }[] | undefined = plan[LIST[sel.type]];
  return rows?.some((o) => o.id === sel.id) ? sel : null;
}
