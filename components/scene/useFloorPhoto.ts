import { useEffect, useMemo, useState } from "react";
import { Vector2 } from "three";
import type { FloorPhoto } from "@/lib/floorPhoto";
import { useKnobs } from "@/lib/quality";
import { acquireFloorPhoto, type PhotoMaps } from "./floorPhotoTextures";
import type { SurfaceProps } from "./shellMaterials";

/** What a room's floor photo gives its floor: the colour to draw while (or instead of) the picture, and the picture's material props once Balanced and above have it. */
export type FloorLook = {
  /** The photo's average colour: all Eco and Light draw, and what shows while the picture loads. */
  color: string;
  /** Metres one repeat covers, and the turn in degrees. */
  tile: number;
  rotation: number;
  /** Material props with the texture maps; null at Eco and Light, and until the picture has loaded. */
  props: SurfaceProps | null;
};

const FLAT_RELIEF = new Vector2(1, 1);

/**
 * The look of a room's floor photo, or null when the room has none. Eco and Light (no textures in the tier) get the average colour only and never fetch the picture;
 * Balanced and above load it lazily and in slices (components/scene/floorPhotoTextures.ts), sharing one set between rooms, with a normal map at Detailed and Ultra. The
 * texture size follows the tier like every other material.
 */
export function useFloorPhoto(photo: FloorPhoto | undefined): FloorLook | null {
  const { textures, textureSize } = useKnobs();
  const id = photo && textures > 0 ? photo.resourceId : null;
  const normal = textures === 2;
  const key = id ? `${id}|${textureSize}|${normal}` : null;
  const [loaded, setLoaded] = useState<{ key: string; maps: PhotoMaps } | null>(null);

  useEffect(() => {
    if (!id || !key) return;
    let live = true;
    const release = acquireFloorPhoto(id, textureSize, normal, (maps) => live && setLoaded({ key, maps }));
    return () => {
      live = false;
      release();
    };
  }, [id, key, textureSize, normal]);

  const maps = loaded && loaded.key === key ? loaded.maps : null; // a set made for another tier or picture is never shown
  const props = useMemo<SurfaceProps | null>(
    () => (maps ? { map: maps.map, roughness: maps.roughness, ...(maps.normalMap ? { normalMap: maps.normalMap, normalScale: FLAT_RELIEF } : {}) } : null),
    [maps],
  );
  const color = photo?.avg;
  const tile = photo?.scaleM;
  const rotation = photo?.rotation;
  return useMemo(() => (color && tile && rotation !== undefined ? { color, tile, rotation, props } : null), [color, tile, rotation, props]);
}
