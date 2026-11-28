import { useStore } from "@/lib/store";
import { withTrace } from "@/lib/trace";
import type { Trace } from "@/lib/designTypes";

/** Sets (or, with null, removes) the plan's floor plan image: one undo step. Inside a drag (`beginEdit`) it joins that step. */
export const putTrace = (trace: Trace | null) => useStore.getState().editPlan((p) => withTrace(p, trace));
