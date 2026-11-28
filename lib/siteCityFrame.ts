// Where a Vectiler OBJ sits on Earth, from reading its source (src/projection.cpp, src/geojson.cpp, src/vectiler.cpp):
//  - Every point of a vector tile becomes `(mercator - tileCentre) * invScale`, where `invScale = 1 / (half the tile's width in Web-Mercator metres)`. So one OBJ unit
//    is HALF_CIRCUMFERENCE / 2^z Mercator metres, a whole tile is 2 units wide, x grows EAST and y grows NORTH, z is UP.
//  - Heights (building height, min_height, terrain elevation) are multiplied by the same `invScale` but they are real metres, while the horizontal Mercator metres
//    are stretched by 1 / cos(latitude). So horizontally 1 unit is S * cos(lat) real metres and vertically exactly S real metres (S = HALF_CIRCUMFERENCE / 2^z): a
//    raw OBJ looks squat at our latitudes, and the conversion below puts that right.
//  - With a tile range, tile (x, y) is placed at `((x - x0) * 2, -(y - y0) * 2)` where (x0, y0) is the FIRST tile (north-west), so the OBJ's (0, 0) is the centre of
//    the north-west tile. `--offsetx/--offsety` (never passed by us) would add to that.
// Pure. The node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { latLonToSite, metresPerDegree, tileCorner, type LatLon } from "./geo.ts";

/** Metres from the Earth's centre in Web Mercator (the spherical radius it uses) times pi. */
const HALF_CIRCUMFERENCE = Math.PI * 6378137;
const RAD = Math.PI / 180;

/** OBJ units to site metres (lib/geo.ts axes: x east, y SOUTH about the site's centre): `x = ox + u * kx`, `y = oy - v * ky` (v points north), height = w * kz. */
export type CityFrame = { ox: number; oy: number; kx: number; ky: number; kz: number };

/**
 * The frame of an OBJ whose (0, 0) is the centre of tile (`x`, `y`) at zoom `z`, seen from the site's `centre`. Linear about the centre: over the 1 to 2 km a city
 * model spans the error of the linear step in y is a few centimetres (the same equirectangular approach lib/geo.ts uses for the whole site).
 */
export function cityFrame(centre: LatLon, z: number, tile: { x: number; y: number }): CityFrame {
  const tileCentre = tileCorner(z, tile.x + 0.5, tile.y + 0.5);
  const [ox, oy] = latLonToSite(centre, tileCentre.lat, tileCentre.lon);
  const m = metresPerDegree(centre.lat);
  const unitDeg = 180 / 2 ** z; // degrees of longitude in one unit; the same count of Mercator-y degrees is scaled by cos(lat) below
  return { ox, oy, kx: unitDeg * m.lon, ky: unitDeg * Math.cos(centre.lat * RAD) * m.lat, kz: HALF_CIRCUMFERENCE / 2 ** z };
}

/** The frame of an OBJ whose position on Earth is unknown: the middle of its bounding box (in OBJ units) lands on the site's centre. `z` still sets the scale. */
export function centredFrame(centre: LatLon, z: number, middle: { u: number; v: number }): CityFrame {
  const f = cityFrame(centre, z, { x: 0, y: 0 });
  return { ...f, ox: -middle.u * f.kx, oy: middle.v * f.ky };
}
