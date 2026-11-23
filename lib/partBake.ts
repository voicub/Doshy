// Baking a furniture piece's static parts into few meshes. A piece is 5 to 30 parts and every part used to be its own draw call (and its own shadow-pass draw call):
// on a weak GPU the call count, not the triangle count, is what a frame costs. Parts that look the same (one material) and never move are placed inside the piece once,
// here, and drawn as one mesh. Pure geometry: no React, no caches (components/scene/partMerge.ts keeps those).
import { BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Part } from "./catalog.ts";

/** Where a geometry stands inside its piece: what a `<mesh position rotation scale>` said. */
export type Placement = { p: readonly [number, number, number]; r?: readonly [number, number, number]; scale: readonly [number, number, number] };

const ONE = [1, 1, 1] as const;

/** A catalog part's placement: its centre, turn, and (a sphere's geometry is round, the part's box squashes it) scale. */
export function placementOf(part: Pick<Part, "p" | "r" | "s" | "shape">): Placement {
  return { p: part.p, r: part.r, scale: part.shape === "sph" ? [1, part.s[1] / part.s[0], part.s[2] / part.s[0]] : ONE };
}

const euler = new Euler();
const quat = new Quaternion();
const at = new Vector3();
const size = new Vector3();

export function placementMatrix(pl: Placement): Matrix4 {
  at.set(pl.p[0], pl.p[1], pl.p[2]);
  quat.setFromEuler(pl.r ? euler.set(pl.r[0], pl.r[1], pl.r[2]) : euler.set(0, 0, 0));
  size.set(pl.scale[0], pl.scale[1], pl.scale[2]);
  return new Matrix4().compose(at, quat, size);
}

/** Indices that share a key, in order, for every key with two or more members (a key of `null` never joins a group: that part keeps its own mesh). */
export function sharedGroups<K>(keys: readonly (K | null)[]): number[][] {
  const byKey = new Map<K, number[]>();
  keys.forEach((k, i) => {
    if (k === null) return;
    const list = byKey.get(k);
    if (list) list.push(i);
    else byKey.set(k, [i]);
  });
  return [...byKey.values()].filter((g) => g.length > 1);
}

/** One geometry from the parts' own geometries, each moved to its place in the piece. The inputs are not touched. Null when the attribute sets do not fit together. */
export function bakeParts(places: readonly Placement[], geos: readonly BufferGeometry[]): BufferGeometry | null {
  // rounded boxes are unindexed, boxes and cylinders are indexed: a merge needs all or none
  const unindexed = geos.some((g) => !g.index);
  const placed = geos.map((g, i) => (unindexed && g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(placementMatrix(places[i])));
  const merged = mergeGeometries(placed);
  for (const g of placed) g.dispose();
  return merged;
}
