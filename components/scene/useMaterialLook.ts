import { useEffect, useMemo, useState } from "react";
import { MeshStandardMaterial, Vector2 } from "three";
import { MATERIAL_ROUGHNESS, materialKey, materialPlan } from "@/lib/materialLook";
import type { MaterialRef } from "@/lib/materialRef";
import { useKnobs } from "@/lib/quality";
import { acquireMaterial, setMaterialKey, type MaterialTextures } from "./materialTextures";
import { flatMaterial, sharedMaterial, type SurfaceProps } from "./shellMaterials";
import type { FloorLook } from "./useFloorPhoto";

/** What a material reference gives a surface: a floor photo's look (colour while or instead of the picture, metres per repeat, turn, material props once loaded) and the loaded set's id. */
export type MaterialLook = FloorLook & { setId: number | null };

const FLAT_RELIEF = new Vector2(1, 1);

/** Which shader a look needs: a material whose maps differ from the one before it must be a new <meshStandardMaterial> (three does not recompile when a map appears), so surfaces put this in the element's `key`. */
export const lookKey = (look: Pick<FloorLook, "props"> | null): string => (!look ? "" : !look.props ? "flat" : `p${look.props.roughnessMap ? "r" : ""}${look.props.normalMap ? "n" : ""}`);

/**
 * The look of a PBR material reference (lib/materialRef.ts), or null when there is none. Eco and Light get its average colour only and never fetch the file; Balanced and
 * above load it lazily and in slices (components/scene/materialTextures.ts), sharing one set between every surface that wears it, with a normal map at Detailed and Ultra.
 * `props` is null until the set has loaded, so a surface draws the average colour in the meantime.
 */
export function useMaterialLook(ref: MaterialRef | undefined): MaterialLook | null {
  const { textures, textureSize } = useKnobs();
  const { fetch, size, normal } = materialPlan(textures, textureSize);
  const id = ref && fetch ? ref.resourceId : null;
  const key = id ? materialKey(id, size, normal) : null;
  const [loaded, setLoaded] = useState<{ key: string; set: MaterialTextures } | null>(null);

  useEffect(() => {
    if (!id || !key) return;
    let live = true;
    const release = acquireMaterial(id, size, normal, (set) => live && setLoaded({ key, set })); // the state change re-renders the scene, which draws the next frame
    return () => {
      live = false;
      release();
    };
  }, [id, key, size, normal]);

  const set = loaded && loaded.key === key ? loaded.set : null; // a set made for another tier or material is never shown
  const props = useMemo<SurfaceProps | null>(
    () =>
      set
        ? { map: set.map, roughness: set.roughnessMap ? 1 : MATERIAL_ROUGHNESS, ...(set.roughnessMap ? { roughnessMap: set.roughnessMap } : {}), ...(set.normalMap ? { normalMap: set.normalMap, normalScale: FLAT_RELIEF } : {}) }
        : null,
    [set],
  );
  const setId = set?.setId ?? null;
  const { avg: color, scaleM: tile, rotation } = ref ?? {};
  return useMemo(() => (color && tile && rotation !== undefined ? { color, tile, rotation, props, setId } : null), [color, tile, rotation, props, setId]);
}

/** The shared material of a wall face that wears `look`: one per loaded set, whatever the number of walls (the uvs are in metres, so no wall needs a texture of its own); the average colour while there is no set. */
export function materialFace(look: MaterialLook): MeshStandardMaterial {
  const { props, setId } = look;
  if (!props || setId === null) return flatMaterial(look.color, MATERIAL_ROUGHNESS);
  return sharedMaterial(setMaterialKey(setId), () => new MeshStandardMaterial({ color: "#ffffff", ...props })); // dropped with the set (materialTextures.ts)
}
