import { activeDashboard } from "@/lib/activePlan";
import { parseBundle, piecesUsedBy, type Bundle, type BundleModel } from "@/lib/customCatalog";
import { useCustom } from "@/lib/customStore";
import { fromBase64, getModel, putModel, toBase64 } from "@/lib/modelStore";
import { identityOf, splitPlanFile, type PlanIdentity } from "@/lib/planFile";
import type { Plan } from "@/lib/types";
import type { TraceImageBlock } from "@/lib/planTraceFile";
import type { FloorPhotoBlocks } from "@/lib/planFloorPhotoFile";
import type { MaterialBlocks } from "@/lib/planMaterialsFile";
import { withMdiIcons } from "@/lib/mdiPlan";
import { restoreTrace, traceImageFor } from "../plan/traceFileIO";
import { floorPhotosFor, restoreFloorPhotos } from "./floorPhotoFileIO";
import { materialsFor, restoreMaterials } from "./materialFileIO";

/**
 * A plan file: the plan itself, plus (when the plan uses any) the custom pieces and 3D models it needs (`custom`) and the plan's identity
 * (`dashboard`: name, icon, colour, description). Files without those blocks are plain old plans and still load.
 */
type PlanFile = Plan & { custom?: unknown; dashboard?: PlanIdentity; traceImage?: TraceImageBlock; floorPhotos?: FloorPhotoBlocks; materials?: MaterialBlocks };

async function bundleFor(plan: Plan): Promise<Bundle | null> {
  const pieces = piecesUsedBy(useCustom.getState().pieces, plan.items);
  if (!pieces.length) return null;
  const models: BundleModel[] = [];
  for (const p of pieces) {
    const model = p.model;
    if (!model || models.some((m) => m.id === model.id)) continue;
    const stored = await getModel(model.id);
    if (stored) models.push({ id: model.id, ext: stored.ext, b64: toBase64(stored.buf) });
  }
  return { pieces, models };
}

/** Save `plan` as a file. `identity` is the plan's name, icon... for the file; by default that of the plan on screen. */
export async function exportPlan(plan: Plan, identity: PlanIdentity | null = currentIdentity()) {
  const custom = await bundleFor(plan);
  const traceImage = await traceImageFor(plan);
  const floorPhotos = await floorPhotosFor(plan);
  const materials = await materialsFor(plan);
  const file: PlanFile = { ...withMdiIcons(plan), ...(custom ? { custom } : {}), ...(traceImage ? { traceImage } : {}), ...(floorPhotos ? { floorPhotos } : {}), ...(materials ? { materials } : {}), ...(identity ? { dashboard: identity } : {}) };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  a.download = "doshy-plan.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Put a file's pieces and models on this device. Pieces and model files that are already here are left alone. */
async function restore(custom: unknown): Promise<number> {
  const { pieces, models } = parseBundle(custom);
  for (const m of models) {
    if (!(await getModel(m.id))) await putModel(m.id, { ext: m.ext, buf: fromBase64(m.b64) }, pieces.find((p) => p.model?.id === m.id)?.name);
  }
  const before = useCustom.getState().pieces.length;
  useCustom.getState().add(pieces);
  return useCustom.getState().pieces.length - before;
}

const currentIdentity = (): PlanIdentity | null => {
  const d = activeDashboard();
  return d ? identityOf(d) : null;
};

/** Read a plan file (restoring the custom pieces, the floor plan image, the floor photos and the Poly Haven textures it carries); throws a readable Error when the shape is wrong. `note`: why the plan opened without a picture or texture, if it did. */
async function openPlanFile(f: File) {
  const parts = splitPlanFile(JSON.parse(await f.text()));
  if (parts.custom) await restore(parts.custom);
  const traced = await restoreTrace(parts);
  const photos = await restoreFloorPhotos({ ...parts, plan: traced.plan });
  const textures = await restoreMaterials({ ...parts, plan: photos.plan });
  return { ...parts, plan: textures.plan, note: [traced.note, photos.note, textures.note].filter(Boolean).join(" ") || null };
}

/** A plan file's plan, for "replace the current plan". `onNote` hears why the plan opened without its floor plan picture. */
export async function readPlanFile(f: File, onNote?: (note: string) => void): Promise<Plan> {
  const { plan, note } = await openPlanFile(f);
  if (note) onNote?.(note);
  return plan;
}

/** A plan file's plan and the name, icon... it was exported with (null for older files), for "import as a new plan" (`createPlan({ from: "import" })`). `note`: why it opened without its floor plan picture. */
export async function readPlanImport(f: File): Promise<{ plan: Plan; identity: PlanIdentity | null; note: string | null }> {
  const { plan, identity, note } = await openPlanFile(f);
  return { plan, identity, note };
}

/** "Import pieces" in My pieces: takes only the custom pieces out of a plan file. Returns how many were new. */
export async function readPiecesFile(f: File): Promise<number> {
  const { custom } = JSON.parse(await f.text()) as PlanFile;
  if (!custom) throw new Error("this file has no custom pieces in it");
  return restore(custom);
}
