"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { useKnobs } from "@/lib/quality";
import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from "three";
import { buildRoads, buildWater, rectDistance, terrainBlend, type Buf } from "@/lib/siteMesh";
import { useReducedMotion } from "../motion";
import { patchSiteMaterial } from "./siteShader";
import type { SiteWorld } from "./siteWorld";

function geometryOf(b: Buf): BufferGeometry | null {
  if (!b.pos.length) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(b.pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(b.nrm, 3));
  g.setAttribute("color", new Float32BufferAttribute(b.col, 3));
  g.computeBoundingSphere();
  return g;
}

const ROAD_LIFT = 0.008; // under the garden's own paths and ground areas (0.012 and up) ...
const ROAD_LIFT_FAR = 0.04; // ... and clear of the sloping ground away from the plan

/** Roads (ribbons draped on the ground) and water (flat polygons and rivers, with a faint shimmer). */
export default function SiteFlat({ w, roads, water }: { w: SiteWorld; roads: boolean; water: boolean }) {
  const { data, toPlan, ground, baseGround, home } = w;
  const still = useReducedMotion();

  const geo = useMemo(() => {
    const lift = (x: number, z: number) => ROAD_LIFT + (ROAD_LIFT_FAR - ROAD_LIFT) * terrainBlend(rectDistance(x, z, home));
    return {
      roads: roads ? geometryOf(buildRoads(data.roads, toPlan, ground, lift)) : null,
      water: water ? geometryOf(buildWater(data.areas, data.roads, toPlan, baseGround)) : null,
    };
  }, [data.roads, data.areas, toPlan, ground, baseGround, home, roads, water]);
  useEffect(
    () => () => {
      geo.roads?.dispose();
      geo.water?.dispose();
    },
    [geo],
  );

  const mats = useMemo(() => {
    const road = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const pond = new MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.05, emissive: "#3a8fb5", emissiveIntensity: 0.05 });
    patchSiteMaterial(road, "roof"); // snowfall whitens the road, a snowy season alone does not (it is ploughed)
    patchSiteMaterial(pond, "plain");
    return { road, pond };
  }, []);
  useEffect(
    () => () => {
      mats.road.dispose();
      mats.pond.dispose();
    },
    [mats],
  );

  // a slow glint on the water (a still surface when the user prefers reduced motion)
  const { ambient } = useKnobs();
  useFrame(({ clock }) => {
    if (still || !ambient || !geo.water) return;
    mats.pond.emissiveIntensity = 0.06 + 0.04 * Math.sin(clock.elapsedTime * 0.7);
    keepAlive(false);
  });

  return (
    <group>
      {geo.roads && <mesh geometry={geo.roads} material={mats.road} receiveShadow raycast={() => null} />}
      {geo.water && <mesh geometry={geo.water} material={mats.pond} receiveShadow raycast={() => null} />}
    </group>
  );
}
