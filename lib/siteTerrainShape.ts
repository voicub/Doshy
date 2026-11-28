// What the browser does with the ground height the server resampled (lib/siteTerrainServer.ts): how big a grid each graphics tier asks for, the owner's
// smoothing and vertical exaggeration, and how finely the ground mesh is cut. Pure and free of Node APIs: the node test runner loads this file directly.
import { clamp } from "./mathUtil.ts";
import type { Tier } from "./quality.ts";
import type { SiteTerrain } from "./siteTypes.ts";

/**
 * Grid nodes per side asked of the server, by tier. Eco 65 x 65 = 4 225 height values and a ground mesh no finer than before (a Raspberry Pi is not slowed down);
 * Detailed 161 x 161 is 3.1 m between points at a 250 m radius, Ultra 193 x 193 is 2.6 m. All odd, so the home is a node.
 */
export const TERRAIN_GRID: Record<Tier, number> = { eco: 65, low: 97, medium: 129, high: 161, ultra: 193 };

/** The ground mesh is never cut finer than this (the dataset's own pixel is about 3 m): more vertices would only draw the same pixels. */
export const MESH_CELL_FLOOR_M = 2.5;

/**
 * Metres between ground-mesh vertices. Without the detailed ground it is what it always was (about 50 cells across, 4 to 12 m). With it, the mesh follows the
 * grid's own spacing (so a bigger tier shows more of the real shape) down to MESH_CELL_FLOOR_M, but Eco keeps the usual cut: its vertex count stays where it was.
 */
export function meshCell(radius: number, terrain: SiteTerrain | undefined, tier: Tier = "medium"): number {
  const usual = Math.min(12, Math.max(4, radius / 50));
  return terrain?.src === "aws" && tier !== "eco" ? Math.min(usual, Math.max(MESH_CELL_FLOOR_M, terrain.step)) : usual;
}

/** Extra smoothing by the owner's choice, as the radius (metres) of the Gaussian blur: light takes the noise off roofs and walls the lidar kept, strong rounds hills. */
export const SMOOTH_M: Record<1 | 2, number> = { 1: 6, 2: 15 };
export const SCALE_RANGE = { min: 0.5, max: 3 } as const;

/** Separable Gaussian blur of an n x n grid; edges repeat their last row and column. `sigma` in cells. */
function blur(h: readonly number[], n: number, sigma: number): number[] {
  const radius = Math.min(12, Math.ceil(sigma * 3));
  const w = Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)));
  const total = w.reduce((a, b) => a + b, 0);
  const pass = (src: readonly number[], horizontal: boolean): number[] => {
    const out = new Array<number>(src.length);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) {
          const a = horizontal ? clamp(i + k, 0, n - 1) : i;
          const b = horizontal ? j : clamp(j + k, 0, n - 1);
          s += w[k + radius] * src[b * n + a];
        }
        out[j * n + i] = s / total;
      }
    }
    return out;
  };
  return pass(pass(h, true), false);
}

/**
 * The owner's smoothing and vertical exaggeration applied to a grid. The result is again metres relative to the ground at the centre (exactly 0 there), so the
 * plan's own ground still meets it without a step whatever was chosen. Returns the same object when nothing is asked for.
 */
export function shapeTerrain(t: SiteTerrain, o: { smooth?: 1 | 2; scale?: number }): SiteTerrain {
  const scale = clamp(o.scale ?? 1, SCALE_RANGE.min, SCALE_RANGE.max);
  const sigma = o.smooth ? SMOOTH_M[o.smooth] / t.step : 0;
  if (scale === 1 && sigma < 0.3) return t;
  const soft = sigma >= 0.3 ? blur(t.h, t.n, sigma) : t.h;
  const mid = ((t.n - 1) / 2) * t.n + (t.n - 1) / 2;
  const zero = soft[mid];
  return { ...t, h: soft.map((v) => Math.round((v - zero) * scale * 100) / 100) };
}
