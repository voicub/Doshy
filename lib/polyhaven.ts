// Poly Haven (https://polyhaven.com, CC0 HDRIs, PBR textures and 3D models): everything that is pure about using their public API from Doshy. Validates every id,
// URL and number that comes back from the network, shrinks the listing to what the browse dialogs show, picks which files to download, and says which size a
// graphics tier gets. The server side (fetching, disk cache) is lib/server/polyhaven*.ts; the material file format is lib/polyhavenMaterial.ts.
// The node test runner loads this file directly: .ts import extensions, no React, no browser globals.
import { isRecord } from "./guards.ts";
import type { Tier } from "./quality.ts";

export type PhType = "hdris" | "textures" | "models";
export const PH_TYPES: readonly PhType[] = ["hdris", "textures", "models"];
export const isPhType = (v: unknown): v is PhType => typeof v === "string" && (PH_TYPES as readonly string[]).includes(v);

/** Poly Haven ids are file-name safe: letters (models use capitals, e.g. ArmChair_01), digits, `_` and `-`. Every id that reaches a URL is checked with this first. */
export const ASSET_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
export const isAssetId = (v: unknown): v is string => typeof v === "string" && ASSET_ID_RE.test(v);

/** The only places the Doshy server talks to. */
export const PH_HOSTS = { api: "api.polyhaven.com", cdn: "cdn.polyhaven.com", files: "dl.polyhaven.org" } as const;
export const PH_SITE = "https://polyhaven.com";
export const PH_PATREON = "https://www.patreon.com/polyhaven/join";
/** The visible credit the API's terms ask for wherever Poly Haven content is offered. */
export const PH_CREDIT = "Assets from Poly Haven (CC0)";

// ---- sizes -----------------------------------------------------------------------------------------------------------------

const MB = 1024 * 1024;
/** Caps per download (checked against the announced size and again while reading): a 1k HDRI is 1.5 MB, a 2k one 6 MB. */
export const PH_LIMITS = { hdriBytes: 25 * MB, textureFileBytes: 5 * MB, materialBytes: 15 * MB, modelSourceBytes: 60 * MB, modelFiles: 40, glbBytes: 25 * MB } as const;
/** A model with more triangles than this is "heavy": the browse dialog warns before it is imported. */
export const HEAVY_TRIANGLES = 150_000;

export type HdriRes = "1k" | "2k";

/**
 * Which HDRI size a tier loads, or null when the tier never loads one. Eco and Light keep the procedural sky (the knobs say `ibl: false`): a 1k picture is
 * 2 MB of float pixels on the GPU plus a cube map, too much for a Raspberry Pi. Balanced and Detailed use 1k, Ultra 2k.
 */
export const hdriResFor = (tier: Tier): HdriRes | null => (tier === "eco" || tier === "low" ? null : tier === "ultra" ? "2k" : "1k");

// ---- the listing -----------------------------------------------------------------------------------------------------------

/** What the browse dialogs need of one asset (the upstream record is ten times bigger). `dims` are metres, width x depth x height for models. */
export type PhItem = {
  id: string;
  type: PhType;
  name: string;
  /** Poly Haven's categories and tags, lower case, used for the filter chips and the search. */
  cats: string[];
  tags: string[];
  authors: string[];
  /** Where the surface is meant to go (textures): floor, wall, ground, paving, roof, object, ceiling. */
  use?: string;
  /** Real size in metres: a texture's patch (x, y) or a model's box (x, y, z). */
  dims?: number[];
  polycount?: number;
  downloads: number;
  /** The picture's version: part of the thumbnail URL so a new picture is never served from the old cache. */
  v?: string;
};

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>`"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const strings = (v: unknown, max: number, each: number): string[] => (Array.isArray(v) ? v.map((s) => text(s, each).toLowerCase()).filter(Boolean).slice(0, max) : []);
const finite = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Upstream sizes are millimetres: metres, to the millimetre, or undefined when any is missing, not positive or absurd (over 200 m). */
export function dimsOf(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 3) return undefined;
  const mm = raw.map(finite);
  if (mm.some((n) => n === undefined || n <= 0 || n > 200_000)) return undefined;
  return mm.map((n) => Math.round(n as number) / 1000);
}

/** The listing of one type, shrunk to `PhItem`s. Bad records are skipped, never trusted: ids, text lengths and numbers are all checked. */
export function parseAssets(type: PhType, upstream: unknown): PhItem[] {
  if (!isRecord(upstream)) return [];
  const out: PhItem[] = [];
  for (const [id, raw] of Object.entries(upstream)) {
    if (!isAssetId(id) || !isRecord(raw)) continue;
    const name = text(raw.name, 80) || id;
    const authors = isRecord(raw.authors) ? Object.keys(raw.authors).map((a) => text(a, 60)).filter(Boolean).slice(0, 6) : [];
    const attrs = isRecord(raw.attributes) ? raw.attributes : {};
    const use = text(attrs.surface_use, 20).toLowerCase();
    const dims = dimsOf(raw.dimensions);
    const polycount = finite(raw.polycount);
    const v = typeof raw.img_version === "string" && /^[a-f0-9]{4,16}$/.test(raw.img_version) ? raw.img_version : undefined;
    out.push({
      id,
      type,
      name,
      cats: strings(raw.categories, 24, 40),
      tags: strings(raw.tags, 24, 40),
      authors,
      ...(use && /^[a-z]+$/.test(use) ? { use } : {}),
      ...(dims ? { dims } : {}),
      ...(polycount !== undefined && polycount >= 0 ? { polycount: Math.round(polycount) } : {}),
      downloads: Math.max(0, Math.round(finite(raw.download_count) ?? 0)),
      ...(v ? { v } : {}),
    });
  }
  return out;
}

/** The credit line kept with anything taken from Poly Haven. */
export const creditLine = (item: Pick<PhItem, "name" | "authors">): string => `${item.name}${item.authors.length ? ` by ${item.authors.join(", ")}` : ""} (Poly Haven, CC0)`;

// ---- searching -------------------------------------------------------------------------------------------------------------

/** A filter chip: it matches an asset by one of its categories, or (textures) by where the surface goes. */
export type PhFilter = { id: string; label: string; cat?: string; use?: readonly string[] };

/** Plain-English chips per type. The ids are what `queryItems` and the route accept; `cat` is Poly Haven's own category name. */
export const PH_FILTERS: Record<PhType, readonly PhFilter[]> = {
  hdris: [
    { id: "studio", label: "Studio", cat: "studio" },
    { id: "outdoor", label: "Outdoor", cat: "outdoor" },
    { id: "indoor", label: "Indoor", cat: "indoor" },
    { id: "sunrise-sunset", label: "Sunrise and sunset", cat: "sunrise-sunset" },
    { id: "night", label: "Night", cat: "night" },
    { id: "overcast", label: "Cloudy", cat: "overcast" },
    { id: "clear", label: "Clear sky", cat: "clear" },
  ],
  textures: [
    { id: "floor", label: "For floors", use: ["floor", "paving"] },
    { id: "wall", label: "For walls", use: ["wall", "ceiling"] },
    { id: "ground", label: "For the garden", use: ["ground", "paving"] },
    { id: "wood", label: "Wood", cat: "wood" },
    { id: "tiles", label: "Tiles", cat: "tiles" },
    { id: "brick", label: "Brick", cat: "brick" },
    { id: "concrete", label: "Concrete", cat: "concrete" },
    { id: "plaster", label: "Plaster", cat: "plaster" },
    { id: "fabric", label: "Fabric", cat: "fabric" },
    { id: "gravel", label: "Gravel", cat: "gravel" },
    { id: "metal", label: "Metal", cat: "metal" },
  ],
  models: [
    { id: "furniture", label: "Furniture", cat: "furniture" },
    { id: "seating", label: "Seating", cat: "seating" },
    { id: "table", label: "Tables", cat: "table" },
    { id: "lighting", label: "Lamps", cat: "lighting" },
    { id: "decorative", label: "Decor", cat: "decorative" },
    { id: "plants", label: "Plants", cat: "plants" },
    { id: "appliances", label: "Appliances", cat: "appliances" },
    { id: "electronics", label: "Electronics", cat: "electronics" },
    { id: "shelves", label: "Shelves", cat: "shelves" },
    { id: "food", label: "Food", cat: "food" },
    { id: "props", label: "Props", cat: "props" },
  ],
};

export const PAGE_SIZE = 48;
export const MAX_PAGE_SIZE = 96;
export const MAX_QUERY_CHARS = 60;

export type PhQuery = { q?: string; filter?: string; page?: number; limit?: number };
export type PhPage = { items: PhItem[]; total: number; page: number; limit: number };

/** Search words must all appear (as part of the name, a tag or a category); the chip narrows by category or use; most downloaded first. Pages are 0-based. */
export function queryItems(all: readonly PhItem[], type: PhType, q: PhQuery): PhPage {
  const words = text(q.q, MAX_QUERY_CHARS).toLowerCase().split(" ").filter(Boolean).slice(0, 6);
  const chip = PH_FILTERS[type].find((f) => f.id === q.filter);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(q.limit ?? PAGE_SIZE)));
  const hits = all.filter((it) => {
    if (chip?.cat && !it.cats.includes(chip.cat)) return false;
    if (chip?.use && !(it.use && chip.use.includes(it.use))) return false;
    const name = it.name.toLowerCase();
    const squashed = name.replaceAll(" ", ""); // "armchair" must find "Arm Chair 01"
    return words.every((w) => name.includes(w) || squashed.includes(w) || it.tags.some((t) => t.includes(w)) || it.cats.some((c) => c.includes(w)));
  });
  hits.sort((a, b) => b.downloads - a.downloads || a.name.localeCompare(b.name));
  const page = Math.max(0, Math.min(Math.floor(q.page ?? 0), Math.max(0, Math.ceil(hits.length / limit) - 1)));
  return { items: hits.slice(page * limit, (page + 1) * limit), total: hits.length, page, limit };
}

// ---- which files ------------------------------------------------------------------------------------------------------------

export type PhFile = { url: string; size: number };

/** A download link is only ever followed when it is https on Poly Haven's file host with no port or login in it and a path under their asset store. */
export function isFileUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 400) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname === PH_HOSTS.files && !u.port && !u.username && !u.password && u.pathname.startsWith("/file/ph-assets/");
  } catch {
    return false;
  }
}

function fileOf(v: unknown, maxBytes: number): PhFile | undefined {
  if (!isRecord(v) || !isFileUrl(v.url)) return undefined;
  const size = finite(v.size);
  return size !== undefined && size > 0 && size <= maxBytes ? { url: v.url, size } : undefined;
}

const RES_ORDER = ["1k", "2k", "4k"] as const;
/** The wanted resolution when it exists, else the nearest smaller one, else the smallest one there is: Poly Haven always has 1k, but never trust that. */
function resKey(from: Record<string, unknown>, want: string): string | undefined {
  const known = RES_ORDER.filter((r) => Object.hasOwn(from, r));
  const below = known.filter((r) => RES_ORDER.indexOf(r) <= RES_ORDER.indexOf(want as (typeof RES_ORDER)[number]));
  return below.at(-1) ?? known[0];
}

/** The `.hdr` file of an HDRI at `want` (or the nearest smaller size), from the `/files/<id>` answer. */
export function pickHdri(files: unknown, want: HdriRes): (PhFile & { res: string }) | undefined {
  const hdri = isRecord(files) && isRecord(files.hdri) ? files.hdri : undefined;
  const res = hdri && resKey(hdri, want);
  const entry = hdri && res ? hdri[res] : undefined;
  const file = isRecord(entry) ? fileOf(entry.hdr, PH_LIMITS.hdriBytes) : undefined;
  return file && res ? { ...file, res } : undefined;
}

/** The three pictures of a PBR texture at 1k (colour, roughness, normal map in OpenGL convention: what three.js reads), from the `/files/<id>` answer. Colour is required. */
export function pickMaterial(files: unknown): { diff: PhFile; rough?: PhFile; nor?: PhFile } | undefined {
  if (!isRecord(files)) return undefined;
  const get = (key: string): PhFile | undefined => {
    const set = files[key];
    const one = isRecord(set) && isRecord(set["1k"]) ? set["1k"] : undefined;
    return one ? fileOf(one.jpg, PH_LIMITS.textureFileBytes) : undefined;
  };
  const diff = get("Diffuse");
  if (!diff) return undefined;
  const rough = get("Rough");
  const nor = get("nor_gl");
  return { diff, ...(rough ? { rough } : {}), ...(nor ? { nor } : {}) };
}

/** A path inside a glTF package: relative, no `..`, no scheme, no odd characters. */
const SAFE_REL = /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_][A-Za-z0-9_ .+()/-]{0,120}$/;

/** The glTF of a model at 1k: the `.gltf` text plus the files it points to (the `.bin` and the pictures), keyed by the path the glTF uses. */
export function pickModel(files: unknown): { gltf: PhFile; include: Record<string, PhFile> } | undefined {
  const set = isRecord(files) && isRecord(files.gltf) && isRecord(files.gltf["1k"]) ? files.gltf["1k"] : undefined;
  const entry = set && isRecord(set.gltf) ? set.gltf : undefined;
  const gltf = entry ? fileOf(entry, 1 * MB) : undefined;
  if (!entry || !gltf || !isRecord(entry.include)) return undefined;
  const names = Object.keys(entry.include);
  if (!names.length || names.length > PH_LIMITS.modelFiles) return undefined;
  const include: Record<string, PhFile> = {};
  let total = gltf.size;
  for (const name of names) {
    const f = SAFE_REL.test(name) ? fileOf(entry.include[name], PH_LIMITS.modelSourceBytes) : undefined;
    if (!f) return undefined;
    total += f.size;
    include[name] = f;
  }
  return total <= PH_LIMITS.modelSourceBytes ? { gltf, include } : undefined;
}

/** A Radiance `.hdr` starts with its own signature: the check the server makes before it keeps or serves the file. */
export function isRadiance(b: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(b.subarray(0, 10));
  return b.length > 64 && (head.startsWith("#?RADIANCE") || head.startsWith("#?RGBE"));
}

/** The thumbnail on Poly Haven's picture server for an id (width is the square size: 128 or 256). Only validated parts get in. */
export function thumbUrl(id: string, size: 128 | 256, v?: string): string | null {
  if (!isAssetId(id) || (v !== undefined && !/^[a-f0-9]{4,16}$/.test(v))) return null;
  return `https://${PH_HOSTS.cdn}/asset_img/thumbs/${id}.png?width=${size}&height=${size}&format=webp${v ? `&v=${v}` : ""}`;
}

/** The API's own addresses. A type or an id that is not valid is a bug in the caller, never something to put in a URL. */
export const apiAssetsUrl = (type: PhType): string => `https://${PH_HOSTS.api}/assets?t=${type}`;
export function apiFilesUrl(id: string): string {
  if (!isAssetId(id)) throw new Error("not a Poly Haven asset id");
  return `https://${PH_HOSTS.api}/files/${id}`;
}

/** Whether `v` is a listing entry as this app's own server sends it (the browser checks it instead of casting). */
export const isPhItem = (v: unknown): v is PhItem =>
  isRecord(v) && isAssetId(v.id) && isPhType(v.type) && typeof v.name === "string" && Array.isArray(v.cats) && Array.isArray(v.tags) && Array.isArray(v.authors) && typeof v.downloads === "number";
