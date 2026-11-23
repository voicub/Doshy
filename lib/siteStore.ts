// The client's view of the surroundings: fetches the site's data (and, only when the owner turns the satellite layer on, the photo and the trees in it)
// whenever the plan's `site` or Home Assistant's home position says it is needed, and hands the scene one merged `SiteData`. The decisions are pure and tested
// in lib/siteState.ts; this file is the wiring (fetch, abort, timers, the zustand store).
import { create } from "zustand";
import { detectPhotoTrees, loadSitePhoto, type SitePhoto } from "./sitePhoto";
import { NO_HOME_MESSAGE, composeSiteData, fetchPlan, siteTarget, targetKey, type Have } from "./siteState";
import { isSiteData, siteOf, type SiteData, type SiteTree } from "./siteTypes";
import { useStore } from "./store";

type SiteStatus = "off" | "loading" | "ready" | "error";

type SiteState = {
  status: SiteStatus;
  /** The OpenStreetMap data with the photo's trees merged in (when the trees and satellite layers are both on). Kept on screen while a new radius loads. */
  data?: SiteData;
  /** Only while the satellite layer is on. */
  photo?: SitePhoto;
  center?: { lat: number; lon: number };
  /** A plain sentence when status is "error". */
  error?: string;
  /** Ask again. `force` skips the server's 30-day cache and loads the photo again (the "refresh" button); without it, only what failed or is missing is fetched. */
  refresh: (force?: boolean) => Promise<void>;
};

const DEBOUNCE_MS = 500; // a radius slider drag fires many changes: one request when it settles
const DATA_TIMEOUT_MS = 210_000; // a cold fetch asks OpenStreetMap, which can take a minute or more

const placeOf = (key: string) => key.split("_r")[0];

// ---- module state: what has been fetched, for which place -----------------------------------------------------------------------------
let raw: { key: string; data: SiteData } | undefined;
let photo: { key: string; photo: SitePhoto; trees?: SiteTree[] } | undefined;
const have: Have = {};
let wantedKey: string | undefined;
let dataJob: { key: string; ctrl: AbortController; done: Promise<void> } | undefined;
let photoJob: { key: string; ctrl: AbortController; done: Promise<void> } | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let published: unknown[] = [];
let finding = false;

export const useSiteState = create<SiteState>()(() => ({
  status: "off",
  refresh: (force = false) => {
    have.dataFailedKey = have.photoFailedKey = undefined;
    return run(force);
  },
}));

/** setState that does nothing when nothing changes: Home Assistant is polled every few seconds and the 3D scene must not re-render for it. */
function patch(p: Partial<Omit<SiteState, "refresh">>) {
  const cur: Record<string, unknown> = useSiteState.getState();
  if (Object.entries(p).every(([k, v]) => Object.is(cur[k], v))) return;
  useSiteState.setState(p);
}

function cancelAll() {
  clearTimeout(timer);
  dataJob?.ctrl.abort();
  photoJob?.ctrl.abort();
  dataJob = photoJob = undefined;
}

/** Hand the scene the merged data, but only when one of its inputs actually changed (the polling of Home Assistant must not re-render the 3D scene). */
function publish() {
  const { plan } = useStore.getState();
  const site = siteOf(plan.site);
  const target = siteTarget(site, useStore.getState().states);
  if (!target || !raw || raw.key !== targetKey(target)) return;
  const usePhoto = site.layers.satellite && photo?.key === raw.key ? photo : undefined;
  const failed = site.layers.satellite && have.photoFailedKey === raw.key;
  const inputs = [raw.data, usePhoto, usePhoto?.trees, failed, site.layers.trees, site.layers.satellite];
  if (useSiteState.getState().status === "ready" && inputs.length === published.length && inputs.every((v, i) => v === published[i])) return;
  published = inputs;
  const summary = usePhoto ? { trees: usePhoto.trees ?? [], failed: usePhoto.photo.failed, credit: usePhoto.photo.credit } : null;
  patch({ status: "ready", data: composeSiteData(raw.data, summary, failed, site.layers), photo: usePhoto?.photo, center: target.center, error: undefined });
}

async function fetchData(key: string, lat: number, lon: number, radius: number, fresh: boolean) {
  const ctrl = new AbortController();
  dataJob?.ctrl.abort();
  const stale = raw && placeOf(raw.key) !== placeOf(key);
  patch({ status: "loading", error: undefined, ...(stale ? { data: undefined, photo: undefined } : {}) });
  const done = (async () => {
    try {
      const url = `/api/site/data?lat=${lat}&lon=${lon}&radius=${radius}${fresh ? "&fresh=1" : ""}`;
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(DATA_TIMEOUT_MS)]) });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "The surroundings could not be loaded.");
      if (!isSiteData(body)) throw new Error("The surroundings came back in a form this version does not understand.");
      if (ctrl.signal.aborted) return;
      raw = { key, data: body };
      have.dataKey = key;
      have.dataFailedKey = undefined;
    } catch (e) {
      if (ctrl.signal.aborted) return;
      have.dataFailedKey = key;
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      patch({
        status: "error",
        error: timedOut ? "Loading the surroundings took too long. Try again in a minute." : e instanceof TypeError ? "The dashboard server could not be reached." : e instanceof Error ? e.message : "The surroundings could not be loaded.",
      });
    }
  })();
  dataJob = { key, ctrl, done };
  await done;
  if (dataJob?.ctrl === ctrl) dataJob = undefined;
}

async function loadPhoto(key: string, lat: number, lon: number, radius: number) {
  const ctrl = new AbortController();
  photoJob?.ctrl.abort();
  const done = (async () => {
    try {
      const p = await loadSitePhoto({ lat, lon }, radius, ctrl.signal);
      if (ctrl.signal.aborted) return;
      photo = { key, photo: p };
      have.photoKey = key;
      have.photoFailedKey = undefined;
    } catch {
      if (ctrl.signal.aborted) return;
      have.photoFailedKey = key;
    }
  })();
  photoJob = { key, ctrl, done };
  await done;
  if (photoJob?.ctrl === ctrl) photoJob = undefined;
  if (!ctrl.signal.aborted) publish();
}

/** Finds the trees in a loaded photo, once, when the trees layer is on. */
async function findTrees() {
  const site = siteOf(useStore.getState().plan.site);
  const p = photo;
  if (!p || p.trees || finding || !site.layers.satellite || !site.layers.trees) return;
  finding = true;
  try {
    p.trees = await detectPhotoTrees(p.photo);
  } catch {
    p.trees = [];
  } finally {
    finding = false;
  }
  publish();
}

/** Look at the plan and Home Assistant and start whatever is missing. Resolves when the fetches it started are done. */
async function run(force = false): Promise<void> {
  const { plan, states, haError } = useStore.getState();
  const site = siteOf(plan.site);
  if (!site.enabled) {
    cancelAll();
    wantedKey = undefined;
    published = [];
    if (useSiteState.getState().status !== "off") patch({ status: "off", data: undefined, photo: undefined, center: undefined, error: undefined });
    return;
  }
  const target = siteTarget(site, states);
  if (!target) {
    cancelAll();
    wantedKey = undefined;
    published = [];
    // Home Assistant's states may simply not have arrived yet: wait for them rather than flash an error
    if (site.source === "home" && Object.keys(states).length === 0 && !haError) patch({ status: "loading", error: undefined, center: undefined });
    else patch({ status: "error", error: NO_HOME_MESSAGE, data: undefined, photo: undefined, center: undefined });
    return;
  }
  if (force) {
    raw = photo = undefined;
    have.dataKey = have.photoKey = undefined;
  }
  const want = fetchPlan(site, states, have);
  const key = want.key as string;
  wantedKey = key;
  const { lat, lon } = target.center;
  const jobs: Promise<void>[] = [];
  if (want.data && dataJob?.key !== key) {
    clearTimeout(timer);
    if (have.dataKey === undefined || force) jobs.push(fetchData(key, lat, lon, target.radius, force));
    else timer = setTimeout(() => wantedKey === key && void fetchData(key, lat, lon, target.radius, false).then(() => run()), DEBOUNCE_MS);
  }
  await Promise.all(jobs);
  if (wantedKey !== key) return;
  publish();
  // the photo waits for the data of the same place and radius, so dragging the radius slider asks for the photo once, when it settles
  if (want.photo && raw?.key === key && photoJob?.key !== key) await loadPhoto(key, lat, lon, target.radius);
  if (wantedKey === key) await findTrees();
}

if (typeof window !== "undefined") {
  let lastSite = useStore.getState().plan.site;
  let lastStates = useStore.getState().states;
  useStore.subscribe((s) => {
    if (s.plan.site === lastSite && s.states === lastStates) return;
    lastSite = s.plan.site;
    lastStates = s.states;
    void run();
  });
  void run();
}
