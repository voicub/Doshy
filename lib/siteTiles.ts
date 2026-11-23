// Satellite tiles, pure parts: which provider (from env), which tiles may be asked for, what bytes are an image, how the disk cache is trimmed.
// The route app/api/site/tile/[z]/[x]/[y] does the I/O. The node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { SITE_TILE_MAX_ZOOM } from "./siteTypes.ts";

export const DEFAULT_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_TILE_CREDIT = "Imagery: Esri, Maxar, Earthstar Geographics";
/** Deepest zoom any slippy-map provider has; an env value above it is a typo. */
const ZOOM_CEILING = 22;
export const MAX_TILE_BYTES = 2 * 1024 * 1024;
export const CACHE_CAP_BYTES = 300 * 1024 * 1024;

export type TileProvider = {
  /** URL template with {z} {y} {x}, https or http only. */
  template: string;
  maxZoom: number;
  credit: string;
  /** Short stable id of the template: the cache folder, so changing provider never serves the old provider's pictures. */
  key: string;
};

type TileEnv = { SITE_TILE_URL?: string; SITE_TILE_MAX_ZOOM?: string; SITE_TILE_CREDIT?: string };

/** FNV-1a, 8 hex digits: a folder name, not security. */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

function validTemplate(t: string | undefined): string | undefined {
  if (!t || !/\{z\}/.test(t) || !/\{x\}/.test(t) || !/\{y\}/.test(t)) return undefined;
  try {
    const u = new URL(t.replace(/\{[zxy]\}/g, "0"));
    return u.protocol === "https:" || u.protocol === "http:" ? t : undefined;
  } catch {
    return undefined;
  }
}

/** The provider from the environment (owner-set, so trusted), with defaults for anything missing or malformed. */
export function tileProvider(env: TileEnv): TileProvider {
  const template = validTemplate(env.SITE_TILE_URL?.trim()) ?? DEFAULT_TILE_URL;
  const z = env.SITE_TILE_MAX_ZOOM?.trim() ? Number(env.SITE_TILE_MAX_ZOOM) : NaN;
  const maxZoom = Number.isInteger(z) && z >= 0 && z <= ZOOM_CEILING ? z : SITE_TILE_MAX_ZOOM;
  const credit = env.SITE_TILE_CREDIT?.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 200);
  return { template, maxZoom, credit: credit || (template === DEFAULT_TILE_URL ? DEFAULT_TILE_CREDIT : "Satellite imagery: see the provider's terms"), key: shortHash(template) };
}

export type TileId = { z: number; x: number; y: number };

/** The route's three path segments as a tile, or undefined unless each is a plain decimal integer and the tile exists at that zoom (0 <= z <= maxZoom, 0 <= x,y < 2^z). */
export function parseTile(z: string, x: string, y: string, maxZoom: number): TileId | undefined {
  if (!/^\d{1,2}$/.test(z) || !/^\d{1,7}$/.test(x) || !/^\d{1,7}$/.test(y)) return undefined;
  const t = { z: Number(z), x: Number(x), y: Number(y) };
  const n = 2 ** t.z;
  return t.z <= maxZoom && t.x < n && t.y < n ? t : undefined;
}

/** The upstream URL: the env template with the three validated integers, nothing else is ever substituted. */
export function tileUrl(p: TileProvider, t: TileId): string {
  return p.template.replaceAll("{z}", String(t.z)).replaceAll("{x}", String(t.x)).replaceAll("{y}", String(t.y));
}

/** The image type by its first bytes (never by what the server says: this is served from our own origin), undefined for anything but JPEG, PNG and WebP. */
export function sniffImage(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | undefined {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return undefined;
}

export type CacheFile = { path: string; size: number; mtimeMs: number };

/** Which cached files to delete (oldest first) so that what is left plus `incoming` bytes fits the cap. */
export function evictionPlan(files: readonly CacheFile[], incoming: number, cap = CACHE_CAP_BYTES): string[] {
  let total = incoming;
  for (const f of files) total += f.size;
  const out: string[] = [];
  for (const f of [...files].sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    if (total <= cap) break;
    out.push(f.path);
    total -= f.size;
  }
  return out;
}

/** Fixed-window counter: `hit()` is false once more than `max` calls landed in the current window. */
export function windowLimiter(max: number, windowMs: number): (now?: number) => boolean {
  let start = 0;
  let n = 0;
  return (now = Date.now()) => {
    if (now - start >= windowMs) {
      start = now;
      n = 0;
    }
    return ++n <= max;
  };
}
