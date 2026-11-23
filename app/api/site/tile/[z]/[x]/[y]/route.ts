import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { refuse } from "@/lib/db/http";
import { errorMessage } from "@/lib/guards";
import { readCapped } from "@/lib/server/readCapped";
import { CACHE_CAP_BYTES, MAX_TILE_BYTES, evictionPlan, parseTile, sniffImage, tileProvider, tileUrl, windowLimiter, type CacheFile, type TileId, type TileProvider } from "@/lib/siteTiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_DIR = join(process.cwd(), "data", "site-tiles");
const USER_AGENT = "doshy/1.0 (+https://github.com/voicub/Doshy; self-hosted home dashboard; satellite backdrop)";
const UPSTREAM_TIMEOUT_MS = 10_000;
// A scene load is ~10-40 tiles: any request is cheap when cached, so the cap on requests is wide; the cap on upstream fetches protects the provider.
const anyRequest = windowLimiter(600, 60_000);
const upstreamFetch = windowLimiter(150, 60_000);
const inFlight = new Map<string, Promise<Uint8Array | null>>();
let cacheBytes: number | undefined;

const fail = (status: number, error: string, extra?: Record<string, string>) => Response.json({ error }, { status, headers: { "cache-control": "no-store", ...extra } });

async function listCache(dir = CACHE_DIR): Promise<CacheFile[]> {
  const out: CacheFile[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listCache(path)));
    else if (e.isFile()) {
      const s = await stat(path).catch(() => null);
      if (s) out.push({ path, size: s.size, mtimeMs: s.mtimeMs });
    }
  }
  return out;
}

/** Keep the folder under the cap: oldest files go first. The running total is counted once per server start, then kept by hand. */
async function makeRoom(incoming: number): Promise<void> {
  if (cacheBytes !== undefined && cacheBytes + incoming <= CACHE_CAP_BYTES) return;
  const files = await listCache();
  const doomed = new Set(evictionPlan(files, incoming));
  await Promise.all([...doomed].map((p) => unlink(p).catch(() => {})));
  cacheBytes = files.reduce((n, f) => (doomed.has(f.path) ? n : n + f.size), 0);
}

/** The picture at most MAX_TILE_BYTES long, or null for anything the provider answered wrongly. */
async function download(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "image/*" }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), redirect: "error" });
  if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").toLowerCase().startsWith("image/")) return null;
  const length = Number(res.headers.get("content-length"));
  if (length > MAX_TILE_BYTES) return null;
  const bytes = await readCapped(res.body, MAX_TILE_BYTES, length);
  return bytes && sniffImage(bytes) ? bytes : null;
}

async function fetchAndStore(p: TileProvider, t: TileId, file: string): Promise<Uint8Array | null> {
  const bytes = await download(tileUrl(p, t));
  if (!bytes) return null;
  try {
    await makeRoom(bytes.length);
    await mkdir(join(file, ".."), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, file);
    cacheBytes = (cacheBytes ?? 0) + bytes.length;
  } catch (e) {
    console.error("site tile cache:", errorMessage(e)); // serving still works without the cache
  }
  return bytes;
}

/** One satellite tile for the Site feature: `GET /api/site/tile/{z}/{x}/{y}` answers the picture. Only integers from the path reach the provider's URL (set by SITE_TILE_URL); pictures are cached on disk. */
export async function GET(req: Request, ctx: { params: Promise<{ z: string; x: string; y: string }> }) {
  const refused = refuse(req);
  if (refused) return refused;
  if (!anyRequest()) return fail(429, "Too many pictures asked for at once. Try again in a moment.");
  const p = tileProvider({ SITE_TILE_URL: process.env.SITE_TILE_URL, SITE_TILE_MAX_ZOOM: process.env.SITE_TILE_MAX_ZOOM, SITE_TILE_CREDIT: process.env.SITE_TILE_CREDIT });
  const { z, x, y } = await ctx.params;
  const t = parseTile(z, x, y, p.maxZoom);
  if (!t) return fail(/^\d+$/.test(z) && Number(z) > p.maxZoom ? 404 : 400, "That map tile does not exist.", { "x-tile-max-zoom": String(p.maxZoom) });
  const file = join(CACHE_DIR, p.key, String(t.z), String(t.x), `${t.y}.jpg`);
  let bytes: Uint8Array | null = await readFile(file).catch(() => null);
  if (bytes && !sniffImage(bytes)) bytes = null; // a damaged cache file is fetched again
  if (!bytes) {
    if (!upstreamFetch()) return fail(429, "Too many pictures asked for at once. Try again in a moment.");
    const key = `${p.key}/${t.z}/${t.x}/${t.y}`;
    let job = inFlight.get(key);
    if (!job) {
      job = fetchAndStore(p, t, file)
        .catch((e: unknown) => {
          console.error("site tile:", errorMessage(e));
          return null;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, job);
    }
    bytes = await job;
  }
  const type = bytes && sniffImage(bytes);
  if (!bytes || !type) return fail(502, "The satellite picture service did not answer. Try again later.");
  return new Response(Buffer.from(bytes), {
    headers: { "content-type": type, "cache-control": "public, max-age=604800", "x-content-type-options": "nosniff", "x-tile-credit": p.credit, "x-tile-max-zoom": String(p.maxZoom) },
  });
}
