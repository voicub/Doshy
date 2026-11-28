// The client's city model: loads and parses the OBJ the site's settings ask for (a Vectiler run on the server, or a file the owner imported) and hands the scene
// the parsed model. Only runs while the Surroundings are on and the city model is chosen; nothing is requested otherwise. The decisions are pure and tested in
// lib/siteCityState.ts; this file is the wiring (fetch, abort, the zustand store), like lib/siteStore.ts.
import { create } from "zustand";
import { ApiError, NetError, fetchResourceFile } from "./dbApi";
import { parseObj, type ObjModel } from "./siteCityObj";
import { cityWant, unpack, type CityWant } from "./siteCityState";
import { CITY_META_HEADER, isCityMeta } from "./siteCityTypes";
import { siteOf } from "./siteTypes";
import { useStore } from "./store";

export type CityLoaded = {
  key: string;
  obj: ObjModel;
  /** zoom of the tiles the model was made from; sets its scale */
  z: number;
  /** the north-west tile, when known (always for a Vectiler run); without it the model's middle is put on the site's centre */
  origin?: { x: number; y: number };
  /** the model carries ground height (the terrain meshes are not a single quad) */
  terrain: boolean;
  from: "vectiler" | "file";
};

/** What the scene made of the loaded model for the current size and tier: for the panel's status line. */
export type CityStats = { buildings: number; roadTriangles: number; leftOut: number; hosts: number };

type CityStatus = "off" | "loading" | "ready" | "error";

type CityState = {
  status: CityStatus;
  loaded?: CityLoaded;
  stats?: CityStats;
  /** A plain sentence when status is "error". */
  error?: string;
  /** Ask the server again (a Vectiler run skips its cache with `fresh`). */
  refresh: () => Promise<void>;
};

const FETCH_TIMEOUT_MS = 330_000; // the server allows a Vectiler run 120 s, and runs one at a time: a queue of runs can wait a few minutes
const NOT_HERE = "The city model file is not on this server any more. It may have been deleted under Data and backups: import it again, or choose OpenStreetMap.";

let loadedKey: string | undefined;
let failedKey: string | undefined;
let job: { key: string; ctrl: AbortController } | undefined;

export const useCityState = create<CityState>()(() => ({
  status: "off",
  refresh: () => {
    failedKey = undefined;
    loadedKey = undefined;
    return run(true);
  },
}));

const patch = (p: Partial<Omit<CityState, "refresh">>) => useCityState.setState(p);

const bytesOf = async (buf: ArrayBuffer) => unpack(new Uint8Array(buf));

/** Fetch and parse what `want` names. Throws an Error whose message is the sentence to show. */
async function load(want: CityWant, fresh: boolean, signal: AbortSignal): Promise<Omit<CityLoaded, "key">> {
  if (want.from === "file") {
    let file: { mime: string; buf: ArrayBuffer } | null;
    try {
      file = await fetchResourceFile(want.file.id);
    } catch (e) {
      throw new Error(e instanceof NetError || e instanceof ApiError ? e.message : "The city model file could not be read.");
    }
    if (!file) throw new Error(NOT_HERE);
    const obj = await parseObj(await bytesOf(file.buf));
    const { x, y } = want.file;
    return { obj, z: want.file.z, origin: x === undefined || y === undefined ? undefined : { x, y }, terrain: true, from: "file" };
  }
  const res = await fetch(`${want.url}${fresh ? "&fresh=1" : ""}`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]) });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "The city model could not be loaded.");
  }
  const meta: unknown = JSON.parse(res.headers.get(CITY_META_HEADER) ?? "null");
  if (!isCityMeta(meta)) throw new Error("The city model came back in a form this version does not understand.");
  const obj = await parseObj(new Uint8Array(await res.arrayBuffer()));
  return { obj, z: meta.z, origin: { x: meta.x, y: meta.y }, terrain: meta.terrain, from: "vectiler" };
}

const reason = (e: unknown): string => {
  if (e instanceof DOMException && e.name === "TimeoutError") return "Making the city model took too long. Try again in a minute.";
  if (e instanceof TypeError) return "The dashboard server could not be reached.";
  return e instanceof Error ? e.message : "The city model could not be loaded.";
};

/** Look at the site's settings and load whatever is missing. A failed load is not repeated by itself: changing a setting or Refresh does. */
async function run(fresh = false): Promise<void> {
  const { plan, states } = useStore.getState();
  const want = cityWant(siteOf(plan.site), states);
  if (!want) {
    job?.ctrl.abort();
    job = undefined;
    loadedKey = failedKey = undefined;
    if (useCityState.getState().status !== "off") patch({ status: "off", loaded: undefined, stats: undefined, error: undefined });
    return;
  }
  if (want.key === loadedKey || want.key === failedKey || job?.key === want.key) return;
  job?.ctrl.abort();
  const ctrl = new AbortController();
  job = { key: want.key, ctrl };
  patch({ status: "loading", error: undefined });
  try {
    const loaded = { key: want.key, ...(await load(want, fresh, ctrl.signal)) };
    if (ctrl.signal.aborted) return;
    loadedKey = want.key;
    patch({ status: "ready", loaded, stats: undefined, error: undefined });
  } catch (e) {
    if (ctrl.signal.aborted) return;
    failedKey = want.key;
    patch({ status: "error", error: reason(e), loaded: undefined, stats: undefined });
  } finally {
    if (job?.ctrl === ctrl) job = undefined;
  }
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
