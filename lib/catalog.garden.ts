import type { Def } from "./catalog";
import { FEATURES } from "./garden/features.ts";
import { FURNITURE } from "./garden/furniture.ts";
import { LIGHTS } from "./garden/lights.ts";
import { PLAY } from "./garden/play.ts";
import { RAILINGS } from "./garden/railings.ts";

// Garden furniture, play, structures and garden/LED lighting (bush lights, path lights, string lights, swings, tables ...). Ids start with "gd_".
export const GARDEN: Record<string, Def> = { ...LIGHTS, ...FURNITURE, ...PLAY, ...FEATURES, ...RAILINGS };
