import type { BundleModel, CustomPiece } from "@/lib/customCatalog";
import { useCustom } from "@/lib/customStore";
import { errorMessage } from "@/lib/guards";
import { deleteModel, fromBase64, getModel, putModel, toBase64 } from "@/lib/modelStore";
import { buildPack, base64Bytes, packFileName, packFileProblem, parsePack, type BuiltPack, type PackMeta, type PackResult } from "@/lib/pieceShare";
import type { ImportPlan, ModelState, PackGroup } from "@/lib/pieceShareMerge";
import { useStore } from "@/lib/store";

/** The browser side of furniture packs: read a file, store what an import decided, remove a pack, save one. The decisions themselves are pure (lib/pieceShare*.ts). */

/** Reads a pack file. The size is checked before the text is read, so a huge file is never loaded. */
export async function readPackFile(file: File): Promise<PackResult> {
  const problem = packFileProblem(file.size);
  if (problem) return { ok: false, reason: problem };
  return parsePack(await file.text());
}

/** For each model of a pack that is already stored on this device: the very same file, or a different one under that id. */
export async function modelStates(models: readonly BundleModel[]): Promise<Map<string, ModelState>> {
  const out = new Map<string, ModelState>();
  for (const m of models) {
    const have = await getModel(m.id);
    if (!have) continue;
    const same = have.ext === m.ext && have.buf.byteLength === base64Bytes(m.b64) && toBase64(have.buf) === m.b64;
    out.set(m.id, same ? "same" : "other");
  }
  return out;
}

export type Added = { count: number; undo: () => void; commit: () => void };

const stillUsed = (id: string) => useCustom.getState().pieces.some((p) => p.model?.id === id);
const dropIfUnused = (id: string | undefined) => {
  if (id && !stillUsed(id)) void deleteModel(id).catch(() => undefined);
};

/**
 * Stores an import plan. Model files go first (a piece must never point at a file that is not there), then the pieces. Throws a readable Error
 * and leaves nothing behind when a model cannot be kept. `undo` puts things back as they were; `commit` ends the chance to undo, which is when
 * the model files of pieces that were replaced are finally deleted.
 */
export async function applyImport(plan: ImportPlan): Promise<Added> {
  const written: string[] = [];
  try {
    for (const m of plan.models) {
      const name = [...plan.add, ...plan.replace].find((p) => p.model?.id === m.id)?.name;
      await putModel(m.id, { ext: m.ext, buf: fromBase64(m.b64) }, name);
      written.push(m.id);
    }
  } catch (e) {
    for (const id of written) void deleteModel(id).catch(() => undefined);
    throw new Error(`Nothing was added: ${errorMessage(e)}`);
  }
  const store = useCustom.getState();
  const before = new Map<string, CustomPiece>(store.pieces.map((p) => [p.kind, p]));
  store.add(plan.add);
  for (const p of plan.replace) store.update(p);

  let open = true;
  const oldModels = plan.replace.flatMap((p) => {
    const was = before.get(p.kind)?.model?.id;
    return was && was !== p.model?.id ? [was] : [];
  });
  return {
    count: plan.add.length + plan.replace.length,
    undo: () => {
      if (!open) return;
      open = false;
      const s = useCustom.getState();
      for (const p of plan.add) s.remove(p.kind);
      for (const p of plan.replace) {
        const old = before.get(p.kind);
        if (old) s.update(old);
        if (p.model && p.model.id !== old?.model?.id) dropIfUnused(p.model.id);
      }
    },
    commit: () => {
      if (!open) return;
      open = false;
      oldModels.forEach(dropIfUnused);
    },
  };
}

/** How many items in the plan on screen use these pieces (they turn into grey boxes when the pieces go). */
export function placedCount(kinds: readonly string[]): number {
  const set = new Set(kinds);
  return useStore.getState().plan.items.filter((i) => set.has(i.kind)).length;
}

/** Deletes every piece of a pack, and their model files once nothing else uses them (`remove` does both). */
export function removePack(group: PackGroup) {
  const store = useCustom.getState();
  for (const kind of group.kinds) store.remove(kind);
}

/** Makes the pack text for these pieces, reading their model files from storage. */
export async function makePack(meta: PackMeta, pieces: readonly CustomPiece[]): Promise<BuiltPack> {
  const models: BundleModel[] = [];
  for (const p of pieces) {
    const id = p.model?.id;
    if (!id || models.some((m) => m.id === id)) continue;
    const stored = await getModel(id);
    if (stored) models.push({ id, ext: stored.ext, b64: toBase64(stored.buf) });
  }
  return buildPack(meta, pieces, models, Date.now());
}

/** Hands the file to the browser as a download; returns its name. */
export function downloadPack(text: string, packName: string): string {
  const name = packFileName(packName);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  return name;
}
