"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { useKnobs } from "@/lib/quality";
import { useEffect, useMemo, useRef } from "react";
import { BufferGeometry, Float32BufferAttribute, type MeshStandardMaterial } from "three";
import { EDGES, GROUND_LIFT, PATH_LIFT, edgeOf, groundBase, groundColor, groundKind, groundPolygon } from "@/lib/ground";
import { areaSurface, edgeTris, pathSurface, type Tris } from "@/lib/groundGeo";
import { FLOORS } from "@/lib/materials";
import { useStore } from "@/lib/store";
import { tiledTexture } from "@/lib/textures";
import type { GroundArea, GroundPath } from "@/lib/types";
import { useReducedMotion } from "./motion";
import { useWetSurface } from "./useWet";

const BASIN = "#1c3a47"; // the dark floor of a pond, seen through its water
const BASIN_LIFT = 0.006;
const MAX_BIAS = 40; // stacked areas win by polygon offset, never by height: no gap for items to sink into

function geometryOf(t: Tris): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(t.pos, 3));
  if (t.uv.length) g.setAttribute("uv", new Float32BufferAttribute(t.uv, 2));
  g.computeVertexNormals(); // not indexed: flat normals, every top face up
  return g;
}

/** One garden area or path: the flat textured surface just above the ground, a rim (kerb, sleeper ...) when it has one, a dark basin under pond water. */
function GroundShape({ g, rank, base }: { g: GroundArea | GroundPath; rank: number; base: number }) {
  const path = "points" in g;
  const kind = groundKind(g);
  const def = FLOORS[kind];
  const water = kind === "water";
  const color = groundColor(g);
  const edge = edgeOf(g);
  const shapeKey = JSON.stringify("points" in g ? [g.points, g.width] : [g.x, g.y, g.w, g.h, g.rot ?? 0]);

  const top = useMemo(() => geometryOf("points" in g ? pathSurface(g, def.tileM) : areaSurface(g, def.tileM)), [shapeKey, def.tileM, path]); // keyed by the shape digest, so a recolour does not rebuild
  const rim = useMemo(() => (edge === "none" ? null : geometryOf(edgeTris(groundPolygon(g), EDGES[edge]))), [shapeKey, edge]);
  useEffect(() => () => top.dispose(), [top]);
  useEffect(() => () => rim?.dispose(), [rim]);

  const tex = useMemo(() => tiledTexture(kind, def.tileM, def.tileM), [kind, def.tileM]);
  useEffect(() => () => tex.dispose(), [tex]);
  const mat = useRef<MeshStandardMaterial>(null);
  useWetSurface(mat, color, def.rough, Math.min(0.3, def.rough), 0.3, !water);

  // pond water drifts slowly (a still surface when the user prefers reduced motion)
  const still = useReducedMotion();
  const { ambient } = useKnobs();
  useFrame(({ clock }) => {
    if (!water || still || !ambient) return;
    const t = clock.elapsedTime;
    tex.offset.set(t * 0.012, Math.sin(t * 0.35) * 0.03);
    keepAlive(false);
  });

  const bias = -Math.min(rank + 1, MAX_BIAS);
  const lift = path ? PATH_LIFT : GROUND_LIFT;
  return (
    <group position-y={base}>
      {water && (
        <mesh geometry={top} position-y={BASIN_LIFT} receiveShadow raycast={() => null}>
          <meshStandardMaterial color={BASIN} roughness={0.9} polygonOffset polygonOffsetFactor={bias} polygonOffsetUnits={bias} />
        </mesh>
      )}
      <mesh geometry={top} position-y={water ? lift + 0.004 : lift} receiveShadow raycast={() => null}>
        <meshStandardMaterial
          ref={mat}
          map={tex}
          color={color}
          roughness={def.rough}
          metalness={def.metal}
          transparent={water}
          opacity={water ? 0.78 : 1}
          polygonOffset
          polygonOffsetFactor={bias}
          polygonOffsetUnits={bias}
        />
      </mesh>
      {rim && (
        <mesh geometry={rim} castShadow receiveShadow raycast={() => null}>
          <meshStandardMaterial color={EDGES[edge].color} roughness={0.85} />
        </mesh>
      )}
    </group>
  );
}

/** The patios, lawns, drives, ponds and paths of the garden. Not rooms: no walls, no roof, flat on the ground in both the studio and the garden. */
export default function GroundAreas() {
  const plan = useStore((s) => s.plan);
  const { ground, paths } = plan;
  if (!ground?.length && !paths?.length) return null;
  return (
    <group>
      {ground?.map((a, i) => <GroundShape key={a.id} g={a} rank={i} base={groundBase(plan, a)} />)}
      {paths?.map((p, i) => <GroundShape key={p.id} g={p} rank={i} base={groundBase(plan, p)} />)}
    </group>
  );
}
