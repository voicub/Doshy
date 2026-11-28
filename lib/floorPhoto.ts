// A room floor made from a photo of the real floor (`room.floorPhoto`): the plan field, reading it safely out of a saved plan and the maths that turns
// "this patch is about 40 cm wide" into tile sizes. The pixel work (crop, lighting, seamless edges) is lib/floorPhotoPixels.ts. Pure.
// The node test runner loads this file directly: .ts import extensions.
import { isRecord } from "./guards.ts";
import { turnOf } from "./trace.ts";
import type { Plan, Room } from "./types.ts";

/**
 * The photo of a floor: `resourceId` is the stored, already seamless texture (a resource of kind "floor-photo"), `scaleM` the real width in metres one
 * repeat of it covers, `rotation` the turn in degrees (-180, 180], and `avg` its average colour: Eco and Light draw that alone and never fetch the picture.
 */
export type FloorPhoto = { resourceId: string; scaleM: number; rotation: number; avg: string };

/** A stored floor texture is at most 1024 x 1024 px (lib/floorPhotoPixels.ts): 6 MB is far above a PNG of even noisy pixels. The server (lib/db/resources.ts) enforces it, a plan file is checked against it. */
export const MAX_FLOOR_PHOTO_BYTES = 6 * 1024 * 1024;

/** Metres one repeat of the texture covers. A patch of floor is a few planks or tiles wide; a whole 6 m is already a mural. */
export const SCALE_RANGE_M = { min: 0.05, max: 6 } as const;
export const DEFAULT_SCALE_M = 0.4;
export const DEFAULT_AVG = "#b4b4b4";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/; // what the resource store accepts as an id (lib/db/resources.ts)
const HEX = /^#[0-9a-f]{6}$/i;

/** The resource id of a stored floor texture: "floor-" and the first 24 hex digits of the SHA-256 of its bytes, so the same texture is stored once. */
export const floorPhotoIdOf = (sha256Hex: string): string => `floor-${sha256Hex.slice(0, 24)}`;

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** The floor photo of a room loaded from anywhere (storage, the database, a file), or undefined when it is not usable. Numbers are clamped, the turn is normalised. */
export function sanitizeFloorPhoto(v: unknown): FloorPhoto | undefined {
  if (!isRecord(v) || typeof v.resourceId !== "string" || !ID_RE.test(v.resourceId)) return undefined;
  return {
    resourceId: v.resourceId,
    scaleM: clamp(v.scaleM, SCALE_RANGE_M.min, SCALE_RANGE_M.max, DEFAULT_SCALE_M),
    rotation: turnOf(clamp(v.rotation, -1e6, 1e6, 0)),
    avg: typeof v.avg === "string" && HEX.test(v.avg) ? v.avg.toLowerCase() : DEFAULT_AVG,
  };
}

/** The plan with every room's `floorPhoto` made valid (bad ones are dropped). The same object when there is nothing to fix, which is nearly always. */
export function withFloorPhotos(plan: Plan): Plan {
  if (!Array.isArray(plan.rooms) || !plan.rooms.some((r) => isRecord(r) && r.floorPhoto !== undefined)) return plan;
  let changed = false;
  const rooms = plan.rooms.map((r): Room => {
    if (!isRecord(r) || r.floorPhoto === undefined) return r;
    const fixed = sanitizeFloorPhoto(r.floorPhoto);
    if (fixed && JSON.stringify(fixed) === JSON.stringify(r.floorPhoto)) return r;
    changed = true;
    const { floorPhoto: _gone, ...rest } = r;
    return fixed ? { ...rest, floorPhoto: fixed } : rest;
  });
  return changed ? { ...plan, rooms } : plan;
}

/** Every distinct texture the plan's rooms use, in room order. */
export function floorPhotoIds(plan: Pick<Plan, "rooms">): string[] {
  const ids = new Set<string>();
  for (const r of Array.isArray(plan.rooms) ? plan.rooms : []) {
    const p = isRecord(r) ? sanitizeFloorPhoto(r.floorPhoto) : undefined;
    if (p) ids.add(p.resourceId);
  }
  return [...ids];
}

/** The plan with room `roomId` wearing `photo` (a Poly Haven floor material comes off: one or the other), or its photo taken off when `photo` is null. The same plan back when nothing changes (no undo step). */
export function setFloorPhoto(plan: Plan, roomId: string, photo: FloorPhoto | null): Plan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  if (!photo && room.floorPhoto === undefined) return plan;
  if (photo && JSON.stringify(room.floorPhoto) === JSON.stringify(photo) && room.floorMaterial === undefined) return plan;
  const { floorPhoto: _old, floorMaterial: _mat, ...rest } = room;
  const next: Room = photo ? { ...rest, floorPhoto: photo } : { ...rest, ...(room.floorMaterial ? { floorMaterial: room.floorMaterial } : {}) };
  return { ...plan, rooms: plan.rooms.map((r) => (r.id === roomId ? next : r)) };
}

/** The plan with the photos of the textures `ids` taken off every room (a plan file whose picture could not be brought along). The same plan back when none uses them. */
export function withoutFloorPhotos(plan: Plan, ids: readonly string[]): Plan {
  const uses = (r: Room) => !!r.floorPhoto && ids.includes(r.floorPhoto.resourceId);
  if (!plan.rooms.some(uses)) return plan;
  return {
    ...plan,
    rooms: plan.rooms.map((r) => {
      if (!uses(r)) return r;
      const { floorPhoto: _gone, ...rest } = r;
      return rest;
    }),
  };
}

// ---- scale ------------------------------------------------------------------------------------------------------------------

/** "This patch is about 40 cm wide" as the metres one repeat of the texture covers (the whole cropped patch is one repeat), kept within range. */
export const scaleFromPatchCm = (cm: number): number => clamp(cm / 100, SCALE_RANGE_M.min, SCALE_RANGE_M.max, DEFAULT_SCALE_M);

/** The patch width in cm for a scale, to show in a field: whole cm above 10, one decimal below. */
export const patchCmOf = (scaleM: number): number => (scaleM >= 0.1 ? Math.round(scaleM * 100) : Math.round(scaleM * 1000) / 10);

/** How many times the texture repeats across a room `w` x `h` metres: the uv span the room's floor covers (the floor's uvs are in metres divided by `scaleM`). */
export const uvRepeat = (w: number, h: number, scaleM: number): { u: number; v: number } => ({ u: w / scaleM, v: h / scaleM });

// ---- the crop box -----------------------------------------------------------------------------------------------------------

export const ZOOM_RANGE = { min: 1, max: 8 } as const;

/**
 * The square patch of an `imgW` x `imgH` picture for a crop centre (`cx`, `cy`, in picture pixels) and a zoom: at 1 the square is the picture's short side, at
 * 8 an eighth of it. The square always lies inside the picture (the centre is pulled in), and its side is at least 1 px.
 */
export function cropBox(imgW: number, imgH: number, cx: number, cy: number, zoom: number): { x: number; y: number; side: number } {
  const z = clamp(zoom, ZOOM_RANGE.min, ZOOM_RANGE.max, 1);
  const side = Math.max(1, Math.round(Math.min(imgW, imgH) / z));
  const x = Math.round(clamp(cx - side / 2, 0, Math.max(0, imgW - side), 0));
  const y = Math.round(clamp(cy - side / 2, 0, Math.max(0, imgH - side), 0));
  return { x, y, side };
}
