// The plan's PBR textures (lib/materialRef.ts): where the references live (`room.floorMaterial`, `wall.material` / `wall.materialB`, a ground area's and a path's
// `material`), scrubbing them when a plan is loaded, listing the stored textures a plan needs, and the edits the inspectors make. Same job and same rules as
// lib/floorPhoto.ts: every setter gives back the SAME plan when nothing changes (so no empty undo step). Pure; the node test runner loads it directly (.ts imports).
import { isRecord } from "./guards.ts";
import { MATERIAL_SCALE_M, sanitizeMaterialRef, type MaterialRef } from "./materialRef.ts";
import type { PhItem } from "./polyhaven.ts";
import { turnOf } from "./trace.ts";
import type { GroundArea, GroundPath, Plan, Room, Wall } from "./types.ts";

export type WallFace = "A" | "B";
export type GroundTarget = { type: "ground" | "path"; id: string }; // the same shape as lib/ground.ts `GroundHit`

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** null = leave the field as it is (absent, or already clean), undefined = drop it, a reference = replace it. */
function redo(raw: unknown): MaterialRef | undefined | null {
  if (raw === undefined) return null;
  const fixed = sanitizeMaterialRef(raw);
  return fixed && same(fixed, raw) ? null : fixed;
}

function scrubRoom(r: Room): Room {
  if (!isRecord(r) || r.floorMaterial === undefined) return r;
  const fixed = redo(r.floorMaterial);
  if (fixed === null && !r.floorPhoto) return r;
  const { floorMaterial: _gone, ...rest } = r;
  const kept = fixed === null ? r.floorMaterial : fixed;
  return kept && !r.floorPhoto ? { ...rest, floorMaterial: kept } : rest; // a floor wears a photo OR a material: the photo (older, set deliberately) wins in a hand-edited file
}

function scrubWall(w: Wall): Wall {
  if (!isRecord(w)) return w;
  const a = redo(w.material);
  const b = redo(w.materialB);
  if (a === null && b === null) return w;
  const { material: _a, materialB: _b, ...rest } = w;
  const ma = a === null ? w.material : a;
  const mb = b === null ? w.materialB : b;
  return { ...rest, ...(ma ? { material: ma } : {}), ...(mb ? { materialB: mb } : {}) };
}

function scrubArea(g: GroundArea): GroundArea {
  const m = isRecord(g) ? redo(g.material) : null;
  if (m === null) return g;
  const { material: _gone, ...rest } = g;
  return m ? { ...rest, material: m } : rest;
}

function scrubPath(g: GroundPath): GroundPath {
  const m = isRecord(g) ? redo(g.material) : null;
  if (m === null) return g;
  const { material: _gone, ...rest } = g;
  return m ? { ...rest, material: m } : rest;
}

/** `list` with `fn` on every row; the same array when no row changed (nearly always). */
function mapList<T>(list: T[] | undefined, fn: (t: T) => T): T[] | undefined {
  if (!Array.isArray(list)) return list;
  const out = list.map(fn);
  return out.some((x, i) => x !== list[i]) ? out : list;
}

/** Rewrites the four lists with `fn`s; the same plan when nothing changed. */
function mapPlan(plan: Plan, fns: { room: (r: Room) => Room; wall: (w: Wall) => Wall; area: (g: GroundArea) => GroundArea; path: (g: GroundPath) => GroundPath }): Plan {
  const rooms = mapList(plan.rooms, fns.room);
  const walls = mapList(plan.walls, fns.wall);
  const ground = mapList(plan.ground, fns.area);
  const paths = mapList(plan.paths, fns.path);
  if (rooms === plan.rooms && walls === plan.walls && ground === plan.ground && paths === plan.paths) return plan;
  return { ...plan, ...(rooms ? { rooms } : {}), ...(walls ? { walls } : {}), ...(ground ? { ground } : {}), ...(paths ? { paths } : {}) };
}

/** The plan with every material reference made valid (bad ones are dropped, numbers clamped, a floor never wears a photo and a material). The same object when there is nothing to fix. */
export const withMaterials = (plan: Plan): Plan => mapPlan(plan, { room: scrubRoom, wall: scrubWall, area: scrubArea, path: scrubPath });

/** Every distinct stored texture the plan uses (rooms, walls, ground areas, paths), in that order. */
export function materialIds(plan: Pick<Plan, "rooms" | "walls" | "ground" | "paths">): string[] {
  const ids = new Set<string>();
  const add = (raw: unknown) => {
    const m = sanitizeMaterialRef(raw);
    if (m) ids.add(m.resourceId);
  };
  for (const r of Array.isArray(plan.rooms) ? plan.rooms : []) if (isRecord(r)) add(r.floorMaterial);
  for (const w of Array.isArray(plan.walls) ? plan.walls : []) {
    if (!isRecord(w)) continue;
    add(w.material);
    add(w.materialB);
  }
  for (const g of [...(Array.isArray(plan.ground) ? plan.ground : []), ...(Array.isArray(plan.paths) ? plan.paths : [])]) if (isRecord(g)) add(g.material);
  return [...ids];
}

/** The plan with every reference to the textures `ids` taken off (a plan file whose texture could not be brought along). The same plan back when none uses them. */
export function withoutMaterials(plan: Plan, ids: readonly string[]): Plan {
  const gone = (m: MaterialRef | undefined) => !!m && ids.includes(m.resourceId);
  return mapPlan(plan, {
    room: (r) => {
      if (!gone(r.floorMaterial)) return r;
      const { floorMaterial: _g, ...rest } = r;
      return rest;
    },
    wall: (w) => {
      if (!gone(w.material) && !gone(w.materialB)) return w;
      const { material, materialB, ...rest } = w;
      return { ...rest, ...(material && !gone(material) ? { material } : {}), ...(materialB && !gone(materialB) ? { materialB } : {}) };
    },
    area: (g) => {
      if (!gone(g.material)) return g;
      const { material: _g, ...rest } = g;
      return rest;
    },
    path: (g) => {
      if (!gone(g.material)) return g;
      const { material: _g, ...rest } = g;
      return rest;
    },
  });
}

// ---- edits ------------------------------------------------------------------------------------------------------------------

/** The plan with room `roomId`'s floor wearing `ref` (its floor photo comes off: one or the other), or its material taken off when `ref` is null. The same plan back when nothing changes. */
export function setFloorMaterial(plan: Plan, roomId: string, ref: MaterialRef | null): Plan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  if (!ref && room.floorMaterial === undefined) return plan;
  if (ref && same(room.floorMaterial, ref) && room.floorPhoto === undefined) return plan;
  const { floorMaterial: _m, floorPhoto: _p, ...rest } = room;
  const next: Room = ref ? { ...rest, floorMaterial: ref } : { ...rest, ...(room.floorPhoto ? { floorPhoto: room.floorPhoto } : {}) };
  return { ...plan, rooms: plan.rooms.map((r) => (r.id === roomId ? next : r)) };
}

/** `wall` with `ref` on one face (null = none); the same wall when nothing changes. */
function withFace(wall: Wall, face: WallFace, ref: MaterialRef | null): Wall {
  const now = face === "A" ? wall.material : wall.materialB;
  if (ref ? same(now, ref) : now === undefined) return wall;
  const { material, materialB, ...rest } = wall;
  const a = face === "A" ? ref : material;
  const b = face === "B" ? ref : materialB;
  return { ...rest, ...(a ? { material: a } : {}), ...(b ? { materialB: b } : {}) };
}

/** The wall with the material taken off face A and/or face B (painting that face with a plain colour or style does this); the same wall when there is none to take off. */
export function withoutFaceMaterials(wall: Wall, a: boolean, b: boolean): Wall {
  const x = a ? withFace(wall, "A", null) : wall;
  return b ? withFace(x, "B", null) : x;
}

/** The plan with each listed wall face wearing `ref` (null = taken off). The style and colour stay, so removing the material restores the old look. */
export function setWallFaceMaterials(plan: Plan, faces: readonly { id: string; face: WallFace }[], ref: MaterialRef | null): Plan {
  if (!faces.length) return plan;
  const walls = plan.walls.map((w) => faces.reduce((acc, f) => (f.id === w.id ? withFace(acc, f.face, ref) : acc), w));
  return walls.some((w, i) => w !== plan.walls[i]) ? { ...plan, walls } : plan;
}

/** The same on one face of each wall in `wallIds`. */
export const setWallMaterial = (plan: Plan, wallIds: readonly string[], face: WallFace, ref: MaterialRef | null): Plan => setWallFaceMaterials(plan, wallIds.map((id) => ({ id, face })), ref);

/** A ground area or a path wearing `ref` (null = off). The same plan back when nothing changes. */
export function setGroundMaterial(plan: Plan, target: GroundTarget, ref: MaterialRef | null): Plan {
  if (target.type === "ground") {
    const g = plan.ground?.find((x) => x.id === target.id);
    if (!g || (ref ? same(g.material, ref) : g.material === undefined)) return plan;
    const { material: _m, ...rest } = g;
    return { ...plan, ground: plan.ground?.map((x) => (x.id === target.id ? (ref ? { ...rest, material: ref } : rest) : x)) };
  }
  const p = plan.paths?.find((x) => x.id === target.id);
  if (!p || (ref ? same(p.material, ref) : p.material === undefined)) return plan;
  const { material: _m, ...rest } = p;
  return { ...plan, paths: plan.paths?.map((x) => (x.id === target.id ? (ref ? { ...rest, material: ref } : rest) : x)) };
}

// ---- size and turn ----------------------------------------------------------------------------------------------------------

/** One more quarter turn. */
export const turnedMaterial = (m: MaterialRef): MaterialRef => ({ ...m, rotation: turnOf(m.rotation + 90) });

/** "One repeat is about 80 cm wide" as the metres it covers, kept within range; a number that is not usable keeps the old size. */
export const materialScaleFromCm = (cm: number, fallback: number): number => (Number.isFinite(cm) && cm > 0 ? Math.min(MATERIAL_SCALE_M.max, Math.max(MATERIAL_SCALE_M.min, cm / 100)) : fallback);

/** The size a freshly applied texture gets: the real size its file says, else the listing's smaller side, else 1 m, kept within range. */
export function initialScaleM(fileScaleM: number | undefined, dims: readonly number[] | undefined): number {
  const real = fileScaleM && fileScaleM > 0 ? fileScaleM : dims?.length ? Math.min(...dims) : 0;
  return materialScaleFromCm(real * 100, MATERIAL_SCALE_M.fallback);
}

const lengthText = (m: number): string => (m >= 1 ? `${Math.round(m * 10) / 10} m` : `${Math.round(m * 100)} cm`);

/** The line the browse dialog shows under a chosen texture: how much real surface one picture covers (null when Poly Haven gives no size). */
export function materialDetail(item: Pick<PhItem, "dims">): { text: string } | null {
  const [x, y] = item.dims ?? [];
  return x && y ? { text: `One picture covers about ${lengthText(x)} by ${lengthText(y)} of real surface.` } : null;
}
