"use client";
import { useEffect, useMemo, useRef } from "react";
import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Object3D, PlaneGeometry } from "three";
import { PATH_LIFT } from "@/lib/ground";
import { onLevel, sortedLevels } from "@/lib/levels";
import { useKnobs } from "@/lib/quality";
import { buildingRects } from "@/lib/stairs";
import { useStore } from "@/lib/store";
import { STUDIO_FLOOR } from "@/lib/studioLook";
import { useThemeColors } from "@/lib/useThemeColors";
import { haloMaterial } from "./ContactShadows";

const LIFT = PATH_LIFT + 0.002; // above the garden's paths and patios, so the shadow also falls on them
const FOOT_MARGIN = 0.15; // the walls and the plinth stand this far outside the rooms (m)

/** A soft dark halo on the ground around the building: it sits on the floor instead of floating over it. One draw call (every roofed room of the lowest storey is one instance). */
export default function FootprintHalo() {
  const on = useKnobs().contactShadows;
  const plan = useStore((s) => s.plan);
  const rects = useMemo(() => buildingRects(onLevel(plan, sortedLevels(plan)[0].id).rooms, FOOT_MARGIN), [plan.rooms, plan.levels]);
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const studio = useStore((s) => s.environment) === "studio";
  const { haloStrength } = useThemeColors();
  const strength = studio ? haloStrength : STUDIO_FLOOR.halo.strength; // a light Studio floor wants a lighter shadow; the garden's ground is not themed
  const material = useMemo(() => haloMaterial(STUDIO_FLOOR.halo.pad, strength), [strength]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    const size = new Float32Array(rects.length * 2);
    rects.forEach((r, i) => {
      o.position.set(r.x + r.w / 2, LIFT, r.y + r.h / 2);
      o.scale.set(r.w + 2 * STUDIO_FLOOR.halo.pad, 1, r.h + 2 * STUDIO_FLOOR.halo.pad);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      size[i * 2] = r.w;
      size[i * 2 + 1] = r.h;
    });
    m.geometry.setAttribute("aSize", new InstancedBufferAttribute(size, 2));
    m.count = rects.length;
    m.instanceMatrix.needsUpdate = true;
  }, [on, rects]);

  if (!on || rects.length === 0) return null;
  // key: the instance buffer is allocated once per count
  return <instancedMesh key={rects.length} ref={mesh} args={[geometry, material, rects.length]} frustumCulled={false} renderOrder={1} raycast={() => null} instanceMatrix-usage={DynamicDrawUsage} />;
}
