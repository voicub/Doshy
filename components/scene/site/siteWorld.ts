import { useMemo } from "react";
import { planBounds } from "@/lib/geometry";
import { planToSite, siteToPlan } from "@/lib/geo";
import { useStore } from "@/lib/store";
import { carveWater, groundFn, homeRect, planFootprint, type GroundFn } from "@/lib/siteMesh";
import type { Rect } from "@/lib/siteGeom";
import type { Site, SiteData, XY } from "@/lib/siteTypes";

/** Everything the surroundings' parts agree on: where the plan sits in the site, how to move points between the two, and the ground height. All in plan axes (x east, z south). */
export type SiteWorld = {
  site: Site;
  data: SiteData;
  /** metres of surroundings drawn */
  radius: number;
  /** the plan's footprint, grown to whole metres: the lawn and the flat ground around it */
  home: Rect;
  /** everything the plan occupies (walls, rooms, garden areas), unsnapped: no neighbour is drawn over it */
  footprint: Rect | null;
  homeC: XY;
  /** the site's centre point in plan axes */
  center: XY;
  toPlan: (p: XY) => XY;
  toSite: (p: XY) => XY;
  /** the ground, with the ponds dug in (when the water layer is on) */
  ground: GroundFn;
  /** the real ground before the ponds were dug in: water surfaces are measured on it */
  baseGround: GroundFn;
};

export function useSiteWorld(site: Site, data: SiteData): SiteWorld {
  const bearing = useStore((s) => s.plan.bearing ?? 0);
  // a string, so a wall drag that does not move the snapped footprint re-renders nothing
  const homeKey = useStore((s) => {
    const r = homeRect(planBounds(s.plan));
    return `${r.x0},${r.y0},${r.x1},${r.y1}`;
  });
  const home = useMemo<Rect>(() => {
    const [x0, y0, x1, y1] = homeKey.split(",").map(Number);
    return { x0, y0, x1, y1 };
  }, [homeKey]);
  const footKey = useStore((s) => {
    const r = planFootprint(s.plan);
    return r ? `${r.x0},${r.y0},${r.x1},${r.y1}` : "";
  });
  const footprint = useMemo<Rect | null>(() => {
    if (!footKey) return null;
    const [x0, y0, x1, y1] = footKey.split(",").map(Number);
    return { x0, y0, x1, y1 };
  }, [footKey]);
  const { dx, dy } = site;
  const toPlan = useMemo(() => (p: XY) => siteToPlan({ dx, dy }, bearing, p), [dx, dy, bearing]);
  const toSite = useMemo(() => (p: XY) => planToSite({ dx, dy }, bearing, p), [dx, dy, bearing]);
  const terrain = site.layers.terrain ? data.terrain : undefined;
  const baseGround = useMemo(() => groundFn(terrain, home, toSite), [terrain, home, toSite]);
  const ground = useMemo(() => (site.layers.water ? carveWater(baseGround, data.areas, toPlan) : baseGround), [site.layers.water, baseGround, data.areas, toPlan]);
  return useMemo(
    () => ({ site, data, radius: data.radius > 0 ? data.radius : site.radius, home, footprint, homeC: [(home.x0 + home.x1) / 2, (home.y0 + home.y1) / 2], center: toPlan([0, 0]), toPlan, toSite, ground, baseGround }),
    [site, data, home, footprint, toPlan, toSite, ground, baseGround],
  );
}
