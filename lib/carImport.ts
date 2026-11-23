import { Vector3 } from "three";
import { isRecord } from "./guards";
import { autoCalibration, type CarModelEntry } from "./carModels";
import { CURATED_MODELS, applyCurated } from "./carCurated";
import { DEFAULT_BUDGET, exportGlb, optimiseCar } from "./carOptimise";
import type { ApiError, ImportReport, ModelAttribution, SearchPage } from "./modelLibrary";
import { disposeTemplate, parseModel } from "./modelLoad";
import { REQUEST_TIMEOUT_MS, TRANSFER_TIMEOUT_MS, within } from "./requestTimeout";
import { putModel } from "./modelStore";
import { measureTemplate } from "./carTemplate";
import { uid as makeId } from "./uid";

/**
 * "Use this model": download (through our server, which holds the token), read, optimise and keep a real car model, ready to be fitted.
 * Nothing is assigned to a car here: the finder shows the fitting step first, then calls `useCarModels.assign` or `discardImport`.
 */
export type Step = (fraction: number, label: string) => void;

export class FinderError extends Error {
  code: string;
  steps?: string[];
  constructor(code: string, message: string, steps?: string[]) {
    super(message);
    this.code = code;
    this.steps = steps;
  }
}

/** Plain-language failure for a response that is not our JSON error (server down, offline). */
const OFFLINE = new FinderError("offline", "Could not reach the app server. Check that it is running and that this computer is online.");

async function asError(res: Response): Promise<FinderError> {
  const body = (await res.json().catch(() => null)) as ApiError | null;
  const e = body?.error;
  return e ? new FinderError(e.code, e.message, e.steps) : new FinderError("upstream", "The model library did not answer. Try again in a minute.");
}

export async function searchCars(q: string, opts: { cursor?: string | null; heavy: boolean }, signal?: AbortSignal): Promise<SearchPage> {
  const p = new URLSearchParams({ q });
  if (opts.cursor) p.set("cursor", opts.cursor);
  if (opts.heavy) p.set("heavy", "1");
  const res = await fetch(`/api/models/search?${p}`, { signal: within(REQUEST_TIMEOUT_MS, signal) }).catch((e) => {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw OFFLINE;
  });
  if (!res.ok) throw await asError(res);
  return (await res.json()) as SearchPage;
}

const decodeMeta = <T>(header: string | null): T => {
  if (!header) throw new FinderError("upstream", "The download came without its credits, so it was not kept.");
  const bytes = Uint8Array.from(atob(header), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
};

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: within(TRANSFER_TIMEOUT_MS, signal) }).catch((e) => {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw OFFLINE;
  });
  if (!res.ok) throw await asError(res);
  return res;
}

export async function downloadModel(uid: string, signal?: AbortSignal): Promise<{ buf: ArrayBuffer; attribution: ModelAttribution; report: ImportReport }> {
  const res = await post("/api/models/import", { uid }, signal);
  return { buf: await res.arrayBuffer(), ...decodeMeta<{ attribution: ModelAttribution; report: ImportReport }>(res.headers.get("x-housey-model")) };
}

/** One alternative the server ranked below its pick (shown to the user, who can ask for the next one). */
export type AutoAlt = { uid: string; name: string; author: string; license: { slug: string; label: string }; faces: number; thumb?: string; url: string; score: number };

/** The server picks the best model for a catalogue car itself (lib/modelRank.ts), skipping `skip` (models already tried), and sends it back. */
export async function autoDownload(carId: string, skip: string[], signal?: AbortSignal) {
  const res = await post("/api/models/auto", { carId, skip: skip.slice(-20) }, signal);
  const meta = decodeMeta<{ attribution: ModelAttribution; report: ImportReport; pick: { uid: string; score: number; heavy: boolean }; alternatives: AutoAlt[] }>(res.headers.get("x-housey-model"));
  return { buf: await res.arrayBuffer(), ...meta };
}

/** Is a Sketchfab token set on the server? (The token itself never leaves it.) */
export async function tokenStatus(): Promise<boolean> {
  const res = await fetch("/api/models/status", { cache: "no-store", signal: within(REQUEST_TIMEOUT_MS) }).catch(() => null);
  if (!res?.ok) return false;
  const body: unknown = await res.json().catch(() => null);
  return isRecord(body) && body.tokenConfigured === true;
}

/** "Keep every detail": no triangle limit for the near model (hidden parts are still dropped) and pictures up to 4096 px. A big file and a slower scene. */
const FULL_DETAIL = { near: Infinity, maxTexture: 4096 };

/** A clean .glb from the server -> an optimised .glb in the model store, with a first-guess fitting (turned the right way, standing on the ground). */
export async function keepCarModel(buf: ArrayBuffer, attribution: ModelAttribution, step: Step, opts: { fullDetail?: boolean } = {}): Promise<{ entry: CarModelEntry; trianglesBefore: number }> {
  step(0.3, "Reading the model");
  const tpl = await parseModel(buf, "glb");
  let optimised: ArrayBuffer;
  let report;
  try {
    const curated = CURATED_MODELS[attribution.uid];
    if (curated) applyCurated(tpl.root, curated);
    const budget = { ...DEFAULT_BUDGET, ...curated?.budget, ...(opts.fullDetail ? FULL_DETAIL : {}) };
    const r = await optimiseCar(tpl.root, budget, (f, label) => step(0.3 + f * 0.6, label));
    report = r.report;
    step(0.92, "Packing");
    optimised = await exportGlb(r.root);
    disposeTemplate({ root: r.root, size: new Vector3() });
  } finally {
    disposeTemplate(tpl);
  }
  // read the result back once: it is what will be shown, so it is what gets measured
  const check = await parseModel(optimised, "glb");
  const measure = measureTemplate(check);
  disposeTemplate(check);
  if (!measure) throw new FinderError("invalid_model", "This model has no car-like shape in it. Try another one.");
  step(0.96, "Saving");
  const resource = `carmodel-${attribution.uid.slice(0, 8)}-${makeId().slice(-6)}`;
  await putModel(resource, { ext: "glb", buf: optimised });
  step(1, "Done");
  const entry: CarModelEntry = { resource, calib: autoCalibration(measure), attribution, triangles: report.near, bytes: optimised.byteLength, addedAt: Date.now() };
  return { entry, trianglesBefore: report.trianglesBefore };
}
