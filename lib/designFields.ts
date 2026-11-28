// Keeps the optional design fields of a plan (`annotations`, `trace`, and each room's `floorPhoto`) valid when a plan is loaded from storage, the server or a file. Same job as `withSite`.
import { sanitizeAnnotations } from "./annotations.ts";
import { withFloorPhotos } from "./floorPhoto.ts";
import { withMaterials } from "./planMaterials.ts";
import type { Plan } from "./types.ts";
import { withMaintenance } from "./maintenance.ts";
import { withUtilities } from "./utilities.ts";
import { sanitizeTrace } from "./trace.ts";

/** The plan with `annotations`, `trace` and the rooms' `floorPhoto` made valid. The same object when there is nothing to fix (nearly always); a plan without either stays without it. */
export function withDesign(plan: Plan): Plan {
  return withUtilities(withMaintenance(withMaterials(withFloorPhotos(withNotesAndTrace(plan))))); // photos first: a floor whose photo is unusable keeps its material; the upkeep tasks and the pipes (lib/maintenance.ts, lib/utilities.ts) ride along
}

function withNotesAndTrace(plan: Plan): Plan {
  if (plan.annotations === undefined && plan.trace === undefined) return plan;
  const { annotations: rawNotes, trace: rawTrace, ...rest } = plan;
  const annotations = sanitizeAnnotations(rawNotes);
  const trace = sanitizeTrace(rawTrace);
  if (JSON.stringify([annotations, trace]) === JSON.stringify([rawNotes, rawTrace])) return plan;
  return { ...rest, ...(annotations ? { annotations } : {}), ...(trace ? { trace } : {}) };
}
