// "Site": the plan's place on Earth, and the real surroundings (neighbouring buildings, trees, roads, water, ground height, satellite photo) drawn around it.
// Pure types and defaults, shared by the server routes (app/api/site/*), the data layer (lib/geo.ts, lib/siteStore.ts), the 3D scene and the Site panel.
// The node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { isRecord } from "./guards.ts";
import type { Species } from "./vegetation.ts";

/** What the owner chose. Stored in the plan (`Plan.site`, optional: older plans have none and show no surroundings). */
export type Site = {
  /** "home": the coordinates of Home Assistant's `zone.home`; "manual": `lat` / `lon` below. */
  source: "home" | "manual";
  lat?: number;
  lon?: number;
  /** Metres the plan's origin (0, 0) lies east (+dx) and south (+dy) of that point: the nudge that lines the drawn flat up with the real one. Default 0, 0. */
  dx: number;
  dy: number;
  /** Show the surroundings at all. */
  enabled: boolean;
  /** Metres of surroundings in every direction (100..600). */
  radius: number;
  layers: SiteLayers;
};

export type SiteLayers = {
  buildings: boolean;
  trees: boolean;
  roads: boolean;
  water: boolean;
  /** Real ground height (hills) instead of a flat lawn. */
  terrain: boolean;
  /** The satellite photo as the ground colour (opt-in: it comes from a third-party tile service). */
  satellite: boolean;
};

export const SITE_RADIUS = { min: 100, max: 600, default: 250 } as const;

export const DEFAULT_SITE: Site = {
  source: "home",
  dx: 0,
  dy: 0,
  enabled: false,
  radius: SITE_RADIUS.default,
  layers: { buildings: true, trees: true, roads: true, water: true, terrain: true, satellite: false },
};

/** The plan's site, completed with defaults and clamped to what is valid. Undefined plan site gives the defaults (disabled). */
export function siteOf(site: Partial<Site> | undefined): Site {
  const s = site ?? {};
  const num = (v: unknown, fallback: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
  const manual = s.source === "manual" && typeof s.lat === "number" && typeof s.lon === "number" && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180;
  return {
    source: manual ? "manual" : "home",
    ...(manual ? { lat: s.lat, lon: s.lon } : {}),
    dx: num(s.dx, 0, -500, 500),
    dy: num(s.dy, 0, -500, 500),
    enabled: s.enabled === true,
    radius: num(s.radius, SITE_RADIUS.default, SITE_RADIUS.min, SITE_RADIUS.max),
    layers: { ...DEFAULT_SITE.layers, ...Object.fromEntries(Object.entries(s.layers ?? {}).filter(([k, v]) => k in DEFAULT_SITE.layers && typeof v === "boolean")) },
  };
}

// ---- the data (answered by GET /api/site/data) ------------------------------------------------------------------------------------------
// Coordinates are metres about the site's centre point, in PLAN AXES BEFORE the plan's own bearing, dx and dy are applied:
// x east (+), y SOUTH (+), so true north is -y. lib/geo.ts turns them into plan coordinates.

export type XY = [number, number];

export type RoofShape = "flat" | "gabled" | "hipped" | "pyramidal" | "skillion" | "dome";

export type SiteBuilding = {
  id: string;
  /** Outline, closed implicitly (the first point is not repeated), counter-clockwise or clockwise: consumers must not assume. */
  ring: XY[];
  holes?: XY[][];
  /** Metres from the ground to the eaves (the wall top), from `height`, else `building:levels` x 3 m, else a guess by kind (a house 6 m, an apartment block 15 m, a shed 3 m). */
  height: number;
  /** Metres the building is lifted off the ground (a bridge, an overhang). Usually 0. */
  minHeight: number;
  roof: RoofShape;
  /** Metres from the eaves to the ridge (0 for a flat roof). */
  roofHeight: number;
  /** CSS colours when OpenStreetMap has them. */
  roofColor?: string;
  wallColor?: string;
  /** OpenStreetMap `building=` value: "apartments", "house", "yes", ... */
  kind: string;
};

export type SiteTree = {
  x: number;
  y: number;
  species?: Species;
  /** Total height, metres. */
  height: number;
  /** Crown diameter, metres. */
  crown: number;
  leaf: "broad" | "needle";
  /** Where the tree came from: a mapped tree, or found in the satellite photo. */
  source: "osm" | "photo";
};

export type AreaKind = "wood" | "scrub" | "grass" | "farmland" | "water" | "paving" | "residential" | "sand" | "rock";
export type SiteArea = { id: string; kind: AreaKind; ring: XY[]; holes?: XY[][]; leaf?: "broad" | "needle" | "mixed" };

export type RoadKind = "motorway" | "primary" | "secondary" | "residential" | "service" | "footway" | "track" | "railway" | "river";
export type SiteRoad = { id: string; kind: RoadKind; /** metres wide */ width: number; pts: XY[] };

/** Heights on a square grid centred on the site's centre point: `n` x `n` samples `step` metres apart, row-major from the north-west corner. Metres relative to the ground height at the centre (so 0 at home). */
export type SiteTerrain = { n: number; step: number; h: number[]; /** metres above sea level at the centre */ base: number };

export type SiteData = {
  version: 1;
  center: { lat: number; lon: number };
  radius: number;
  fetchedAt: number;
  buildings: SiteBuilding[];
  trees: SiteTree[];
  areas: SiteArea[];
  roads: SiteRoad[];
  terrain?: SiteTerrain;
  /** Credit lines the UI must show while the data (or the satellite photo) is on screen. */
  attribution: string[];
  /** Sentences for the owner when part of the data could not be fetched ("Ground height was not available"). */
  notes: string[];
};

/** The satellite tile route: GET /api/site/tile/{z}/{x}/{y} answers a JPEG, same origin. `SITE_TILE_MAX_ZOOM` is the deepest level the default provider has. */
export const SITE_TILE_ROUTE = "/api/site/tile";
export const SITE_TILE_MAX_ZOOM = 17;

/** Is this parsed JSON (network, cache file) shaped like SiteData? Checks the version and that every list is a list. */
export const isSiteData = (v: unknown): v is SiteData =>
  isRecord(v) && v.version === 1 && ["buildings", "trees", "areas", "roads", "attribution", "notes"].every((k) => Array.isArray(v[k]));
