import { ExtrudeGeometry, Path, Shape, Vector2, type BufferGeometry } from "three";
import type { Pt } from "./types.ts";

type Rect = { x: number; y: number; w: number; h: number };

/** Plan points as shape points: extruding and then standing the shape upright turns shape y into world -z. */
const ring = (pts: Pt[]) => pts.map((p) => new Vector2(p.x, -p.y));

/**
 * A slab of `rect` with polygon holes, `depth` metres thick, from y = 0 up to y = depth (plan x, y become world x, z). UVs span the rectangle
 * 0..1 like a box top face, so a tiled floor texture lines up with the unholed floor. Holes must lie inside the rectangle (lib/voids holesIn).
 */
export function holedSlabGeometry(rect: Rect, holes: Pt[][], depth: number): BufferGeometry {
  const { x, y, w, h } = rect;
  const shape = new Shape(ring([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]));
  for (const hole of holes) shape.holes.push(new Path(ring(hole)));
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x) / w, 1 - (pos.getZ(i) - y) / h);
  return g;
}
