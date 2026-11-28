// The browser's two requests to this app's own server for the detailed ground and the Overture buildings (routes app/api/site/terrain and app/api/site/overture).
// Both answer a plain sentence on failure; a 403 means the server's owner switched third-party downloads off (DOSHY_EXTERNAL_DATA=0), which is not an error to show.
import { isOvertureAnswer, isTerrainAnswer, type Outcome, type OvertureAnswer, type TerrainAnswer } from "./siteExternal";

const TIMEOUT_MS = 90_000;

async function ask<T>(url: string, valid: (v: unknown) => v is T, signal: AbortSignal): Promise<Outcome<T>> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok && valid(body)) return { state: "ok", value: body };
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : undefined;
    return { state: "failed", disabled: res.status === 403, message };
  } catch {
    return { state: "failed", disabled: false };
  }
}

/** The detailed ground: `n` grid nodes per side (odd) around the point, out to `radius` metres. */
export const fetchTerrain = (lat: number, lon: number, radius: number, n: number, signal: AbortSignal): Promise<Outcome<TerrainAnswer>> =>
  ask(`/api/site/terrain?lat=${lat}&lon=${lon}&radius=${radius}&n=${n}`, isTerrainAnswer, signal);

/** The Overture Maps buildings within `radius` metres of the point. */
export const fetchOverture = (lat: number, lon: number, radius: number, signal: AbortSignal): Promise<Outcome<OvertureAnswer>> =>
  ask(`/api/site/overture?lat=${lat}&lon=${lon}&radius=${radius}`, isOvertureAnswer, signal);
