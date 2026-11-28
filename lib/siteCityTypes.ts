// "City model" source of the Surroundings: buildings and roads from Vectiler (https://github.com/karimnaaji/vectiler), which turns Nextzen vector tiles into a Wavefront OBJ.
// Types and limits shared by the server (lib/siteCity.ts, lib/siteCityServer.ts, app/api/site/city), the client store and the scene.
// The node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { isRecord } from "./guards.ts";

/** Zoom of the vector tiles asked for. Vectiler exports terrain only from zoom 15, and 16 is the finest zoom with building heights worth drawing (a tile is about 430 m wide at 45 degrees north). */
export const CITY_ZOOM = 16;
/** Tiles across a Vectiler run (centred on the tile that holds the home). 3 x 3 is about 1.3 km, 5 x 5 about 2.2 km; more would only cost memory and Nextzen requests. */
export const CITY_TILES = [3, 5] as const;
export type CityTiles = (typeof CITY_TILES)[number];
/** Vertices per side of each tile's terrain mesh when the city's own ground shape is wanted; a single quad otherwise (Vectiler needs `--terrain 1` to leave out the flat land-use polygons, the quad is just its by-product). */
export const CITY_TERRAIN_SUB = 32;

/** What the server tells the client about the OBJ it sends (header `x-city-meta`, JSON), and what an imported file's owner types in: where the OBJ sits on Earth. */
export type CityMeta = {
  z: number;
  /** The north-west tile of the range: its CENTRE is the OBJ's (0, 0), x east, y north, z up, one tile = 2 units wide (see docs/site.md, "How the OBJ is placed"). */
  x: number;
  y: number;
  /** Tiles in the range (east-west, north-south). */
  nx: number;
  ny: number;
  /** The terrain meshes carry real ground height (the quad otherwise). */
  terrain: boolean;
  roads: boolean;
};

export const isCityMeta = (v: unknown): v is CityMeta =>
  isRecord(v) &&
  [v.z, v.x, v.y, v.nx, v.ny].every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0) &&
  typeof v.terrain === "boolean" &&
  typeof v.roads === "boolean";

/** The route: GET /api/site/city?lat=&lon=&tiles=3|5&terrain=0|1&roads=0|1[&fresh=1] answers the OBJ (gzip, content-encoding) with `x-city-meta`. */
export const SITE_CITY_ROUTE = "/api/site/city";
export const CITY_META_HEADER = "x-city-meta";

/** A city model the owner imported (a resource of kind "city", see lib/db/resources.ts) and where on Earth it is. Without `x`, `y` the middle of the model is put on the site's centre. */
export type CityFile = { id: string; name: string; z: number; x?: number; y?: number };

/** What the owner chose for the city model (`Site.city`). */
export type SiteCity = {
  tiles: CityTiles;
  /** The ground shape comes from the city model instead of Open-Meteo (needs real ground tiles from Nextzen: more downloads). */
  terrain: boolean;
  roads: boolean;
  /** An imported file is used instead of asking Nextzen. */
  file?: CityFile;
};

export const DEFAULT_CITY: SiteCity = { tiles: 3, terrain: false, roads: true };
