"use client";
import { useEffect, useMemo } from "react";
import { buildVegetation, levelOfFoliage, speciesDef, VARIANTS, type Species } from "@/lib/vegetation";
import { useKnobs } from "@/lib/quality";
import { makeFoliageMaterials } from "./foliageMaterial";

/**
 * A catalog plant: the organic mesh of `species`, stretched to the part's size [w, h, d] (metres) and recoloured by the item's finish.
 * The mesh stands on y = 0 of the part box; `seed` picks the variant and the wind phase.
 */
export default function FoliagePart({ species, seed = 0, size, position, tint, castShadow = true }: { species: Species; seed?: number; size: [number, number, number]; position?: [number, number, number]; tint?: string; castShadow?: boolean }) {
  const k = useKnobs();
  const level = levelOfFoliage(k.foliage);
  const lod = k.cheapPlants ? 1 : 0;
  const geo = useMemo(() => buildVegetation(species, Math.abs(Math.floor(seed)) % VARIANTS, lod, level), [species, seed, lod, level]);
  const mats = useMemo(() => makeFoliageMaterials(), []);
  const nat = speciesDef(species).size;
  useMemo(() => mats.rand.set((((seed * 0.6180339) % 1) + 1) % 1, (((seed * 0.7548776) % 1) + 1) % 1, 0.5, (((seed * 0.5698402) % 1) + 1) % 1), [mats, seed]);
  useEffect(() => {
    mats.tint.set(tint ?? "#ffffff");
  }, [mats, tint]);
  useEffect(() => () => void (mats.main.dispose(), mats.depth.dispose()), [mats]);
  return <mesh geometry={geo} material={mats.main} customDepthMaterial={mats.depth} position={position} scale={[size[0] / nat[0], size[1] / nat[1], size[2] / nat[2]]} castShadow={castShadow} receiveShadow dispose={null} />;
}
