// Sketchfab car-model finder + importer (server side). Pure functions with injected fetch so they are testable.
// The client imports only types, attributionLine and LICENSE_LABELS from here.
import { inflateRawSync } from "node:zlib";
import { CARS } from "./catalog.cars.ts";
import { isRecord } from "./guards.ts";
import { bestFirst, CURATED, MIN_HEAVY, pickAuto, queriesFor, rankCandidates, type Ranked } from "./modelRank.ts";
import { readCapped } from "./server/readCapped.ts";

type LicenseSlug = "cc0" | "by" | "by-sa";
export type SearchHit = { uid: string; name: string; author: string; authorUrl: string; license: { slug: LicenseSlug; label: string }; faces: number; glbBytes: number | null; thumb: string; url: string; tags: string[]; likes: number; views: number; published: string; textures: number | null; textureMax: number | null };
export type SearchPage = { hits: SearchHit[]; next: string | null; canDownload: boolean };
export type ModelAttribution = { source: "sketchfab"; uid: string; name: string; author: string; authorUrl: string; license: LicenseSlug; licenseLabel: string; licenseUrl: string; sourceUrl: string; line: string };
export type ImportReport = { triangles: number; materials: number; textures: number; bytes: number };
type ErrorCode = "needs_token" | "bad_request" | "rate_limited" | "not_allowed" | "too_big" | "invalid_model" | "no_match" | "upstream" | "offline";
export type ApiError = { error: { code: ErrorCode; message: string; steps?: string[] } };
export type Failure = ApiError & { status: number };
export type Deps = { fetch: typeof fetch; token: string | undefined; timeoutMs?: number };
type ImportOk = { glb: Uint8Array; attribution: ModelAttribution; report: ImportReport; header: string };

const API = "https://api.sketchfab.com/v3";
const SLUGS: LicenseSlug[] = ["by", "by-sa", "cc0"];
const MAX_ARCHIVE = 60 * 1024 * 1024;
const MAX_UNZIPPED = 200 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const STATUS: Record<ErrorCode, number> = { needs_token: 401, bad_request: 400, rate_limited: 429, not_allowed: 403, too_big: 413, invalid_model: 422, no_match: 404, upstream: 502, offline: 502 };
const TOKEN_STEPS = [
  "Create a free Sketchfab account (sketchfab.com).",
  "Open sketchfab.com/settings/password and copy your API token.",
  "Add SKETCHFAB_TOKEN=your-token to the .env.local file next to package.json.",
  "Restart the dev server, then press the button again.",
];
const COMPRESSED = "This model uses compression this app cannot read yet; try another one";

const LICENSE_LABELS: Record<LicenseSlug, string> = { cc0: "CC0 1.0", by: "CC BY 4.0", "by-sa": "CC BY-SA 4.0" };
const LICENSE_URLS: Record<LicenseSlug, string> = {
  cc0: "https://creativecommons.org/publicdomain/zero/1.0/",
  by: "https://creativecommons.org/licenses/by/4.0/",
  "by-sa": "https://creativecommons.org/licenses/by-sa/4.0/",
};
const BY_UPSTREAM_LABEL: Record<string, LicenseSlug> = { "cc attribution": "by", "cc attribution-sharealike": "by-sa", "cc0 public domain": "cc0" };

export const fail = (code: ErrorCode, message: string, steps?: string[]): Failure => ({ status: STATUS[code], error: steps ? { code, message, steps } : { code, message } });
/** A refusal as a route's JSON reply (every /api/models route answers its failures this way). */
export const failureResponse = (f: Failure): Response => Response.json({ error: f.error }, { status: f.status });

class ModelError extends Error {
  code: ErrorCode;
  steps?: string[];
  constructor(code: ErrorCode, message: string, steps?: string[]) {
    super(message);
    this.code = code;
    this.steps = steps;
  }
}
const bad = (message = "This file is not a valid 3D model.") => new ModelError("invalid_model", message);

export const isUid = (s: unknown): s is string => typeof s === "string" && /^[a-f0-9]{32}$/.test(s);

/** Maps an upstream licence label or a slug to an allowed slug; everything else (NC, ND, Standard, Editorial, unknown) is null. */
export function licenseSlug(labelOrSlug: unknown): LicenseSlug | null {
  if (typeof labelOrSlug !== "string") return null;
  const t = labelOrSlug.trim().toLowerCase();
  return (SLUGS as string[]).includes(t) ? (t as LicenseSlug) : BY_UPSTREAM_LABEL[t] ?? null;
}

const clean = (t: string) => t.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, " ").replace(/\s+/g, " ").trim();

export function attributionLine(a: { name: string; author: string; authorUrl: string; license: LicenseSlug; sourceUrl: string }): string {
  const who = a.authorUrl ? `${a.author} (${a.authorUrl})` : a.author;
  const terms = a.license === "cc0" ? "is dedicated to the public domain (CC0 1.0)" : `is licensed under ${LICENSE_LABELS[a.license]} (${LICENSE_URLS[a.license]})`;
  return `"${a.name}" by ${who} ${terms}. Source: ${a.sourceUrl}. Provided by Sketchfab.`;
}

/** In-memory token bucket: `perMinute` takes, refilled continuously. Returns take() -> allowed. */
export function tokenBucket(perMinute: number, now: () => number = Date.now): () => boolean {
  let tokens = perMinute;
  let last = now();
  return () => {
    const t = now();
    tokens = Math.min(perMinute, tokens + ((t - last) * perMinute) / 60000);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

// ---------- search ----------

// glTF and Sketchfab JSON are untrusted and walked defensively everywhere: values stay `unknown` until `obj` / `list` / `num` / `str` read them.
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (isRecord(v) ? v : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown, max = 120) => (typeof v === "string" ? clean(v).slice(0, max) : "");
const sketchfabUrl = (v: unknown) => {
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" && /(^|\.)sketchfab\.com$/.test(u.hostname) ? u.href : "";
  } catch {
    return "";
  }
};
const httpsUrl = (v: unknown) => {
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
};

function pickThumb(m: Json): string {
  const imgs = list(obj(m.thumbnails).images).map(obj).filter((i) => typeof i.width === "number" && httpsUrl(i.url));
  const big = imgs.filter((i) => num(i.width) >= 256).sort((a, b) => num(a.width) - num(b.width))[0];
  const best = big ?? imgs.sort((a, b) => num(b.width) - num(a.width))[0];
  return best ? httpsUrl(best.url) : "";
}

/** Turns one upstream search response into safe hits. Everything that is not clearly allowed is dropped. */
export function shapeSearch(upstream: unknown, slugHint?: LicenseSlug): { hits: SearchHit[]; next: string | null } {
  const u = obj(upstream);
  const hits: SearchHit[] = [];
  for (const raw of list(u.results)) {
    const m = obj(raw);
    const slug = licenseSlug(obj(m.license).label);
    if (!isUid(m.uid) || !slug || (slugHint && slug !== slugHint) || m.isAgeRestricted === true || m.isDownloadable === false) continue;
    const glb = obj(obj(m.archives).glb).size;
    const gltf = obj(obj(m.archives).gltf).size;
    const known = [glb, gltf].filter((s): s is number => typeof s === "number");
    if (known.length && known.every((s) => s > MAX_ARCHIVE)) continue;
    const user = obj(m.user);
    const tex = obj(obj(m.archives).glb ?? obj(m.archives).gltf); // a single huge texture is the mark of a scan (see lib/modelRank.ts)
    hits.push({
      uid: m.uid,
      name: str(m.name, 80) || "Untitled",
      author: str(user.displayName || user.username, 80) || "Unknown",
      authorUrl: sketchfabUrl(user.profileUrl),
      license: { slug, label: LICENSE_LABELS[slug] },
      faces: num(m.faceCount),
      glbBytes: typeof glb === "number" ? glb : null,
      thumb: pickThumb(m),
      url: sketchfabUrl(m.viewerUrl) || `https://sketchfab.com/3d-models/x-${m.uid}`,
      tags: list(m.tags).map((t) => str(obj(t).slug, 40).toLowerCase()).filter(Boolean).slice(0, 25),
      likes: num(m.likeCount),
      views: num(m.viewCount),
      published: /^\d{4}-\d{2}-\d{2}/.test(String(m.publishedAt)) ? String(m.publishedAt).slice(0, 10) : "",
      textures: typeof tex.textureCount === "number" ? tex.textureCount : null,
      textureMax: typeof tex.textureMaxResolution === "number" ? tex.textureMaxResolution : null,
    });
  }
  const next = obj(u.cursors).next;
  return { hits, next: typeof next === "string" && next ? next : null };
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
function decodeCursor(c: string): Partial<Record<LicenseSlug, string>> | null {
  try {
    const o = obj(JSON.parse(Buffer.from(c, "base64url").toString("utf8")));
    const out: Partial<Record<LicenseSlug, string>> = {};
    for (const s of SLUGS) if (typeof o[s] === "string" && o[s].length <= 500) out[s] = o[s];
    return out;
  } catch {
    return null;
  }
}

const headersFor = (token?: string): Record<string, string> => (token ? { Accept: "application/json", Authorization: `Token ${token}` } : { Accept: "application/json" });

/** `anyCategory` drops the cars-vehicles filter (only the automatic pick uses it; the manual finder keeps the filter). */
export async function searchModels(p: { q: string; cursor?: string; heavy?: boolean; anyCategory?: boolean }, deps: Deps): Promise<SearchPage | Failure> {
  const q = clean(String(p.q ?? "")).slice(0, 100);
  if (q.length < 2) return fail("bad_request", "Type at least 2 letters to search.");
  let cur: Partial<Record<LicenseSlug, string>> | null = null;
  if (p.cursor) {
    cur = decodeCursor(p.cursor);
    if (!cur) return fail("bad_request", "That page link is no longer valid. Search again.");
  }
  const active = cur ? SLUGS.filter((s) => cur[s]) : SLUGS;
  const one = async (slug: LicenseSlug) => {
    const url = new URL(`${API}/search`);
    const params: Record<string, string> = { type: "models", downloadable: "true", q, count: "24", max_face_count: p.heavy ? "1000000" : "200000", license: slug, sort_by: "-likeCount" };
    if (!p.anyCategory) params.categories = "cars-vehicles";
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (cur?.[slug]) url.searchParams.set("cursor", cur[slug]);
    try {
      const res = await deps.fetch(url.toString(), { headers: headersFor(deps.token), signal: AbortSignal.timeout(deps.timeoutMs ?? 15000) });
      if (!res.ok) return { slug, status: res.status };
      return { slug, status: 200, ...shapeSearch(await res.json(), slug) };
    } catch {
      return { slug, status: 0 };
    }
  };
  const results = await Promise.all(active.map(one));
  const good = results.filter((r): r is { slug: LicenseSlug; status: number; hits: SearchHit[]; next: string | null } => "hits" in r);
  if (active.length && !good.length) {
    if (results.some((r) => r.status === 429)) return fail("rate_limited", "Sketchfab is busy. Try again in a minute.");
    if (results.every((r) => r.status === 0)) return fail("offline", "Could not reach Sketchfab. Check your internet connection.");
    return fail("upstream", "Sketchfab did not answer. Try again in a minute.");
  }
  // interleave: rank within own list first, then most liked
  const flat = good.flatMap((r) => r.hits.map((h, rank) => ({ h, rank })));
  flat.sort((a, b) => a.rank - b.rank || b.h.likes - a.h.likes);
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const { h } of flat) {
    if (seen.has(h.uid)) continue;
    seen.add(h.uid);
    hits.push(h);
  }
  const nexts = Object.fromEntries(good.filter((r) => r.next).map((r) => [r.slug, r.next]));
  return { hits, next: Object.keys(nexts).length ? b64(JSON.stringify(nexts)) : null, canDownload: !!deps.token };
}

// ---------- zip + glb ----------

export function readZip(buf: Uint8Array, limits: { maxTotal: number; maxEntries: number } = { maxTotal: MAX_UNZIPPED, maxEntries: MAX_ENTRIES }): Map<string, Uint8Array> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  const zipBad = () => bad("The model archive is damaged.");
  if (end < 0) throw zipBad();
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  if (count === 0xffff || p === 0xffffffff) throw zipBad();
  if (count > limits.maxEntries) throw new ModelError("too_big", "This model has too many files to open safely.");
  const out = new Map<string, Uint8Array>();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || v.getUint32(p, true) !== 0x02014b50) throw zipBad();
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const usize = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen)).replaceAll("\\", "/");
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    if (name.endsWith("/")) continue;
    if (flags & 1) throw bad("This model archive is password protected.");
    total += usize;
    if (total > limits.maxTotal) throw new ModelError("too_big", "This model is too big to open safely.");
    if (local + 30 > buf.length || v.getUint32(local, true) !== 0x04034b50) throw zipBad();
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (start + csize > buf.length) throw zipBad();
    const raw = buf.subarray(start, start + csize);
    let data: Uint8Array;
    if (method === 0) {
      if (csize !== usize) throw zipBad();
      data = raw;
    } else if (method === 8) {
      try {
        data = usize === 0 ? new Uint8Array(0) : inflateRawSync(raw, { maxOutputLength: usize });
      } catch {
        throw zipBad();
      }
      if (data.length !== usize) throw zipBad();
    } else throw zipBad();
    out.set(name, data);
  }
  return out;
}

const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const pad4 = (n: number) => (n + 3) & ~3;

function packGlb(json: unknown, bin: Uint8Array | null) {
  const j = new TextEncoder().encode(JSON.stringify(json));
  const jLen = pad4(j.length);
  const bLen = bin ? pad4(bin.length) : 0;
  const total = 12 + 8 + jLen + (bin ? 8 + bLen : 0);
  const out = new Uint8Array(total).fill(0);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, total, true);
  v.setUint32(12, jLen, true);
  v.setUint32(16, CHUNK_JSON, true);
  out.set(j, 20);
  out.fill(0x20, 20 + j.length, 20 + jLen);
  if (bin) {
    v.setUint32(20 + jLen, bLen, true);
    v.setUint32(24 + jLen, CHUNK_BIN, true);
    out.set(bin, 28 + jLen);
  }
  return out;
}

/** A JSON object from UTF-8 bytes; anything else (not UTF-8, not JSON, not an object) is a refused model. */
function jsonObject(bytes: Uint8Array | undefined): Json {
  try {
    const v: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (isRecord(v)) return v;
  } catch {
    // refused below, like a value that parsed but is not an object
  }
  throw bad();
}

function parseGlb(buf: Uint8Array): { json: Json; bin: Uint8Array | null } {
  if (buf.length < 20) throw bad();
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (v.getUint32(0, true) !== 0x46546c67) throw bad("This file is not a GLB 3D model.");
  if (v.getUint32(4, true) !== 2) throw bad("This model uses an unsupported glTF version.");
  if (v.getUint32(8, true) !== buf.length) throw bad("This model file is incomplete.");
  const jLen = v.getUint32(12, true);
  if (v.getUint32(16, true) !== CHUNK_JSON || 20 + jLen > buf.length) throw bad();
  const json = jsonObject(buf.subarray(20, 20 + jLen));
  let bin: Uint8Array | null = null;
  const at = 20 + jLen;
  if (at + 8 <= buf.length && v.getUint32(at + 4, true) === CHUNK_BIN) {
    const bLen = v.getUint32(at, true);
    if (at + 8 + bLen > buf.length) throw bad();
    bin = buf.subarray(at + 8, at + 8 + bLen);
  }
  return { json, bin };
}

const OK_REQUIRED: Record<string, true> = { KHR_texture_transform: true, KHR_mesh_quantization: true, EXT_texture_webp: true };

/** A GLB whose JSON has at least one mesh (checked by `validateGlb`), with its binary chunk. */
type ValidGlb = { json: Json & { meshes: unknown[] }; bin: Uint8Array | null };

export function validateGlb(buf: Uint8Array): ValidGlb {
  const { json, bin } = parseGlb(buf);
  for (const e of list(json.extensionsRequired)) {
    if (/draco|meshopt|basisu|ktx2/i.test(String(e))) throw bad(COMPRESSED);
    if (typeof e !== "string" || (!Object.hasOwn(OK_REQUIRED, e) && !e.startsWith("KHR_materials_"))) throw bad("This model needs a feature this app cannot read yet; try another one");
  }
  const buffers = list(json.buffers);
  if (buffers.some((b) => obj(b).uri !== undefined) || list(json.images).some((i) => obj(i).uri !== undefined)) throw bad("This model points to files outside itself.");
  const meshes = list(json.meshes);
  if (!meshes.length) throw bad("This file has no 3D shape in it.");
  const have = bin?.length ?? 0;
  if (num(obj(buffers[0]).byteLength) > have) throw bad("This model file is incomplete.");
  for (const bv of list(json.bufferViews)) if (num(obj(bv).byteOffset) + num(obj(bv).byteLength) > have) throw bad("This model file is incomplete.");
  return { json: { ...json, meshes }, bin };
}

function dropExtras(v: unknown) {
  if (Array.isArray(v)) v.forEach(dropExtras);
  else if (isRecord(v)) {
    delete v.extras;
    Object.values(v).forEach(dropExtras);
  }
}

/** Removes cameras, lights, animations and extras; skins and names stay. */
export function stripGlb(buf: Uint8Array) {
  const { json, bin } = parseGlb(buf);
  delete json.cameras;
  delete json.animations;
  const LIGHTS = "KHR_lights_punctual";
  const dropLights = (o: Json) => {
    if (!isRecord(o.extensions)) return;
    delete o.extensions[LIGHTS];
    if (!Object.keys(o.extensions).length) delete o.extensions;
  };
  for (const n of list(json.nodes)) {
    const node = obj(n);
    delete node.camera;
    dropLights(node);
  }
  dropLights(json);
  for (const k of ["extensionsUsed", "extensionsRequired"]) {
    const used = json[k];
    if (!Array.isArray(used)) continue;
    const kept = used.filter((e) => e !== LIGHTS);
    if (kept.length) json[k] = kept;
    else delete json[k];
  }
  dropExtras(json);
  return packGlb(json, bin);
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/** One .gltf + .bin + pictures from a zip -> one binary GLB. Refuses links that point outside the zip. */
export function gltfZipToGlb(files: Map<string, Uint8Array>): Uint8Array {
  const path = [...files.keys()].filter((k) => /\.gltf$/i.test(k) && !k.startsWith("__MACOSX")).sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (!path) throw bad("No model was found inside the download.");
  const base = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  const json = jsonObject(files.get(path));
  const resolve = (uri: unknown): { data: Uint8Array; ext: string } => {
    if (typeof uri !== "string") throw bad();
    const m = /^data:([^;,]*)(;base64)?,/.exec(uri);
    if (m) {
      const body = uri.slice(m[0].length);
      return { data: m[2] ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body), "latin1"), ext: m[1].split("/")[1] ?? "" };
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || /^[/\\]/.test(uri)) throw bad("This model points to files outside itself.");
    let rel: string;
    try {
      rel = decodeURIComponent(uri).replaceAll("\\", "/");
    } catch {
      throw bad();
    }
    if (rel.split("/").includes("..")) throw bad("This model points to files outside itself.");
    const data = files.get(base + rel);
    if (!data) throw bad("The download is missing a file the model needs.");
    return { data, ext: rel.slice(rel.lastIndexOf(".") + 1).toLowerCase() };
  };
  const parts: Uint8Array[] = [];
  let size = 0;
  const add = (d: Uint8Array) => {
    const offset = size;
    parts.push(d, new Uint8Array(pad4(d.length) - d.length));
    size += pad4(d.length);
    return offset;
  };
  const views = list(json.bufferViews).map(obj);
  const offsets = list(json.buffers).map((b) => {
    const { data } = resolve(obj(b).uri);
    const len = num(obj(b).byteLength);
    if (data.length < len) throw bad("The model data is incomplete.");
    return add(data.subarray(0, len));
  });
  for (const bv of views) {
    const shift = typeof bv.buffer === "number" ? offsets[bv.buffer] : undefined;
    bv.byteOffset = num(bv.byteOffset) + (shift ?? 0);
    bv.buffer = 0;
  }
  for (const img of list(json.images).map(obj)) {
    if (img.uri === undefined) continue;
    const { data, ext } = resolve(img.uri);
    const mime = MIME[ext] ?? (/^(png|jpeg|webp)$/.test(ext) ? `image/${ext}` : "");
    if (!mime) throw bad("This model uses a picture format this app cannot read.");
    views.push({ buffer: 0, byteOffset: add(data), byteLength: data.length });
    img.bufferView = views.length - 1;
    img.mimeType = mime;
    delete img.uri;
  }
  json.bufferViews = views;
  json.buffers = [{ byteLength: size }];
  const bin = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    bin.set(p, at);
    at += p.length;
  }
  return packGlb(json, bin);
}

function glbReport(json: Json, bytes: number): ImportReport {
  const accessors = list(json.accessors);
  let triangles = 0;
  for (const mesh of list(json.meshes))
    for (const p of list(obj(mesh).primitives).map(obj)) {
      if ((p.mode ?? 4) !== 4) continue;
      const at = p.indices ?? obj(p.attributes).POSITION;
      triangles += Math.floor(num(obj(typeof at === "number" ? accessors[at] : undefined).count) / 3);
    }
  return { triangles, materials: list(json.materials).length, textures: list(json.textures).length, bytes };
}

// ---------- import ----------

const HOST_OK = /(^|\.)(amazonaws\.com|sketchfab\.com|skfb\.ms|cloudfront\.net)$/i;

async function fetchCapped(url: unknown, cap: number, deps: Deps): Promise<Uint8Array> {
  let u: URL;
  try {
    u = new URL(String(url));
  } catch {
    throw new ModelError("upstream", "Sketchfab sent a download link we could not use.");
  }
  if (u.protocol !== "https:" || u.port || u.username || !HOST_OK.test(u.hostname)) throw new ModelError("upstream", "The download came from an unexpected place, so it was blocked.");
  const tooBig = () => new ModelError("too_big", "This model is too big to download (the limit is 60 MB).");
  // no Authorization header here: the signed link needs none and must never see the token
  const res = await deps.fetch(u.toString(), { redirect: "error", signal: AbortSignal.timeout(deps.timeoutMs ?? 60000) });
  if (!res.ok) throw new ModelError("upstream", "Sketchfab could not send the file. Try again in a minute.");
  const declared = num(Number(res.headers.get("content-length")));
  if (declared > cap) throw tooBig();
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    if (all.length > cap) throw tooBig();
    return all;
  }
  const bytes = await readCapped(res.body, cap, declared);
  if (!bytes) throw tooBig();
  return bytes;
}

async function getJson(url: string, deps: Deps, gone: string): Promise<Json> {
  const res = await deps.fetch(url, { headers: headersFor(deps.token), signal: AbortSignal.timeout(deps.timeoutMs ?? 15000) });
  if (res.status === 429) throw new ModelError("rate_limited", "Sketchfab is busy. Try again in a minute.");
  if (res.status === 401) throw new ModelError("needs_token", "Sketchfab did not accept your API token.", TOKEN_STEPS);
  if (res.status === 403 || res.status === 404) throw new ModelError("not_allowed", gone);
  if (!res.ok) throw new ModelError("upstream", "Sketchfab did not answer. Try again in a minute.");
  return obj(await res.json());
}

export async function importModel(uid: string, deps: Deps): Promise<ImportOk | Failure> {
  if (!isUid(uid)) return fail("bad_request", "That model id does not look right.");
  if (!deps.token) return fail("needs_token", "Downloading models needs your own free Sketchfab API token.", TOKEN_STEPS);
  try {
    const notDownloadable = "This model cannot be downloaded (it may be private, paid or password protected).";
    const meta = await getJson(`${API}/models/${uid}`, deps, notDownloadable);
    const slug = licenseSlug(obj(meta.license).slug) ?? licenseSlug(obj(meta.license).label);
    if (!slug) return fail("not_allowed", "This model's licence does not allow use here. Only CC0, CC BY and CC BY-SA models can be used.");
    if (meta.isDownloadable === false || meta.isAgeRestricted === true) return fail("not_allowed", notDownloadable);
    const dl = await getJson(`${API}/models/${uid}/download`, deps, notDownloadable);
    const pick = obj(dl.glb).url ? "glb" : obj(dl.gltf).url ? "gltf" : null;
    if (!pick) return fail("not_allowed", notDownloadable);
    if (num(obj(dl[pick]).size) > MAX_ARCHIVE) return fail("too_big", "This model is too big to download (the limit is 60 MB).");
    const raw = await fetchCapped(obj(dl[pick]).url, MAX_ARCHIVE, deps);
    const whole = pick === "glb" ? raw : gltfZipToGlb(readZip(raw));
    const { json } = validateGlb(whole);
    const glb = stripGlb(whole);
    const user = obj(meta.user);
    const base = {
      source: "sketchfab" as const,
      uid,
      name: str(meta.name, 80) || "Untitled",
      author: str(user.displayName || user.username, 80) || "Unknown",
      authorUrl: sketchfabUrl(user.profileUrl),
      license: slug,
      licenseLabel: LICENSE_LABELS[slug],
      licenseUrl: LICENSE_URLS[slug],
      sourceUrl: sketchfabUrl(meta.viewerUrl) || `https://sketchfab.com/3d-models/x-${uid}`,
    };
    const attribution: ModelAttribution = { ...base, line: attributionLine(base) };
    const report = glbReport(json, glb.length);
    return { glb, attribution, report, header: Buffer.from(JSON.stringify({ attribution, report }), "utf8").toString("base64") };
  } catch (e) {
    if (e instanceof ModelError) return fail(e.code, e.message, e.steps);
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return fail("upstream", "Sketchfab took too long. Try again in a minute.");
    return fail("offline", "Could not reach Sketchfab. Check your internet connection.");
  }
}

// ---------- automatic pick ----------

export const needsToken = () => fail("needs_token", "Downloading models needs your own free Sketchfab API token.", TOKEN_STEPS);

/** Search results for one catalogue car, best first. Looks under the full name, the plain name, then regional names. */
export async function autoCandidates(carId: string, deps: Deps, opts: { heavy?: boolean; skip?: string[] } = {}): Promise<Ranked[] | Failure> {
  const car = CARS[carId]?.car;
  if (!car) return fail("bad_request", "That car is not in the catalogue.");
  const queries = queriesFor(car);
  const pool = new Map<string, SearchHit>();
  let failure: Failure | null = null;
  const run = async (q: string, anyCategory?: boolean) => {
    const page = await searchModels({ q, heavy: opts.heavy, anyCategory }, deps);
    if ("error" in page) failure ??= page;
    else for (const h of page.hits) pool.set(h.uid, h);
  };
  const enough = () => rankCandidates(car, [...pool.values()]).filter((r) => r.score >= MIN_HEAVY).length >= 6;
  // some good models have no Sketchfab category at all, so the plain name (no year) is also searched without the filter
  await Promise.all([...queries.slice(0, 2).map((q) => run(q)), run(queries[1] ?? queries[0], true)]);
  for (const q of queries.slice(2)) {
    if (enough()) break;
    await run(q);
  }
  if (!pool.size && failure) return failure;
  return bestFirst(rankCandidates(car, [...pool.values()]), { skip: opts.skip });
}

export type AutoMeta = {
  attribution: ModelAttribution;
  report: ImportReport;
  pick: { uid: string; score: number; heavy: boolean };
  alternatives: { uid: string; name: string; author: string; license: { slug: LicenseSlug; label: string }; faces: number; thumb?: string; url: string; score: number }[];
};
export type AutoOk = { glb: Uint8Array; header: string; meta: AutoMeta };

const RETRY = new Set<ErrorCode>(["invalid_model", "not_allowed", "too_big", "upstream"]);
const noMatch = () => fail("no_match", "No good match found for this car. Try the manual search.");

/** Finds, downloads and cleans the best model for a catalogue car. A model that cannot be used is replaced by the next best (3 tries). */
export async function autoImport(carId: string, deps: Deps, opts: { heavy?: boolean; skip?: string[] } = {}): Promise<AutoOk | Failure> {
  if (!deps.token) return needsToken();
  let ranked = await autoCandidates(carId, deps, { heavy: opts.heavy, skip: opts.skip });
  if ("error" in ranked) return ranked;
  let sel = pickAuto(ranked);
  if ((!sel || sel.pick.scan || CURATED[carId]) && !opts.heavy) {
    // nothing light is good enough, only a scan (cannot be recoloured), or a hand-picked model that is big: look at big models too
    const again = await autoCandidates(carId, deps, { heavy: true, skip: opts.skip });
    const sel2 = "error" in again ? null : pickAuto(again);
    if (sel2 && !("error" in again)) {
      ranked = again;
      sel = sel2;
    }
  }
  if (!sel) return noMatch();
  const queue = [sel.pick, ...ranked.filter((r) => r !== sel.pick)];
  let last: Failure = noMatch();
  for (const [i, cand] of queue.slice(0, 3).entries()) {
    if (i > 0 && cand.score < MIN_HEAVY) break;
    const r = await importModel(cand.hit.uid, deps);
    if (!("error" in r)) {
      const rest = queue.filter((q) => q !== cand && !queue.slice(0, i).includes(q)).slice(0, 5);
      const meta = autoMeta(r, cand, rest);
      return { glb: r.glb, meta, header: Buffer.from(JSON.stringify(meta), "utf8").toString("base64") };
    }
    last = r;
    if (!RETRY.has(r.error.code)) return r;
  }
  return last;
}

/** The header payload, kept small enough for an HTTP header (thumbnails go first when it is too long). */
function autoMeta(r: ImportOk, pick: Ranked, rest: Ranked[]): AutoMeta {
  const alternatives = rest.map(({ hit, score }) => ({ uid: hit.uid, name: hit.name.slice(0, 60), author: hit.author.slice(0, 40), license: hit.license, faces: hit.faces, thumb: hit.thumb, url: hit.url, score }));
  const meta: AutoMeta = { attribution: r.attribution, report: r.report, pick: { uid: pick.hit.uid, score: pick.score, heavy: pick.heavy }, alternatives };
  if (JSON.stringify(meta).length * 1.34 > 6000) for (const a of meta.alternatives) delete a.thumb;
  return meta;
}

