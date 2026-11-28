"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { useKnobs } from "@/lib/quality";
import { useEffect, useMemo, useRef } from "react";
import { BufferGeometry, Float32BufferAttribute, type MeshStandardMaterial } from "three";
import { EDGES, GROUND_LIFT, PATH_LIFT, edgeOf, groundBase, groundColor, groundKind, groundPolygon, marksOf, pavementOf } from "@/lib/ground";
import { areaSurface, edgeTris, fringeTris, pathSurface } from "@/lib/groundGeo";
import { FRINGE, groundGain, groundSurface, macroOf, scaleColor } from "@/lib/groundLook";
import { FLOORS } from "@/lib/materials";
import { stoneSlabs } from "@/lib/roadGeo";
import { useStore } from "@/lib/store";
import { tiledTexture } from "@/lib/textures";
import type { GroundArea, GroundPath, Pt } from "@/lib/types";
import { macroVariation } from "./groundMacro";
import RoadDetails, { trisGeometry } from "./RoadDetails";
import { useReducedMotion } from "./motion";
import { surfaceProps } from "./shellMaterials";
import { turnUvs } from "@/lib/materialLook";
import { lookKey, useMaterialLook } from "./useMaterialLook";
import { useWetSurface } from "./useWet";

const BASIN = "#1c3a47"; // the dark floor of a pond, seen through its water
const BASIN_LIFT = 0.006;
const MAX_BIAS = 40; // stacked areas win by polygon offset, never by height: no gap for items to sink into
const FRINGE_LIFT = 0.001; // over the surface's own height: the shade lies on whatever is next to it

/** The soft shade around a patio, path or pond (see fringeTris): black with a per-vertex opacity, so the ring needs no texture. */
function fringeGeometry(poly: Pt[]): BufferGeometry {
  const f = fringeTris(poly, FRINGE.width, FRINGE.edge);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(f.pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(f.alpha.flatMap((a) => [0, 0, 0, a]), 4));
  return g;
}

/**
 * One garden area or path: the flat textured surface just above the ground, a rim (kerb, sleeper ...) when it has one, a dark basin under pond water. A road adds its paint and
 * pavements (RoadDetails); a path of stepping stones draws just the stones, in the same material, with no continuous surface, fringe or rim.
 */
function GroundShape({ g, rank, base }: { g: GroundArea | GroundPath; rank: number; base: number }) {
  const path = "points" in g;
  const kind = groundKind(g);
  const def = FLOORS[kind];
  const water = kind === "water";
  const edge = edgeOf(g);
  const k = useKnobs();
  const look = useMaterialLook(g.material); // a Poly Haven texture instead of the kind's look (lib/materialRef.ts): untinted; its average colour at Eco and Light
  const surf = !look && k.textures > 0 ? groundSurface(kind) : undefined; // Eco keeps the cheap flat voxel texture
  const tileM = look?.tile ?? surf?.tile ?? def.tileM; // metres one tile covers: the uvs are in tiles, so a bigger tile is a bigger pattern, whatever the size of the area
  const color = look ? (look.props ? "#ffffff" : look.color) : surf ? scaleColor(groundColor(g), groundGain(kind)) : groundColor(g); // the procedural map is brighter than the voxel one: the tint is as bright as it always was
  const turn = look?.rotation ?? 0; // the area's own turn is already in its uvs; the material's is added on top
  const stones = "points" in g && g.stones === true;
  const shapeKey = JSON.stringify("points" in g ? [g.points, g.width, g.smooth ?? false, g.ends ?? "round", stones] : [g.x, g.y, g.w, g.h, g.rot ?? 0]);

  const top = useMemo(() => {
    const geo = trisGeometry("points" in g ? (g.stones ? stoneSlabs(g, tileM, k.detail >= 1 ? 3 : 1) : pathSurface(g, tileM)) : areaSurface(g, tileM));
    const uv = geo.getAttribute("uv")?.array;
    if (uv instanceof Float32Array) turnUvs(uv, turn);
    return geo;
  }, [shapeKey, tileM, path, k.detail, turn]); // keyed by the shape digest, so a recolour does not rebuild
  const rim = useMemo(() => (edge === "none" || stones ? null : trisGeometry(edgeTris(groundPolygon(g), EDGES[edge]))), [shapeKey, edge]);
  const fringe = useMemo(() => (k.detail >= 1 && !water && !stones ? fringeGeometry(groundPolygon(g)) : null), [shapeKey, k.detail, water]); // a pond keeps a crisp bank
  useEffect(() => () => top.dispose(), [top]);
  useEffect(() => () => rim?.dispose(), [rim]);
  useEffect(() => () => fringe?.dispose(), [fringe]);

  const tex = useMemo(() => (surf || look ? null : tiledTexture(kind, def.tileM, def.tileM)), [surf, !!look, kind, def.tileM]);
  useEffect(() => () => tex?.dispose(), [tex]);
  const maps = useMemo(() => (look ? (look.props ?? { roughness: def.rough }) : surf ? surfaceProps(surf, k, def.rough) : null), [look, surf, k, def.rough]);
  const macro = useMemo(() => {
    const m = surf && macroOf(kind);
    return m ? macroVariation(m.tone, m.hue) : null;
  }, [surf, kind]);
  const mat = useRef<MeshStandardMaterial>(null);
  useWetSurface(mat, color, maps?.roughness ?? def.rough, Math.min(0.3, def.rough), 0.3, !water);

  // pond water drifts slowly (a still surface when the user prefers reduced motion)
  const still = useReducedMotion();
  useFrame(({ clock }) => {
    if (!water || still || !k.ambient || look) return; // a Poly Haven texture is shared with every surface that wears it: it never drifts
    const t = clock.elapsedTime;
    const [x, y] = [t * 0.012, Math.sin(t * 0.35) * 0.03];
    tex?.offset.set(x, y);
    for (const m of maps ? [maps.map, maps.roughnessMap, maps.normalMap] : []) m?.offset.set(x, y); // the textures of a surface kind are shared: every pond drifts together
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
      <mesh geometry={top} position-y={water ? lift + 0.004 : lift} castShadow={stones && k.shadows && k.textures > 0} receiveShadow raycast={() => null}>
        <meshStandardMaterial
          key={`${look ? "mat" : surf ? "pbr" : "flat"}-${macro ? "macro" : "plain"}-${lookKey(look)}`} // the shader differs: a new material, not an edit of the old one
          ref={mat}
          {...(maps ?? { map: tex, roughness: def.rough })}
          {...macro}
          color={color}
          metalness={def.metal}
          transparent={water}
          opacity={water ? 0.78 : 1}
          polygonOffset
          polygonOffsetFactor={bias}
          polygonOffsetUnits={bias}
        />
      </mesh>
      {fringe && (
        <mesh geometry={fringe} position-y={lift + FRINGE_LIFT} renderOrder={1} raycast={() => null}>
          <meshBasicMaterial vertexColors transparent depthWrite={false} polygonOffset polygonOffsetFactor={bias - 1} polygonOffsetUnits={bias - 1} />
        </mesh>
      )}
      {rim && (
        <mesh geometry={rim} castShadow receiveShadow raycast={() => null}>
          <meshStandardMaterial color={EDGES[edge].color} roughness={0.85} />
        </mesh>
      )}
      {"points" in g && !stones && (marksOf(g) !== "none" || pavementOf(g) !== "none") && <RoadDetails g={g} lift={lift} bias={bias} />}
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
