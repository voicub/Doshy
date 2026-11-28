"use client";
import { useMemo } from "react";
import type { CityLoaded } from "@/lib/siteCityStore";
import { middleOf, prepareCity, type CityPrepared } from "@/lib/siteCityBuild";
import { centredFrame, cityFrame } from "@/lib/siteCityFrame";
import type { Site, SiteData } from "@/lib/siteTypes";

/**
 * The loaded city model moved into site metres, cut to the radius and the quality tier's triangle budget (lib/siteCityBuild.ts), or undefined while the city model
 * is not chosen or not loaded. Slow part of the city (about a tenth of a second for a big one), so it only reruns when the model, the place, the size or the tier
 * changes, never when the plan is lined up (that only moves a transform, SiteCity). `share` is `useKnobs().site`.
 */
export function useCityPrepared(loaded: CityLoaded | undefined, site: Site, data: SiteData, share: number): CityPrepared | undefined {
  const active = site.buildingsFrom === "city" && !!site.city;
  const radius = data.radius > 0 ? data.radius : site.radius;
  const roads = !!site.city?.roads && site.layers.roads;
  const terrain = !!site.city?.terrain && !!loaded?.terrain;
  const { lat, lon } = data.center;
  return useMemo(() => {
    if (!loaded || !active) return undefined;
    const centre = { lat, lon };
    const frame = loaded.origin ? cityFrame(centre, loaded.z, loaded.origin) : centredFrame(centre, loaded.z, middleOf(loaded.obj));
    return prepareCity(loaded.obj, frame, { radius, share, roads, terrain });
  }, [loaded, active, lat, lon, radius, share, roads, terrain]);
}
