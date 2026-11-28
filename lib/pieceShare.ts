import { cleanPiece, cleanText, isModelId, MAX_MODEL_BYTES, MAX_PACK_TEXT, MAX_PARTS, type BundleModel, type CustomPiece } from "./customCatalog.ts";
import { isRecord } from "./guards.ts";

/**
 * Furniture packs: a `.doshypack` file is ONE JSON document with a header (who made it, what it is called, a licence note), the pieces and, for
 * pieces that are imported 3D models, the model files as base64 so the piece travels with its model. Reading one is the dangerous part (it is
 * a file from a stranger): everything is checked against the caps below and rebuilt from an allow-list of known fields, nothing from the file
 * is ever used as a property name. Merging an imported pack into My pieces lives in pieceShareMerge.ts.
 */
export const PACK_FORMAT = "doshypack";
export const PACK_VERSION = 1;
export const PACK_EXT = ".doshypack";

const MB = 1024 * 1024;
export const PACK_LIMITS = {
  /** The whole file (checked on `File.size` before anything is read). */
  fileBytes: 80 * MB,
  pieces: 200,
  models: 40,
  /** All model files together, as decoded bytes (one of them is at most MAX_MODEL_BYTES). */
  modelBytes: 40 * MB,
  /** How deep JSON may nest and how many objects/arrays it may hold: a real pack is about 6 deep. */
  depth: 8,
  containers: 400_000,
  /** Longest text value anywhere except a model file and a picture (those are checked on their own). */
  text: 2000,
} as const;

const HEADER_KEYS = new Set(["format", "version", "name", "author", "licence", "created", "app", "pieces", "models"]);
const PIECE_KEYS = new Set(["kind", "name", "w", "d", "h", "parts", "model", "thumb", "light", "wall", "at", "pack", "source", "tags"]);
const MODEL_KEYS = new Set(["id", "ext", "b64"]);
/** Keys that would reach the prototype of an object when copied carelessly: a file that has one is hostile, whatever it wanted. */
const HOSTILE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const BIG_TEXT_KEYS = new Set(["b64", "thumb"]);
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

export type Pack = { name: string; author?: string; licence?: string; created?: string; app?: string; pieces: CustomPiece[]; models: BundleModel[] };

/** What the import preview shows. */
export type PackInfo = {
  name: string;
  author?: string;
  licence?: string;
  created?: string;
  app?: string;
  pieces: number;
  /** Pieces that are an imported 3D model (the rest are built from shapes). */
  modelPieces: number;
  modelBytes: number;
};

export type PackResult = { ok: false; reason: string } | { ok: true; pack: Pack; info: PackInfo; warnings: string[] };

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Plain-English size, for the preview and the export screen. */
export const sizeLabel = (bytes: number): string => (bytes < 1024 ? `${bytes} bytes` : bytes < MB ? `${Math.round(bytes / 1024)} KB` : `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`);

/** Reason a file of this size must not even be read, or null. Call with `File.size` before `file.text()`. */
export const packFileProblem = (bytes: number): string | null =>
  bytes > PACK_LIMITS.fileBytes ? `This file is too big to be a furniture pack (${sizeLabel(bytes)}; the limit is ${sizeLabel(PACK_LIMITS.fileBytes)}).` : null;

/** Size of the data a base64 string stands for, from its length alone (never decodes). null when it cannot be base64. */
export function base64Bytes(b64: string): number | null {
  const n = b64.length;
  if (n === 0 || n % 4 !== 0) return null;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (n / 4) * 3 - pad;
}

/** First bytes of the decoded data say whether it can be a glTF model: a binary .glb starts with "glTF"; a .gltf is JSON text. */
function looksLikeModel(ext: "glb" | "gltf", b64: string): boolean {
  if (ext === "glb") return b64.startsWith("Z2xUR"); // base64 of "glTF"
  try {
    return atob(b64.slice(0, 64)).trimStart().startsWith("{");
  } catch {
    return false;
  }
}

const TOO_ODD = "This file does not look like a furniture pack, so nothing was added.";

/**
 * Walks the parsed JSON once, without recursion (so a deeply nested file cannot overflow the stack): refuses forbidden keys at any depth,
 * nesting deeper than a pack ever goes, absurd amounts of objects and very long text. Returns the reason, or null when it is fine.
 */
function inspect(root: unknown): string | null {
  const stack: [unknown, number][] = [[root, 0]];
  let seen = 0;
  for (let top = stack.pop(); top; top = stack.pop()) {
    const [node, depth] = top;
    if (++seen > PACK_LIMITS.containers || depth > PACK_LIMITS.depth) return "This file is far more complicated than a furniture pack, so nothing was added.";
    const children: [string, unknown][] = Array.isArray(node) ? node.map((v) => ["", v]) : Object.entries(node as object);
    for (const [key, v] of children) {
      if (HOSTILE_KEYS.has(key)) return TOO_ODD;
      if (typeof v === "string" && v.length > PACK_LIMITS.text && !BIG_TEXT_KEYS.has(key)) return "This file has text that is far too long for a furniture pack, so nothing was added.";
      if (v && typeof v === "object") stack.push([v, depth + 1]);
    }
  }
  return null;
}

const unknownKeys = (o: Record<string, unknown>, known: ReadonlySet<string>) => Object.keys(o).filter((k) => !known.has(k)).length;

type ModelRead = { model: BundleModel; bytes: number } | string;

/** One entry of `models`: the model, or why it was left out (a sentence for the warnings). */
function readModel(raw: unknown): ModelRead {
  if (!isRecord(raw)) return "a model file entry was not readable";
  const { id, ext, b64 } = raw;
  if (!isModelId(id) || (ext !== "glb" && ext !== "gltf") || typeof b64 !== "string") return "a model file entry was not readable";
  const bytes = base64Bytes(b64);
  if (bytes === null || b64.length > PACK_LIMITS.modelBytes * 2 || !B64.test(b64) || !looksLikeModel(ext, b64)) return "a model file is damaged";
  if (bytes > MAX_MODEL_BYTES) return `a model file is bigger than ${sizeLabel(MAX_MODEL_BYTES)}`;
  return { model: { id, ext, b64 }, bytes };
}

type Models = { byId: Map<string, { model: BundleModel; bytes: number }>; problems: string[]; unknown: number; total: number };

function readModels(raw: unknown[]): Models {
  const out: Models = { byId: new Map(), problems: [], unknown: 0, total: 0 };
  for (const entry of raw) {
    if (isRecord(entry)) out.unknown += unknownKeys(entry, MODEL_KEYS);
    const m = readModel(entry);
    if (typeof m === "string") out.problems.push(m);
    else if (!out.byId.has(m.model.id)) {
      out.byId.set(m.model.id, m);
      out.total += m.bytes;
    }
  }
  return out;
}

/** Header text field: plain text, bounded, absent when empty. */
const field = (raw: unknown): string | undefined => (typeof raw === "string" ? cleanText(raw, MAX_PACK_TEXT) || undefined : undefined);

function createdDate(raw: unknown): string | undefined {
  const t = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(t) && t > 0 && t < 4e12 ? new Date(t).toISOString() : undefined;
}

type Pieces = { list: CustomPiece[]; unreadable: number; duplicates: number; noModel: number; trimmed: number; unknown: number; used: Set<string> };

function readPieces(raw: unknown[], models: Models): Pieces {
  const out: Pieces = { list: [], unreadable: 0, duplicates: 0, noModel: 0, trimmed: 0, unknown: 0, used: new Set() };
  const kinds = new Set<string>();
  for (const entry of raw) {
    const piece = cleanPiece(entry);
    if (!piece || !isRecord(entry)) {
      out.unreadable++;
      continue;
    }
    out.unknown += unknownKeys(entry, PIECE_KEYS);
    if (Array.isArray(entry.parts) && entry.parts.length > MAX_PARTS) out.trimmed++;
    if (kinds.has(piece.kind)) {
      out.duplicates++;
      continue;
    }
    delete piece.pack; // the tag is made on this device when the pack is added; a file cannot claim one
    if (piece.model) {
      const have = models.byId.get(piece.model.id);
      if (!have) {
        out.noModel++;
        continue;
      }
      piece.model = { id: have.model.id, ext: have.model.ext, bytes: have.bytes };
      out.used.add(have.model.id);
    }
    kinds.add(piece.kind);
    out.list.push(piece);
  }
  return out;
}

function warningsFor(p: Pieces, m: Models, unknownTop: number): string[] {
  const w: string[] = [];
  if (p.unreadable) w.push(`${plural(p.unreadable, "piece", "pieces")} could not be read and ${p.unreadable === 1 ? "was" : "were"} left out.`);
  if (p.noModel) w.push(`${plural(p.noModel, "piece", "pieces")} left out because ${p.noModel === 1 ? "its" : "their"} 3D model file is missing or damaged in the pack.`);
  if (p.duplicates) w.push(`${plural(p.duplicates, "piece", "pieces")} appeared twice in the file; the first one is used.`);
  if (p.trimmed) w.push(`${plural(p.trimmed, "piece", "pieces")} had more than ${MAX_PARTS} shapes; the extra shapes were left out.`);
  const spare = [...m.byId.keys()].filter((id) => !p.used.has(id)).length;
  if (spare) w.push(`${plural(spare, "model file", "model files")} in the pack ${spare === 1 ? "is" : "are"} not used by any piece and will not be added.`);
  const unknown = p.unknown + m.unknown + unknownTop;
  if (unknown) w.push(`${plural(unknown, "unknown detail", "unknown details")} in the file ${unknown === 1 ? "was" : "were"} ignored.`);
  return w;
}

/** Why the pack cannot be read at all, or the parsed top level. */
function readTop(text: string): { head: Record<string, unknown>; pieces: unknown[]; models: unknown[] } | { reason: string } {
  if (text.length > PACK_LIMITS.fileBytes) return { reason: packFileProblem(text.length) ?? TOO_ODD };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { reason: "This is not a furniture pack: the file could not be read." };
  }
  if (!isRecord(raw) || raw.format !== PACK_FORMAT) return { reason: "This is not a Doshy furniture pack (a .doshypack file)." };
  if (typeof raw.version !== "number" || raw.version < 1) return { reason: "This furniture pack has no usable version, so it cannot be added." };
  if (raw.version > PACK_VERSION) return { reason: "This pack was made by a newer version of Doshy. Update Doshy to add it." };
  const bad = inspect(raw);
  if (bad) return { reason: bad };
  if (!Array.isArray(raw.pieces)) return { reason: "This furniture pack has no pieces in it." };
  if (raw.models !== undefined && !Array.isArray(raw.models)) return { reason: TOO_ODD };
  const models = Array.isArray(raw.models) ? raw.models : [];
  if (raw.pieces.length > PACK_LIMITS.pieces) return { reason: `This pack has ${raw.pieces.length} pieces; Doshy adds at most ${PACK_LIMITS.pieces} at a time.` };
  if (models.length > PACK_LIMITS.models) return { reason: `This pack has ${models.length} model files; Doshy adds at most ${PACK_LIMITS.models} at a time.` };
  return { head: raw, pieces: raw.pieces, models };
}

/** Reads and checks the text of a `.doshypack`. Either a plain reason it was refused, or the pack (rebuilt from known fields only), facts for a preview and warnings. */
export function parsePack(text: string): PackResult {
  const top = readTop(text);
  if ("reason" in top) return fail(top.reason);
  const models = readModels(top.models);
  if (models.total > PACK_LIMITS.modelBytes) return fail(`The 3D models in this pack add up to ${sizeLabel(models.total)}; Doshy adds at most ${sizeLabel(PACK_LIMITS.modelBytes)} of models at a time.`);
  const pieces = readPieces(top.pieces, models);
  if (!pieces.list.length) return fail("This furniture pack has no pieces Doshy can use.");
  const used = models.byId.size ? [...models.byId.values()].filter((m) => pieces.used.has(m.model.id)) : [];
  const pack: Pack = {
    name: field(top.head.name) ?? "Furniture pack",
    author: field(top.head.author),
    licence: field(top.head.licence),
    created: createdDate(top.head.created),
    app: field(top.head.app),
    pieces: pieces.list,
    models: used.map((m) => m.model),
  };
  const info: PackInfo = {
    name: pack.name,
    author: pack.author,
    licence: pack.licence,
    created: pack.created,
    app: pack.app,
    pieces: pieces.list.length,
    modelPieces: pieces.list.filter((p) => p.model).length,
    modelBytes: used.reduce((n, m) => n + m.bytes, 0),
  };
  const warnings = [...warningsFor(pieces, models, unknownKeys(top.head, HEADER_KEYS))];
  if (models.problems.length) warnings.push(`${plural(models.problems.length, "model file", "model files")} could not be used (${models.problems[0]}).`);
  return { ok: true, pack, info, warnings };
}

// ---- making a pack ------------------------------------------------------------------------------------------------------------------

export type PackMeta = { name: string; author?: string; licence?: string };

/** Distinct model ids of these pieces with the size the pack will hold them at. */
function modelsOf(pieces: readonly CustomPiece[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of pieces) if (p.model) out.set(p.model.id, p.model.bytes);
  return out;
}

/** About how big the file will be, without making it: pieces as text plus models as base64. Used for the live size on the export screen. */
export function estimatePackBytes(pieces: readonly CustomPiece[]): number {
  let n = 300; // header
  for (const p of pieces) n += JSON.stringify(p).length;
  for (const bytes of modelsOf(pieces).values()) n += Math.ceil(bytes / 3) * 4 + 60;
  return n;
}

/** Why these pieces cannot go into one pack, or null. Shared by the live check and the real export. */
export function exportProblem(pieces: readonly CustomPiece[], estimate = estimatePackBytes(pieces)): string | null {
  if (!pieces.length) return "Choose at least one piece.";
  if (pieces.length > PACK_LIMITS.pieces) return `A pack holds at most ${PACK_LIMITS.pieces} pieces. Choose fewer.`;
  const models = modelsOf(pieces);
  if (models.size > PACK_LIMITS.models) return `A pack holds at most ${PACK_LIMITS.models} different 3D models. Choose fewer.`;
  const modelBytes = [...models.values()].reduce((a, b) => a + b, 0);
  if (modelBytes > PACK_LIMITS.modelBytes) return `The 3D models of these pieces add up to ${sizeLabel(modelBytes)}; a pack holds at most ${sizeLabel(PACK_LIMITS.modelBytes)} of models. Choose fewer.`;
  if (estimate > PACK_LIMITS.fileBytes) return `This pack would be ${sizeLabel(estimate)}; the limit is ${sizeLabel(PACK_LIMITS.fileBytes)}. Choose fewer pieces.`;
  return null;
}

export type BuiltPack = { ok: false; reason: string } | { ok: true; text: string; bytes: number };

/**
 * The text of a `.doshypack` for these pieces. `models` are the files of the model pieces (the caller reads them from storage); a model piece whose
 * file is not there stops the export, since a pack that cannot show its piece would be useless to whoever gets it.
 */
export function buildPack(meta: PackMeta, pieces: readonly CustomPiece[], models: readonly BundleModel[], now: number): BuiltPack {
  const problem = exportProblem(pieces);
  if (problem) return fail(problem);
  const clean: CustomPiece[] = [];
  for (const p of pieces) {
    const c = cleanPiece(p);
    if (!c) continue;
    delete c.pack; // the receiver's own tag replaces it; the author's details are in the header
    if (c.model && !models.some((m) => m.id === c.model?.id)) return fail(`The 3D model of "${c.name}" could not be found on this device, so it cannot go into a pack.`);
    clean.push(c);
  }
  const wanted = new Set(clean.flatMap((p) => (p.model ? [p.model.id] : [])));
  const file = {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    name: cleanText(meta.name, MAX_PACK_TEXT, "Furniture pack"),
    author: field(meta.author),
    licence: field(meta.licence),
    created: new Date(now).toISOString(),
    app: "Doshy",
    pieces: clean,
    models: models.filter((m) => wanted.has(m.id)),
  };
  const text = JSON.stringify(file);
  if (text.length > PACK_LIMITS.fileBytes) return fail(`This pack would be ${sizeLabel(text.length)}; the limit is ${sizeLabel(PACK_LIMITS.fileBytes)}. Choose fewer pieces.`);
  return { ok: true, text, bytes: text.length };
}

/** A safe file name for a pack: letters, digits and dashes, with the extension. */
export const packFileName = (name: string): string => `${cleanText(name, 40, "furniture-pack").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "furniture-pack"}${PACK_EXT}`;
