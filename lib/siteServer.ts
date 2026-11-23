// Server side of GET /api/site/data: validating the query, fetching OpenStreetMap + elevation, the disk cache and the rate limit.
// Node only (fs), but free of Next.js so the node test runner can load it: imports carry a .ts extension or are type-only.
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { errorMessage, isRecord } from "./guards.ts";
import { ELEVATION_ATTRIBUTION, TERRAIN_NOTE, sampleTerrain } from "./siteElevation.ts";
import { OSM_ATTRIBUTION, overpassQuery, parseOverpass } from "./siteOsm.ts";
import { windowLimiter } from "./siteTiles.ts";
import { SITE_RADIUS, isSiteData, type SiteData } from "./siteTypes.ts";

export const USER_AGENT = "doshy/1.0 (+https://github.com/voicub/Doshy; personal home dashboard)";
export const OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const OVERPASS_TIMEOUT_MS = 60_000;
const ELEVATION_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1500;
export const CACHE_TTL_MS = 30 * 24 * 3600_000;
/** A reply with a missing part (OpenStreetMap or the elevation service did not answer) is kept briefly, so a flaky minute does not stick for a month. */
export const PARTIAL_TTL_MS = 10 * 60_000;
const MAX_CACHE_FILES = 200;
const RADIUS_BUCKET = 50;

/** At most this many requests that reach the third parties per minute, for the whole server. Cached answers are free. */
const upstreamLimit = windowLimiter(4, 60_000);

type SiteQuery = { lat: number; lon: number; radius: number; fresh: boolean };
export class SiteError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const DECIMAL = /^-?\d{1,3}(?:\.\d{1,15})?$/;

/** The query's numbers, or a sentence saying what is wrong. Only plain decimals pass: nothing else ever reaches an upstream URL. */
export function parseSiteQuery(params: URLSearchParams): SiteQuery | string {
  const lat = params.get("lat");
  const lon = params.get("lon");
  const radius = params.get("radius");
  if (lat === null || lon === null || !DECIMAL.test(lat) || !DECIMAL.test(lon) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return "Give a latitude (-90 to 90) and a longitude (-180 to 180) as plain numbers.";
  if (radius === null || !/^\d{2,3}(?:\.\d{1,3})?$/.test(radius) || Number(radius) < SITE_RADIUS.min || Number(radius) > SITE_RADIUS.max) return `The radius must be a number from ${SITE_RADIUS.min} to ${SITE_RADIUS.max} metres.`;
  return { lat: Number(lat), lon: Number(lon), radius: Number(radius), fresh: params.get("fresh") === "1" };
}

/** Same place and about the same size share one answer: coordinates to 5 decimals (about a metre), radius rounded up to a 50 m step. */
export function siteKey(q: Pick<SiteQuery, "lat" | "lon" | "radius">): { key: string; lat: number; lon: number; radius: number } {
  const lat = Number(q.lat.toFixed(5));
  const lon = Number(q.lon.toFixed(5));
  const radius = Math.min(SITE_RADIUS.max, Math.ceil(q.radius / RADIUS_BUCKET) * RADIUS_BUCKET);
  return { key: `${lat.toFixed(5)}_${lon.toFixed(5)}_r${radius}`, lat, lon, radius };
}

// ---- cache --------------------------------------------------------------------------------------------------------------------------

const cacheDir = () => resolve(process.env.HOUSEY_SITE_CACHE || join("data", "site-cache"), "data");
type Entry = { complete: boolean; data: SiteData };
const fileOf = (dir: string, key: string) => join(dir, `${key}.json`);

/** The cached answer, or undefined when there is none, it expired, or the file is not ours. */
export async function readCache(key: string, now = Date.now(), dir = cacheDir()): Promise<SiteData | undefined> {
  try {
    const e: unknown = JSON.parse(await readFile(fileOf(dir, key), "utf8"));
    if (!isRecord(e) || !("complete" in e) || !isSiteData(e.data) || typeof e.data.fetchedAt !== "number") return undefined;
    const data = e.data;
    const complete = e.complete;
    return now - data.fetchedAt < (complete ? CACHE_TTL_MS : PARTIAL_TTL_MS) ? data : undefined;
  } catch {
    return undefined;
  }
}

/** Writes the answer (atomically) and keeps the folder to the newest MAX_CACHE_FILES files. */
export async function writeCache(key: string, entry: Entry, dir = cacheDir()): Promise<void> {
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${key}.${process.pid}.tmp`);
  await writeFile(tmp, JSON.stringify(entry));
  await rename(tmp, fileOf(dir, key));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  if (files.length <= MAX_CACHE_FILES) return;
  const aged = await Promise.all(files.map(async (f) => ({ f, t: (await stat(join(dir, f)).catch(() => null))?.mtimeMs ?? 0 })));
  for (const { f } of aged.sort((a, b) => a.t - b.t).slice(0, files.length - MAX_CACHE_FILES)) await unlink(join(dir, f)).catch(() => {});
}

// ---- upstream -----------------------------------------------------------------------------------------------------------------------

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
const sleep = (ms: number) => {
  const { promise, resolve: done } = Promise.withResolvers<void>();
  setTimeout(done, ms);
  return promise;
};

/** The Overpass answer, trying the main server, then the mirror, then the main server once more. Undefined when none of them gave usable JSON. */
export async function fetchOverpass(query: string, fetchFn: FetchFn = fetch, retryDelayMs = RETRY_DELAY_MS): Promise<unknown> {
  for (const [i, url] of [OVERPASS_URLS[0], OVERPASS_URLS[1], OVERPASS_URLS[0]].entries()) {
    if (i) await sleep(retryDelayMs);
    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "user-agent": USER_AGENT, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
        redirect: "error",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      // Overpass answers 200 with a "remark" when it ran out of time or memory halfway: that list is incomplete, so try the next server.
      if (!json || typeof json !== "object" || !("elements" in json) || !Array.isArray(json.elements)) throw new Error("no elements");
      if ("remark" in json && typeof json.remark === "string" && /runtime error|timed out|out of memory/i.test(json.remark)) throw new Error("incomplete answer");
      return json;
    } catch (e) {
      console.error(`site data: overpass ${new URL(url).host}:`, errorMessage(e));
    }
  }
  return undefined;
}

/** One elevation request, retried once after a pause (the free service sometimes answers 429 to a burst). */
function elevationFetcher(fetchFn: FetchFn = fetch, retryDelayMs = RETRY_DELAY_MS): (url: string) => Promise<unknown> {
  return async (url) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetchFn(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(ELEVATION_TIMEOUT_MS), redirect: "error" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        console.error("site data: elevation:", errorMessage(e));
        if (attempt) throw e;
        await sleep(retryDelayMs);
      }
    }
  };
}

const OSM_FAILED_NOTE = "Buildings, roads and trees could not be loaded from OpenStreetMap just now, so none are drawn. Try again in a few minutes.";

/** Asks both services at once and puts the answer together. Throws a `SiteError` only when neither answered. */
export async function buildSiteData(lat: number, lon: number, radius: number, fetchFn: FetchFn = fetch, now = Date.now(), retryDelayMs = RETRY_DELAY_MS): Promise<{ data: SiteData; complete: boolean }> {
  const [osm, ground] = await Promise.all([fetchOverpass(overpassQuery(lat, lon, radius), fetchFn, retryDelayMs), sampleTerrain({ lat, lon }, radius, elevationFetcher(fetchFn, retryDelayMs))]);
  if (osm === undefined && !ground.terrain) throw new SiteError(502, "The map services did not answer just now. Try again in a minute.");
  const parsed = osm === undefined ? { buildings: [], trees: [], areas: [], roads: [], notes: [OSM_FAILED_NOTE] } : parseOverpass(osm, { lat, lon }, radius);
  const notes = [...parsed.notes];
  if (ground.terrain) notes.push(TERRAIN_NOTE);
  else if (ground.note) notes.push(ground.note);
  const attribution = [...(osm === undefined ? [] : [OSM_ATTRIBUTION]), ...(ground.terrain ? [ELEVATION_ATTRIBUTION] : [])];
  const data: SiteData = { version: 1, center: { lat, lon }, radius, fetchedAt: now, buildings: parsed.buildings, trees: parsed.trees, areas: parsed.areas, roads: parsed.roads, ...(ground.terrain ? { terrain: ground.terrain } : {}), attribution, notes };
  return { data, complete: osm !== undefined && !!ground.terrain };
}

const inFlight = new Map<string, Promise<SiteData>>();

/**
 * The site's data: from the cache when fresh enough, else fetched (at most `upstreamLimit` times a minute; several callers asking for the same place share one fetch).
 * `fresh` skips the cache. Throws a `SiteError` with a sentence fit to show.
 */
export async function siteData(q: SiteQuery, opts: { fetchFn?: FetchFn; dir?: string; now?: number; retryDelayMs?: number } = {}): Promise<SiteData> {
  const { key, lat, lon, radius } = siteKey(q);
  const dir = opts.dir ?? cacheDir();
  const now = opts.now ?? Date.now();
  if (!q.fresh) {
    const hit = await readCache(key, now, dir);
    if (hit) return hit;
  }
  const running = inFlight.get(key);
  if (running) return running;
  if (!upstreamLimit(now)) throw new SiteError(429, "The map services are being asked too often. Try again in a minute.");
  const job = buildSiteData(lat, lon, radius, opts.fetchFn, now, opts.retryDelayMs)
    .then(async ({ data, complete }) => {
      await writeCache(key, { complete, data }, dir).catch((e: Error) => console.error("site data: cache write:", e.message));
      return data;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}
