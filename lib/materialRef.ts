// A reference from the plan to a stored PBR texture (a resource of kind "material", lib/polyhavenMaterial.ts, usually from Poly Haven): which texture, how wide
// one repeat is in real life, its turn, and its average colour (what Eco and Light draw instead of the picture). The same shape as a floor photo
// (lib/floorPhoto.ts) on purpose, so the plan, the plan file and the renderers treat them alike. Used by `room.floorMaterial`, `wall.material` / `wall.materialB`,
// `ground area.material` and `path.material`. Pure; the node test runner loads it directly (.ts imports).
import { isRecord } from "./guards.ts";

export type MaterialRef = { resourceId: string; scaleM: number; rotation: number; avg: string };

/** Metres one repeat covers: Poly Haven textures run from a 20 cm tile to 30 m of aerial ground. */
export const MATERIAL_SCALE_M = { min: 0.05, max: 30, fallback: 1 } as const;
export const MATERIAL_DEFAULT_AVG = "#b4b4b4";

/** The id `keepAsResource` (lib/polyhavenClient.ts) gives a stored texture: "mat-" and the first 24 hex digits of the SHA-256 of its bytes. */
export const MATERIAL_ID_RE = /^mat-[0-9a-f]{24}$/;
const HEX = /^#[0-9a-f]{6}$/i;

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** A material reference read from anywhere (storage, the database, a file): numbers are clamped, the turn is normalised to (-180, 180], an unusable one is undefined. */
export function sanitizeMaterialRef(v: unknown): MaterialRef | undefined {
  if (!isRecord(v) || typeof v.resourceId !== "string" || !MATERIAL_ID_RE.test(v.resourceId)) return undefined;
  const turn = clamp(v.rotation, -1e6, 1e6, 0);
  const rotation = ((((turn + 180) % 360) + 360) % 360) - 180 || 0;
  return {
    resourceId: v.resourceId,
    scaleM: clamp(v.scaleM, MATERIAL_SCALE_M.min, MATERIAL_SCALE_M.max, MATERIAL_SCALE_M.fallback),
    rotation: rotation === -180 ? 180 : rotation,
    avg: typeof v.avg === "string" && HEX.test(v.avg) ? v.avg.toLowerCase() : MATERIAL_DEFAULT_AVG,
  };
}
