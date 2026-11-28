// Server side of GET /api/site/terrain: validates the query, fetches AWS Terrain Tiles (Terrarium PNGs) one by one, keeps them on disk, decodes them and
// resamples them into the ground grid. Node only (fs), but free of Next.js so the node test runner can load it: imports carry a .ts extension or are type-only.
// SSRF: the only host ever contacted is the dataset's own, and only integers that passed `parseTerrainTile` are put into its fixed URL template.
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeTerrarium, MAX_TILE_PNG_BYTES } from "./pngTerrarium.ts";
import { readCapped } from "./server/readCapped.ts";
import { SiteError, USER_AGENT, parseSiteQuery } from "./siteServer.ts";
import { TERRAIN_MAX_ZOOM, TERRAIN_MIN_ZOOM, sampleTerrainGrid, terrainZoom, tileKey, tilesCovering, type TerrainTileId, type TileHeights } from "./siteTerrainTiles.ts";
import { evictionPlan, windowLimiter, type CacheFile } from "./siteTiles.ts";
import type { SiteTerrain } from "./siteTypes.ts";

export const TERRAIN_URL_BASE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
/** The credit shown with the ground; the full per-country list the dataset requires is in CREDITS.md. */
export const TERRAIN_ATTRIBUTION = "Terrain: AWS Terrain Tiles by Mapzen (USGS 3DEP and SRTM, Copernicus EU-DEM, national surveys; see CREDITS.md)";
/** Terrain does not change in a human lifetime, but the dataset is occasionally corrected: the satellite photo cache's 90 days. */
export const TERRAIN_TTL_MS = 90 * 24 * 3600_000;
export const TERRAIN_CACHE_CAP_BYTES = 150 * 1024 * 1024;
/** The grid sizes the route will compute: odd (the centre is a node), between a coarse Eco ground and a very dense one. */
export const GRID_MIN = 33;
export const GRID_MAX = 257;
const UPSTREAM_TIMEOUT_MS = 10_000;
const DECODED_KEEP = 16;

/** At most this many tiles are really downloaded per minute for the whole server (a site is 1 to 9 tiles, a cached tile is free). */
const upstreamLimit = windowLimiter(90, 60_000);

type Query = { lat: number; lon: number; radius: number; n: number };

/** The query's numbers, or a sentence saying what is wrong. Place and radius follow the data route's rules; `n` is the grid size per side (odd, GRID_MIN to GRID_MAX). */
export function parseTerrainQuery(params: URLSearchParams): Query | string {
  const q = parseSiteQuery(params);
  if (typeof q === "string") return q;
  const raw = params.get("n") ?? "";
  const n = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < GRID_MIN || n > GRID_MAX || n % 2 === 0) return `n must be an odd whole number from ${GRID_MIN} to ${GRID_MAX}.`;
  return { lat: q.lat, lon: q.lon, radius: q.radius, n };
}

/** A tile that exists in the dataset (zoom inside the levels we use, x and y inside the world), or undefined. Only plain decimal integers pass. */
export function parseTerrainTile(z: unknown, x: unknown, y: unknown): TerrainTileId | undefined {
  if (![z, x, y].every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0)) return undefined;
  const t = { z: z as number, x: x as number, y: y as number };
  return t.z >= TERRAIN_MIN_ZOOM && t.z <= TERRAIN_MAX_ZOOM && t.x < 2 ** t.z && t.y < 2 ** t.z ? t : undefined;
}

/** The upstream URL of a validated tile. */
export const terrainTileUrl = (t: TerrainTileId): string => `${TERRAIN_URL_BASE}/${t.z}/${t.x}/${t.y}.png`;

/** Where a tile lives on disk. */
export const terrainTilePath = (dir: string, t: TerrainTileId): string => join(dir, String(t.z), String(t.x), `${t.y}.png`);

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** The PNG bytes of one tile as the dataset answered them, or null for anything that is not a plain Terrarium picture. */
async function download(t: TerrainTileId, fetchFn: FetchFn): Promise<Uint8Array | null> {
  const res = await fetchFn(terrainTileUrl(t), { headers: { "user-agent": USER_AGENT, accept: "image/png" }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), redirect: "error" });
  if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").toLowerCase().startsWith("image/png")) return null;
  const length = Number(res.headers.get("content-length"));
  if (length > MAX_TILE_PNG_BYTES) return null;
  const bytes = await readCapped(res.body, MAX_TILE_PNG_BYTES, length);
  return bytes && decodeTerrarium(bytes) ? bytes : null; // a damaged answer is never cached
}

type Stored = { path: string; size: number; mtimeMs: number };

async function listFiles(dir: string, depth = 0): Promise<Stored[]> {
  const out: Stored[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, e.name);
    if (e.isDirectory() && depth < 3) out.push(...(await listFiles(path, depth + 1)));
    else if (e.isFile() && e.name.endsWith(".png")) {
      const s = await stat(path).catch(() => null);
      if (s) out.push({ path, size: s.size, mtimeMs: s.mtimeMs });
    }
  }
  return out;
}

/** Atomic write, then the folder is trimmed to the cap, oldest first. A failure is logged and serving goes on without the cache. */
async function store(dir: string, file: string, bytes: Uint8Array, cap: number): Promise<void> {
  try {
    await mkdir(join(file, ".."), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, file);
    const files: CacheFile[] = (await listFiles(dir)).filter((f) => f.path !== file);
    await Promise.all(evictionPlan(files, bytes.length, cap).map((p) => unlink(p).catch(() => {})));
  } catch (e) {
    console.error("site terrain: cache write:", e instanceof Error ? e.message : e);
  }
}

const decoded = new Map<string, { at: number; heights: Float32Array }>();
const inFlight = new Map<string, Promise<Float32Array | undefined>>();

export type TerrainOpts = { fetchFn?: FetchFn; dir: string; now?: number; ttlMs?: number; capBytes?: number };

/** One tile's heights: from memory, else the disk cache (when younger than the TTL), else downloaded; an expired file is the fallback when the download fails. Undefined = no usable tile. */
export async function terrainTile(t: TerrainTileId, opts: TerrainOpts): Promise<Float32Array | undefined> {
  const key = `${opts.dir}|${tileKey(t)}`;
  const now = opts.now ?? Date.now();
  const ttl = opts.ttlMs ?? TERRAIN_TTL_MS;
  const kept = decoded.get(key);
  if (kept && now - kept.at < ttl) return kept.heights;
  const running = inFlight.get(key);
  if (running) return running;
  const job = (async () => {
    const file = terrainTilePath(opts.dir, t);
    const age = await stat(file).then((s) => now - s.mtimeMs, () => Infinity);
    let bytes: Uint8Array | null = age < ttl ? await readFile(file).catch(() => null) : null;
    if (bytes && !decodeTerrarium(bytes)) bytes = null; // a damaged cache file is fetched again
    if (!bytes) {
      if (!upstreamLimit(now)) throw new SiteError(429, "The terrain service is being asked too often. Try again in a minute.");
      try {
        bytes = await download(t, opts.fetchFn ?? fetch);
      } catch (e) {
        console.error("site terrain tile:", e instanceof Error ? e.message : e);
      }
      if (bytes) await store(opts.dir, file, bytes, opts.capBytes ?? TERRAIN_CACHE_CAP_BYTES);
      else if (age !== Infinity) bytes = await readFile(file).catch(() => null); // stale beats nothing
    }
    const heights = bytes ? decodeTerrarium(bytes) : undefined;
    if (heights) {
      decoded.delete(key);
      decoded.set(key, { at: now, heights });
      if (decoded.size > DECODED_KEEP) decoded.delete(decoded.keys().next().value as string);
    }
    return heights;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

export type TerrainAnswer = { terrain: SiteTerrain; zoom: number; tiles: number; attribution: string };

/**
 * The ground around a point from the dataset's tiles. Throws a `SiteError` with a sentence fit to show when no tile could be had or the ground came out
 * too incomplete to trust (the client then keeps the Open-Meteo ground).
 */
export async function terrainFromTiles(q: Query, opts: TerrainOpts): Promise<TerrainAnswer> {
  const center = { lat: q.lat, lon: q.lon };
  const z = terrainZoom(q.lat, (2 * q.radius) / (q.n - 1));
  const ids = tilesCovering(center, q.radius, z);
  if (!ids) throw new SiteError(400, "That area needs too many terrain tiles.");
  const got = await Promise.all(ids.map(async (t) => [tileKey(t), await terrainTile(t, opts)] as const));
  const tiles: TileHeights = new Map(got.flatMap(([k, v]) => (v ? [[k, v] as const] : [])));
  if (tiles.size === 0) throw new SiteError(502, "The terrain service did not answer just now. Try again in a minute.");
  const terrain = sampleTerrainGrid(tiles, center, q.radius, q.n, z);
  if (!terrain) throw new SiteError(502, "The terrain data for this place is incomplete.");
  return { terrain, zoom: z, tiles: tiles.size, attribution: TERRAIN_ATTRIBUTION };
}
