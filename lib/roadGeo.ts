import { Color } from "three";
import { PATH_LIFT, marksOf, pathLine, pavementOf, pavementWidthOf } from "./ground.ts";
import type { Tris } from "./groundGeo.ts";
import { capTris, faceTris, offsetLine, pavementBands, ribbonTris, roadMarkStrips, stoneRects, type Stone } from "./lineGeometry.ts";
import type { GroundPath, Pt } from "./types.ts";

// The 3D parts of a road, as flat triangles ready for a merged BufferGeometry (components/scene/RoadDetails.tsx, GroundAreas.tsx). Pure, so the winding and the
// merge are tested without a browser. Every height is measured from the road's own surface (the mesh sits at PATH_LIFT above the ground).

/** How far a pavement stands above the road surface (m). */
export const PAVEMENT_RISE = 0.12;
/** Stepping stones are this thick (m). */
export const STONE_HEIGHT = 0.05;

export type RoadShape = Pick<GroundPath, "points" | "width" | "smooth" | "marks" | "pavement" | "pavementWidth">;

const join = (parts: readonly Tris[]): Tris => {
  const out: Tris = { pos: [], uv: [] };
  for (const t of parts) {
    for (const v of t.pos) out.pos.push(v);
    for (const v of t.uv) out.uv.push(v);
  }
  return out;
};

/** The lane markings of a road as ONE set of triangles with a colour per vertex (linear light, ready for vertexColors). Flat at height 0; the mesh lifts it a hair above the surface. */
export function markTris(p: RoadShape): { pos: number[]; color: number[] } {
  const pos: number[] = [];
  const color: number[] = [];
  for (const s of roadMarkStrips(pathLine(p), p.width, marksOf(p))) {
    const t = ribbonTris(offsetLine(s.pts, s.width / 2), offsetLine(s.pts, -s.width / 2), 1);
    const c = new Color(s.color);
    for (const v of t.pos) pos.push(v);
    for (let i = 0; i < t.pos.length / 3; i++) color.push(c.r, c.g, c.b);
  }
  return { pos, color };
}

/** The tops of a road's pavements, PAVEMENT_RISE above the road; uv in tiles of `tileM` metres. */
export function pavementTris(p: RoadShape, tileM: number): Tris {
  return join(pavementBands(pathLine(p), p.width, pavementWidthOf(p), pavementOf(p)).map((b) => ribbonTris(b.inner, b.outer, tileM, PAVEMENT_RISE)));
}

/**
 * The sides of a road's pavements in one piece: the kerb face toward the road, the outer face away from it (it reaches down to the ground, since the pavement is a block
 * and not a ledge) and a face at each end. Together with the top they close the block, so no side shows the inside.
 */
export function kerbTris(p: RoadShape): Tris {
  const parts: Tris[] = [];
  for (const b of pavementBands(pathLine(p), p.width, pavementWidthOf(p), pavementOf(p))) {
    const toward = b.side === "left" ? "right" : "left"; // the road lies on the other side of the pavement's inner edge
    const [forward, backward] = b.side === "left" ? (["right", "left"] as const) : (["left", "right"] as const); // faces of the line inner -> outer, which runs across the road
    const n = b.inner.length - 1;
    parts.push(
      faceTris(b.inner, 0, PAVEMENT_RISE, toward),
      faceTris(b.outer, -PATH_LIFT, PAVEMENT_RISE, b.side),
      faceTris([b.inner[0], b.outer[0]], -PATH_LIFT, PAVEMENT_RISE, backward),
      faceTris([b.inner[n], b.outer[n]], -PATH_LIFT, PAVEMENT_RISE, forward),
    );
  }
  return join(parts);
}

/** A rectangle with rounded corners, `segs` steps a corner, turned and placed as `s` says (plan metres). Goes round the same way for every stone. */
function slabRing(s: Stone, segs: number): Pt[] {
  const r = Math.min(s.l, s.w) * 0.2;
  const [hl, hw] = [s.l / 2 - r, s.w / 2 - r];
  const [cos, sin] = [Math.cos(s.angle), Math.sin(s.angle)];
  const ring: Pt[] = [];
  [[hl, hw], [-hl, hw], [-hl, -hw], [hl, -hw]].forEach(([cu, cv], corner) => {
    for (let k = 0; k <= segs; k++) {
      const a = ((corner + k / segs) * Math.PI) / 2;
      const [u, v] = [cu + r * Math.cos(a), cv + r * Math.sin(a)];
      ring.push({ x: s.x + u * cos - v * sin, y: s.y + u * sin + v * cos });
    }
  });
  return ring;
}

const ringArea = (ring: readonly Pt[]) => ring.reduce((s, p, i) => s + p.x * ring[(i + 1) % ring.length].y - ring[(i + 1) % ring.length].x * p.y, 0) / 2;

/**
 * Stepping stones as one set of triangles: a slab with rounded corners (`segs` steps a corner: 1 is a chamfer, cheap for Eco), STONE_HEIGHT thick, standing on the ground.
 * The top's uv is the plan position / `tileM`, like the continuous surface, so the same texture and colour make a stone of the path's own kind.
 */
export function stoneSlabs(p: Pick<GroundPath, "points" | "width" | "smooth">, tileM: number, segs: number): Tris {
  const parts: Tris[] = [];
  for (const s of stoneRects(pathLine(p), p.width)) {
    const ring = slabRing(s, Math.max(1, segs));
    // going round a ring with a positive signed area (plan y down), its outside is the LEFT of travel
    parts.push(capTris(ring, STONE_HEIGHT, tileM), faceTris([...ring, ring[0]], -PATH_LIFT, STONE_HEIGHT, ringArea(ring) > 0 ? "left" : "right", tileM));
  }
  return join(parts);
}
