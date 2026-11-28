"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute, MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, RGBADepthPacking } from "three";
import { polygonCentroid } from "@/lib/siteGeom";
import { CUT_STRIDE, buildBuildings, type Buf, type PlanBuilding } from "@/lib/siteMesh";
import type { XY } from "@/lib/siteTypes";
import { live } from "../skyLive";
import { patchCutDepth, patchSiteMaterial } from "./siteShader";
import { useCutEase } from "./useCutEase";
import type { SiteWorld } from "./siteWorld";
import { windowTextures } from "./windowTexture";

/** Buildings this close to the plan cast sun shadows (the garden's shadow frustum is ~32 m wide); farther ones only receive them. */
const SHADOW_M = 46;

function geometryOf(b: Buf, cut: number[]): BufferGeometry | null {
  if (!b.pos.length) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(b.pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(b.nrm, 3));
  g.setAttribute("color", new Float32BufferAttribute(b.col, 3));
  g.setAttribute("uv", new Float32BufferAttribute(b.uv, 2));
  g.setAttribute("aCut", new Float32BufferAttribute(cut, CUT_STRIDE));
  g.computeBoundingSphere();
  return g;
}

type Parts = { wallsNear: BufferGeometry | null; roofsNear: BufferGeometry | null; wallsFar: BufferGeometry | null; roofsFar: BufferGeometry | null };

/**
 * The neighbours: every building merged into a handful of meshes (walls with the window-row texture, roofs in plain colour; near ones cast shadows).
 * At night the windows glow: the lit-window map is the walls' emissive map, its strength follows the sky.
 */
export default function SiteBuildings({ w, buildings }: { w: SiteWorld; buildings: PlanBuilding[] }) {
  const { ground, homeC, footprint } = w;
  const parts = useMemo<Parts>(() => {
    const near: PlanBuilding[] = [];
    const far: PlanBuilding[] = [];
    for (const b of buildings) {
      const c: XY = polygonCentroid(b.ring);
      (Math.hypot(c[0] - homeC[0], c[1] - homeC[1]) <= SHADOW_M ? near : far).push(b);
    }
    const n = buildBuildings(near, ground, footprint);
    const f = buildBuildings(far, ground, footprint);
    return { wallsNear: geometryOf(n.walls, n.wallsCut), roofsNear: geometryOf(n.roofs, n.roofsCut), wallsFar: geometryOf(f.walls, f.wallsCut), roofsFar: geometryOf(f.roofs, f.roofsCut) };
  }, [buildings, ground, homeC, footprint]);
  useEffect(() => () => Object.values(parts).forEach((g) => g?.dispose()), [parts]);

  const mats = useMemo(() => {
    const tex = windowTextures();
    const walls = new MeshStandardMaterial({ map: tex.wall, emissiveMap: tex.lit, emissive: "#ffffff", emissiveIntensity: 0, vertexColors: true, roughness: 0.92 });
    const roofs = new MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
    patchSiteMaterial(walls, "plain", undefined, true);
    patchSiteMaterial(roofs, "roof", undefined, true);
    // the shadow maps draw the lowered shapes too
    const sun = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    const lamps = new MeshDistanceMaterial();
    patchCutDepth(sun);
    patchCutDepth(lamps);
    return { walls, roofs, sun, lamps };
  }, []);
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats],
  );

  useCutEase(); // Cut-away lowers the neighbours near the home, like it lowers the home's own walls
  useFrame(() => {
    const e = Math.max(0, 1 - live.daylight * 2.2) * 1.4; // windows light up as the day fades
    if (Math.abs(mats.walls.emissiveIntensity - e) > 0.005) mats.walls.emissiveIntensity = e;
  });

  return (
    <group>
      {parts.wallsNear && <mesh geometry={parts.wallsNear} material={mats.walls} customDepthMaterial={mats.sun} customDistanceMaterial={mats.lamps} castShadow receiveShadow raycast={() => null} />}
      {parts.roofsNear && <mesh geometry={parts.roofsNear} material={mats.roofs} customDepthMaterial={mats.sun} customDistanceMaterial={mats.lamps} castShadow receiveShadow raycast={() => null} />}
      {parts.wallsFar && <mesh geometry={parts.wallsFar} material={mats.walls} receiveShadow raycast={() => null} />}
      {parts.roofsFar && <mesh geometry={parts.roofsFar} material={mats.roofs} receiveShadow raycast={() => null} />}
    </group>
  );
}
