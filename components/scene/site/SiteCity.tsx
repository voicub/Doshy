"use client";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, RGBADepthPacking } from "three";
import { useKnobs } from "@/lib/quality";
import type { CityPrepared } from "@/lib/siteCityBuild";
import { placeBuildings, placeRoads, type PlaceEnv } from "@/lib/siteCityPlace";
import { useCityState } from "@/lib/siteCityStore";
import { CUT_STRIDE } from "@/lib/siteMesh";
import { useStore } from "@/lib/store";
import { patchCutDepth, patchSiteMaterial } from "./siteShader";
import type { SiteWorld } from "./siteWorld";
import { useCutEase } from "./useCutEase";

const ROAD_COLOR = "#55585d"; // the OpenStreetMap residential road's asphalt (lib/siteMeshWorld.ts)

const geometryOf = (position: BufferAttribute, normal: BufferAttribute, index: Uint32Array, extra?: BufferAttribute, color?: BufferAttribute): BufferGeometry | null => {
  if (!index.length) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", position);
  g.setAttribute("normal", normal);
  if (color) g.setAttribute("color", color);
  if (extra) g.setAttribute("aCut", extra);
  g.setIndex(new BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return g;
};

/**
 * The city model's buildings and roads (lib/siteCityBuild.ts), in the same clay look as the OpenStreetMap neighbours: one merged mesh near the plan (it casts the sun's
 * shadow on the better tiers) and one beyond, plain colour, no textures, the Cut-away and the snow, rain and edge fade of the other site layers (siteShader.ts).
 * The geometry is in SITE axes and is turned and moved as a whole, so lining the plan up never rebuilds it; only each building's lift onto the ground does.
 */
export default function SiteCity({ w, city, buildings, roads }: { w: SiteWorld; city: CityPrepared; buildings: boolean; roads: boolean }) {
  const bearing = useStore((s) => s.plan.bearing ?? 0);
  const { site: share, shadows } = useKnobs();
  const { toPlan, ground, footprint, center, homeC, home } = w;
  const env = useMemo<PlaceEnv>(() => ({ toPlan, ground, footprint, homes: [center, homeC], at: homeC }), [toPlan, ground, footprint, center, homeC]);

  const houses = useMemo(() => {
    if (!buildings) return null;
    const placed = placeBuildings(city, env);
    const position = new BufferAttribute(placed.pos, 3);
    const normal = new BufferAttribute(city.nrm, 3);
    const color = new BufferAttribute(city.col, 3, true);
    const cut = new BufferAttribute(placed.cut, CUT_STRIDE);
    return { near: geometryOf(position, normal, placed.near, cut, color), far: geometryOf(position, normal, placed.far, cut, color), hosts: placed.hosts };
  }, [buildings, city, env]);

  const up = useMemo(() => new BufferAttribute(new Float32Array(city.roads.pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3), [city]);
  const ribbons = useMemo(() => (roads ? geometryOf(new BufferAttribute(placeRoads(city, env, home), 3), up, city.roads.idx) : null), [roads, city, env, home, up]);

  useEffect(() => () => {
    houses?.near?.dispose();
    houses?.far?.dispose();
  }, [houses]);
  useEffect(() => () => ribbons?.dispose(), [ribbons]);
  useEffect(() => {
    useCityState.setState({ stats: { buildings: city.stats.buildings - (houses?.hosts ?? 0), roadTriangles: city.stats.roadTris, leftOut: city.stats.leftOut, hosts: houses?.hosts ?? 0 } });
  }, [city, houses]);

  const mats = useMemo(() => {
    const walls = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    const road = new MeshStandardMaterial({ color: ROAD_COLOR, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    patchSiteMaterial(walls, "roof", undefined, true); // snow settles on roofs; the cut-away lowers what is near the plan
    patchSiteMaterial(road, "roof");
    const sun = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    const lamps = new MeshDistanceMaterial();
    patchCutDepth(sun); // the shadow maps draw the lowered shapes too
    patchCutDepth(lamps);
    return { walls, road, sun, lamps };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useCutEase();

  const casts = shadows && share >= 1; // the light tiers and Eco do not pay for the city's shadows
  return (
    <group position={[center[0], 0, center[1]]} rotation={[0, (bearing * Math.PI) / 180, 0]}>
      {houses?.near && <mesh geometry={houses.near} material={mats.walls} customDepthMaterial={mats.sun} customDistanceMaterial={mats.lamps} castShadow={casts} receiveShadow raycast={() => null} />}
      {houses?.far && <mesh geometry={houses.far} material={mats.walls} receiveShadow raycast={() => null} />}
      {ribbons && <mesh geometry={ribbons} material={mats.road} receiveShadow raycast={() => null} />}
    </group>
  );
}
