"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { Color } from "three";
import { insideAny, planBuilding, planTrees, areaTrees, selectBuildings, thinTrees, type PlanBuilding, type PlanTree } from "@/lib/siteMesh";
import { live } from "../skyLive";
import SiteBuildings from "./SiteBuildings";
import SiteCity from "./SiteCity";
import SiteFlat from "./SiteFlat";
import SiteTerrain from "./SiteTerrain";
import SiteTrees from "./SiteTrees";
import { NO_BLOCK, useSiteBlock } from "./siteBlock";
import { SITE_U } from "./siteShader";
import { useSiteWorld, type SiteWorld } from "./siteWorld";
import { useSurroundings, type SurroundingsInput } from "./useSurroundings";
import { useCityPrepared } from "./useCityPrepared";
import { useKnobs } from "@/lib/quality";
import { useCityState } from "@/lib/siteCityStore";

const MAX_BUILDINGS = 1200;
const MAX_TREES = 1500;
const AREA_TREES = 800; // trees a wood without mapped trees may be given, before thinning
const TREE_EDGE = 0.88; // trees and buildings stop this share of the radius out, where the ground has all but faded away
const BUILDING_EDGE = 0.94;

/** Writes the shared uniforms: the layout (where the plan is, where the world fades out) and the sky (horizon colour, snow, rain). Renders nothing. */
function Driver({ w }: { w: SiteWorld }) {
  const scene = useThree((s) => s.scene);
  const { center, radius, home } = w;
  useLayoutEffect(() => {
    SITE_U.uCenter.value.set(center[0], center[1]);
    SITE_U.uEdge.value.set(radius * 0.72, radius);
    SITE_U.uRect.value.set(home.x0, home.y0, home.x1, home.y1);
  }, [center, radius, home]);
  useFrame(() => {
    if (scene.background instanceof Color) SITE_U.uHorizon.value.copy(scene.background);
    SITE_U.uSnow.value = live.snowCover;
    SITE_U.uWet.value = live.wet;
  });
  return null;
}

function World({ input }: { input: SurroundingsInput }) {
  const { site, data: osm, photo } = input;
  const share = useKnobs().site; // the light tiers draw only the nearest neighbours and a few trees
  // The city model REPLACES the OpenStreetMap buildings and roads once it is loaded (never both); until then, or when it failed, the OpenStreetMap ones stay. Its own ground
  // height, when the owner asked for it and the model has one, replaces Open-Meteo's. Trees, water and land cover always come from OpenStreetMap.
  const city = useCityPrepared(useCityState((s) => s.loaded), site, osm, share);
  const data = useMemo(() => (city?.terrain ? { ...osm, terrain: city.terrain } : osm), [osm, city]);
  const w = useSiteWorld(site, data);
  const { layers } = site;
  const { toPlan, home, footprint, homeC, center, radius } = w;

  const all = useMemo(() => data.buildings.map((b) => planBuilding(b, toPlan)).filter((b): b is PlanBuilding => !!b), [data.buildings, toPlan]);
  const buildings = useMemo(
    () => (layers.buildings ? selectBuildings(all, { footprint, homes: [center, homeC], at: homeC, radius: radius * BUILDING_EDGE, max: Math.round(MAX_BUILDINGS * share) }) : []),
    [layers.buildings, all, footprint, center, homeC, radius, share],
  );

  const trees = useMemo<PlanTree[]>(() => {
    if (!layers.trees) return [];
    const mapped = planTrees(data.trees, toPlan);
    const inBuilding = insideAny(all);
    const limit = radius * TREE_EDGE;
    const keep = (t: PlanTree) => Math.hypot(t.x - center[0], t.z - center[1]) < limit && !inBuilding(t.x, t.z) && !(t.x > home.x0 && t.x < home.x1 && t.z > home.y0 && t.z < home.y1);
    const inWoods = areaTrees(data.areas, toPlan, mapped, Math.round(AREA_TREES * share));
    return thinTrees([...mapped, ...inWoods].filter(keep), homeC, Math.round(MAX_TREES * share));
  }, [layers.trees, data.trees, data.areas, toPlan, all, radius, center, home, homeC, share]);

  // tell the garden's own scatter what is taken: no plant inside a neighbour's walls, no made-up tree where real ones stand
  useEffect(() => {
    useSiteBlock.setState({ inside: insideAny(buildings), realTrees: trees.some((t) => t.source !== "area") });
    return () => useSiteBlock.setState(NO_BLOCK);
  }, [buildings, trees]);

  return (
    <group>
      <Driver w={w} />
      <SiteTerrain w={w} photo={photo} />
      {city ? <SiteCity w={w} city={city} buildings={layers.buildings} roads={layers.roads && !!site.city?.roads} /> : layers.buildings && <SiteBuildings w={w} buildings={buildings} />}
      <SiteFlat w={w} roads={layers.roads && !city} water={layers.water} />
      {layers.trees && <SiteTrees trees={trees} ground={w.ground} homeC={homeC} footprint={footprint} />}
    </group>
  );
}

/**
 * The real surroundings of the home, drawn around the garden when the owner switched them on and the data has arrived: ground height and colour
 * (or the satellite photo), neighbouring buildings, trees, roads and water. Each part is an optional layer; nothing here is pickable.
 */
export default function Surroundings() {
  const input = useSurroundings();
  return input ? <World input={input} /> : null;
}
