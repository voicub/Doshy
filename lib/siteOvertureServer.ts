// Server side of GET /api/site/overture: finds the current Overture Maps release (STAC catalogue), reads the z14 building vector tiles out of Overture's
// PMTiles archive with HTTP range requests (a few hundred KB per tile out of 180 GB), keeps each tile on disk, and maps the buildings of a site.
// Node only (fs, zlib), but free of Next.js so the node test runner can load it: imports carry a .ts extension or are type-only.
// SSRF: only three fixed hosts are ever contacted; URLs come from the catalogue only after the host, path shape and release name were checked.
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { decodeMvt } from "./mvt.ts";
import { HEADER_BYTES, inflateTile, locateTile, parseHeader, readRootDirectory, type DirEntry, type PmHeader, type RangeFn } from "./pmtiles.ts";
import { readCapped } from "./server/readCapped.ts";
import { SiteError, USER_AGENT, parseSiteQuery } from "./siteServer.ts";
import { assembleBuildings, buildingsOfTile, overtureTiles, type TileBuildings, type TileId } from "./siteOverture.ts";
import { evictionPlan, windowLimiter, type CacheFile } from "./siteTiles.ts";
import type { SiteBuilding } from "./siteTypes.ts";

export const STAC_ROOT = "https://stac.overturemaps.org/catalog.json";
const STAC_HOST = "stac.overturemaps.org";
/** The hosts Overture publishes its PMTiles on (the STAC link names the first; the second is the same bucket under its S3 name). */
export const PMTILES_HOSTS = ["tiles.overturemaps.org", "overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com"];
export const OVERTURE_ATTRIBUTION = "Buildings: Overture Maps Foundation (\u00a9 OpenStreetMap contributors, Esri Community Maps, Microsoft, Google and others; see CREDITS.md)";

/** The release names look like 2026-11-18.0; anything else never reaches a URL. */
export const RELEASE_RE = /^\d{4}-\d{2}-\d{2}\.\d{1,2}$/;
/** How long the discovered release is trusted. Overture releases monthly; a day keeps new data within a day of release. */
export const RELEASE_TTL_MS = 24 * 3600_000;
/** Tiles of one release stay a month; a new release has new file names anyway. */
export const OVERTURE_TTL_MS = 30 * 24 * 3600_000;
export const OVERTURE_CACHE_CAP_BYTES = 150 * 1024 * 1024;
const STAC_BYTES = 256 * 1024;
const MAX_STORED_TILE = 4 * 1024 * 1024;
const MAX_TILE_BYTES = 24 * 1024 * 1024;
const MAX_RANGE_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

/** At most this many requests that really reach Overture per minute for the whole server (a cold tile is about 4; cached ones are free). */
const upstreamLimit = windowLimiter(120, 60_000);

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
export class OvertureError extends SiteError {}

const get = (fetchFn: FetchFn, url: string, headers: Record<string, string> = {}) =>
  fetchFn(url, { headers: { "user-agent": USER_AGENT, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });

async function json(fetchFn: FetchFn, url: string): Promise<unknown> {
  const res = await get(fetchFn, url, { accept: "application/json" });
  if (!res.ok || !res.body) throw new OvertureError(502, "Overture Maps did not answer.");
  const bytes = await readCapped(res.body, STAC_BYTES);
  if (!bytes) throw new OvertureError(502, "Overture Maps answered with something too large.");
  return JSON.parse(new TextDecoder().decode(bytes));
}

const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** `<host>/<release>/buildings.pmtiles` on an allowed host, https, nothing else in it; undefined for any other link. */
export function checkedArchiveUrl(href: unknown, release: string): string | undefined {
  if (typeof href !== "string") return undefined;
  try {
    const u = new URL(href);
    const ok = u.protocol === "https:" && PMTILES_HOSTS.includes(u.hostname) && !u.port && !u.username && !u.password && !u.search && !u.hash;
    return ok && (u.pathname === `/${release}/buildings.pmtiles` || u.pathname === `/tiles/${release}/buildings.pmtiles`) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export type Release = { release: string; url: string };

/** The latest release and where its buildings archive is: the STAC root names the release, the release's buildings catalogue links the archive. */
export async function discoverRelease(fetchFn: FetchFn): Promise<Release> {
  const root = rec(await json(fetchFn, STAC_ROOT));
  const release = root?.latest;
  if (typeof release !== "string" || !RELEASE_RE.test(release)) throw new OvertureError(502, "Overture Maps did not name a current release.");
  const theme = rec(await json(fetchFn, `https://${STAC_HOST}/${release}/buildings/catalog.json`));
  const links = Array.isArray(theme?.links) ? theme.links : [];
  for (const l of links) {
    const link = rec(l);
    const url = link?.rel === "pmtiles" ? checkedArchiveUrl(link.href, release) : undefined;
    if (url) return { release, url };
  }
  throw new OvertureError(502, "Overture Maps did not link its building tiles.");
}

/** Reads a byte range of the archive; refuses anything that is not a real 206 of the size asked for, and never keeps more than `length` bytes. */
export function rangeReader(url: string, fetchFn: FetchFn): RangeFn {
  return async (offset, length) => {
    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length <= 0 || length > MAX_RANGE_BYTES) throw new OvertureError(502, "Overture Maps data is damaged.");
    if (!upstreamLimit()) throw new OvertureError(429, "Overture Maps is being asked too often. Try again in a minute.");
    const res = await get(fetchFn, url, { range: `bytes=${offset}-${offset + length - 1}` });
    if (res.status !== 206 || !res.body) throw new OvertureError(502, "Overture Maps did not answer.");
    const bytes = await readCapped(res.body, length, length);
    if (!bytes || bytes.length !== length) throw new OvertureError(502, "Overture Maps answered with the wrong amount of data.");
    return bytes;
  };
}

// ---- disk cache ---------------------------------------------------------------------------------------------------------------------

type Stored = { path: string; size: number; mtimeMs: number };

async function listFiles(dir: string, depth = 0): Promise<Stored[]> {
  const out: Stored[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, e.name);
    if (e.isDirectory() && depth < 4) out.push(...(await listFiles(path, depth + 1)));
    else if (e.isFile() && e.name.endsWith(".gz")) {
      const s = await stat(path).catch(() => null);
      if (s) out.push({ path, size: s.size, mtimeMs: s.mtimeMs });
    }
  }
  return out;
}

async function writeAtomic(file: string, bytes: Uint8Array): Promise<void> {
  await mkdir(join(file, ".."), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, file);
}

export const tileFile = (dir: string, release: string, t: TileId): string => join(dir, release, String(t.z), String(t.x), `${t.y}.mvt.gz`);

const latestFile = (dir: string) => join(dir, "latest.json");

async function storeTile(dir: string, file: string, bytes: Uint8Array, cap: number): Promise<void> {
  try {
    await writeAtomic(file, bytes);
    const files: CacheFile[] = (await listFiles(dir)).filter((f) => f.path !== file);
    await Promise.all(evictionPlan(files, bytes.length, cap).map((p) => unlink(p).catch(() => {})));
  } catch (e) {
    console.error("site overture: cache write:", e instanceof Error ? e.message : e);
  }
}

// ---- the archive ----------------------------------------------------------------------------------------------------------------------

export type OvertureOpts = { fetchFn?: FetchFn; dir: string; now?: number; capBytes?: number };

type Archive = { release: Release; header: PmHeader; root: DirEntry[]; leaves: Map<number, DirEntry[]> };
let known: { at: number; release: Release } | undefined;
const archives = new Map<string, Promise<Archive>>();

/** The release to read: remembered for RELEASE_TTL_MS (in memory, and on disk across restarts); when the catalogue cannot be reached the last known one is used. */
export async function currentRelease(opts: OvertureOpts): Promise<Release> {
  const now = opts.now ?? Date.now();
  if (known && now - known.at < RELEASE_TTL_MS) return known.release;
  const onDisk = await readFile(latestFile(opts.dir), "utf8").then((s) => rec(JSON.parse(s)), () => undefined);
  const saved = onDisk && typeof onDisk.at === "number" && typeof onDisk.release === "string" && RELEASE_RE.test(onDisk.release) ? checkedArchiveUrl(onDisk.url, onDisk.release) : undefined;
  const remembered = saved && onDisk ? { at: onDisk.at as number, release: { release: onDisk.release as string, url: saved } } : undefined;
  if (remembered && now - remembered.at < RELEASE_TTL_MS) {
    known = remembered;
    return remembered.release;
  }
  try {
    if (!upstreamLimit()) throw new OvertureError(429, "Overture Maps is being asked too often. Try again in a minute.");
    const release = await discoverRelease(opts.fetchFn ?? fetch);
    known = { at: now, release };
    await writeAtomic(latestFile(opts.dir), new TextEncoder().encode(JSON.stringify({ at: now, ...release }))).catch(() => {});
    return release;
  } catch (e) {
    if (remembered) return remembered.release; // stale beats nothing: its cached tiles still work, and the archive may still be there
    throw e instanceof SiteError ? e : new OvertureError(502, "Overture Maps could not be reached.");
  }
}

function archiveOf(release: Release, range: RangeFn): Promise<Archive> {
  const key = release.release;
  let job = archives.get(key);
  if (!job) {
    job = (async () => {
      const header = parseHeader(await range(0, HEADER_BYTES));
      if (header.tileType !== 1 || header.maxZoom < 14) throw new OvertureError(502, "Overture Maps changed its tile format.");
      return { release, header, root: await readRootDirectory(range, header), leaves: new Map<number, DirEntry[]>() };
    })();
    archives.set(key, job);
    job.catch(() => archives.delete(key)); // a failure is not remembered
    if (archives.size > 3) archives.delete(archives.keys().next().value as string);
  }
  return job;
}

/**
 * One tile's decompressed bytes: from the disk cache (a young file), else out of the archive with range requests and stored (gzip) for next time. An empty
 * result (`new Uint8Array()`) means the archive has no tile there (no buildings): it is remembered too. Throws a `SiteError` when the archive could not be read.
 */
export async function overtureTile(t: TileId, opts: OvertureOpts, current?: Release): Promise<Uint8Array> {
  const now = opts.now ?? Date.now();
  const release = current ?? (await currentRelease(opts));
  const file = tileFile(opts.dir, release.release, t);
  const age = await stat(file).then((s) => now - s.mtimeMs, () => Infinity);
  if (age < OVERTURE_TTL_MS) {
    const stored = await readFile(file).catch(() => null);
    if (stored) {
      if (stored.length === 0) return new Uint8Array();
      try {
        return gunzipSync(stored, { maxOutputLength: MAX_TILE_BYTES });
      } catch {
        /* a damaged cache file: read again below */
      }
    }
  }
  const range = rangeReader(release.url, opts.fetchFn ?? fetch);
  const archive = await archiveOf(release, range);
  const at = await locateTile(range, archive.header, archive.root, t.z, t.x, t.y, { directoryCache: archive.leaves });
  if (!at) {
    await storeTile(opts.dir, file, new Uint8Array(), opts.capBytes ?? OVERTURE_CACHE_CAP_BYTES);
    return new Uint8Array();
  }
  if (at.length > MAX_STORED_TILE) throw new OvertureError(502, "An Overture Maps tile is unexpectedly large.");
  const tile = inflateTile(await range(at.offset, at.length), archive.header, MAX_TILE_BYTES);
  await storeTile(opts.dir, file, gzipSync(tile), opts.capBytes ?? OVERTURE_CACHE_CAP_BYTES);
  return tile;
}

export type OvertureAnswer = { release: string; buildings: SiteBuilding[]; tiles: number; /** tiles that could not be read (their buildings are missing) */ failed: number; withHeight: number; attribution: string };

/**
 * The buildings of a site from Overture's current release. Throws a `SiteError` with a sentence fit to show when no tile could be read (the client then keeps
 * the OpenStreetMap buildings and says so); a tile that failed while others worked is skipped and counted in `failed`.
 */
export async function overtureBuildings(q: { lat: number; lon: number; radius: number }, opts: OvertureOpts): Promise<OvertureAnswer> {
  const center = { lat: q.lat, lon: q.lon };
  const ids = overtureTiles(center, q.radius);
  if (!ids) throw new SiteError(400, "That area needs too many building tiles.");
  const release = await currentRelease(opts);
  const settled = await Promise.allSettled(
    ids.map(async (t): Promise<TileBuildings> => {
      const bytes = await overtureTile(t, opts, release);
      return bytes.length === 0 ? { entries: [], parts: new Map() } : buildingsOfTile(decodeMvt(bytes, ["building", "building_part"]), t, center);
    }),
  );
  const ok = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  if (ok.length === 0) {
    const first = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
    throw first?.reason instanceof SiteError ? first.reason : new OvertureError(502, "Overture Maps could not be read just now.");
  }
  const buildings = assembleBuildings(ok, q.radius);
  return { release: release.release, buildings, tiles: ok.length, failed: ids.length - ok.length, withHeight: buildings.filter((b) => b.real).length, attribution: OVERTURE_ATTRIBUTION };
}

/** The query: place and radius under the data route's rules. */
export const parseOvertureQuery = (params: URLSearchParams): { lat: number; lon: number; radius: number } | string => {
  const q = parseSiteQuery(params);
  return typeof q === "string" ? q : { lat: q.lat, lon: q.lon, radius: q.radius };
};

/** Test seam: forget the remembered release and archives. */
export function resetOvertureMemory(): void {
  known = undefined;
  archives.clear();
}
