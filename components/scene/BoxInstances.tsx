"use client";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, MeshStandardMaterial, Object3D, type InstancedMesh } from "three";

export type BoxSpec = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; rx?: number };

let unit: BoxGeometry | null = null;
const unitBox = () => (unit ??= new BoxGeometry(1, 1, 1));
const dummy = new Object3D();

/** Many boxes of one colour in a single draw call. Static decoration: never picked. */
export default function BoxInstances({ boxes, color, roughness = 0.9, metalness = 0, shadow = true }: { boxes: BoxSpec[]; color: string; roughness?: number; metalness?: number; shadow?: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useMemo(() => new MeshStandardMaterial({ color, roughness, metalness }), [color, roughness, metalness]);
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    boxes.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(b.rx ?? 0, b.ry ?? 0, 0);
      dummy.scale.set(b.sx, b.sy, b.sz);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [boxes]);
  if (!boxes.length) return null;
  return <instancedMesh key={boxes.length} ref={mesh} args={[unitBox(), material, boxes.length]} castShadow={shadow} receiveShadow raycast={() => null} frustumCulled={false} />;
}
