"use client";
import { useEffect, useMemo, useRef } from "react";
import { PlaneGeometry, type MeshStandardMaterial } from "three";
import { groundGain, groundSurface, macroOf, scaleColor } from "@/lib/groundLook";
import { yearPalette } from "@/lib/seasonYear";
import { useKnobs } from "@/lib/quality";
import { useStore } from "@/lib/store";
import { mottleTexture, tiledTexture } from "@/lib/textures";
import { useSky } from "@/lib/useSky";
import { macroVariation } from "./groundMacro";
import { surfaceProps } from "./shellMaterials";
import { useWetSurface } from "./useWet";

const SIZE = 140; // metres: the lawn reaches far past the garden, so the horizon is never bare

/** A plane whose uvs count tiles of `tileM` metres: the textures of a surface kind are shared, so their repeat stays 1 and the geometry carries the scale. */
function metricPlane(size: number, tileM: number): PlaneGeometry {
  const g = new PlaneGeometry(size, size);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * size) / tileM, (uv.getY(i) * size) / tileM);
  return g;
}

/**
 * The garden's lawn. Balanced and up: a procedural lawn (blade-scale detail and relief, tonal patches inside the tile) with world-space patches on top so no repeat
 * shows; Eco and Light: the flat voxel texture with soft dark blobs. While the real surroundings show (`covered`) their ground replaces it (same lawn look near the
 * plan), so this plane only stays as the invisible catcher of a double click.
 */
export default function GardenGround({ cx, cz, covered }: { cx: number; cz: number; covered: boolean }) {
  const k = useKnobs();
  const surf = k.textures > 0 ? groundSurface("grass") : undefined;
  const tex = useMemo(() => (surf ? null : tiledTexture("grass", SIZE, SIZE)), [surf]);
  const mottle = useMemo(() => (surf ? null : mottleTexture(SIZE, SIZE)), [surf]);
  const maps = useMemo(() => (surf ? surfaceProps(surf, k, 1) : null), [surf, k]);
  const macro = useMemo(() => {
    const m = surf && macroOf("grass");
    return m ? macroVariation(m.tone, m.hue) : null;
  }, [surf]);
  const geometry = useMemo(() => (surf ? metricPlane(SIZE, surf.tile) : new PlaneGeometry(SIZE, SIZE)), [surf]);
  const setFocusRoom = useStore((s) => s.setFocusRoom);
  const pal = yearPalette(useSky().year);
  // the procedural map is brighter than the voxel one: scaled, the season's lawn colour keeps the brightness it always had
  const grass = scaleColor(pal.ground, surf ? groundGain("grass") : 1);
  const mott = pal.mottle;
  const mat = useRef<MeshStandardMaterial>(null);
  useWetSurface(mat, grass, maps?.roughness ?? 1, 0.5, 0.4);
  useEffect(() => () => tex?.dispose(), [tex]);
  useEffect(() => () => mottle?.dispose(), [mottle]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.002, cz]} receiveShadow onDoubleClick={() => setFocusRoom(null)}>
        <meshStandardMaterial key={maps ? "pbr" : "flat"} ref={mat} {...(maps ?? { map: tex, roughness: 1 })} {...macro} color={grass} visible={!covered} />
      </mesh>
      {mottle && !covered && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.004, cz]} renderOrder={1} raycast={() => null}>
          <planeGeometry args={[SIZE, SIZE]} />
          <meshBasicMaterial color={mott} alphaMap={mottle} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}
