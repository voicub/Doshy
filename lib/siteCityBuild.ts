// Turns a parsed city OBJ (lib/siteCityObj.ts) into what the scene draws: buildings (walls and roofs, flat-shaded clay), road ribbons, and the ground height the
// model carries. Everything is moved into SITE metres (lib/siteCityFrame.ts) once; where the plan sits (dx, dy, bearing) only changes a transform and a per-building
// lift (lib/siteCityPlace.ts), so dragging the alignment never re-reads the model.
//
// How the pieces are told apart (the file has no names, only `o` objects): we always run Vectiler with `--terrain 1 --splitMeshes 1 --roadsHeight 0`
// (lib/siteCity.ts), so the file holds, per tile, one terrain mesh (a 2 x 2 unit grid), then one object per building (it has vertical walls) and one per road
// (a flat ribbon, no walls). A model made some other way is read the same way; flat land-use polygons in it would show as roads (docs/site.md says how to export).
// Pure; the node test runner loads this file directly: imports carry a .ts extension or are type-only.
import type { CityFrame } from "./siteCityFrame.ts";
import type { ObjMesh, ObjModel } from "./siteCityObj.ts";
import { cityTerrain } from "./siteCityTerrain.ts";
import { hexOr } from "./siteMeshBase.ts";
import type { SiteTerrain } from "./siteTypes.ts";

/** Buildings and roads stop this share of the radius out, where the ground has all but faded away (the same edges the OpenStreetMap layers use). */
const BUILDING_EDGE = 0.94;
const ROAD_EDGE = 0.98;
/** Triangles drawn at full quality; the lighter tiers draw `share` of them, nearest buildings first. A 3 x 3 tile city is 100k to 500k. */
const MAX_BUILDING_TRIS = 300_000;
const MAX_ROAD_TRIS = 120_000;
/** Farther than this, a building under SMALL_M2 of floor (a shed, a kiosk) is left out: it is a few pixels wide and costs as much as a house. */
const FAR_M = 90;
const SMALL_M2 = 20;
/** A triangle whose normal is within this much of horizontal (|y component|) is a wall. */
const WALL_NORMAL_Y = 0.5;
const TILE_UNITS = 2;
const TILE_TOLERANCE = 0.01;

const WALL_RGB = hexOr("#e6e0d4");
const ROOF_RGB = hexOr("#cbc3b5");

export type CityBuilding = {
  /** vertex range [v0, v1) in `CityPrepared.pos`, triangle corner range [i0, i1) in `idx` */
  v0: number;
  v1: number;
  i0: number;
  i1: number;
  /** footprint box in site metres (x east, y south) */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** metres from its lowest point to its highest */
  h: number;
};

export type CityPrepared = {
  /** x east, y up (0 at the building's base: placement lifts it onto the ground), z south; site metres about the site's centre */
  pos: Float32Array;
  nrm: Float32Array;
  /** linear RGB, normalised */
  col: Uint8Array;
  idx: Uint32Array;
  buildings: CityBuilding[];
  /** flat ribbons: x east, y 0, z south; placement drapes them */
  roads: { pos: Float32Array; idx: Uint32Array };
  /** the ground height the model's terrain meshes carry, when it has any */
  terrain: SiteTerrain | undefined;
  stats: { buildings: number; buildingTris: number; roadTris: number; leftOut: number };
};

export type PrepareOptions = {
  /** metres of surroundings drawn (Site.radius) */
  radius: number;
  /** the quality tier's share of the full triangle budget, 0..1 (Knobs.site) */
  share: number;
  roads: boolean;
  /** also derive the ground height from the model's terrain meshes */
  terrain: boolean;
};

/** The middle of the model's bounding box in OBJ units (x east, y north): where an OBJ of unknown position is centred (lib/siteCityFrame.ts `centredFrame`). */
export function middleOf(model: ObjModel): { u: number; v: number } {
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (let k = 0; k < model.pos.length; k += 3) {
    u0 = Math.min(u0, model.pos[k]);
    u1 = Math.max(u1, model.pos[k]);
    v0 = Math.min(v0, model.pos[k + 1]);
    v1 = Math.max(v1, model.pos[k + 1]);
  }
  return { u: (u0 + u1) / 2, v: (v0 + v1) / 2 };
}

type Rec = { mesh: ObjMesh; vmin: number; vmax: number; box: Box; wall: boolean; tris: number };
type Box = { u0: number; u1: number; v0: number; v1: number; w0: number; w1: number };

/** One pass over the triangles of every object: which vertices it uses, its box, whether it has a wall. */
function scan(model: ObjModel, mesh: ObjMesh): Rec | null {
  const { pos, tris } = model;
  if (mesh.end <= mesh.start) return null;
  const box: Box = { u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity, w0: Infinity, w1: -Infinity };
  let vmin = Infinity;
  let vmax = -1;
  let wall = false;
  for (let t = mesh.start; t < mesh.end; t += 3) {
    const a = tris[t] * 3;
    const b = tris[t + 1] * 3;
    const c = tris[t + 2] * 3;
    for (const k of [a, b, c]) {
      const i = k / 3;
      if (i < vmin) vmin = i;
      if (i > vmax) vmax = i;
      if (pos[k] < box.u0) box.u0 = pos[k];
      if (pos[k] > box.u1) box.u1 = pos[k];
      if (pos[k + 1] < box.v0) box.v0 = pos[k + 1];
      if (pos[k + 1] > box.v1) box.v1 = pos[k + 1];
      if (pos[k + 2] < box.w0) box.w0 = pos[k + 2];
      if (pos[k + 2] > box.w1) box.w1 = pos[k + 2];
    }
    if (!wall) {
      // OBJ axes: z is up. A wall's normal has (almost) no z part.
      const ux = pos[b] - pos[a];
      const uy = pos[b + 1] - pos[a + 1];
      const uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a];
      const vy = pos[c + 1] - pos[a + 1];
      const vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-12 && Math.abs(nz) / len < WALL_NORMAL_Y) wall = true;
    }
  }
  return { mesh, vmin, vmax, box, wall, tris: (mesh.end - mesh.start) / 3 };
}

const isTerrainTile = (b: Box) => Math.abs(b.u1 - b.u0 - TILE_UNITS) < TILE_TOLERANCE && Math.abs(b.v1 - b.v0 - TILE_UNITS) < TILE_TOLERANCE;

/** A small deterministic 0..1 per building, so neighbours differ a little in tone without any random state. */
const tone = (n: number) => ((Math.imul(n + 1, 0x9e3779b1) >>> 8) & 0xffff) / 0xffff;

type Placed = { rec: Rec; dist: number; x0: number; y0: number; x1: number; y1: number };

/** The record's footprint box in site metres and its distance from the site's centre. */
function sited(rec: Rec, f: CityFrame): Placed {
  const x0 = f.ox + rec.box.u0 * f.kx;
  const x1 = f.ox + rec.box.u1 * f.kx;
  const y0 = f.oy - rec.box.v1 * f.ky;
  const y1 = f.oy - rec.box.v0 * f.ky;
  return { rec, dist: Math.hypot((x0 + x1) / 2, (y0 + y1) / 2), x0, y0, x1, y1 };
}

/** The first `max` triangles' worth of records, nearest first. */
function withinBudget(list: Placed[], max: number): Placed[] {
  let total = 0;
  const kept: Placed[] = [];
  for (const p of list.sort((a, b) => a.dist - b.dist)) {
    if (total + p.rec.tris > max) continue;
    total += p.rec.tris;
    kept.push(p);
  }
  return kept;
}

export function prepareCity(model: ObjModel, f: CityFrame, o: PrepareOptions): CityPrepared {
  const buildingsIn: Placed[] = [];
  const roadsIn: Placed[] = [];
  const terrainMeshes: Rec[] = [];
  let leftOut = 0;
  for (const mesh of model.meshes) {
    const rec = scan(model, mesh);
    if (!rec) continue;
    if (isTerrainTile(rec.box)) {
      terrainMeshes.push(rec);
      continue;
    }
    const p = sited(rec, f);
    if (rec.wall) {
      const area = (p.x1 - p.x0) * (p.y1 - p.y0);
      if (p.dist > o.radius * BUILDING_EDGE || (p.dist > FAR_M && area < SMALL_M2)) leftOut++;
      else buildingsIn.push(p);
    } else if (o.roads && p.dist <= o.radius * ROAD_EDGE) roadsIn.push(p);
  }
  const share = Math.min(1, Math.max(0, o.share));
  const buildings = withinBudget(buildingsIn, Math.round(MAX_BUILDING_TRIS * share));
  leftOut += buildingsIn.length - buildings.length;
  const roads = withinBudget(roadsIn, Math.round(MAX_ROAD_TRIS * share));
  const built = buildBuildings(model, f, buildings);
  const flat = buildRoads(model, f, roads);
  return {
    ...built,
    roads: flat,
    terrain: o.terrain ? cityTerrain(model, terrainMeshes.map((r) => r.mesh), f, o.radius) : undefined,
    stats: { buildings: built.buildings.length, buildingTris: built.idx.length / 3, roadTris: flat.idx.length / 3, leftOut },
  };
}

function buildBuildings(model: ObjModel, f: CityFrame, list: Placed[]): Pick<CityPrepared, "pos" | "nrm" | "col" | "idx" | "buildings"> {
  let nv = 0;
  let ni = 0;
  for (const { rec } of list) {
    nv += rec.vmax - rec.vmin + 1;
    ni += rec.mesh.end - rec.mesh.start;
  }
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const col = new Uint8Array(nv * 3);
  const idx = new Uint32Array(ni);
  const out: CityBuilding[] = [];
  let v = 0;
  let i = 0;
  for (const [n, p] of list.entries()) {
    const { rec } = p;
    const v0 = v;
    const i0 = i;
    for (let s = rec.vmin; s <= rec.vmax; s++, v++) {
      pos[v * 3] = f.ox + model.pos[s * 3] * f.kx;
      pos[v * 3 + 1] = (model.pos[s * 3 + 2] - rec.box.w0) * f.kz;
      pos[v * 3 + 2] = f.oy - model.pos[s * 3 + 1] * f.ky;
    }
    // walls are turned to face away from the building's middle, roofs up: Vectiler's winding is not trusted, so a building is lit right whichever way it came
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.y0 + p.y1) / 2;
    let outward = 0;
    for (let t = rec.mesh.start; t < rec.mesh.end; t += 3) {
      const [a, b, c] = [model.tris[t] - rec.vmin + v0, model.tris[t + 1] - rec.vmin + v0, model.tris[t + 2] - rec.vmin + v0];
      const nm = faceNormal(pos, a, b, c);
      if (Math.abs(nm[1]) >= WALL_NORMAL_Y) continue;
      outward += nm[0] * ((pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3 - cx) + nm[2] * ((pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3 - cz);
    }
    for (let t = rec.mesh.start; t < rec.mesh.end; t += 3) {
      const [a, b, c] = [model.tris[t] - rec.vmin + v0, model.tris[t + 1] - rec.vmin + v0, model.tris[t + 2] - rec.vmin + v0];
      const nm = faceNormal(pos, a, b, c);
      const roof = Math.abs(nm[1]) >= WALL_NORMAL_Y;
      const flip = roof ? nm[1] < 0 : outward < 0;
      idx[i++] = a;
      idx[i++] = flip ? c : b;
      idx[i++] = flip ? b : c;
      const sign = flip ? -1 : 1;
      for (const k of [a, b, c]) {
        nrm[k * 3] += nm[0] * sign;
        nrm[k * 3 + 1] += nm[1] * sign;
        nrm[k * 3 + 2] += nm[2] * sign;
      }
    }
    const shade = 0.93 + 0.14 * tone(n);
    for (let k = v0; k < v; k++) {
      const len = Math.hypot(nrm[k * 3], nrm[k * 3 + 1], nrm[k * 3 + 2]) || 1;
      nrm[k * 3] /= len;
      nrm[k * 3 + 1] /= len;
      nrm[k * 3 + 2] /= len;
      const base = nrm[k * 3 + 1] > WALL_NORMAL_Y ? ROOF_RGB : WALL_RGB;
      for (let c = 0; c < 3; c++) col[k * 3 + c] = Math.round(Math.min(1, base[c] * shade) * 255);
    }
    out.push({ v0, v1: v, i0, i1: i, x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, h: (rec.box.w1 - rec.box.w0) * f.kz });
  }
  return { pos, nrm, col, idx, buildings: out };
}

/** The unit normal of triangle a, b, c (vertex numbers) of a three.js-ordered position array; zeros for a sliver. */
function faceNormal(pos: Float32Array, a: number, b: number, c: number): [number, number, number] {
  const ux = pos[b * 3] - pos[a * 3];
  const uy = pos[b * 3 + 1] - pos[a * 3 + 1];
  const uz = pos[b * 3 + 2] - pos[a * 3 + 2];
  const vx = pos[c * 3] - pos[a * 3];
  const vy = pos[c * 3 + 1] - pos[a * 3 + 1];
  const vz = pos[c * 3 + 2] - pos[a * 3 + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  return len > 1e-12 ? [nx / len, ny / len, nz / len] : [0, 0, 0];
}

function buildRoads(model: ObjModel, f: CityFrame, list: Placed[]): CityPrepared["roads"] {
  let nv = 0;
  let ni = 0;
  for (const { rec } of list) {
    nv += rec.vmax - rec.vmin + 1;
    ni += rec.mesh.end - rec.mesh.start;
  }
  const pos = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let v = 0;
  let i = 0;
  for (const { rec } of list) {
    const v0 = v;
    for (let s = rec.vmin; s <= rec.vmax; s++, v++) {
      pos[v * 3] = f.ox + model.pos[s * 3] * f.kx;
      pos[v * 3 + 2] = f.oy - model.pos[s * 3 + 1] * f.ky;
    }
    // ribbons are turned to face up (Vectiler's winding is not trusted): a triangle facing down would be culled and the road would be invisible
    for (let t = rec.mesh.start; t < rec.mesh.end; t += 3) {
      const [a, b, c] = [model.tris[t] - rec.vmin + v0, model.tris[t + 1] - rec.vmin + v0, model.tris[t + 2] - rec.vmin + v0];
      const up = (pos[b * 3 + 2] - pos[a * 3 + 2]) * (pos[c * 3] - pos[a * 3]) - (pos[b * 3] - pos[a * 3]) * (pos[c * 3 + 2] - pos[a * 3 + 2]);
      idx[i++] = a;
      idx[i++] = up < 0 ? c : b;
      idx[i++] = up < 0 ? b : c;
    }
  }
  return { pos, idx };
}
