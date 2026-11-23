"use client";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";
import { fovPolygon } from "@/lib/cameraFov";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";

const FLOOR_Y = 0.066; // just above the floor slab (RoomFloor's FLOOR_T = 0.06), below furniture
const CORE = [0.35, 0.85, 1].map((c) => c * 0.5); // colour at the camera ...
const EDGE = [0.35, 0.85, 1].map((c) => c * 0.05); // ... fading to this at the far edge

/** What a camera sees, drawn on the floor of its storey as a soft cyan fan stopped by walls. Shown while furnishing and linking, never in live view. */
export default function CameraFov({ item }: { item: Item }) {
  const show = useStore((s) => s.view === "furniture" || s.view === "ha");
  const walls = useStore((s) => s.plan.walls);
  const openings = useStore((s) => s.plan.openings);
  const levels = useStore((s) => s.plan.levels);
  const { fan, edge } = useMemo(() => {
    if (!show) return { fan: null, edge: null };
    const poly = fovPolygon({ walls, openings, rooms: [], items: [], levels }, item);
    const pos = poly.flatMap((p) => [p.x, FLOOR_Y, p.y]);
    const fan = new BufferGeometry();
    fan.setAttribute("position", new Float32BufferAttribute(pos, 3));
    fan.setAttribute("color", new Float32BufferAttribute(poly.flatMap((_, i) => (i === 0 ? CORE : EDGE)), 3));
    fan.setIndex(poly.slice(1, -1).flatMap((_, i) => [0, i + 1, i + 2]));
    const edge = new BufferGeometry();
    edge.setAttribute("position", new Float32BufferAttribute(pos, 3));
    return { fan, edge };
  }, [show, walls, openings, levels, item]);
  useEffect(() => () => (fan?.dispose(), edge?.dispose()), [fan, edge]);
  if (!fan || !edge) return null;
  return (
    <group renderOrder={2}>
      <mesh geometry={fan}>
        <meshBasicMaterial vertexColors transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      <lineLoop geometry={edge}>
        <lineBasicMaterial color="#5ad7ff" transparent opacity={0.5} depthWrite={false} toneMapped={false} />
      </lineLoop>
    </group>
  );
}
