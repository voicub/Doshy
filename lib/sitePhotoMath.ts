// The numbers behind the satellite photo: which tiles cover the site, how big the picture is, and a small concurrency helper. Pure: `node --test` runs it.
import { siteToLatLon, tileBoundsSite, tileOf } from "./geo.ts";
import type { LatLon } from "./geo.ts";

export const TILE_PX = 256;
/** At most this many tiles across: 6 x 6 tiles is a 1536 px picture, about 36 requests. Wider sites use a coarser zoom. */
export const MAX_TILES_PER_SIDE = 6;

type TilePlan = {
  z: number;
  /** The north-west tile. */
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  /** The covered rectangle in site metres (y south): at least the radius square on every side. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  metresPerPixel: number;
};

/** The deepest zoom <= maxZoom whose tiles covering the square of `radius` metres about `center` fit MAX_TILES_PER_SIDE across. */
export function planTiles(center: LatLon, radius: number, maxZoom: number): TilePlan {
  const nw = siteToLatLon(center, [-radius, -radius]);
  const se = siteToLatLon(center, [radius, radius]);
  for (let z = Math.max(0, Math.floor(maxZoom)); ; z--) {
    const a = tileOf(nw.lat, nw.lon, z);
    const b = tileOf(se.lat, se.lon, z);
    const cols = b.x - a.x + 1;
    const rows = b.y - a.y + 1;
    if (z > 0 && (cols > MAX_TILES_PER_SIDE || rows > MAX_TILES_PER_SIDE)) continue;
    const t0 = tileBoundsSite(center, z, a.x, a.y);
    const t1 = tileBoundsSite(center, z, b.x, b.y);
    const bounds = { x0: t0.x0, y0: t0.y0, x1: t1.x1, y1: t1.y1 };
    return { z, x0: a.x, y0: a.y, cols, rows, bounds, metresPerPixel: (bounds.x1 - bounds.x0) / (cols * TILE_PX) };
  }
}

/** The smallest power of two >= n, but never above `max` (a power of two itself). */
export function pow2Size(n: number, max = 2048): number {
  let p = 1;
  while (p < n && p < max) p *= 2;
  return p;
}

/** `fn` over `items` with at most `limit` running at once; results in item order. Stops starting new work once `signal` aborts (and then rejects with its reason). */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      signal?.throwIfAborted();
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
