// Triangle buffers and polygon triangulation: what every mesh builder (buildings, roads, water) writes into.
import { ShapeUtils, Vector2 } from "three";
import { dedupeRing } from "./siteGeom.ts";
import type { V3 } from "./mathUtil.ts";
import type { RGB } from "./siteMeshBase.ts";
import type { XY } from "./siteTypes.ts";

/** Flat-shaded triangles: three floats per vertex for positions, normals and colours (linear RGB), two for texture coordinates. */
export type Buf = { pos: number[]; nrm: number[]; col: number[]; uv: number[] };
export const newBuf = (): Buf => ({ pos: [], nrm: [], col: [], uv: [] });

export const NO_UV: XY = [0, 0];
export const UP: V3 = [0, 1, 0];

/** Push a triangle, turned so that it faces the side `want` points to. */
export function push(out: Buf, a: V3, b: V3, c: V3, want: V3, col: RGB, ua: XY, ub: XY, uc: XY) {
  let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-9) return;
  if (nx * want[0] + ny * want[1] + nz * want[2] < 0) {
    [b, c] = [c, b];
    [ub, uc] = [uc, ub];
    nx = -nx; ny = -ny; nz = -nz;
  }
  nx /= len; ny /= len; nz /= len;
  for (const [p, t] of [[a, ua], [b, ub], [c, uc]] as [V3, XY][]) {
    out.pos.push(p[0], p[1], p[2]);
    out.nrm.push(nx, ny, nz);
    out.col.push(col[0], col[1], col[2]);
    out.uv.push(t[0], t[1]);
  }
}

/** The ring without repeated points, or null when it is not a polygon. */
export function clean(ring: readonly XY[]): XY[] | null {
  const r = dedupeRing(ring);
  return r.length >= 3 ? r : null;
}

/** Earcut a polygon with holes: the points (outline first, then each hole) and counter-clockwise-agnostic triangle indices into them. */
export function triangulate(ring: readonly XY[], holes: readonly (readonly XY[])[] = []): { pts: XY[]; tris: [number, number, number][] } {
  const outer = clean(ring);
  if (!outer) return { pts: [], tris: [] };
  const hs = holes.map(clean).filter((h): h is XY[] => !!h);
  const pts = [...outer, ...hs.flat()];
  const faces = ShapeUtils.triangulateShape(outer.map((p) => new Vector2(p[0], p[1])), hs.map((h) => h.map((p) => new Vector2(p[0], p[1]))));
  return { pts, tris: faces as [number, number, number][] };
}
