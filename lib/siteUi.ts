// Pure helpers behind the Surroundings panel and the Plan-mode map underlay: reading coordinates people paste, nudging and dragging the
// alignment, turning the plan, and keeping `plan.site` valid. No DOM. The node test runner loads this file directly: .ts import extensions.
import { planToSite, validLatLon, type LatLon } from "./geo.ts";
import { commitPlan, type HistoryState } from "./history.ts";
import { SITE_RADIUS, siteOf, type Site, type SiteData, type SiteLayers, type XY } from "./siteTypes.ts";
import type { Plan } from "./types.ts";

/** A change to the site: any of its fields, and any of its layers. */
export type SitePatch = Partial<Omit<Site, "layers">> & { layers?: Partial<SiteLayers> };

/** The four sizes of surroundings the panel offers (metres in every direction). Anything between 100 and 600 can be typed under Advanced. */
export const RADIUS_STEPS = [
  { label: "Small", m: 150 },
  { label: "Medium", m: 250 },
  { label: "Large", m: 400 },
  { label: "Wide", m: 600 },
] as const;

/** Metres one nudge moves the map; Shift moves it further. */
export const NUDGE_M = 1;
export const NUDGE_BIG_M = 5;

/** The site with `patch` applied, validated and completed (see `siteOf`). */
export function mergeSite(site: Site | undefined, patch: SitePatch): Site {
  const cur = siteOf(site);
  return siteOf({ ...cur, ...patch, layers: { ...cur.layers, ...patch.layers } });
}

/** Store step: change the site as one undo step (or inside the open gesture). Changing nothing leaves no step, and a plan without a site stays without one. */
export function setSiteIn(s: HistoryState, patch: SitePatch): Partial<HistoryState> {
  const next = mergeSite(s.plan.site, patch);
  if (JSON.stringify(next) === JSON.stringify(siteOf(s.plan.site))) return {};
  return commitPlan(s, { ...s.plan, site: next });
}

/** A plan loaded from anywhere (storage, the server, a file): a `site` it carries is made valid; a plan without one gets none. */
export const withSite = (plan: Plan): Plan => (plan.site === undefined ? plan : { ...plan, site: siteOf(plan.site) });

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

/**
 * Turn what people paste into a coordinate pair: "51.48, 0.12", "51.48 0.12", "51,48 0,12", "51.48N 0.12E", "51.48; -0.12".
 * Letters are only understood right after a number (S and W mean negative); anything else, or an out-of-range value, gives null.
 */
export function parseCoords(text: string): LatLon | null {
  const tidy = text.replace(/[°º]/g, " ").trim();
  const pairs = (t: string) => [...t.matchAll(/([-+]?\d+(?:\.\d+)?)\s*([NSEW])?/gi)];
  // "47,66 23,56": a comma between digits is a decimal comma when it does not leave exactly two numbers
  let found = pairs(tidy);
  if (found.length !== 2) found = pairs(tidy.replace(/(\d),(\d)/g, "$1.$2"));
  if (found.length !== 2) return null;
  const leftover = tidy.replace(/([-+]?\d+(?:[.,]\d+)?)\s*([NSEW])?/gi, "").replace(/[\s,;/]/g, "");
  if (leftover) return null;
  const [lat, lon] = found.map((m) => (/[SW]/i.test(m[2] ?? "") ? -Math.abs(+m[1]) : +m[1]));
  const ok = validLatLon(lat, lon);
  return ok && { lat: round(ok.lat, 6), lon: round(ok.lon, 6) };
}

/** One number from a text field ("12", "12.5", "12,5"); null when it is not one. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(",", ".");
  return /^[-+]?\d+(\.\d+)?$/.test(t) ? +t : null;
}

/** A radius typed under Advanced, kept within what the data layer serves. */
export const clampRadius = (m: number) => Math.min(SITE_RADIUS.max, Math.max(SITE_RADIUS.min, Math.round(m)));

/** A compass bearing as a whole number of degrees, 0..359. */
export const normBearing = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

const WINDS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
/** "south-east (156 degrees)": the compass direction of a bearing, in words. */
export const compassWords = (deg: number) => `${WINDS[Math.round(normBearing(deg) / 45) % 8]} (${normBearing(deg)}\u00b0)`;

/** Where the plan's dx / dy end up when the map is moved by `v` on the plan (metres, plan axes), the plan itself staying put. */
export function dragSite(site: Pick<Site, "dx" | "dy">, bearing: number, v: XY): Pick<Site, "dx" | "dy"> {
  const [sx, sy] = planToSite({ dx: 0, dy: 0 }, bearing, v); // the same move in site axes
  return { dx: round(site.dx - sx, 2), dy: round(site.dy - sy, 2) };
}

export type Nudge = "left" | "right" | "up" | "down";
const STEP: Record<Nudge, XY> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/** Move the map `metres` towards `way` as seen on the plan. */
export const nudgeSite = (site: Pick<Site, "dx" | "dy">, bearing: number, way: Nudge, metres: number) => dragSite(site, bearing, [STEP[way][0] * metres, STEP[way][1] * metres]);

/**
 * The patch that switches the surroundings on. A plan never aligned (dx = dy = 0) gets its CENTRE put on the location point, so the plan does not start with its
 * north-west corner on the home point (the middle of some real block); a plan the owner already nudged keeps its place. `centred` says whether it moved.
 */
export function enablePatch(site: Pick<Site, "dx" | "dy">, bearing: number, planBounds: { x0: number; y0: number; x1: number; y1: number } | null): { patch: SitePatch; centred: boolean } {
  if (site.dx !== 0 || site.dy !== 0 || !planBounds) return { patch: { enabled: true }, centred: false };
  const centre: XY = [(planBounds.x0 + planBounds.x1) / 2, (planBounds.y0 + planBounds.y1) / 2];
  return { patch: { enabled: true, ...dragSite(site, bearing, centre) }, centred: true };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "59 buildings, 120 trees, 14 roads and paths": what the data holds, for the layers that are on. */
export function siteSummary(data: SiteData, layers: SiteLayers): string {
  const parts = [
    layers.buildings && plural(data.buildings.length, "building"),
    layers.trees && plural(data.trees.length, "tree"),
    layers.roads && plural(data.roads.length, "road or path", "roads and paths"),
    layers.water && plural(data.areas.filter((a) => a.kind === "water").length + data.roads.filter((r) => r.kind === "river").length, "water feature"),
    layers.terrain && data.terrain && "ground height",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing selected to show";
}

/** Credits shown whenever the surroundings are on: the data layer's own lines once it has answered, these until then (and the photo's when it names none). */
export const SITE_CREDITS = ["\u00a9 OpenStreetMap contributors (ODbL)", "Elevation: Copernicus DEM via Open-Meteo"];
const SATELLITE_CREDIT = "Satellite photo: Esri World Imagery, or the map service set up for this app";

export function creditsOf(attribution: readonly string[] | undefined, satellite: boolean): string[] {
  const all = attribution?.length ? [...attribution] : SITE_CREDITS;
  const photo = all.some((c) => /imagery|satellite|esri|photo/i.test(c));
  return satellite && !photo ? [...all, SATELLITE_CREDIT] : all;
}
