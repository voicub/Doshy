"use client";
import { useEffect, useMemo } from "react";
import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
import { useStore } from "@/lib/store";

const SPAN = 100; // metres covered by the plate: 40+ m of ground around the building, where cars and garden items stand
const PX_PER_M = 26;
const SHADOW_OPACITY = 0.6;
const POOL_R = 15; // metres where the light pool has faded out

/** Dark graphite plate: soft radial pool of light, faint 1 m / 5 m measured grid, falls off to black at the edges. */
function plateTexture() {
  const size = SPAN * PX_PER_M;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const mid = size / 2;
  const radial = (r: number, stops: [number, string][]) => {
    const grad = g.createRadialGradient(mid, mid, 0, mid, mid, r * PX_PER_M);
    for (const [at, col] of stops) grad.addColorStop(at, col);
    return grad;
  };
  g.fillStyle = radial(POOL_R, [[0, "#2c333c"], [0.35, "#1b2027"], [1, "#0b0d11"]]);
  g.fillRect(0, 0, size, size);
  g.lineWidth = 1;
  for (let m = 0; m <= SPAN; m++) {
    const major = m % 5 === 0;
    g.strokeStyle = major ? "rgba(170,205,225,0.16)" : "rgba(170,205,225,0.065)";
    g.lineWidth = major ? 2 : 1;
    const p = m * PX_PER_M + (major ? 0 : 0.5); // odd widths centre on a pixel
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, size);
    g.moveTo(0, p);
    g.lineTo(size, p);
    g.stroke();
  }
  g.fillStyle = radial(SPAN / 2, [[0, "rgba(0,0,0,0)"], [0.38, "rgba(0,0,0,0.25)"], [0.8, "rgba(0,0,0,1)"], [1, "rgba(0,0,0,1)"]]);
  g.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 16;
  tex.minFilter = LinearMipmapLinearFilter;
  return tex;
}

export default function StudioFloor({ cx, cz }: { cx: number; cz: number }) {
  const tex = useMemo(plateTexture, []);
  useEffect(() => () => tex.dispose(), [tex]);
  const setFocusRoom = useStore((s) => s.setFocusRoom);
  // Unlit plate (interior lamps must not bleed onto the ground through walls) plus a shadow-only layer for the sun.
  // Snapped to whole metres so the grid lines sit on world integers.
  const at: [number, number, number] = [Math.round(cx), -0.002, Math.round(cz)];
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={at}>
      <mesh onDoubleClick={() => setFocusRoom(null)}>
        <planeGeometry args={[SPAN, SPAN]} />
        <meshBasicMaterial map={tex} toneMapped />
      </mesh>
      <mesh position={[0, 0, 0.001]} receiveShadow raycast={() => null}>
        <planeGeometry args={[SPAN, SPAN]} />
        <shadowMaterial transparent opacity={SHADOW_OPACITY} />
      </mesh>
    </group>
  );
}
