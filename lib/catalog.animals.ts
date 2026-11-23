import type { Def } from "./catalog";
import { BIRDS } from "./animals/birds.ts";
import { CAGES } from "./animals/cages.ts";
import { HOUSES } from "./animals/houses.ts";
import { MAMMALS } from "./animals/mammals.ts";

// Animals and pet houses (dogs, cats, chickens, farm animals, coops, kennels ...), with idle behaviour: see lib/critters.ts and components/scene/Critter.tsx.
// The living ones carry `Def.critter` (bones that move); houses, cages and the fish tank are plain parts.
export const ANIMALS: Record<string, Def> = { ...MAMMALS, ...BIRDS, ...CAGES, ...HOUSES };
