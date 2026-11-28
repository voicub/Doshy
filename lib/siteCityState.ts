// The pure decisions behind the city model's browser store (lib/siteCityStore.ts): what to load for the site's settings, and how files are packed for storage.
// The node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { siteTarget } from "./siteState.ts";
import { SITE_CITY_ROUTE, type CityFile } from "./siteCityTypes.ts";
import type { Site } from "./siteTypes.ts";

type States = Record<string, { attributes?: Record<string, unknown> }> | undefined;

/** What the city store should have loaded: a Vectiler run for the home's tiles (a URL for the server's route), or an imported file. */
export type CityWant =
  | { key: string; from: "vectiler"; url: string }
  | { key: string; from: "file"; file: CityFile };

/** Null while the site is off, the city model is not chosen, or the home's position is not known yet. The key changes exactly when a different model has to be loaded. */
export function cityWant(site: Site, states: States): CityWant | null {
  const target = siteTarget(site, states);
  if (!target || site.buildingsFrom !== "city" || !site.city) return null;
  const { file, tiles, terrain, roads } = site.city;
  if (file) return { key: `file:${file.id}`, from: "file", file };
  const { lat, lon } = target.center;
  const q = `lat=${lat}&lon=${lon}&tiles=${tiles}&terrain=${terrain ? 1 : 0}&roads=${roads ? 1 : 0}`;
  return { key: `vectiler:${q}`, from: "vectiler", url: `${SITE_CITY_ROUTE}?${q}` };
}

export const isGzip = (b: Uint8Array): boolean => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

async function through(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** Gzip for storage: a 3 x 3 tile OBJ is tens of MB of text and the database keeps 25 MB per file. */
export const gzip = (bytes: Uint8Array<ArrayBuffer>) => through(bytes, new CompressionStream("gzip"));

/** The file's bytes, unpacked when they are gzip (an imported model is stored packed; the server's reply is already unpacked by the browser). */
export const unpack = (bytes: Uint8Array<ArrayBuffer>) => (isGzip(bytes) ? through(bytes, new DecompressionStream("gzip")) : Promise.resolve(bytes));

/** Why the tile numbers typed for an imported model cannot be right (a sentence), or undefined when they are fine. `x` and `y` are both given or both empty. */
export function placeProblem(z: number | null, x: number | null, y: number | null): string | undefined {
  if (z === null || !Number.isInteger(z) || z < 10 || z > 18) return "The zoom is a whole number from 10 to 18 (the --tilez you gave Vectiler, 16 unless you chose otherwise).";
  if ((x === null) !== (y === null)) return "Give both tile numbers, or leave both empty.";
  const n = 2 ** z;
  if (x !== null && y !== null && (![x, y].every((v) => Number.isInteger(v) && v >= 0 && v < n))) return `At zoom ${z} the tile numbers are whole numbers from 0 to ${n - 1}.`;
  return undefined;
}
