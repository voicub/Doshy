import { planBounds, type Bounds } from "@/lib/geometry";
import { planOfLevel } from "@/lib/levels";
import { activeLevelId, useStore } from "@/lib/store";
import type { Plan } from "@/lib/types";

/** The active level's plan, read from the store at call time (for event handlers). */
export const lvPlan = (): Plan => {
  const s = useStore.getState();
  return planOfLevel(s.plan, activeLevelId(s));
};

/** Bounds of the active level, or of every level while that level is still empty. */
export const levelBounds = (): Bounds | null => planBounds(lvPlan()) ?? planBounds(useStore.getState().plan);
