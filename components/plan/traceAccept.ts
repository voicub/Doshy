import { fenceDefaults, isFence } from "@/lib/fences";
import { planOfLevel } from "@/lib/levels";
import { activeLevelId, useStore } from "@/lib/store";
import { freshWalls, toPlanSeg } from "@/lib/traceSuggest";
import { uid } from "@/lib/uid";
import { useTraceUi } from "./traceUi";
import { useWallUi } from "./wallUi";

/**
 * Adds the suggested walls with these ids (all of them without `ids`) to the active level, in the Wall tool's current style, as ONE undo step,
 * through the same wall record `addWall` makes. Walls already on the level are not doubled. The accepted suggestions leave the list. Returns how many walls were added.
 */
export function acceptSuggestions(ids?: number[]): number {
  const ui = useTraceUi.getState();
  const state = useStore.getState();
  const trace = state.plan.trace;
  if (!trace) return 0;
  const chosen = ui.suggestions.filter((s) => !ids || ids.includes(s.id));
  const level = activeLevelId(state);
  const onPlan = planOfLevel(state.plan, level).walls.map((w) => ({ a: w.a, b: w.b }));
  const fresh = freshWalls(onPlan, chosen.flatMap((s) => toPlanSeg(s, trace) ?? []));
  const style = useWallUi.getState().style;
  if (fresh.length) {
    state.editPlan((p) => ({ ...p, walls: [...p.walls, ...fresh.map((s) => ({ id: uid(), a: s.a, b: s.b, style, ...(isFence(style) ? fenceDefaults(style) : {}), level }))] }));
  }
  ui.drop(chosen.map((s) => s.id));
  return fresh.length;
}
