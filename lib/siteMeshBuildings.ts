// Neighbour buildings into wall and roof buffers: palette by kind, wall rows with window texture coordinates, roofs by shape.
import { clamp, hashStr, rngOf } from "./mathUtil.ts";
import { polygonBounds, polygonCentroid, type Rect } from "./siteGeom.ts";
import { hexOr, parseCssColor, type RGB } from "./siteMeshBase.ts";
import { NO_UV, UP, newBuf, push, triangulate, type Buf } from "./siteMeshBuf.ts";
import type { V3 } from "./mathUtil.ts";
import { bearingOf, cutKeep, rectCentre, ringRectDistance } from "./siteMeshCut.ts";
import type { GroundFn } from "./siteMeshGround.ts";
import { eaves, type PlanBuilding } from "./siteMeshPlan.ts";
import { defaultRise, edgeCuts, orientedBox, roofOf, splitTriangles } from "./siteMeshRoof.ts";
import type { XY } from "./siteTypes.ts";

const FLOOR_M = 3; // storey height assumed by the window rows
const BAY_M = 3; // window spacing along a wall
/** The window texture holds this many bays and storeys in each direction (components/scene/site/windowTexture.ts). */
export const WINDOW_CELLS = 8;
const SKIRT_M = 0.4; // walls reach this far below their lowest ground point so they never float on a slope
const PARAPET_M = 0.3;

/** The window texture's one blank cell (bottom-right): small sheds and walls without windows sample it. */
const PLAIN_UV: XY = [1 - 0.5 / WINDOW_CELLS, 1 - 0.5 / WINDOW_CELLS];

type BuildingStyle = { wall: RGB; roof: RGB; edge: RGB; glazed: boolean };

const WALLS_BLOCK = ["#d9d3c3", "#cfc8b8", "#e2d9bf", "#c9cfd1", "#d8c9b0", "#bfc6c9", "#e5ded0"];
const WALLS_HOUSE = ["#efe6d3", "#e8dcc0", "#f0e9dc", "#e3c9a0", "#dcb98c", "#e9d9c6"];
const WALLS_WORK = ["#a9aeb2", "#b5b9bb", "#9aa3aa", "#c4c1b8"];
const WALLS_DEFAULT = ["#d8d0c0", "#cdc4b4", "#d3cbbb"];
const ROOFS_TILE = ["#9c4a32", "#a65a3c", "#8c4a38", "#7d5546", "#6b6b6e"];
const ROOFS_FLAT = ["#5b5e63", "#6a6c70", "#4f5256"];
const ROOFS_WORK = ["#8a9096", "#9aa0a6"];
const EDGE = "#b8b6b0";
type KindGroup = "block" | "house" | "work" | "holy" | "plain";
const KIND_GROUP: Record<string, KindGroup> = {
  apartments: "block", residential: "block", dormitory: "block", block: "block", flats: "block", hotel: "block",
  house: "house", detached: "house", semidetached_house: "house", terrace: "house", bungalow: "house", villa: "house", farm: "house",
  industrial: "work", warehouse: "work", commercial: "work", retail: "work", office: "work", supermarket: "work", factory: "work", manufacture: "work", hangar: "work",
  church: "holy", chapel: "holy", cathedral: "holy", monastery: "holy",
  shed: "plain", garage: "plain", garages: "plain", carport: "plain", roof: "plain", hut: "plain", cabin: "plain", greenhouse: "plain", service: "plain", kiosk: "plain", container: "plain", silo: "plain", tank: "plain",
  construction: "plain", ruins: "plain", bunker: "plain", barn: "plain", stable: "plain", farm_auxiliary: "plain", outbuilding: "plain", toilets: "plain", transformer_tower: "plain", static_caravan: "plain",
};

const pick = <T,>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** What a building looks like: its OpenStreetMap colours, else a plausible plaster and roof palette by kind with a stable variation from its id. */
export function buildingStyle(b: PlanBuilding): BuildingStyle {
  const rnd = rngOf(hashStr(b.id));
  const { top } = eaves(b);
  const group: KindGroup | undefined = KIND_GROUP[b.kind] ?? (b.kind === "yes" ? (top >= 10 ? "block" : "house") : undefined);
  const block = group === "block";
  const work = group === "work";
  const wallPick = pick(group === "holy" ? ["#efece4"] : work ? WALLS_WORK : block ? WALLS_BLOCK : group === "house" ? WALLS_HOUSE : WALLS_DEFAULT, rnd());
  const pitched = b.roof !== "flat";
  const roofPick = pick(work ? ROOFS_WORK : pitched && !block ? ROOFS_TILE : ROOFS_FLAT, rnd());
  const tone = 0.94 + rnd() * 0.12;
  const mul = (c: RGB): RGB => [c[0] * tone, c[1] * tone, c[2] * tone];
  return {
    wall: parseCssColor(b.wallColor) ?? mul(hexOr(wallPick)),
    roof: parseCssColor(b.roofColor) ?? mul(hexOr(roofPick)),
    edge: hexOr(EDGE),
    glazed: group !== "plain" && top >= 3.4,
  };
}

/**
 * One building into the wall and roof buffers. `base` is the ground height under it (the lowest point of its footprint).
 * Walls carry window-row texture coordinates (one bay per BAY_M, one storey per FLOOR_M, snapped to whole bays and storeys); roofs are plain colour.
 * Walls rise to the roof surface, so gables and hipped ends close without extra pieces.
 * Returns the texture v of the walls' bottom edge (what the cut-away shrinks the window rows towards).
 */
function addBuilding(walls: Buf, roofs: Buf, b: PlanBuilding, base: number, style: BuildingStyle): number {
  const { top, bottom } = eaves(b);
  const eavesY = base + top;
  const bottomY = base + bottom - (bottom > 0 ? 0 : SKIRT_M);
  const box = orientedBox(b.ring);
  const roof = roofOf(b.roof, box, b.roofHeight);
  const creases = roof?.creases ?? [];
  const rnd = rngOf(hashStr(b.id) ^ 0x9e3779b9);
  const uo = Math.floor(rnd() * WINDOW_CELLS) / WINDOW_CELLS;
  const vo = Math.floor(rnd() * WINDOW_CELLS) / WINDOW_CELLS;
  const floors = Math.max(1, Math.round((top - bottom) / FLOOR_M));
  const floorH = (top - bottom) / floors;

  // ---- walls (and the parapet that gives a flat roof its slab edge)
  for (const ring of [b.ring, ...b.holes]) {
    let run = 0; // texture u, in bays
    for (let i = 0; i < ring.length; i++) {
      const A = ring[i];
      const B = ring[(i + 1) % ring.length];
      const dx = B[0] - A[0];
      const dz = B[1] - A[1];
      const L = Math.hypot(dx, dz);
      if (L < 0.05) continue;
      const bays = Math.max(1, Math.round(L / BAY_M));
      const want: V3 = [dz, 0, -dx];
      const cuts = [0, ...edgeCuts(A, B, creases), 1];
      for (let k = 0; k + 1 < cuts.length; k++) {
        const s0 = cuts[k];
        const s1 = cuts[k + 1];
        if (s1 - s0 < 1e-6) continue;
        const P: XY = [A[0] + dx * s0, A[1] + dz * s0];
        const Q: XY = [A[0] + dx * s1, A[1] + dz * s1];
        const tP = eavesY + (roof ? roof.height(P[0], P[1]) : 0);
        const tQ = eavesY + (roof ? roof.height(Q[0], Q[1]) : 0);
        const uv = (s: number, y: number): XY => (style.glazed ? [uo + (run + s * bays) / WINDOW_CELLS, vo + (y - bottomY) / floorH / WINDOW_CELLS] : PLAIN_UV);
        const p0: V3 = [P[0], bottomY, P[1]], p1: V3 = [Q[0], bottomY, Q[1]], p2: V3 = [Q[0], tQ, Q[1]], p3: V3 = [P[0], tP, P[1]];
        push(walls, p0, p1, p2, want, style.wall, uv(s0, bottomY), uv(s1, bottomY), uv(s1, tQ));
        push(walls, p0, p2, p3, want, style.wall, uv(s0, bottomY), uv(s1, tQ), uv(s0, tP));
        if (b.roof === "flat") {
          const q0: V3 = [P[0], eavesY, P[1]], q1: V3 = [Q[0], eavesY, Q[1]], q2: V3 = [Q[0], eavesY + PARAPET_M, Q[1]], q3: V3 = [P[0], eavesY + PARAPET_M, P[1]];
          push(roofs, q0, q1, q2, want, style.edge, NO_UV, NO_UV, NO_UV);
          push(roofs, q0, q2, q3, want, style.edge, NO_UV, NO_UV, NO_UV);
        }
      }
      run += bays;
    }
  }

  // ---- roof surface
  const vBottom = style.glazed ? vo : PLAIN_UV[1];
  if (b.roof === "dome") {
    addDome(roofs, b, eavesY, style.roof);
    return vBottom;
  }
  const { pts, tris } = triangulate(b.ring, b.holes);
  const flatY = eavesY + (b.roof === "flat" ? PARAPET_M * 0.66 : 0);
  const pieces = splitTriangles(tris.map((t) => [pts[t[0]], pts[t[1]], pts[t[2]]]), creases);
  for (const t of pieces) {
    const v = t.map((p): V3 => [p[0], flatY + (roof ? roof.height(p[0], p[1]) : 0), p[1]]);
    push(roofs, v[0], v[1], v[2], UP, style.roof, NO_UV, NO_UV, NO_UV);
  }
  return vBottom;
}

/** A low cap: the outline shrinks towards its middle in a few rings while rising along a circle's arc. */
function addDome(roofs: Buf, b: PlanBuilding, eavesY: number, col: RGB) {
  const c = polygonCentroid(b.ring);
  const bb = polygonBounds(b.ring);
  const rise = defaultRise("dome", Math.min(bb.x1 - bb.x0, bb.y1 - bb.y0) / 2) * (b.roofHeight > 0 ? clamp(b.roofHeight, 0.5, 14) / defaultRise("dome", Math.min(bb.x1 - bb.x0, bb.y1 - bb.y0) / 2) : 1);
  const scales = [1, 0.82, 0.58, 0.3];
  const rings = scales.map((s) => b.ring.map((p): XY => [c[0] + (p[0] - c[0]) * s, c[1] + (p[1] - c[1]) * s]));
  const ys = scales.map((s) => eavesY + rise * Math.sqrt(Math.max(0, 1 - s * s)) * (s === 1 ? 0 : 1));
  for (let r = 0; r + 1 < rings.length; r++) {
    for (let i = 0; i < b.ring.length; i++) {
      const j = (i + 1) % b.ring.length;
      const a0 = rings[r][i], a1 = rings[r][j], c1 = rings[r + 1][j], c0 = rings[r + 1][i];
      const q: V3[] = [[a0[0], ys[r], a0[1]], [a1[0], ys[r], a1[1]], [c1[0], ys[r + 1], c1[1]], [c0[0], ys[r + 1], c0[1]]];
      push(roofs, q[0], q[1], q[2], UP, col, NO_UV, NO_UV, NO_UV);
      push(roofs, q[0], q[2], q[3], UP, col, NO_UV, NO_UV, NO_UV);
    }
  }
  const inner = rings[rings.length - 1];
  const { pts, tris } = triangulate(inner, []);
  for (const t of tris) push(roofs, [pts[t[0]][0], eavesY + rise, pts[t[0]][1]], [pts[t[1]][0], eavesY + rise, pts[t[1]][1]], [pts[t[2]][0], eavesY + rise, pts[t[2]][1]], UP, col, NO_UV, NO_UV, NO_UV);
}

/**
 * Every building into two buffers (walls with the window texture, roofs). Each stands on the lowest ground under its outline.
 * With a `footprint`, also the cut-away attribute of each buffer (`CUT_STRIDE` floats per vertex): the scale its heights above the ground take when
 * Cut-away is on (one value for the whole building, so a roof stays a roof, only lower), see `cutKeep`. Without one nothing is ever lowered.
 */
export function buildBuildings(list: readonly PlanBuilding[], ground: GroundFn, footprint?: Rect | null): { walls: Buf; roofs: Buf; wallsCut: number[]; roofsCut: number[] } {
  const walls = newBuf();
  const roofs = newBuf();
  const wallsCut: number[] = [];
  const roofsCut: number[] = [];
  for (const b of list) {
    const base = Math.min(...b.ring.map((p) => ground(p[0], p[1])));
    const w0 = walls.pos.length;
    const r0 = roofs.pos.length;
    const vBottom = addBuilding(walls, roofs, b, base, buildingStyle(b));
    let top = base;
    for (let i = w0 + 1; i < walls.pos.length; i += 3) top = Math.max(top, walls.pos[i]);
    for (let i = r0 + 1; i < roofs.pos.length; i += 3) top = Math.max(top, roofs.pos[i]);
    const keep = footprint ? cutKeep(ringRectDistance(b.ring, footprint), top - base) : 1;
    const bearing = footprint ? bearingOf(rectCentre(footprint), polygonCentroid(b.ring)) : 0;
    for (let i = w0; i < walls.pos.length; i += 3) wallsCut.push(keep, base, vBottom, bearing);
    for (let i = r0; i < roofs.pos.length; i += 3) roofsCut.push(keep, base, vBottom, bearing);
  }
  return { walls, roofs, wallsCut, roofsCut };
}
