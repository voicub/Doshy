import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, LatheGeometry, SphereGeometry, Vector2 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Part } from "@/lib/catalog";
import { GRAIN_SEEDS, bevelRadius, cylinderPoints, geometryKey, lathePoints } from "@/lib/materialsPbr";
import { disposeLater } from "@/lib/disposeLater";

// One cached geometry per distinct shape (not per part): a table's four legs, the chairs of a set and every copy of a piece share it. Rounded boxes and cylinders
// follow the tier's bevelSegments; at 0 the geometries are exactly the plain ones the scene always used. Textured geometries carry `pbrP`, which world-space
// mapping in pbr.ts (applyWorldUV) reads: the part's extents, how to unwrap it (box / turned / cylinder) and a seed that shifts the grain.

const MAX_GEOMETRIES = 2000; // bounded: the oldest are disposed when a long editing session creates more. Above a scene's own count (the starter flat needs ~810 at Detailed: textured tiers keep one per grain seed), because evicting a mounted one leaks its re-upload
const cache = new Map<string, BufferGeometry>();
const MODE_BOX = 1, MODE_TURNED = 2, MODE_CYLINDER = 3; // pbrP.w = mode + 4 * seed; 1 is also what a geometry without the attribute reads (WebGL default 0,0,0,1)
const RADIAL = [20, 20, 24, 32]; // radial segments of cylinders and lathes by bevelSegments
const SPHERE_W = 18, SPHERE_H = 14;

function tag(g: BufferGeometry, ext: [number, number, number], mode: number, seed: number): BufferGeometry {
  const n = g.getAttribute("position").count;
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a.set([ext[0], ext[1], ext[2], mode + 4 * seed], i * 4);
  g.setAttribute("pbrP", new Float32BufferAttribute(a, 4));
  return g;
}

function build(p: Part, segments: number, r: number, textured: boolean, seed: number): BufferGeometry {
  const shape = p.shape ?? "box";
  const [sx, sy, sz] = p.s;
  let g: BufferGeometry;
  let mode = MODE_BOX;
  if (shape === "lathe" && p.lathe) {
    const pts = lathePoints(p.lathe, p.s);
    if (pts.length >= 3) {
      g = new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), RADIAL[segments]);
      mode = MODE_TURNED;
    } else g = new BoxGeometry(sx, sy, sz); // a profile with fewer than two usable points: keep the footprint box
  } else if (shape === "cyl") {
    mode = MODE_CYLINDER;
    g = r > 0 ? new LatheGeometry(cylinderPoints(sx / 2, sy, r, segments).map(([x, y]) => new Vector2(x, y)), RADIAL[segments]) : new CylinderGeometry(sx / 2, sx / 2, sy, 20);
  } else if (shape === "sph") {
    mode = MODE_TURNED;
    g = new SphereGeometry(sx / 2, SPHERE_W, SPHERE_H);
  } else g = r > 0 ? new RoundedBoxGeometry(sx, sy, sz, segments, r) : new BoxGeometry(sx, sy, sz);
  return textured ? tag(g, [sx, sy, sz], mode, seed) : g;
}

/** The geometry of a part (not `veg` parts) at the tier's rounding and texture level. `index` is the part's position in the piece: it only picks the grain shift. */
export function partGeometry(p: Part, bevelSegments: number, textured: boolean, index: number): BufferGeometry {
  const flat = !!p.glass || !!p.glow;
  const shape = p.shape ?? "box";
  const dims = shape === "cyl" ? [p.s[0], p.s[1]] : p.s;
  const r = shape === "sph" || shape === "lathe" ? 0 : bevelRadius(dims, p.bevel, bevelSegments, flat);
  const seed = index % GRAIN_SEEDS;
  const key = geometryKey(shape === "sph" ? { ...p, s: [p.s[0], p.s[0], p.s[0]] } : p, r, bevelSegments, textured ? seed : null);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key); // refresh: most recently used last
    cache.set(key, hit);
    return hit;
  }
  const g = build(p, bevelSegments, r, textured, seed);
  cache.set(key, g);
  if (cache.size > MAX_GEOMETRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.get(oldest)?.dispose();
      cache.delete(oldest);
    }
  }
  return g;
}

/** Retire every cached geometry (a tier changed its rounding): freed after the meshes that still hold them are gone, see lib/disposeLater.ts. */
export function disposePartGeometries() {
  disposeLater(cache.values());
  cache.clear();
}
