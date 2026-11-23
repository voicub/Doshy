import { parseBundle, piecesUsedBy, type Bundle, type BundleModel } from "@/lib/customCatalog";
import { useCustom } from "@/lib/customStore";
import { fromBase64, getModel, putModel, toBase64 } from "@/lib/modelStore";
import type { Plan } from "@/lib/types";

/** A plan file: the plan itself, plus (when the plan uses any) the custom pieces and 3D models it needs. Files without `custom` are plain old plans and still load. */
type PlanFile = Plan & { custom?: unknown };

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

export async function exportPlan(plan: Plan) {
  const custom = await bundleFor(plan);
  const file: PlanFile = custom ? { ...plan, custom } : plan;
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

/** Parse a plan file (restoring the custom pieces it carries); throws a readable Error when the shape is wrong. */
export async function readPlanFile(f: File): Promise<Plan> {
  const { custom, ...p } = JSON.parse(await f.text()) as PlanFile;
  if (!p.walls || !p.openings || !p.rooms || !p.items) throw new Error("missing keys");
  if (custom) await restore(custom);
  return p;
}

/** "Import pieces" in My pieces: takes only the custom pieces out of a plan file. Returns how many were new. */
export async function readPiecesFile(f: File): Promise<number> {
  const { custom } = JSON.parse(await f.text()) as PlanFile;
  if (!custom) throw new Error("this file has no custom pieces in it");
  return restore(custom);
}
