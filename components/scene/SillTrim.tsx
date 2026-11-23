"use client";
import { useEffect, useMemo } from "react";
import { SILL_IN, SILL_OUT, mergeMeshData, sweepProfile } from "@/lib/shellDetail";
import { STONE, barMat } from "./openingParts";
import { toGeometry } from "./shellGeometry";

const EMBED = 0.03; // how far a sill runs back into the wall, so no gap shows at the face

/**
 * The two window sills of a window `w` wide whose glass bottom is `sill` above the floor, in the wall's frame (local +z is the outer side, as OpeningMesh draws them):
 * a stone sill outside with a sloped top and a drip groove, a painted board with a rounded nose inside.
 */
export default function SillTrim({ w, sill, thick, inner }: { w: number; sill: number; thick: number; inner: string }) {
  const [outside, inside] = useMemo(() => {
    const ow = w + 0.1;
    const iw = w + 0.12;
    const out = sweepProfile(SILL_OUT, 0, ow, 0, 0, { o: [-ow / 2, sill - 0.045, thick / 2 - EMBED], s: [1, 0, 0], d: [0, 0, 1], z: [0, 1, 0] });
    const inn = sweepProfile(SILL_IN, 0, iw, 0, 0, { o: [-iw / 2, sill - 0.034, -thick / 2 + EMBED], s: [1, 0, 0], d: [0, 0, -1], z: [0, 1, 0] });
    return [toGeometry(mergeMeshData([out])), toGeometry(mergeMeshData([inn]))];
  }, [w, sill, thick]);
  useEffect(() => () => { outside.dispose(); inside.dispose(); }, [outside, inside]);
  return (
    <>
      <mesh geometry={outside} material={barMat(STONE)} castShadow receiveShadow />
      <mesh geometry={inside} material={barMat(inner)} castShadow receiveShadow />
    </>
  );
}
