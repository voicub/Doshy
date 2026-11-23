// The pure decisions behind the client's site store (lib/siteStore.ts): where the site is, when anything needs fetching, and how the pieces merge.
// The node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { siteCenter, type LatLon } from "./geo.ts";
import { pointInShape, polygonBounds } from "./siteGeom.ts";
import { MAX_TREES } from "./siteOsm.ts";
import type { Site, SiteBuilding, SiteData, SiteTree } from "./siteTypes.ts";

export const NO_HOME_MESSAGE = "Home Assistant has not told us where your home is. Set the home zone in Home Assistant, or type the coordinates in the Site panel.";
export const PHOTO_FAILED_NOTE = "The satellite photo could not be loaded, so the ground is drawn plain and no trees were found in it.";
export const PHOTO_PARTIAL_NOTE = "Part of the satellite photo is missing, so some ground is drawn plain.";

type States = Record<string, { attributes?: Record<string, unknown> }> | undefined;

/** What to show a site for: its centre point (rounded to 5 decimals, about a metre: all that the map services are told, and the photo and the data share one centre) and radius (whole metres), or null while the site is off or has no known position. */
export function siteTarget(site: Site, states: States): { center: LatLon; radius: number } | null {
  if (!site.enabled) return null;
  const c = siteCenter(site, states);
  return c ? { center: { lat: Number(c.lat.toFixed(5)), lon: Number(c.lon.toFixed(5)) }, radius: Math.round(site.radius) } : null;
}

/** Identifies one fetch: the same place and radius (a metre, a metre) is the same key. */
export const targetKey = (t: { center: LatLon; radius: number }): string => `${t.center.lat.toFixed(5)}_${t.center.lon.toFixed(5)}_r${Math.round(t.radius)}`;

export type Have = { dataKey?: string; dataFailedKey?: string; photoKey?: string; photoFailedKey?: string };

/**
 * What still has to be fetched. Nothing while the site is off or has no position. The OpenStreetMap data for a place and radius is fetched once (and a failed
 * attempt is not repeated until the place changes or the owner presses refresh); the satellite photo only while its layer is on (a third-party service: opt-in).
 */
export function fetchPlan(site: Site, states: States, have: Have): { key?: string; data: boolean; photo: boolean } {
  const t = siteTarget(site, states);
  if (!t) return { data: false, photo: false };
  const key = targetKey(t);
  return { key, data: key !== have.dataKey && key !== have.dataFailedKey, photo: site.layers.satellite && key !== have.photoKey && key !== have.photoFailedKey };
}

/**
 * Trees from the map plus the ones found in the photo. A found tree is dropped when it is on top of a mapped tree (the map knows better), inside a building
 * outline (a green roof, not a tree) or outside the radius. Nearest the centre first, at most MAX_TREES.
 */
export function mergeTrees(mapped: readonly SiteTree[], found: readonly SiteTree[], buildings: readonly SiteBuilding[], radius: number): SiteTree[] {
  const boxes = buildings.map((b) => ({ b, box: polygonBounds(b.ring) }));
  const CELL = 8;
  const grid: Record<string, SiteTree[]> = {};
  for (const t of mapped) (grid[`${Math.floor(t.x / CELL)},${Math.floor(t.y / CELL)}`] ??= []).push(t);
  const nearMapped = (p: SiteTree) => {
    const cx = Math.floor(p.x / CELL);
    const cy = Math.floor(p.y / CELL);
    for (let i = cx - 1; i <= cx + 1; i++)
      for (let j = cy - 1; j <= cy + 1; j++) if (grid[`${i},${j}`]?.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < Math.max(1.5, m.crown / 2))) return true;
    return false;
  };
  const kept = found.filter(
    (p) => Math.abs(p.x) <= radius && Math.abs(p.y) <= radius && !nearMapped(p) && !boxes.some(({ b, box }) => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1 && pointInShape([p.x, p.y], b.ring, b.holes)),
  );
  return [...mapped, ...kept].sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y)).slice(0, MAX_TREES);
}

type PhotoSummary = { trees: readonly SiteTree[]; failed: number; credit: string };

/**
 * The data the scene gets: the server's answer, with the photo's trees merged in when the trees layer is on, the photo's credit added to the attribution,
 * and a note when the photo is (partly) missing. `photo` null while the satellite layer is off; `photoFailed` when it was asked for but could not be loaded.
 */
export function composeSiteData(raw: SiteData, photo: PhotoSummary | null, photoFailed: boolean, layers: Pick<Site["layers"], "trees" | "satellite">): SiteData {
  if (!layers.satellite || (!photo && !photoFailed)) return raw;
  const notes = [...raw.notes];
  if (photoFailed) notes.push(PHOTO_FAILED_NOTE);
  if (!photo) return { ...raw, notes };
  if (photo.failed > 0) notes.push(PHOTO_PARTIAL_NOTE);
  const attribution = photo.credit && !raw.attribution.includes(photo.credit) ? [...raw.attribution, photo.credit] : raw.attribution;
  const trees = layers.trees ? mergeTrees(raw.trees, photo.trees, raw.buildings, raw.radius) : raw.trees;
  return { ...raw, trees, attribution, notes };
}
