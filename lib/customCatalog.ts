import type { Def, Part } from "./catalog.ts";
import { isAssetId } from "./polyhaven.ts";
import { isRecord } from "./guards.ts";
import type { Item } from "./types.ts";

/**
 * Pieces the user made themselves: built from shapes, copied from the catalog and tweaked, or imported as a 3D model.
 * They live in the persisted custom store and are mirrored into CATALOG (see `syncCatalog`) so every part of the app that
 * looks a kind up (3D scene, plan editor, inspector, collisions) treats them like built-in furniture.
 */
const PREFIX = "my_";
export const MY_PIECES = "My pieces";
export const MAX_PARTS = 120;
export const MAX_MODEL_BYTES = 25 * 1024 * 1024; // the database refuses bigger files (lib/db/resources MAX_RESOURCE_BYTES)
const MAX_NAME = 40;
/** Longest pack name, author and licence note (a piece's own name stays at 40). */
export const MAX_PACK_TEXT = 120;
const MIN_DIM = 0.01;
const MAX_DIM = 30;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const ID = /^[a-z0-9_-]{1,48}$/i;

type ModelRef = { id: string; ext: "glb" | "gltf"; bytes: number };
export type CustomPiece = {
  kind: string;
  name: string;
  w: number;
  d: number;
  h: number;
  /** Shapes of a built piece; a model piece keeps one stand-in box so lists and loading states have something to draw. */
  parts: Part[];
  model?: ModelRef;
  /** Small data: image of a model piece, shown in the catalog. */
  thumb?: string;
  light?: Def["light"];
  wall?: true;
  at: number;
  /** The furniture pack this piece came from (lib/pieceShare.ts); lets a pack be removed as a whole. Pieces made here have none. */
  pack?: PiecePack;
  /** A model taken from Poly Haven: kept on the piece itself (a pack file cannot claim a pack tag, but it keeps this) so the credit list survives sharing. */
  source?: PieceSource;
  /** Extra words the catalog search matches (for a Poly Haven model: its categories and tags). */
  tags?: string;
};

/** Where an imported piece came from. `id` is made on this device at import (the same file imported twice is two groups); the rest is what the pack's author wrote. */
export type PiecePack = { id: string; name: string; author?: string; licence?: string; at: number };

/** Which Poly Haven asset a piece was made from; `authors` is already joined ("A, B"). */
export type PieceSource = { type: "polyhaven"; id: string; name: string; authors?: string };

/** One imported 3D model as it travels inside an exported plan. */
export type BundleModel = { id: string; ext: "glb" | "gltf"; b64: string };
export type Bundle = { pieces: CustomPiece[]; models: BundleModel[] };

const isCustomKind = (kind: string) => kind.startsWith(PREFIX);

/** Plain text only: no markup, no control characters, one line, at most `max` characters. */
export function cleanText(raw: unknown, max: number, fallback = ""): string {
  const s = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f<>`"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return s || fallback;
}

/** Plain text only: no markup, no control characters, one line, bounded. Used for every name that comes from the user or a file. */
export const cleanName = (raw: unknown, fallback = "My piece"): string => cleanText(raw, MAX_NAME, fallback);

/** Whether `v` is usable as a model file id (also the id regex of kinds). */
export const isModelId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

const slug = (name: string) =>
  cleanName(name, "piece")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "piece";

const rand4 = () => Math.random().toString(36).slice(2, 6).padEnd(4, "0");

/** A unique kind id that still tells a human what it was: `my_sofa-nook_a1b2`. */
export const newKind = (name: string, rand: () => string = rand4) => `${PREFIX}${slug(name)}_${rand()}`;

/** The name a kind id carries ("my_sofa-nook_a1b2" -> "Sofa nook"), for stand-ins of pieces this device does not have. */
export function kindLabel(kind: string): string {
  const body = kind.slice(PREFIX.length).replace(/_[a-z0-9]{1,8}$/i, "").replace(/-+/g, " ").trim();
  return body ? body[0].toUpperCase() + body.slice(1) : "Custom piece";
}

const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const triple = (v: unknown, lo: number, hi: number, fallback: [number, number, number]): [number, number, number] =>
  Array.isArray(v) && v.length === 3 ? [num(v[0], lo, hi, fallback[0]), num(v[1], lo, hi, fallback[1]), num(v[2], lo, hi, fallback[2])] : fallback;

/** Axis-aligned half extents of a part, honouring its tilt (Euler XYZ like three.js). Cylinders and balls count as their bounding box. */
export function partHalf(p: Part): [number, number, number] {
  const [sx, sy, sz] = p.s;
  const [rx, ry, rz] = p.r ?? [0, 0, 0];
  const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  const m = [c * e, -c * f, d, af + be * d, ae - bf * d, -b * c, bf - ae * d, be + af * d, a * c]; // rows of Rx*Ry*Rz
  const h = (i: number) => (Math.abs(m[i * 3]) * sx + Math.abs(m[i * 3 + 1]) * sy + Math.abs(m[i * 3 + 2]) * sz) / 2;
  return [h(0), h(1), h(2)];
}

/**
 * Shapes -> a footprint-centred piece standing on the floor: the group is moved so its middle sits at x/z 0 and its lowest point at y 0,
 * and w/d/h are the size of what is left. null when there is nothing to draw.
 */
export function fitParts(parts: Part[]): { parts: Part[]; w: number; d: number; h: number } | null {
  if (!parts.length) return null;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const half = partHalf(p);
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p.p[i] - half[i]);
      hi[i] = Math.max(hi[i], p.p[i] + half[i]);
    }
  }
  const cx = (lo[0] + hi[0]) / 2;
  const cz = (lo[2] + hi[2]) / 2;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    parts: parts.map((p) => ({ ...p, p: [r(p.p[0] - cx), r(p.p[1] - lo[1]), r(p.p[2] - cz)] })),
    w: Math.max(MIN_DIM, r(hi[0] - lo[0])),
    d: Math.max(MIN_DIM, r(hi[2] - lo[2])),
    h: Math.max(MIN_DIM, r(hi[1] - lo[1])),
  };
}

/** Keeps a part's size consistent with its shape (a ball is one diameter, a cylinder a diameter and a height). */
export const shapeSize = (shape: Part["shape"], s: [number, number, number]): [number, number, number] => (shape === "sph" ? [s[0], s[0], s[0]] : shape === "cyl" ? [s[0], s[1], s[0]] : s);

/** Checks and cleans one part from untrusted data (an imported file); null when unusable. */
function cleanPart(raw: unknown): Part | null {
  if (!isRecord(raw)) return null;
  const o = raw;
  const shape = o.shape === "cyl" || o.shape === "sph" ? o.shape : undefined;
  const p: Part = {
    p: triple(o.p, -MAX_DIM, MAX_DIM, [0, 0, 0]),
    s: shapeSize(shape, triple(o.s, MIN_DIM / 10, MAX_DIM, [0.2, 0.2, 0.2])),
    c: typeof o.c === "string" && HEX.test(o.c) ? o.c : "#c9a26b",
  };
  if (shape) p.shape = shape;
  if (o.m === true) p.m = true;
  if (o.glow === true) p.glow = true;
  if (Array.isArray(o.r)) p.r = triple(o.r, -7, 7, [0, 0, 0]);
  const sp = isRecord(o.spin) ? o.spin : undefined;
  if (sp && (sp.axis === "x" || sp.axis === "y" || sp.axis === "z")) p.spin = { axis: sp.axis, rpm: num(sp.rpm, -300, 300, 30) };
  return p;
}

/** Checks the pack tag of a stored piece; undefined when it is missing or not usable (the piece then simply belongs to no pack). */
function cleanPack(raw: unknown): PiecePack | undefined {
  if (!isRecord(raw) || !isModelId(raw.id)) return undefined;
  const author = cleanText(raw.author, MAX_PACK_TEXT);
  const licence = cleanText(raw.licence, MAX_PACK_TEXT);
  return { id: raw.id, name: cleanText(raw.name, MAX_PACK_TEXT, "Furniture pack"), ...(author ? { author } : {}), ...(licence ? { licence } : {}), at: num(raw.at, 0, 1e15, 0) };
}

/** Checks the Poly Haven source of a stored piece; undefined when missing or unusable. The id ends up in a link, so it must be a real asset id. */
function cleanSource(raw: unknown): PieceSource | undefined {
  if (!isRecord(raw) || raw.type !== "polyhaven" || !isAssetId(raw.id)) return undefined;
  const authors = cleanText(raw.authors, MAX_PACK_TEXT);
  return { type: "polyhaven", id: raw.id, name: cleanText(raw.name, MAX_PACK_TEXT, raw.id), ...(authors ? { authors } : {}) };
}

/** Checks and cleans a piece read from storage or from an imported plan; null when it cannot be trusted. */
export function cleanPiece(raw: unknown): CustomPiece | null {
  if (!isRecord(raw)) return null;
  const o = raw;
  if (typeof o.kind !== "string" || !isCustomKind(o.kind) || !ID.test(o.kind)) return null;
  const parts = (Array.isArray(o.parts) ? o.parts : []).slice(0, MAX_PARTS).map(cleanPart).filter((p): p is Part => !!p);
  const m = isRecord(o.model) ? o.model : undefined;
  const model: ModelRef | undefined = m && typeof m.id === "string" && ID.test(m.id) ? { id: m.id, ext: m.ext === "gltf" ? "gltf" : "glb", bytes: num(m.bytes, 0, 1e10, 0) } : undefined;
  const fit = parts.length ? fitParts(parts) : null;
  const size = model ? { w: num(o.w, MIN_DIM, MAX_DIM, 1), d: num(o.d, MIN_DIM, MAX_DIM, 1), h: num(o.h, MIN_DIM, MAX_DIM, 1), parts: [] } : fit;
  if (!size) return null;
  const piece: CustomPiece = {
    kind: o.kind,
    name: cleanName(o.name),
    ...size,
    at: num(o.at, 0, 1e15, 0),
  };
  if (model) {
    piece.model = model;
    piece.parts = [{ p: [0, piece.h / 2, 0], s: [piece.w, piece.h, piece.d], c: "#7b8794" }]; // stand-in while the model loads
    if (typeof o.thumb === "string" && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(o.thumb) && o.thumb.length < 200_000) piece.thumb = o.thumb;
  }
  const lt = isRecord(o.light) ? o.light : undefined;
  if (lt && typeof lt.color === "string" && HEX.test(lt.color)) piece.light = { y: num(lt.y, 0, MAX_DIM, piece.h * 0.8), color: lt.color, ...(lt.k !== undefined ? { k: num(lt.k, 0, 5, 1) } : {}) };
  if (o.wall === true) piece.wall = true;
  const pack = cleanPack(o.pack);
  if (pack) piece.pack = pack;
  const source = cleanSource(o.source);
  if (source) piece.source = source;
  const tags = cleanText(o.tags, MAX_PACK_TEXT);
  if (tags) piece.tags = tags;
  return piece;
}

const defs = new WeakMap<CustomPiece, Def>();

/** The catalog definition of a custom piece (same object every time for the same piece, so memoised scene code stays stable). */
function defOf(piece: CustomPiece): Def {
  const hit = defs.get(piece);
  if (hit) return hit;
  const def: Def = {
    label: piece.name,
    brand: "Generic",
    cat: "Decor",
    w: piece.w,
    d: piece.d,
    h: piece.h,
    parts: piece.parts,
    ...(piece.light ? { light: piece.light } : {}),
    ...(piece.wall ? { wall: true as const } : {}),
    ...(piece.model ? { model: { id: piece.model.id } } : {}),
    ...(piece.tags ? { tags: piece.tags } : {}),
  };
  defs.set(piece, def);
  return def;
}

/** Neutral grey box standing in for a custom piece this device does not have, sized like the item that uses it. */
function placeholderDef(kind: string, size: { w: number; d: number; h: number }): Def {
  const { w, d, h } = size;
  return {
    label: `${kindLabel(kind)} (missing)`,
    brand: "Generic",
    cat: "Decor",
    w,
    d,
    h,
    parts: [{ p: [0, h / 2, 0], s: [w, h, d], c: "#7b8794" }],
    model: { id: "", missing: true },
  };
}

/**
 * Makes CATALOG match the custom pieces: every piece is registered, pieces that were removed are dropped, and a kind that
 * some item still uses but nobody has becomes a grey stand-in box (so the plan loads, the item can be selected, moved and deleted).
 */
export function syncCatalog(catalog: Record<string, Def>, pieces: CustomPiece[], items: Pick<Item, "kind" | "w" | "d" | "h">[]) {
  const have = new Set(pieces.map((p) => p.kind));
  const missing = new Map<string, Pick<Item, "w" | "d" | "h">>();
  for (const it of items) if (isCustomKind(it.kind) && !have.has(it.kind) && !missing.has(it.kind)) missing.set(it.kind, it);
  for (const k of Object.keys(catalog)) if (isCustomKind(k) && !have.has(k) && !(missing.has(k) && catalog[k].model?.missing)) delete catalog[k];
  for (const p of pieces) catalog[p.kind] = defOf(p);
  for (const [k, it] of missing) if (!catalog[k]) catalog[k] = placeholderDef(k, it);
}

/** Kinds used by items that no custom piece covers (what "import the pieces" would fix). */
export function missingKinds(pieces: CustomPiece[], items: Pick<Item, "kind">[]): string[] {
  const have = new Set(pieces.map((p) => p.kind));
  return [...new Set(items.map((i) => i.kind).filter((k) => isCustomKind(k) && !have.has(k)))];
}

/** The pieces a plan actually uses, in first-use order. */
export const piecesUsedBy = (pieces: CustomPiece[], items: Pick<Item, "kind">[]): CustomPiece[] => {
  const used = new Set(items.map((i) => i.kind));
  return pieces.filter((p) => used.has(p.kind));
};

/** Same items with fresh objects for `kinds`, so memoised views redraw them after their definition changed. */
export const touchItems = <T extends Pick<Item, "kind">>(items: T[], kinds: Set<string>): T[] => items.map((it) => (kinds.has(it.kind) ? { ...it } : it));

/** Item size follows the piece when the piece was resized: items still at the old size get the new one. */
export function resizeItems<T extends Pick<Item, "kind" | "w" | "d" | "h">>(items: T[], kind: string, from: { w: number; d: number; h: number }, to: { w: number; d: number; h: number }): T[] {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
  return items.map((it) => (it.kind === kind && near(it.w, from.w) && near(it.d, from.d) && near(it.h, from.h) ? { ...it, w: to.w, d: to.d, h: to.h } : it));
}

/** A copy of a catalog piece as an editable draft ("Duplicate and tweak"). */
export function draftFromDef(def: Def, name = `${def.label} copy`): { name: string; parts: Part[]; light?: Def["light"]; wall?: true } {
  return {
    name: cleanName(name),
    parts: def.parts.map((p) => ({ ...p, p: [...p.p], s: [...p.s], ...(p.r ? { r: [...p.r] as Part["r"] } : {}) }) as Part),
    ...(def.light ? { light: { ...def.light } } : {}),
    ...(def.wall ? { wall: true as const } : {}),
  };
}

/** A new built piece from edited shapes; null when there are no shapes. */
export function pieceFromParts(draft: { name: string; parts: Part[]; light?: Def["light"]; wall?: true }, kind = newKind(draft.name), now = Date.now()): CustomPiece | null {
  const fit = fitParts(draft.parts.slice(0, MAX_PARTS));
  if (!fit) return null;
  return { kind, name: cleanName(draft.name), w: fit.w, d: fit.d, h: fit.h, parts: fit.parts, ...(draft.light ? { light: draft.light } : {}), ...(draft.wall ? { wall: true as const } : {}), at: now };
}

/** Size an imported model should start at: its own size in metres, unless that is absurd for furniture, then 1 m on its longest side. */
export function startSize(native: { x: number; y: number; z: number }): { w: number; d: number; h: number } {
  const big = Math.max(native.x, native.y, native.z, 1e-6);
  const k = big > 5 || big < 0.05 ? 1 / big : 1;
  const r = (v: number) => Math.max(0.01, Math.round(v * k * 100) / 100);
  return { w: r(native.x), d: r(native.z), h: r(native.y) };
}

/** Resize keeping proportions: the edited side wins, the others follow. */
export function lockedSize(from: { w: number; d: number; h: number }, edit: "w" | "d" | "h", value: number): { w: number; d: number; h: number } {
  const v = Math.min(MAX_DIM, Math.max(MIN_DIM, value));
  const k = v / from[edit];
  const r = (n: number) => Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(n * k * 1000) / 1000));
  return { w: edit === "w" ? v : r(from.w), d: edit === "d" ? v : r(from.d), h: edit === "h" ? v : r(from.h) };
}

/** Reads the `custom` block of an exported plan; anything that does not check out is dropped. */
export function parseBundle(raw: unknown): Bundle {
  const o = isRecord(raw) ? raw : {};
  const pieces = (Array.isArray(o.pieces) ? o.pieces : []).slice(0, 500).map(cleanPiece).filter((p): p is CustomPiece => !!p);
  const models = (Array.isArray(o.models) ? o.models : [])
    .slice(0, 200)
    .flatMap((m: unknown) =>
      isRecord(m) && typeof m.id === "string" && ID.test(m.id) && typeof m.b64 === "string" ? [{ id: m.id, ext: m.ext === "gltf" ? ("gltf" as const) : ("glb" as const), b64: m.b64 }] : [],
    );
  return { pieces, models };
}
