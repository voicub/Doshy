// How the two newer data sources (AWS Terrain Tiles for the ground, Overture Maps for buildings) join the OpenStreetMap + Open-Meteo `SiteData` in the browser:
// when each is wanted, what a server answer must look like to be believed, and the one function that puts everything together with the credits, the sentences
// for the owner and the numbers the panel shows. Pure; the node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { isRecord } from "./guards.ts";
import { ELEVATION_ATTRIBUTION, TERRAIN_NOTE } from "./siteElevation.ts";
import { mergeBuildings, type MergeStats } from "./siteOvertureMerge.ts";
import { shapeTerrain } from "./siteTerrainShape.ts";
import type { RoofShape, Site, SiteBuilding, SiteData, SiteTerrain, XY } from "./siteTypes.ts";

/** The place and radius the new routes are asked with: the radius rounded up to 50 m like the data route's cache, so every source covers the same square. */
export const radiusBucket = (radius: number): number => Math.min(600, Math.max(100, Math.ceil(radius / 50) * 50));

/** The detailed ground is wanted unless the owner picked "Standard" or switched the ground layer off. */
export const wantsTerrain = (site: Site): boolean => site.enabled && site.layers.terrain && site.terrainFrom !== "standard";

/** Overture buildings are wanted with the buildings layer on, OpenStreetMap as the source and the owner not having chosen "OpenStreetMap only". */
export const wantsOverture = (site: Site): boolean => site.enabled && site.layers.buildings && site.buildingsFrom !== "city" && site.buildingData !== "osm";

// ---- what the server answered ---------------------------------------------------------------------------------------------------------

export type TerrainAnswer = { terrain: SiteTerrain; zoom: number; tiles: number; attribution: string };
export type OvertureAnswer = { release: string; buildings: SiteBuilding[]; tiles: number; failed: number; withHeight: number; attribution: string };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ROOFS: readonly string[] = ["flat", "gabled", "hipped", "pyramidal", "skillion", "dome"] satisfies RoofShape[];
const isXY = (p: unknown): p is XY => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]) && Math.abs(p[0]) < 5000 && Math.abs(p[1]) < 5000;
const isRing = (r: unknown): r is XY[] => Array.isArray(r) && r.length >= 3 && r.length <= 5000 && r.every(isXY);

/** Does a parsed terrain answer have a grid the scene can draw? (n x n finite numbers within a mountain's height, centre exactly 0.) */
export function isTerrainAnswer(v: unknown): v is TerrainAnswer {
  if (!isRecord(v) || !isRecord(v.terrain) || typeof v.attribution !== "string" || !finite(v.zoom)) return false;
  const t = v.terrain;
  const { n, step, h, base } = t;
  if (!Number.isInteger(n) || (n as number) < 3 || (n as number) > 257 || (n as number) % 2 === 0 || !finite(step) || step <= 0 || step > 200 || !finite(base) || !Array.isArray(h)) return false;
  return h.length === (n as number) ** 2 && h.every((x) => finite(x) && Math.abs(x) < 9000) && h[((n as number) ** 2 - 1) / 2] === 0;
}

function isBuilding(b: unknown): b is SiteBuilding {
  if (!isRecord(b) || typeof b.id !== "string" || !isRing(b.ring) || !finite(b.height) || !finite(b.minHeight) || !finite(b.roofHeight) || typeof b.kind !== "string") return false;
  if (typeof b.roof !== "string" || !ROOFS.includes(b.roof) || b.height < 0 || b.height > 600 || b.roofHeight < 0 || b.roofHeight > 100 || b.minHeight < 0) return false;
  return b.holes === undefined || (Array.isArray(b.holes) && b.holes.every(isRing));
}

/** Does a parsed Overture answer hold usable buildings? Every outline is checked: it ends up as geometry. */
export function isOvertureAnswer(v: unknown): v is OvertureAnswer {
  return isRecord(v) && typeof v.release === "string" && typeof v.attribution === "string" && finite(v.tiles) && finite(v.failed) && Array.isArray(v.buildings) && v.buildings.length <= 5000 && v.buildings.every(isBuilding);
}

// ---- composing ----------------------------------------------------------------------------------------------------------------------

/** One fetch's outcome as the composer needs it: what arrived, or why not (`disabled` = the server's owner switched third-party downloads off: not worth a warning). */
export type Outcome<T> = { state: "idle" } | { state: "loading" } | { state: "ok"; value: T } | { state: "failed"; disabled: boolean; message?: string };

export type TerrainStatus = { state: "off" | "loading" | "high" | "standard" | "fallback"; /** metres between ground points when detailed */ spacing?: number; zoom?: number };
export type BuildingStatus = { state: "off" | "loading" | "ready" | "unavailable"; choice: "osm" | "overture" | "both"; stats?: MergeStats; failedTiles?: number; release?: string };

export const TERRAIN_FALLBACK_NOTE = "The detailed ground height (AWS Terrain Tiles) could not be loaded just now, so the standard ground is shown.";
export const OVERTURE_FALLBACK_NOTE = "Overture data unavailable right now, showing OpenStreetMap.";
export const OVERTURE_PARTIAL_NOTE = "Part of the Overture Maps data could not be loaded, so some buildings may be missing there.";
const detailedNote = (spacing: number) => `Ground height comes from AWS Terrain Tiles, one point about every ${Math.round(spacing)} m: hills and slopes are real, a retaining wall, a plinth or a terrace of your garden is not.`;

/**
 * The data the scene gets: the OpenStreetMap + Open-Meteo answer with the detailed ground (smoothed and exaggerated as chosen) in place of the Open-Meteo one
 * when it arrived, and with the buildings merged as chosen. Credits and notes follow what is actually drawn. Nothing is dropped when a source failed: the
 * OpenStreetMap buildings and the Open-Meteo ground stay, with a sentence saying so.
 */
export function composeExternal(data: SiteData, site: Site, terrain: Outcome<TerrainAnswer>, overture: Outcome<OvertureAnswer>): { data: SiteData; terrain: TerrainStatus; buildings: BuildingStatus } {
  let notes = data.notes;
  let attribution = data.attribution;
  let ground = data.terrain;
  let terrainStatus: TerrainStatus = { state: "off" };
  if (wantsTerrain(site)) {
    if (terrain.state === "ok") {
      ground = shapeTerrain(terrain.value.terrain, { smooth: site.terrainSmooth, scale: site.terrainScale });
      notes = [...notes.filter((n) => n !== TERRAIN_NOTE), detailedNote(terrain.value.terrain.step)];
      attribution = [...attribution.filter((a) => a !== ELEVATION_ATTRIBUTION), terrain.value.attribution];
      terrainStatus = { state: "high", spacing: terrain.value.terrain.step, zoom: terrain.value.zoom };
    } else if (terrain.state === "failed") {
      if (!terrain.disabled) notes = [...notes, TERRAIN_FALLBACK_NOTE];
      terrainStatus = { state: terrain.disabled ? "standard" : "fallback" };
    } else terrainStatus = { state: "loading" };
  } else if (site.layers.terrain) terrainStatus = { state: "standard" };

  const choice = site.buildingData ?? "both";
  let buildings = data.buildings;
  let buildingStatus: BuildingStatus = { state: "off", choice };
  if (wantsOverture(site)) {
    if (overture.state === "ok") {
      const merged = mergeBuildings(data.buildings, overture.value.buildings, choice);
      buildings = merged.buildings;
      attribution = [...attribution, overture.value.attribution];
      if (overture.value.failed > 0) notes = [...notes, OVERTURE_PARTIAL_NOTE];
      buildingStatus = { state: "ready", choice, stats: merged.stats, failedTiles: overture.value.failed, release: overture.value.release };
    } else if (overture.state === "failed") {
      if (!overture.disabled) notes = [...notes, OVERTURE_FALLBACK_NOTE];
      buildingStatus = { state: "unavailable", choice };
    } else buildingStatus = { state: "loading", choice };
  }
  const changed = ground !== data.terrain || buildings !== data.buildings || notes !== data.notes || attribution !== data.attribution;
  return { data: changed ? { ...data, ...(ground ? { terrain: ground } : {}), buildings, notes, attribution } : data, terrain: terrainStatus, buildings: buildingStatus };
}

// ---- the panel's sentences ----------------------------------------------------------------------------------------------------------

/** One plain sentence on where the ground height comes from right now. */
export function describeTerrain(info: TerrainStatus | undefined): string {
  switch (info?.state) {
    case "high":
      return `Detailed ground height: one point about every ${Math.round(info.spacing ?? 0)} m (AWS Terrain Tiles).`;
    case "loading":
      return "Loading the detailed ground height...";
    case "fallback":
      return "The detailed ground height could not be loaded just now: the standard ground (one point every 60 m or so) is shown.";
    case "standard":
      return "Standard ground height (Open-Meteo, one point every 60 m or so).";
    default:
      return "";
  }
}

/** One plain sentence on which building sources are in use and how many heights are real. */
export function describeBuildings(info: BuildingStatus | undefined): string {
  if (!info || info.state === "off") return "";
  if (info.state === "loading") return "Loading the Overture Maps buildings...";
  if (info.state === "unavailable") return OVERTURE_FALLBACK_NOTE;
  const s = info.stats;
  if (!s) return "";
  const heights = `${s.withHeight} of ${s.total} buildings have a measured height`;
  return info.choice === "both" ? `${heights} (OpenStreetMap alone: ${s.osmWithHeight} of ${s.osmTotal}).` : `${heights}.`;
}
