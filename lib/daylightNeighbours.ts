// The surroundings shadow casters shared by the room sunlight analysis and the advisor.
import { siteToPlan } from "./geo.ts";
import { planBounds } from "./geometry.ts";
import { neighbourOf, type Neighbour } from "./daylightRay.ts";
import { homeRect, planBuilding, planFootprint, selectBuildings, type PlanBuilding } from "./siteMesh.ts";
import { siteOf, type SiteData, type XY } from "./siteTypes.ts";
import type { Plan } from "./types.ts";

export function neighboursOf(plan: Plan, data: SiteData | undefined): Neighbour[] {
  const site = siteOf(plan.site);
  if (!data || !site.enabled || !site.layers.buildings) return [];
  const toPlan = (p: XY) => siteToPlan(site, plan.bearing ?? 0, p);
  const all = data.buildings.map((b) => planBuilding(b, toPlan)).filter((b): b is PlanBuilding => !!b);
  const home = homeRect(planBounds(plan));
  const homeC: XY = [(home.x0 + home.x1) / 2, (home.y0 + home.y1) / 2];
  return selectBuildings(all, { footprint: planFootprint(plan), homes: [toPlan([0, 0]), homeC], at: homeC, radius: data.radius > 0 ? data.radius : site.radius, max: 1200 }).map(neighbourOf);
}
