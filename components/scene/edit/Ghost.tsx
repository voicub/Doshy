"use client";
import { CATALOG } from "@/lib/catalog";
import { itemExtent } from "@/lib/editMath";
import { WALL_CUT_H } from "@/lib/geometry";
import { floorY } from "@/lib/levels";
import { useStore } from "@/lib/store";
import { BoxEdges, CYAN, Plate, WARN } from "./Outlines";
import { useEditUi } from "./editStore";

const DEG = Math.PI / 180;
const GHOST_OPACITY = 0.42;

/** Translucent copy of the catalog item following the cursor: cyan where it fits, red-orange where the cursor itself is blocked. */
export default function Ghost() {
  const g = useEditUi((s) => s.ghost);
  // the surface under the cursor: the level floor, or the ground outside a raised building
  const lv = useStore((s) => (g ? floorY(s.plan, { level: s.activeLevel, x: g.x, y: g.y, kind: g.kind, elev: g.elev }) : 0));
  const def = g && CATALOG[g.kind];
  if (!g || !def) return null;
  const color = g.blocked ? WARN : CYAN;
  const { y0, y1 } = itemExtent(def, { h: def.h, elev: g.elev }, def.solid ? WALL_CUT_H : undefined);
  const box = { x: g.x, z: g.y, y0: y0 + lv, y1: y1 + lv, lv, w: def.w, d: def.d, rot: g.rot };
  return (
    <>
      <group position={[g.x, lv + (g.elev ?? 0), g.y]} rotation={[0, -g.rot * DEG, 0]}>
        {def.parts.map((p, i) => (
          <mesh key={i} position={p.p} rotation={p.r} scale={p.veg ? p.s : undefined} renderOrder={4}>
            {p.veg ? <sphereGeometry args={[0.5, 12, 10]} /> : p.shape === "cyl" ? <cylinderGeometry args={[p.s[0] / 2, p.s[0] / 2, p.s[1], 16]} /> : p.shape === "sph" ? <sphereGeometry args={[p.s[0] / 2, 12, 10]} /> : <boxGeometry args={p.s} />}
            <meshBasicMaterial color={color} transparent opacity={GHOST_OPACITY} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <BoxEdges box={box} color={color} />
      <Plate box={box} color={color} />
    </>
  );
}
