import { useStore } from "@/lib/store";
import { nearestPoint, snapPoints } from "@/lib/traceSuggest";
import type { Pt } from "@/lib/types";
import { useTraceUi } from "./traceUi";

let cache: { from: unknown; trace: unknown; points: Pt[] } | null = null;

/**
 * Where a wall being drawn locks onto the wall suggestions (their ends and crossings) within `reach` metres: null when there are no suggestions
 * for the picture on show. The points are worked out once per list and picture, not on every pointer move.
 */
export function traceSnapPoint(p: Pt, reach: number, skip?: (q: Pt) => boolean): Pt | null {
  const { suggestions, suggestionsFor } = useTraceUi.getState();
  const trace = useStore.getState().plan.trace;
  if (!trace || trace.hidden || suggestionsFor !== trace.resourceId || !suggestions.length) return null;
  if (!cache || cache.from !== suggestions || cache.trace !== trace) cache = { from: suggestions, trace, points: snapPoints(suggestions, trace) };
  return nearestPoint(cache.points, p, reach, skip);
}
