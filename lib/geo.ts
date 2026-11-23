// Geography for the "Site" feature: latitude/longitude <-> metres about the site's centre, site axes <-> plan axes, and slippy-map tile maths.
// Pure (no DOM, no three.js). The node test runner loads this file directly: imports carry a .ts extension or are type-only.
// An equirectangular projection about the centre is exact enough at the site's size (<= 600 m: well under a centimetre of error per kilometre^2).
import type { Site, XY } from "./siteTypes.ts";

export type LatLon = { lat: number; lon: number };
const RAD = Math.PI / 180;

/** Metres in one degree of latitude and of longitude at `lat` (WGS84 series). */
export function metresPerDegree(lat: number): { lat: number; lon: number } {
  const p = lat * RAD;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p),
  };
}

/** Site axes (metres about `center`: x east, y south) of a point on Earth. */
export function latLonToSite(center: LatLon, lat: number, lon: number): XY {
  const m = metresPerDegree(center.lat);
  return [(lon - center.lon) * m.lon, -(lat - center.lat) * m.lat];
}

/** The inverse of `latLonToSite`. */
export function siteToLatLon(center: LatLon, xy: XY): LatLon {
  const m = metresPerDegree(center.lat);
  return { lat: center.lat - xy[1] / m.lat, lon: center.lon + xy[0] / m.lon };
}

/** Rotate clockwise on screen (x east, y south) by `deg`. */
function turn(xy: XY, deg: number): XY {
  const a = deg * RAD;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [xy[0] * c - xy[1] * s, xy[0] * s + xy[1] * c];
}

/**
 * Site axes -> plan axes. The plan's origin lies `site.dx` east and `site.dy` south of the centre point, and the plan's up direction (-y) faces
 * compass `bearing` degrees: a point whose compass direction from the origin is theta shows up at theta - bearing clockwise from plan-up.
 */
export function siteToPlan(site: Pick<Site, "dx" | "dy">, bearing: number, xy: XY): XY {
  return turn([xy[0] - site.dx, xy[1] - site.dy], -bearing);
}

/** The inverse of `siteToPlan`. */
export function planToSite(site: Pick<Site, "dx" | "dy">, bearing: number, xy: XY): XY {
  const r = turn(xy, bearing);
  return [r[0] + site.dx, r[1] + site.dy];
}

/** Home Assistant's `zone.home` position, or null when it has none. */
export function homeOf(states: Record<string, { attributes?: Record<string, unknown> }> | undefined): LatLon | null {
  const a = states?.["zone.home"]?.attributes;
  return validLatLon(a?.latitude, a?.longitude);
}

/** A finite, in-range coordinate pair, or null. */
export function validLatLon(lat: unknown, lon: unknown): LatLon | null {
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/** The site's centre point: the manual coordinates, or Home Assistant's home. Null while neither is known. */
export function siteCenter(site: Pick<Site, "source" | "lat" | "lon">, states: Record<string, { attributes?: Record<string, unknown> }> | undefined): LatLon | null {
  return site.source === "manual" ? validLatLon(site.lat, site.lon) : homeOf(states);
}

// ---- slippy-map tiles (Web Mercator, the XYZ scheme every satellite provider uses) -------------------------------------------------------

const MAX_LAT = 85.0511287798;

/** The tile that contains a point at zoom `z`. */
export function tileOf(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const la = Math.min(MAX_LAT, Math.max(-MAX_LAT, lat)) * RAD;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n);
  const clamp = (v: number) => Math.min(n - 1, Math.max(0, v));
  return { x: clamp(x), y: clamp(y) };
}

/** Latitude/longitude of the north-west corner of tile x, y at zoom z. */
export function tileCorner(z: number, x: number, y: number): LatLon {
  const n = 2 ** z;
  return { lat: Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) / RAD, lon: (x / n) * 360 - 180 };
}

/** A tile's rectangle in site metres about `center` (y south, so y0 is the north edge). */
export function tileBoundsSite(center: LatLon, z: number, x: number, y: number): { x0: number; y0: number; x1: number; y1: number } {
  const nw = tileCorner(z, x, y);
  const se = tileCorner(z, x + 1, y + 1);
  const [x0, y0] = latLonToSite(center, nw.lat, nw.lon);
  const [x1, y1] = latLonToSite(center, se.lat, se.lon);
  return { x0, y0, x1, y1 };
}
