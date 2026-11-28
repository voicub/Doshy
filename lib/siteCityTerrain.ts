// The ground height a Vectiler model carries, as the `SiteTerrain` grid the rest of the Surroundings already uses (lib/siteMeshGround.ts `groundFn`).
// Vectiler writes each tile's terrain as a regular grid of `sub x sub` quads over [-1, 1] x [-1, 1] about the tile's centre, four unshared vertices per quad, the
// neighbouring tiles `2` units apart (lib/siteCityFrame.ts). So a vertex at OBJ position (u, v) is grid node (round((u + 1) * sub / 2), round((1 - v) * sub / 2)) of
// ONE grid shared by all tiles (columns grow east, rows grow south): no tile bookkeeping needed. Pure; the node test runner loads this file directly.
import type { CityFrame } from "./siteCityFrame.ts";
import type { ObjMesh, ObjModel } from "./siteCityObj.ts";
import type { SiteTerrain } from "./siteTypes.ts";

/** Metres between samples of the grid handed to the scene: the DEM behind it is about 30 m, and a finer grid only costs memory. */
const STEP_M = 15;
const MAX_N = 121;

/** Ground height from the model's terrain meshes (heights relative to the ground at the site's centre), or undefined when they do not make a grid. */
export function cityTerrain(model: ObjModel, meshes: readonly ObjMesh[], f: CityFrame, radius: number): SiteTerrain | undefined {
  const first = meshes[0];
  if (!first) return undefined;
  const sub = Math.round(Math.sqrt((first.end - first.start) / 6)); // two triangles per quad
  if (sub < 1 || 6 * sub * sub !== first.end - first.start) return undefined;
  const half = sub / 2;
  const nodes: { x: number; r: number; h: number }[] = [];
  let x0 = Infinity;
  let x1 = -Infinity;
  let r0 = Infinity;
  let r1 = -Infinity;
  for (const m of meshes) {
    if (m.end - m.start !== 6 * sub * sub) continue; // a tile of another detail would not line up
    for (let t = m.start; t < m.end; t++) {
      const k = model.tris[t] * 3;
      const x = Math.round((model.pos[k] + 1) * half);
      const r = Math.round((1 - model.pos[k + 1]) * half);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r);
      nodes.push({ x, r, h: model.pos[k + 2] * f.kz });
    }
  }
  const w = x1 - x0 + 1;
  const hgt = r1 - r0 + 1;
  if (!nodes.length || w < 2 || hgt < 2) return undefined;
  const grid = new Float32Array(w * hgt).fill(NaN);
  for (const n of nodes) grid[(n.r - r0) * w + (n.x - x0)] = n.h;

  const at = (sx: number, sy: number): number => {
    const fx = Math.min(w - 1, Math.max(0, ((sx - f.ox) / f.kx + 1) * half - x0));
    const fy = Math.min(hgt - 1, Math.max(0, (1 - (f.oy - sy) / f.ky) * half - r0));
    const i = Math.min(w - 2, Math.floor(fx));
    const j = Math.min(hgt - 2, Math.floor(fy));
    const u = fx - i;
    const v = fy - j;
    const g = (a: number, b: number) => grid[b * w + a];
    const mix = (1 - v) * ((1 - u) * g(i, j) + u * g(i + 1, j)) + v * ((1 - u) * g(i, j + 1) + u * g(i + 1, j + 1));
    return Number.isFinite(mix) ? mix : NaN;
  };

  const n = Math.min(MAX_N, 2 * Math.ceil(radius / STEP_M) + 1);
  const base = at(0, 0);
  if (!Number.isFinite(base)) return undefined;
  const h: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const hh = at((i - (n - 1) / 2) * STEP_M, (j - (n - 1) / 2) * STEP_M);
      h.push(Number.isFinite(hh) ? hh - base : 0);
    }
  }
  return { n, step: STEP_M, h, base };
}
