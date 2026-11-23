import { useLayoutEffect } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { metricUv, wallSlab, type FaceTile, type MeshData } from "@/lib/shellDetail";

/** Metres of rounding on a wall's top and corner edges (a wall is never rounder than this; thin pieces round less). */
export const WALL_EDGE = 0.012;

/** Plain typed arrays from lib/shellDetail as a BufferGeometry. The caller disposes it. */
export function toGeometry(m: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(m.positions, 3));
  g.setAttribute("normal", new BufferAttribute(m.normals, 3));
  g.setAttribute("uv", new BufferAttribute(m.uvs, 2));
  g.setIndex(new BufferAttribute(m.indices, 1));
  m.groups?.forEach((grp) => g.addGroup(grp.start, grp.count, grp.tag));
  return g;
}

/** A wall segment (see lib/shellDetail wallSlab: flat ends, rounded top edges, box-order material groups) with uvs in metres, centred on its own origin; `o` is where that origin lies in the wall's frame. */
export function wallBox(w: number, h: number, t: number, segments: number, radius: number, o: readonly [number, number, number], tileFor: (nx: number, ny: number, nz: number) => FaceTile): BufferGeometry {
  const m = wallSlab(w, h, t, radius, segments);
  metricUv(m.positions, m.normals, m.uvs, o, tileFor);
  return toGeometry(m);
}

/**
 * A w x h x d box (centred on its own origin, six material groups in three's box order +x -x +y -y +z -z) with edges rounded in `segments` steps and uvs in
 * metres: one texture tile spans `tileFor(normal).tile` metres whatever the size, and `o` (the box centre in world or wall space) keeps neighbours aligned.
 * `segments` 0 = a sharp box. The caller disposes it.
 */
export function shellBox(w: number, h: number, d: number, segments: number, radius: number, o: readonly [number, number, number], tileFor: (nx: number, ny: number, nz: number) => FaceTile): BoxGeometry {
  const g = segments > 0 ? new RoundedBoxGeometry(w, h, d, segments, radius) : new BoxGeometry(w, h, d);
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = g.getAttribute("uv") as BufferAttribute;
  metricUv(pos.array, nor.array, uv.array as Float32Array, o, tileFor);
  uv.needsUpdate = true;
  return g;
}

/** World-metre uvs for a geometry that is already in world coordinates (a floor or slab with holes cut in it): one tile spans `tile` metres. No-op without a geometry or tile. */
export function useMetricUv(geo: BufferGeometry | null, tile: number | undefined) {
  useLayoutEffect(() => {
    if (!geo || !tile) return;
    const uv = geo.getAttribute("uv") as BufferAttribute;
    metricUv(geo.getAttribute("position").array, geo.getAttribute("normal").array, uv.array as Float32Array, [0, 0, 0], () => ({ tile }));
    uv.needsUpdate = true;
  }, [geo, tile]);
}
