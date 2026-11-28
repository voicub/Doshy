import { MAX_PACK_TEXT, cleanText, newKind, type BundleModel, type CustomPiece, type PiecePack } from "./customCatalog.ts";

/**
 * Adding the pieces of a furniture pack (lib/pieceShare.ts) to My pieces, and the pack list built from the tag each added piece carries.
 * Pure: it decides what to add, replace and write; components/ui/packApply.ts does it.
 */

/** What to do with a pack piece that clashes with one of yours: keep both (the new one gets a new name), replace yours, or leave it out. */
export type Choice = "both" | "replace" | "skip";
export type Conflict = { piece: CustomPiece; mine: CustomPiece; by: "kind" | "name" };

const MAX_NAME = 40;
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The piece of yours a pack piece clashes with: same id first (it is the same piece), else the same name (case does not matter). */
function clash(mine: readonly CustomPiece[], p: CustomPiece): { mine: CustomPiece; by: "kind" | "name" } | null {
  const byKind = mine.find((m) => m.kind === p.kind);
  if (byKind) return { mine: byKind, by: "kind" };
  const byName = mine.find((m) => sameName(m.name, p.name));
  return byName ? { mine: byName, by: "name" } : null;
}

/** Which pack pieces clash with what you already have (for the preview's choices). */
export function findConflicts(mine: readonly CustomPiece[], incoming: readonly CustomPiece[]): Conflict[] {
  return incoming.flatMap((piece) => {
    const hit = clash(mine, piece);
    return hit ? [{ piece, ...hit }] : [];
  });
}

/** "Sofa" -> "Sofa (2)", "Sofa (3)"... the first not in `taken` (lower case names), still within the name length. */
function freeName(name: string, taken: ReadonlySet<string>): string {
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = `${cleanText(name, MAX_NAME - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

const rand8 = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

/** How a model id the pack uses stands on this device: not stored yet, stored with the very same file, or stored as a different file. */
export type ModelState = "same" | "other";

export type ImportOptions = {
  /** What the tag of every added piece says. */
  tag: PiecePack;
  /** The pack's model files (already checked). */
  models: readonly BundleModel[];
  /** For every model id of the pack that is already stored here: whether it is the same file. Ids not listed are free. */
  stored?: ReadonlyMap<string, ModelState>;
  rand?: () => string;
};

export type ImportPlan = {
  /** New pieces. */
  add: CustomPiece[];
  /** Pieces that take over one of yours (they keep its id, so what you placed with it follows). */
  replace: CustomPiece[];
  skipped: number;
  /** Model files to store (final ids), only for pieces that are going in and only when this device has not got that very file. */
  models: BundleModel[];
};

/**
 * Decides what importing `incoming` into `mine` does. `choice` is one answer for every clash or an answer per pack piece id; the default is
 * keep both. Nothing is touched: the result lists the pieces to add, the ones that replace yours, and the model files to store.
 * Model ids that would meet a different file on this device get a fresh id, and the pieces that use them follow.
 */
export function planImport(mine: readonly CustomPiece[], incoming: readonly CustomPiece[], choice: Choice | ReadonlyMap<string, Choice>, opts: ImportOptions): ImportPlan {
  const rand = opts.rand ?? rand8;
  const kinds = new Set(mine.map((p) => p.kind));
  const names = new Set(mine.map((p) => p.name.toLowerCase()));
  const modelIds = new Set([...mine.flatMap((p) => (p.model ? [p.model.id] : [])), ...(opts.stored?.keys() ?? [])]);
  const mineModels = new Set(mine.flatMap((p) => (p.model ? [p.model.id] : [])));
  const files = new Map(opts.models.map((m) => [m.id, m]));
  const finalId = new Map<string, string>();
  const write = new Map<string, BundleModel>();
  const replaced = new Set<string>();
  const plan: ImportPlan = { add: [], replace: [], skipped: 0, models: [] };

  /** The id this model is kept under, and a note to store the file when it is new here. */
  const place = (id: string): string => {
    const known = finalId.get(id);
    if (known) return known;
    const state = opts.stored?.get(id) ?? (mineModels.has(id) ? "other" : undefined);
    let out = id;
    if (state === "other") {
      do out = `m_${rand()}`;
      while (modelIds.has(out) || write.has(out));
    }
    const file = files.get(id);
    if (file && state !== "same") write.set(out, { ...file, id: out });
    finalId.set(id, out);
    return out;
  };

  const freshKind = (name: string): string => {
    let kind = newKind(name, rand);
    for (let i = 1; kinds.has(kind); i++) kind = newKind(name, () => `${rand()}${i}`);
    return kind;
  };

  for (const p of incoming) {
    const hit = clash(mine, p);
    const asked = typeof choice === "string" ? choice : (choice.get(p.kind) ?? "both");
    const pick: Choice | "new" = !hit ? "new" : asked === "replace" && replaced.has(hit.mine.kind) ? "both" : asked; // one of yours is replaced at most once
    if (pick === "skip") {
      plan.skipped++;
      continue;
    }
    const model = p.model ? { ...p.model, id: place(p.model.id) } : undefined;
    const common = { ...p, ...(model ? { model } : {}), pack: opts.tag, at: opts.tag.at };
    if (pick === "replace" && hit) {
      replaced.add(hit.mine.kind);
      plan.replace.push({ ...common, kind: hit.mine.kind });
      continue;
    }
    const kind = kinds.has(p.kind) ? freshKind(p.name) : p.kind;
    const name = pick === "both" ? freeName(p.name, names) : p.name;
    kinds.add(kind);
    names.add(name.toLowerCase());
    plan.add.push({ ...common, kind, name });
  }
  plan.models = [...write.values()];
  return plan;
}

// ---- imported packs ------------------------------------------------------------------------------------------------------------------

export type PackGroup = { pack: PiecePack; kinds: string[] };

/** The packs behind your pieces, in the order they were added, each with the ids of its pieces. */
export function packGroups(pieces: readonly CustomPiece[]): PackGroup[] {
  const groups = new Map<string, PackGroup>();
  for (const p of pieces) {
    if (!p.pack) continue;
    const g = groups.get(p.pack.id);
    if (g) g.kinds.push(p.kind);
    else groups.set(p.pack.id, { pack: p.pack, kinds: [p.kind] });
  }
  return [...groups.values()].sort((a, b) => a.pack.at - b.pack.at);
}

/** The tag for a pack being added now (author and licence are what the pack said). */
export function packTag(info: { name: string; author?: string; licence?: string }, now: number, rand: () => string = rand8): PiecePack {
  return {
    id: `pk_${rand()}`,
    name: cleanText(info.name, MAX_PACK_TEXT, "Furniture pack"),
    ...(info.author ? { author: info.author } : {}),
    ...(info.licence ? { licence: info.licence } : {}),
    at: now,
  };
}
