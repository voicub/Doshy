"use client";
import { useEffect, useMemo } from "react";
import { Color } from "three";
import { openingSpans, wallTrims, type TrimFaces } from "@/lib/shellDetail";
import type { Opening } from "@/lib/types";
import { toGeometry } from "./shellGeometry";
import { flatMaterial } from "./shellMaterials";

const PAINT = "#f1eee8";
const NO_RAYCAST = () => null;

/** The tint darkened by `k` (a stand-in for a base course painted a deeper shade than its wall). */
const deeper = (hex: string, k: number) => `#${new Color(hex).multiplyScalar(k).getHexString()}`;

/**
 * The painted trim of one wall in a single draw call per kind: skirting boards and crown moulding on the faces that look into a room, door and window
 * casings on both faces, and a dark base course on the outside of a ground-floor wall. Built once when the wall, its openings or the cut-away change.
 * lib/shellDetail's wallTrims lays them out in the wall's own frame (origin at the wall's middle), so the meshes go in place unmoved.
 */
export default function WallTrims({ openings, len, t, height, top, faces, ground, detail, outsideTint }: { openings: readonly Opening[]; len: number; t: number; height: number; top: number; faces: TrimFaces; ground: boolean; detail: number; outsideTint: string }) {
  const crown = detail >= 2 && top >= height && height >= 2.2;
  const geo = useMemo(() => {
    const { paint, base } = wallTrims({ len, t, height, top, spans: openingSpans(openings, len, top), faces, ground, crown });
    return { paint: paint && toGeometry(paint), base: base && toGeometry(base) };
  }, [openings, len, t, height, top, faces, ground, crown]);
  useEffect(() => () => { geo.paint?.dispose(); geo.base?.dispose(); }, [geo]);
  return (
    <>
      {geo.paint && <mesh geometry={geo.paint} material={flatMaterial(PAINT)} receiveShadow raycast={NO_RAYCAST} />}
      {geo.base && <mesh geometry={geo.base} material={flatMaterial(deeper(outsideTint, 0.62), 0.9)} castShadow receiveShadow raycast={NO_RAYCAST} />}
    </>
  );
}
