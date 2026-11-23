import { FLOORS, FLOOR_KINDS } from "./materials.ts";
import type { FloorKind } from "./types.ts";

export type { Swatch } from "./materials.ts";

/** Default floor tint per floor kind (new rooms and "change floor type" use it). The tints and the named paint colours live in lib/materials.ts. */
export const FLOOR_COLORS = Object.fromEntries(FLOOR_KINDS.map((k) => [k, FLOORS[k].color])) as Record<FloorKind, string>;
