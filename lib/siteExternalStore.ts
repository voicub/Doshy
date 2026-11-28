// The browser-side state of the two newer data sources (detailed ground, Overture buildings): what was asked for which place, what came back, and the jobs that
// ask. Kept apart from lib/siteStore.ts, which calls `startExternal` / `externalOutcomes` / `cancelExternal` and re-publishes when a job finishes.
// A failed answer is kept (and not asked again by itself) until the place changes or the owner presses Refresh, like the OpenStreetMap data.
import { useQuality } from "./quality";
import { radiusBucket, wantsOverture, wantsTerrain, type Outcome, type OvertureAnswer, type TerrainAnswer } from "./siteExternal";
import { fetchOverture, fetchTerrain } from "./siteExternalFetch";
import { TERRAIN_GRID } from "./siteTerrainShape";
import type { Site } from "./siteTypes";

const DEBOUNCE_MS = 500; // a radius slider drag fires many changes: one request when it settles

type Target = { center: { lat: number; lon: number }; radius: number };
type Slot<T> = { place: string; key: string; out: Outcome<T> };

let terrain: Slot<TerrainAnswer> | undefined;
let overture: Slot<OvertureAnswer> | undefined;
let pending: { terrain?: string; overture?: string } = {};
let ctrl = new AbortController();
let timer: ReturnType<typeof setTimeout> | undefined;

const placeOf = (t: Target) => `${t.center.lat.toFixed(5)}_${t.center.lon.toFixed(5)}_r${radiusBucket(t.radius)}`;

/** The detailed ground grid size for the tier in force (the governor may lower the tier: a smaller grid is then asked for, from the server's cached tiles). */
const gridNow = () => TERRAIN_GRID[useQuality.getState().tier];

// one object each: `publish` compares its inputs by identity, so "loading" must be the same value every time or every Home Assistant poll would rebuild the scene
const IDLE: { state: "idle" } = { state: "idle" };
const LOADING: { state: "loading" } = { state: "loading" };
const pick = <T>(slot: Slot<T> | undefined, place: string, wanted: boolean): Outcome<T> => (!wanted ? IDLE : slot && slot.place === place ? slot.out : LOADING);

/** What the composer (`composeExternal`) needs for the current site: the finished answers, or "loading" while they are on their way. Stable objects: the same input gives the same output. */
export function externalOutcomes(site: Site, target: Target): { terrain: Outcome<TerrainAnswer>; overture: Outcome<OvertureAnswer> } {
  const place = placeOf(target);
  return { terrain: pick(terrain, place, wantsTerrain(site)), overture: pick(overture, place, wantsOverture(site)) };
}

/** Starts whatever the site wants and has not been asked for yet; `done` runs after each answer so the scene is re-published. `force` forgets earlier answers (Refresh). */
export function startExternal(site: Site, target: Target, force: boolean, done: () => void): void {
  if (force) {
    ctrl.abort();
    ctrl = new AbortController();
    terrain = overture = undefined;
    pending = {};
  }
  const place = placeOf(target);
  const { lat, lon } = target.center;
  const bucket = radiusBucket(target.radius);
  const signal = ctrl.signal;
  const jobs: (() => void)[] = [];
  const n = gridNow();
  const tKey = `${place}_g${n}`;
  if (wantsTerrain(site) && terrain?.key !== tKey && pending.terrain !== tKey) {
    jobs.push(() => {
      pending.terrain = tKey;
      void fetchTerrain(lat, lon, bucket, n, signal).then((out) => {
        if (signal.aborted) return;
        pending.terrain = undefined;
        terrain = { place, key: tKey, out };
        done();
      });
    });
  }
  if (wantsOverture(site) && overture?.key !== place && pending.overture !== place) {
    jobs.push(() => {
      pending.overture = place;
      void fetchOverture(lat, lon, bucket, signal).then((out) => {
        if (signal.aborted) return;
        pending.overture = undefined;
        overture = { place, key: place, out };
        done();
      });
    });
  }
  clearTimeout(timer);
  if (!jobs.length) return;
  // the first request for a place goes at once; a later change of radius waits for the slider to settle
  const base = place.split("_r")[0];
  const first = ![terrain, overture].some((s) => s?.place.split("_r")[0] === base);
  if (first) jobs.forEach((j) => j());
  else timer = setTimeout(() => jobs.forEach((j) => j()), DEBOUNCE_MS);
}

/** The surroundings were switched off or lost their position: stop what is running. Finished answers are kept (switching on again is then instant). */
export function cancelExternal(): void {
  clearTimeout(timer);
  ctrl.abort();
  ctrl = new AbortController();
  pending = {};
}
