"use client";
import { useEffect, useState } from "react";
import type { CanvasTexture } from "three";
import type { PlateMount } from "@/lib/carSurf";
import { applyPlateFit, type PlateFit } from "@/lib/plateFit";
import { plateSize, type PlateStyle } from "@/lib/plate";
import { AWAY_OPACITY } from "./carMaterials";
import { acquirePlate, releasePlate } from "./plateTexture";

const PLATE_T = 0.006;
const FRAME = 0.012; // m: width of the outline drawn round a plate being adjusted
const FRAME_COLOUR = "#5ad7ff";

/** The outline of the plate being adjusted: four thin strips just proud of its face, drawn over the car so a plate sunk into the body is still found. */
function Outline({ w, h }: { w: number; h: number }) {
  const z = PLATE_T / 2 + 0.004;
  const strips: [number, number, number, number][] = [
    [0, (h + FRAME) / 2, w + 2 * FRAME, FRAME],
    [0, -(h + FRAME) / 2, w + 2 * FRAME, FRAME],
    [(w + FRAME) / 2, 0, FRAME, h],
    [-(w + FRAME) / 2, 0, FRAME, h],
  ];
  return (
    <>
      {strips.map(([x, y, sw, sh]) => (
        <mesh key={`${x}${y}`} position={[x, y, z]} renderOrder={20} raycast={() => null}>
          <planeGeometry args={[sw, sh]} />
          <meshBasicMaterial color={FRAME_COLOUR} depthTest={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/**
 * One number plate: a 6 mm box in the car's frame carrying the cached picture of the plate (built-in cars and real models share it). `mount` is the
 * automatic place; `fit` (lib/plateFit.ts) is the owner's nudge from it, applied as one cheap transform: no geometry or texture is rebuilt by moving it.
 */
export default function CarPlate({ mount, fit, outline, text, style, ghost }: { mount: PlateMount; fit?: PlateFit; outline?: boolean; text: string; style: PlateStyle; ghost: boolean }) {
  const [tex, setTex] = useState<CanvasTexture | null>(null);
  const placed = applyPlateFit(mount, fit);
  const { hidden } = placed;
  useEffect(() => {
    if (hidden) return;
    setTex(acquirePlate(text, style, mount.end));
    return () => releasePlate(text, style, mount.end);
  }, [text, style, mount.end, hidden]);
  if (hidden) return null;
  const [w, h] = plateSize(style, mount.end);
  return (
    <mesh position={placed.p} rotation={placed.rot} scale={[placed.scale, placed.scale, 1]} receiveShadow>
      <boxGeometry args={[w, h, PLATE_T]} />
      {/* keyed: three only recompiles a material's shader when its needsUpdate is set, so a picture that arrives after the first draw would never show; a fresh material is built with it. The offset pulls the face toward the camera so a plate laid on a baked-in one does not flicker */}
      <meshStandardMaterial key={tex ? "picture" : "blank"} map={tex} color={tex ? "#ffffff" : "#e6e6e2"} roughness={0.45} metalness={0} transparent={ghost} opacity={ghost ? AWAY_OPACITY : 1} depthWrite={!ghost} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      {outline && <Outline w={w} h={h} />}
    </mesh>
  );
}
