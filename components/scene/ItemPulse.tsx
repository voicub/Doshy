"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { useEffect, useRef, useState } from "react";
import type { Mesh, MeshBasicMaterial } from "three";
import { useStore } from "@/lib/store";
import { BoxEdges, CYAN, boxOf } from "./edit/Outlines";
import { useItemFocus } from "./itemFocus";
import { useReducedMotion } from "./motion";

const PING_S = 1.3; // seconds per expanding ring
const PINGS = 2;
const REDUCED_S = 1.6; // with reduced motion: a still outline for this long
const BEAM_H = 2.6; // m

/** An outline of the item (drawn through walls and furniture), a thin beam up from it and a ring at its foot (spreading out for a pulse): visible for a 4 cm sensor too. */
function Ping({ id, steady }: { id: string; steady: boolean }) {
  const plan = useStore((s) => s.plan);
  const reduced = useReducedMotion();
  const ring = useRef<Mesh>(null);
  const t0 = useRef<number | null>(null);
  const [done, setDone] = useState(false);
  const box = boxOf(plan, { type: "item", id });
  const still = steady || reduced;
  useEffect(() => {
    if (steady) return;
    const t = setTimeout(() => setDone(true), (reduced ? REDUCED_S : PING_S * PINGS) * 1000);
    return () => clearTimeout(t);
  }, [steady, reduced]);
  useFrame(({ clock }) => {
    const m = ring.current;
    if (!m || still) return;
    t0.current ??= clock.elapsedTime;
    const u = ((clock.elapsedTime - t0.current) / PING_S) % 1;
    m.scale.setScalar(0.5 + u * 1.5);
    (m.material as MeshBasicMaterial).opacity = 0.8 * (1 - u);
    keepAlive(false);
  });
  if (!box || done) return null;
  const r = Math.max(box.w, box.d, 0.3) / 2 + 0.05;
  return (
    <>
      <BoxEdges box={box} color={CYAN} opacity={steady ? 0.9 : 1} />
      <mesh position={[box.x, box.lv + BEAM_H / 2, box.z]} renderOrder={31}>
        <cylinderGeometry args={[0.02, 0.02, BEAM_H, 6]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.95} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[box.x, box.lv + 0.09, box.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={31}>
        <ringGeometry args={[r * 0.92, r, 48]} />
        <meshBasicMaterial color={CYAN} transparent opacity={still ? 0.8 : 0} depthTest={false} toneMapped={false} />
      </mesh>
    </>
  );
}

/** The 3D answer to a list row (room device sheet, items in this room): `hover` keeps an outline on the item, `pulse` pings it once. */
export default function ItemPulse() {
  const hover = useItemFocus((s) => s.hover);
  const pulse = useItemFocus((s) => s.pulse);
  return (
    <>
      {hover && <Ping key={`h${hover}`} id={hover} steady />}
      {pulse && <Ping key={`p${pulse.n}`} id={pulse.id} steady={false} />}
    </>
  );
}
