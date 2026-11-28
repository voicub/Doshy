// AWS Terrain Tiles (Mapzen "Terrarium", see docs/site-data.md) as the Surroundings' ground height: which tiles cover a site, and how their 256 x 256
// height pictures are resampled (bilinear, across tile seams) into the `SiteTerrain` grid the scene already draws. Pure; the server fetches and decodes.
// The node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { siteToLatLon, type LatLon } from "./geo.ts";
import { TILE_PX } from "./pngTerrarium.ts";
import type { SiteTerrain } from "./siteTypes.ts";

/** The deepest zoom the dataset has (about 3 m a pixel at mid latitudes); a request for more is a 404 upstream. */
export const TERRAIN_MAX_ZOOM = 15;
/** Below this a pixel is more than 40 m wide at mid latitudes: the Open-Meteo grid is as good, so the tiles are not worth it. */
export const TERRAIN_MIN_ZOOM = 11;
/** A 600 m radius at the deepest zoom touches 3 x 3 tiles (+ a pixel of margin); the cap keeps a wrong number from fanning out into a download. */
export const MAX_TILES = 16;
const EQUATOR_M_PER_PX_Z0 = 156543.03392804097;

export type TerrainTileId = { z: number; x: number; y: number };

/** Metres per pixel of a 256-pixel Web Mercator tile at `lat` and zoom `z`. */
export const metresPerPixel = (lat: number, z: number): number => (EQUATOR_M_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/** The zoom whose pixel is closest to the grid's spacing (so the grid is dense enough without sampling noise), kept inside the dataset's levels. `spacing` = metres between grid nodes. */
export function terrainZoom(lat: number, spacing: number): number {
  const ideal = Math.log2((EQUATOR_M_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180)) / spacing);
  return Math.min(TERRAIN_MAX_ZOOM, Math.max(TERRAIN_MIN_ZOOM, Math.round(ideal)));
}

/** Pixel position on the whole world's raster at zoom `z` (x east, y south), fractional. */
export function worldPixel(lat: number, lon: number, z: number): [number, number] {
  const world = TILE_PX * 2 ** z;
  const la = (Math.min(85.0511287798, Math.max(-85.0511287798, lat)) * Math.PI) / 180;
  return [((lon + 180) / 360) * world, ((1 - Math.asinh(Math.tan(la)) / Math.PI) / 2) * world];
}

/** The tiles that hold every height a grid of `radius` metres about `center` can need (a pixel of margin for the bilinear taps), or undefined when that is too many. */
export function tilesCovering(center: LatLon, radius: number, z: number): TerrainTileId[] | undefined {
  const a = siteToLatLon(center, [-radius, -radius]);
  const b = siteToLatLon(center, [radius, radius]);
  const [x0, y0] = worldPixel(a.lat, a.lon, z);
  const [x1, y1] = worldPixel(b.lat, b.lon, z);
  const last = 2 ** z - 1;
  const clamp = (v: number) => Math.min(last, Math.max(0, v));
  const tx0 = clamp(Math.floor((Math.min(x0, x1) - 1) / TILE_PX));
  const tx1 = clamp(Math.floor((Math.max(x0, x1) + 1) / TILE_PX));
  const ty0 = clamp(Math.floor((Math.min(y0, y1) - 1) / TILE_PX));
  const ty1 = clamp(Math.floor((Math.max(y0, y1) + 1) / TILE_PX));
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > MAX_TILES) return undefined;
  const out: TerrainTileId[] = [];
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) out.push({ z, x, y });
  return out;
}

/** Decoded tiles by `${z}/${x}/${y}`; a tile that is missing or failed is simply absent (its pixels read as no data). */
export type TileHeights = ReadonlyMap<string, Float32Array>;
export const tileKey = (t: TerrainTileId): string => `${t.z}/${t.x}/${t.y}`;

/** Bilinear height at a fractional world pixel (pixel centres at +0.5), reading across tile seams. A tap with no data is left out and the rest reweighted; NaN when all four are missing. */
export function heightAt(tiles: TileHeights, z: number, px: number, py: number): number {
  const u = px - 0.5;
  const v = py - 0.5;
  const ix = Math.floor(u);
  const iy = Math.floor(v);
  const fx = u - ix;
  const fy = v - iy;
  const world = TILE_PX * 2 ** z;
  let sum = 0;
  let weight = 0;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const gx = Math.min(world - 1, Math.max(0, ix + dx));
      const gy = Math.min(world - 1, Math.max(0, iy + dy));
      const tile = tiles.get(`${z}/${Math.floor(gx / TILE_PX)}/${Math.floor(gy / TILE_PX)}`);
      const h = tile ? tile[(gy % TILE_PX) * TILE_PX + (gx % TILE_PX)] : NaN;
      if (!Number.isFinite(h)) continue;
      const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      sum += h * w;
      weight += w;
    }
  }
  return weight > 1e-9 ? sum / weight : NaN;
}

/** Fills the NaN holes of an n x n grid from their nearest finite neighbours (a few sweeps of the four-neighbour average); false when nothing is finite. */
function fillHoles(h: Float32Array, n: number): boolean {
  if (!h.some(Number.isFinite)) return false;
  for (let guard = 0; guard < n * 2 && h.some(Number.isNaN); guard++) {
    const next = Float32Array.from(h);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(h[j * n + i])) continue;
        let s = 0;
        let c = 0;
        for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
          const v = a >= 0 && b >= 0 && a < n && b < n ? h[b * n + a] : NaN;
          if (Number.isFinite(v)) {
            s += v;
            c++;
          }
        }
        if (c) next[j * n + i] = s / c;
      }
    }
    h.set(next);
  }
  return true;
}

/** The most grid nodes with no data (before filling) that still count as a usable ground: a coastline cut, not a missing tile. */
const MAX_HOLE_SHARE = 0.3;

/**
 * Resamples the tiles into a `SiteTerrain`: `n` x `n` nodes (odd, so the centre is a node) spanning exactly +-`radius` about `center`, metres relative to the
 * ground at the centre (so the centre is exactly 0 and the plan's own ground meets it without a step), `base` = that centre's height above sea level.
 * Undefined when the centre has no data or more than 30 % of the nodes have none (a tile failed): the caller then falls back to the other ground source.
 */
export function sampleTerrainGrid(tiles: TileHeights, center: LatLon, radius: number, n: number, z: number): SiteTerrain | undefined {
  const half = (n - 1) / 2;
  const step = radius / half;
  const h = new Float32Array(n * n);
  let holes = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const p = siteToLatLon(center, [(i - half) * step, (j - half) * step]);
      const [px, py] = worldPixel(p.lat, p.lon, z);
      const v = heightAt(tiles, z, px, py);
      if (Number.isNaN(v)) holes++;
      h[j * n + i] = v;
    }
  }
  if (!Number.isFinite(h[half * n + half]) || holes > n * n * MAX_HOLE_SHARE || !fillHoles(h, n)) return undefined;
  const base = h[half * n + half];
  return { n, step: Math.round(step * 100) / 100, h: Array.from(h, (v) => Math.round((v - base) * 100) / 100), base: Math.round(base * 10) / 10, src: "aws" };
}
