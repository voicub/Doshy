// "Import a city model (.obj)": checks an OBJ the owner made elsewhere (Vectiler's command line, or the halfmaps.io app), packs it and keeps it as a resource of kind "city"
// (lib/db/resources.ts), so it is stored, backed up and served like every other file. Client side.
import { ApiError, NetError, putResource } from "./dbApi";
import { parseObj } from "./siteCityObj";
import { gzip, placeProblem } from "./siteCityState";
import type { CityFile } from "./siteCityTypes";

/** Larger than this before packing is refused outright: it would not fit a phone's memory when drawn. (The database's own limit is 25 MB packed.) */
const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

/** A fresh resource id: letters, digits and dashes only (the database's rule), unique per import. */
const newId = () => `city-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Where on Earth the model is: the zoom the model was made at and, when known, its north-west tile (both numbers, or neither). */
export type CityPlace = { z: number; x?: number; y?: number };

/**
 * Check, pack and store the file. Throws an Error whose message is a sentence to show: not an OBJ, nothing in it, too large, the server refused it (no room), unreachable.
 * The packed bytes are what the server keeps; an OBJ is mostly repeated digits, so it shrinks 5 to 8 times.
 */
export async function importCityFile(file: File, place: CityPlace): Promise<CityFile> {
  const bad = placeProblem(place.z, place.x ?? null, place.y ?? null);
  if (bad) throw new Error(bad);
  if (file.size > MAX_IMPORT_BYTES) throw new Error("That file is too large to draw (over 200 MB). Make the model from fewer tiles.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  await parseObj(bytes); // throws a sentence when it is not a usable OBJ
  const packed = typeof CompressionStream === "undefined" ? bytes : await gzip(bytes);
  const id = newId();
  const name = file.name.slice(0, 120) || "city model.obj";
  try {
    await putResource({ id, kind: "city", mime: "application/octet-stream", name, meta: { z: place.z, ...(place.x !== undefined && place.y !== undefined ? { x: place.x, y: place.y } : {}), bytes: bytes.length } }, packed);
  } catch (e) {
    throw new Error(e instanceof ApiError || e instanceof NetError ? e.message : "The city model could not be kept.");
  }
  return { id, name, z: place.z, ...(place.x !== undefined && place.y !== undefined ? { x: place.x, y: place.y } : {}) };
}
