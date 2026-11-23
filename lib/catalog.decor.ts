import type { Def } from "./catalog";
import { BATH } from "./decor/bath.ts";
import { BEDROOM } from "./decor/bedroom.ts";
import { FUN } from "./decor/fun.ts";
import { HOME } from "./decor/home.ts";
import { KITCHEN } from "./decor/kitchen.ts";
import { onSlab } from "./decor/kit.ts";
import { LIGHTS } from "./decor/lights.ts";
import { PLANTS } from "./decor/plants.ts";
import { SEATING } from "./decor/seating.ts";
import { STORAGE } from "./decor/storage.ts";
import { TABLES } from "./decor/tables.ts";
import { WALLS } from "./decor/walls.ts";

const FLAT = 0.05; // lib/placement.ts FLAT_MAX_H: pieces this low are placed as flat (rugs, mats, strips)

// Furniture, lighting and decoration for any style of home. Every id starts with "dc_".
// Pieces are built in lib/decor/*.ts (shared part helpers in lib/decor/kit.ts, conventions as in lib/catalog.home-office.ts).
const ALL: Record<string, Def> = { ...SEATING, ...TABLES, ...BEDROOM, ...STORAGE, ...KITCHEN, ...BATH, ...LIGHTS, ...WALLS, ...PLANTS, ...HOME, ...FUN };
// flat pieces lie on the floor slab instead of sinking into it
export const DECOR: Record<string, Def> = Object.fromEntries(Object.entries(ALL).map(([id, d]) => [id, d.h <= FLAT ? onSlab(d) : d]));
