"use client";
import { useEffect, useMemo, useRef } from "react";
import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Object3D, PlaneGeometry, ShaderMaterial } from "three";
import { CATALOG } from "@/lib/catalog";
import { elevationOf, floorY } from "@/lib/levels";
import { useKnobs } from "@/lib/quality";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";

const DEG = Math.PI / 180;
const PAD = 0.14; // how far the soft shadow reaches past the footprint (m)
const LIFT = 0.006; // above the floor: clear of z-fighting, still under the rugs
const STRENGTH = 0.5;
const MIN_H = 0.05; // flat things (rugs, mats) cast no contact shadow

/**
 * Rounded rectangle falloff in metres: opaque under the footprint, fading to nothing `pad` further out. One draw call for every instance; the instance
 * attribute `aSize` holds the footprint (w, d) and the instance matrix scales the plane by that plus the pad. Also draws the Studio floor's footprint halo.
 */
export function haloMaterial(pad: number, strength: number): ShaderMaterial {
  const vertexShader = /* glsl */ `
attribute vec2 aSize;
varying vec2 vP;
varying vec2 vHalf;
void main() {
  vHalf = aSize * 0.5;
  vP = (uv - 0.5) * (aSize + 2.0 * ${pad.toFixed(3)});
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
  const fragmentShader = /* glsl */ `
varying vec2 vP;
varying vec2 vHalf;
void main() {
  float r = min(min(vHalf.x, vHalf.y), 0.3);
  vec2 q = abs(vP) - vHalf + r;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  float a = 1.0 - smoothstep(-0.04, ${pad.toFixed(3)}, d);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * ${strength.toFixed(3)});
}`;
  return new ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

/** Items that rest on the floor and are tall enough to matter. */
const restsOnFloor = (item: Item): boolean => {
  const def = CATALOG[item.kind];
  return !!def && !def.wall && !def.critter && !def.stair && !def.model && (item.elev ?? 0) < 0.02 && item.h >= MIN_H;
};

/** Soft dark halo under every item standing on the floor of one level (cheap stand-in for a shadow-casting light; the screen-space AO does the corners).
 *  Lives inside the level group, so it lifts and sinks with its storey. Off below the Balanced tier. */
export default function ContactShadows({ levelId, items }: { levelId: string; items: Item[] }) {
  const on = useKnobs().contactShadows;
  const plan = useStore((s) => s.plan);
  const list = useMemo(() => items.filter(restsOnFloor), [items]);
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const material = useMemo(() => haloMaterial(PAD, STRENGTH), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    const size = new Float32Array(list.length * 2);
    const base = elevationOf(plan, levelId);
    list.forEach((it, i) => {
      o.position.set(it.x, floorY(plan, it) - base + LIFT, it.y);
      o.rotation.set(0, -it.rot * DEG, 0);
      o.scale.set(it.w + 2 * PAD, 1, it.d + 2 * PAD);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      size[i * 2] = it.w;
      size[i * 2 + 1] = it.d;
    });
    m.geometry.setAttribute("aSize", new InstancedBufferAttribute(size, 2));
    m.count = list.length;
    m.instanceMatrix.needsUpdate = true;
  }, [on, list, plan, levelId]);

  if (!on || list.length === 0) return null;
  // key: the instance buffer is allocated once per count
  return <instancedMesh key={list.length} ref={mesh} args={[geometry, material, list.length]} frustumCulled={false} renderOrder={1} raycast={() => null} instanceMatrix-usage={DynamicDrawUsage} />;
}
