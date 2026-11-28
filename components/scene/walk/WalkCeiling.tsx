"use client";
import { useMemo } from "react";
import { WALL_H } from "@/lib/geometry";
import { levelsOf } from "@/lib/levels";
import { roofForPlan } from "@/lib/roof";
import { isOpenAir } from "@/lib/stairs";
import { useStore } from "@/lib/store";

const THICKNESS = 0.1;
const CEILING = "#ebe8e1";

/**
 * A flat ceiling over every indoor room, for a walker in a home with no roof (an apartment): without it the sky shows through the top of the walls. One slab per room, drawn from
 * its storey's wall height up. A home with a roof has its own overhead, and a balcony or terrace has none.
 */
export default function WalkCeiling() {
  const plan = useStore((s) => s.plan);
  const slabs = useMemo(() => {
    if (roofForPlan({ ...plan, openings: [], items: [] })) return [];
    const levels = levelsOf(plan);
    return plan.rooms
      .filter((r) => !isOpenAir(r))
      .map((r) => ({ r, y: (levels.find((l) => l.id === r.level) ?? levels[0]).elevation + WALL_H - 0.01 + THICKNESS / 2 }));
  }, [plan]);
  return (
    <>
      {slabs.map(({ r, y }) => (
        <mesh key={r.id} position={[r.x + r.w / 2, y, r.y + r.h / 2]} castShadow receiveShadow raycast={() => null}>
          <boxGeometry args={[r.w, THICKNESS, r.h]} />
          <meshStandardMaterial color={CEILING} emissive={CEILING} emissiveIntensity={0.28} roughness={0.95} />
        </mesh>
      ))}
    </>
  );
}
