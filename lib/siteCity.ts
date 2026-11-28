// Pure logic of GET /api/site/city (the Vectiler city model): query, tile range, cache key, the child's arguments and environment, and what a run's
// output means. No fs, no child_process (see siteCityServer.ts). The node test runner loads this file: imports carry a .ts extension.
import { tileCorner, tileOf } from "./geo.ts";
import { CITY_TERRAIN_SUB, CITY_TILES, CITY_ZOOM, type CityMeta, type CityTiles } from "./siteCityTypes.ts";

export type CityQuery = { lat: number; lon: number; tiles: CityTiles; terrain: boolean; roads: boolean; fresh: boolean };
export type CityRange = { z: number; x0: number; x1: number; y0: number; y1: number };
export type CityOptions = { terrain: boolean; roads: boolean };

/** Bump when `vectilerArgs` changes: files made with other arguments are then never found again (and age out of the cache). */
export const ARGS_VERSION = 1;
/** Half-width of a road in metres, after the client's cos(lat) correction (see `roadWidthArg`). */
const ROAD_HALF_WIDTH_M = 3;

const DECIMAL = /^-?\d{1,3}(?:\.\d{1,15})?$/;

/** The query's values, or a sentence saying what is wrong. Only plain decimals and the listed words pass: nothing else ever reaches the child's arguments. */
export function parseCityQuery(params: URLSearchParams): CityQuery | string {
  const lat = params.get("lat");
  const lon = params.get("lon");
  if (lat === null || lon === null || !DECIMAL.test(lat) || !DECIMAL.test(lon) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return "Give a latitude (-90 to 90) and a longitude (-180 to 180) as plain numbers.";
  const tiles = params.get("tiles");
  const size = CITY_TILES.find((t) => String(t) === tiles);
  if (size === undefined) return `The size must be ${CITY_TILES.join(" or ")} tiles.`;
  const flag = (name: string, fallback: "0" | "1"): boolean | undefined => {
    const v = params.get(name) ?? fallback;
    return v === "0" ? false : v === "1" ? true : undefined;
  };
  const terrain = flag("terrain", "0");
  const roads = flag("roads", "1");
  if (terrain === undefined || roads === undefined) return "Terrain and roads must each be 0 or 1.";
  return { lat: Number(lat), lon: Number(lon), tiles: size, terrain, roads, fresh: params.get("fresh") === "1" };
}

/** The tile that holds the point, plus (tiles - 1) / 2 each way; cut at the edge of the world, so the range can be smaller there. */
export function cityTileRange(lat: number, lon: number, tiles: CityTiles): CityRange {
  const { x, y } = tileOf(lat, lon, CITY_ZOOM);
  const reach = (tiles - 1) / 2;
  const last = 2 ** CITY_ZOOM - 1;
  return { z: CITY_ZOOM, x0: Math.max(0, x - reach), x1: Math.min(last, x + reach), y0: Math.max(0, y - reach), y1: Math.min(last, y + reach) };
}

export function cityMeta(r: CityRange, o: CityOptions): CityMeta {
  return { z: r.z, x: r.x0, y: r.y0, nx: r.x1 - r.x0 + 1, ny: r.y1 - r.y0 + 1, terrain: o.terrain, roads: o.roads };
}

/** Depends on the range and options only, so neighbouring homes (same tiles) share one file. */
export function cityKey(r: CityRange, o: CityOptions): string {
  return `v${ARGS_VERSION}_z${r.z}_x${r.x0}-${r.x1}_y${r.y0}-${r.y1}_t${o.terrain ? 1 : 0}_r${o.roads ? 1 : 0}`;
}

/**
 * Vectiler scales its road width by the Mercator stretch, so a real half-width of ROAD_HALF_WIDTH_M metres (after the client's cos(lat) correction) needs
 * ROAD_HALF_WIDTH_M / cos(lat) here. The latitude is that of the range's middle, so the value (and the cache key) depends on the range only.
 */
export function roadWidthArg(r: CityRange): number {
  const { lat } = tileCorner(r.z, (r.x0 + r.x1 + 1) / 2, (r.y0 + r.y1 + 1) / 2);
  return Math.round((ROAD_HALF_WIDTH_M / Math.cos((lat * Math.PI) / 180)) * 100) / 100;
}

/** The child's arguments: the key, and numbers and fixed words built from validated integers. */
export function vectilerArgs(r: CityRange, o: CityOptions, apiKey: string): string[] {
  return [
    "--name", "out",
    "--apikey", apiKey,
    "--tilex", `${r.x0}/${r.x1}`,
    "--tiley", `${r.y0}/${r.y1}`,
    "--tilez", String(r.z),
    // One `o` object per feature: the client lifts each building onto the ground and drops the one the home stands in.
    "--splitMeshes", "1",
    "--buildings", "1",
    "--roads", o.roads ? "1" : "0",
    // Flat ribbons without kerb walls: the client tells buildings from roads by whether a mesh has vertical walls.
    "--roadsHeight", "0",
    "--roadsExtrusionWidth", String(roadWidthArg(r)),
    // The height of a building that has none (otherwise it is flat, so invisible), like the OpenStreetMap path's guess.
    "--buildingsHeight", "6",
    "--buildingsExtrusionScale", "1",
    // Always on: without terrain Vectiler also exports every layer's flat polygons and lines (earth, land use, water, boundaries), which the client cannot
    // tell from roads; with it only the "buildings" and "roads" layers are written. Subdivision 1 (a single quad) when the ground shape is not wanted.
    "--terrain", "1",
    "--terrainSubdivision", String(o.terrain ? CITY_TERRAIN_SUB : 1),
    // The client computes its own normals.
    "--normals", "0",
  ];
}

/** The environment of the child: nothing of ours (HA_TOKEN, the dashboard's secrets) except what a program needs to find itself and trust TLS. */
export function childEnv(src: Readonly<Record<string, string | undefined>>, home: string): Record<string, string> {
  const out: Record<string, string> = { HOME: home };
  for (const name of ["PATH", "SSL_CERT_FILE", "SSL_CERT_DIR", "CURL_CA_BUNDLE"]) {
    const v = src[name];
    if (v) out[name] = v;
  }
  return out;
}

/** Vectiler can only take the key as an argument and prints it back ("Using API key ...", `api_key=` in tile URLs): it must never reach a message or a log. */
export function redact(text: string, apiKey: string): string {
  const masked = apiKey ? text.split(apiKey).join("***") : text;
  return masked.replace(/api_key=[^\s&"']*/g, "api_key=***");
}

export type CityFailure = { status: number; message: string };

export const CITY_FAILURES = {
  keyMissing: { status: 503, message: "The city model needs a free Nextzen API key: NEXTZEN_API_KEY is missing or does not look like a key on the server (see docs/site.md)." },
  notInstalled: { status: 503, message: "The city model tool (Vectiler) is not installed on the server (see docs/site.md)." },
  busy: { status: 429, message: "The city model was asked for too often. Try again in a minute." },
  noNetwork: { status: 502, message: "The city model could not be downloaded: the server could not reach Nextzen. Check its internet connection and try again." },
  keyRejected: { status: 502, message: "Nextzen did not accept the API key or did not answer properly. The key may be wrong or expired; a free key is at developers.nextzen.org." },
  incomplete: { status: 502, message: "Nextzen did not send all the map data, so no model was made. Check the server's internet connection and NEXTZEN_API_KEY (a free key is at developers.nextzen.org), then try again." },
  timedOut: { status: 504, message: "Building the city model took too long and was stopped. Try the smaller size." },
  crashed: { status: 502, message: "The city model tool stopped with an error. Try again, or try the smaller size." },
  noData: { status: 404, message: "There is no building data for this area." },
  tooBig: { status: 502, message: "This area is too detailed to load. Try the smaller size." },
} as const satisfies Record<string, CityFailure>;

export type RunResult = { code: number | null; signal: string | null; timedOut: boolean; stdout: string };

/**
 * What a finished run means, or undefined when it looks fine. Vectiler exits 0 even when downloads fail, so its stdout is read:
 * `URL request: <url> -- Failure: <curl error>` (no network), `ERROR: GeoJSON missing 'features' member` / `Error parsing tile` (curl does not fail on an HTTP
 * error, so Nextzen's JSON error body is parsed as a tile), `Failed to download ...` (incomplete output).
 * The mapping is inferred from the source (vectiler.cpp, curl_httpget.cpp) and unverified against the live Nextzen service.
 */
export function explainRun(run: RunResult): CityFailure | undefined {
  if (run.timedOut) return CITY_FAILURES.timedOut;
  if (run.code !== 0) return CITY_FAILURES.crashed;
  if (/-- Failure:/.test(run.stdout)) return CITY_FAILURES.noNetwork;
  if (/GeoJSON missing 'features'|Error parsing tile/.test(run.stdout)) return CITY_FAILURES.keyRejected;
  if (/Failed to download/.test(run.stdout)) return CITY_FAILURES.incomplete;
  return undefined;
}
