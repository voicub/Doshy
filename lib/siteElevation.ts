// Ground height for the Site: a grid of elevations from Open-Meteo's elevation API (Copernicus 90 m DEM, no key), smoothed into a gentle surface.
// Pure apart from the injected `fetchFn`; the node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { siteToLatLon, type LatLon } from "./geo.ts";
import type { SiteTerrain } from "./siteTypes.ts";

const ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";
export const ELEVATION_ATTRIBUTION = "Elevation: Copernicus DEM via Open-Meteo";
/** The honest caveat: the model has one value per ~90 m, so only broad slopes are real. */
export const TERRAIN_NOTE = "Ground height comes from a 90 m elevation model: hills and slopes are real, small steps, walls and embankments are not.";
export const TERRAIN_FAILED_NOTE = "Ground height was not available, so the ground is drawn flat.";

const BATCH = 100;
const BATCH_DELAY_MS = 150;
const MAX_HALF = 10; // 21 x 21 samples at most
const MIN_HALF = 5;
const MAX_STEP = 60;

/** Samples per side (odd, so the centre is a sample) and the metres between them, for a site of `radius` metres: the grid spans exactly +-radius, n <= 21, step <= ~60 m. */
export function terrainGrid(radius: number): { n: number; step: number } {
  const half = Math.min(MAX_HALF, Math.max(MIN_HALF, Math.ceil(radius / MAX_STEP)));
  return { n: 2 * half + 1, step: radius / half };
}

/** Separable Gaussian blur of an n x n grid (kernel radius 2 cells, edges repeat their last row/column). Keeps flat ground flat and leaves a gentle surface. */
export function smoothGrid(h: readonly number[], n: number, sigma = 0.9): number[] {
  const k = [-2, -1, 0, 1, 2].map((d) => Math.exp(-(d * d) / (2 * sigma * sigma)));
  const sum = k.reduce((a, b) => a + b, 0);
  const w = k.map((v) => v / sum);
  const at = (g: readonly number[], x: number, y: number) => g[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
  const pass = (g: readonly number[], dx: number, dy: number) => g.map((_, i) => w.reduce((acc, wk, d) => acc + wk * at(g, (i % n) + (d - 2) * dx, Math.floor(i / n) + (d - 2) * dy), 0));
  return pass(pass(h, 1, 0), 0, 1);
}

/** Absolute elevations (metres above sea level) of a `terrainGrid(radius)` grid about `center`, row-major from the north-west corner; undefined when the service fails. */
async function fetchGrid(center: LatLon, n: number, step: number, fetchFn: (url: string) => Promise<unknown>): Promise<number[] | undefined> {
  const half = (n - 1) / 2;
  const pts: LatLon[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push(siteToLatLon(center, [(i - half) * step, (j - half) * step]));
  const out: number[] = [];
  for (let from = 0; from < pts.length; from += BATCH) {
    if (from) {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, BATCH_DELAY_MS);
      await promise;
    }
    const part = pts.slice(from, from + BATCH);
    const url = `${ELEVATION_URL}?latitude=${part.map((p) => p.lat.toFixed(5)).join(",")}&longitude=${part.map((p) => p.lon.toFixed(5)).join(",")}`;
    const body = await fetchFn(url);
    const e = body && typeof body === "object" && "elevation" in body ? body.elevation : undefined;
    if (!Array.isArray(e) || e.length !== part.length || !e.every((v) => typeof v === "number" && Number.isFinite(v))) return undefined;
    out.push(...e);
  }
  return out;
}

/**
 * The ground around `center` as a `SiteTerrain` (metres relative to the ground at the centre, smoothed), or undefined with a sentence for the owner when the
 * elevation service cannot be reached. `fetchFn` fetches a URL and answers its parsed JSON (the route adds the timeout); a throw counts as a failure.
 */
export async function sampleTerrain(center: LatLon, radius: number, fetchFn: (url: string) => Promise<unknown>): Promise<{ terrain?: SiteTerrain; note?: string }> {
  const { n, step } = terrainGrid(radius);
  let raw: number[] | undefined;
  try {
    raw = await fetchGrid(center, n, step, fetchFn);
  } catch {
    raw = undefined;
  }
  if (!raw) return { note: TERRAIN_FAILED_NOTE };
  const smooth = smoothGrid(raw, n);
  const base = smooth[((n - 1) / 2) * n + (n - 1) / 2];
  return { terrain: { n, step: Math.round(step * 100) / 100, h: smooth.map((v) => Math.round((v - base) * 100) / 100), base: Math.round(base * 10) / 10 } };
}
