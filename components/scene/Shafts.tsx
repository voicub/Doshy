"use client";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, type MeshBasicMaterial } from "three";
import { glowTexture } from "@/lib/textures";
import { useKnobs } from "@/lib/quality";
import { live } from "./skyLive";

const ELEVATION = 32 * (Math.PI / 180); // slant of the beams below horizontal
const SHEET_GAP = 0.3; // metres between parallel sheets
const GLOW_SHARE = 0.5; // strength lit lamps contribute next to the sun's own
const MAX_OPACITY = 0.2;
const PATCH_OPACITY = 0.32;
const FADE_V = [0, 0.18, 0.82, 1]; // across the window: soft edges
const FADE_U = [1, 0.55, 0]; // along the beam: bright at the glass, gone at the floor
const WARM = new Color("#ffc98a");

/** A fan of vertical sheets from the window rectangle down to the floor, vertex-coloured so the edges fade. Window-local: x along wall, y up, +z into the room. */
function shaftGeometry(w: number, sill: number, top: number) {
  const tan = Math.tan(ELEVATION);
  const zSill = sill / tan;
  const zTop = top / tan;
  const sheets = Math.max(2, Math.round(w / SHEET_GAP));
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let s = 0; s < sheets; s++) {
    const x = -w / 2 + ((s + 0.5) * w) / sheets;
    const amp = 0.55 + 0.45 * Math.abs(Math.sin(s * 12.9898)); // deterministic per-sheet variation
    const base = pos.length / 3;
    for (let ui = 0; ui < FADE_U.length; ui++) {
      const u = ui / (FADE_U.length - 1);
      const lo: [number, number] = [sill * (1 - u), zSill * u]; // [y, z] on the lower edge
      const hi: [number, number] = [top * (1 - u), zTop * u];
      for (const v of FADE_V) {
        pos.push(x, lo[0] + (hi[0] - lo[0]) * v, lo[1] + (hi[1] - lo[1]) * v);
        const k = FADE_U[ui] * (v === 0 || v === 1 ? 0 : 1) * amp;
        col.push(WARM.r * k, WARM.g * k, WARM.b * k);
      }
    }
    const cols = FADE_V.length;
    for (let ui = 0; ui < FADE_U.length - 1; ui++) {
      for (let vi = 0; vi < cols - 1; vi++) {
        const a = base + ui * cols + vi;
        idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return { geometry: g, patchZ: (zSill + zTop) / 2, patchLen: zTop - zSill };
}

const noRaycast = () => null;

/** Light shafts + sun patch for a glazed opening. Strength follows the window glow (lit lamps) and the live sun (dimmed by cloud). */
export default function Shafts(props: ShaftProps) {
  return useKnobs().ambient ? <ShaftBeams {...props} /> : null; // calm tiers draw no sunbeams
}

type ShaftProps = { w: number; sill: number; top: number; glow: MutableRefObject<number>; cutaway: boolean };

function ShaftBeams({ w, sill, top, glow, cutaway }: ShaftProps) {
  const { geometry, patchZ, patchLen } = useMemo(() => shaftGeometry(w, sill, top), [w, sill, top]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const beams = useRef<MeshBasicMaterial>(null);
  const patch = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const strength = Math.max(glow.current * GLOW_SHARE, live.look.shaft);
    if (beams.current) beams.current.opacity = cutaway ? 0 : strength * MAX_OPACITY; // beams would hang in mid-air over the low walls
    if (patch.current) patch.current.opacity = strength * PATCH_OPACITY;
  });
  return (
    <group>
      <mesh geometry={geometry} raycast={noRaycast} renderOrder={3} frustumCulled={false}>
        <meshBasicMaterial ref={beams} vertexColors transparent opacity={0} depthWrite={false} blending={AdditiveBlending} side={2} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.075, patchZ]} raycast={noRaycast} renderOrder={3}>
        <planeGeometry args={[w * 1.15, patchLen * 1.2 + 0.4]} />
        <meshBasicMaterial ref={patch} map={glowTexture()} color={WARM} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  );
}
