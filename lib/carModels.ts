import type { CarSpec } from "./cars.ts";
import type { ModelAttribution } from "./modelLibrary.ts";
import { isRecord } from "./guards.ts";
import { clamp } from "./mathUtil.ts";

/**
 * Real 3D models for catalogue cars. A mapping says "every car of this catalogue id is drawn with that imported model"; the plan itself
 * only ever stores the catalogue car id. Everything here is pure (no React, no storage): the calibration maths that puts a model of unknown
 * orientation and size onto a car's published footprint, the cleaning of stored entries, the search words and the credits list.
 * Local car coordinates (lib/cars.ts): front = +z, the car's left = +x, y up, centred on the footprint, standing on y = 0.
 */

/** What the user (or the first guess) decided about one imported model. Rotations are quarter turns. */
export type Calibration = {
  rotY: number; // 0..3 quarter turns about the vertical axis
  flip: boolean; // turned another half turn (the "Flip front / back" button)
  yOffset: number; // metres up (+) or down (-) after the wheels were put on the ground
  scale: number; // user nudge on top of the automatic fit, 0.8..1.25
};

export type CarModelEntry = {
  resource: string; // id in lib/modelStore (an optimised .glb)
  calib: Calibration;
  paintKey?: string; // material that takes the paint colour (lib/carPaintMap key); undefined = guess
  keepOriginal?: boolean; // keep the model's own paint colour
  attribution: ModelAttribution;
  triangles: number;
  bytes: number;
  addedAt: number;
};
const WRONG_WAY = 1.3; // width and length scales this far apart: the model's length is not along the car's length

export const DEFAULT_CALIB: Calibration = { rotY: 0, flip: false, yOffset: 0, scale: 1 };
const SCALE_RANGE = [0.8, 1.25] as const;
const OFFSET_RANGE = [-0.5, 0.5] as const;
const DIFFERENT_GENERATION = 0.06; // the model's shape differs from the published size by more than this share
const BAND = [0.12, 0.5] as const; // body sides live between these shares of the height (below the mirrors, above the sills)
const TRIM_P = 0.002; // outliers (aerials, photoscan crumbs) are ignored at both ends of each measured axis
const ID = /^[a-z0-9_-]{1,64}$/i;

/** One mesh worth of world-space vertices (x, y, z triples) and whether it belongs to a wheel or tyre. */
export type PointCloud = { pos: ArrayLike<number>; wheel: boolean };

export type Measure = {
  centre: [number, number]; // x, z of the middle of the body
  ground: number; // y the wheels stand on
  size: [number, number, number]; // x, y (height) and z extents of the body as found, mirrors and aerials left out
  lengthAxis: "x" | "z";
  front: 1 | -1; // which way the nose points along the length axis: +1 = toward +axis
};

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

function span(values: number[]): [number, number] {
  const s = values.slice().sort((a, b) => a - b);
  return [quantile(s, TRIM_P), quantile(s, 1 - TRIM_P)];
}

/** Where the car's body is, how big it is without mirrors, where the ground is and which way it faces (best guess). null when there is nothing to measure. */
export function measureModel(clouds: PointCloud[]): Measure | null {
  const all: [number, number, number][] = [];
  const ys: number[] = [];
  const wheelYs: number[] = [];
  for (const { pos, wheel } of clouds) {
    for (let i = 0; i + 2 < pos.length; i += 3) {
      ys.push(pos[i + 1]);
      if (wheel) wheelYs.push(pos[i + 1]);
    }
  }
  if (ys.length < 3) return null;
  const [lowAll, top] = span(ys);
  // the lowest wheel contact is the ground; without wheels the lowest part of the model is
  const ground = wheelYs.length >= 3 ? span(wheelYs)[0] : lowAll;
  const height = top - ground;
  if (!(height > 1e-6)) return null;
  const y0 = ground + height * BAND[0];
  const y1 = ground + height * BAND[1];
  const xs: number[] = [];
  const zs: number[] = [];
  for (const { pos } of clouds) {
    for (let i = 0; i + 2 < pos.length; i += 3) {
      if (pos[i + 1] < y0 || pos[i + 1] > y1) continue;
      all.push([pos[i], pos[i + 1], pos[i + 2]]);
      xs.push(pos[i]);
      zs.push(pos[i + 2]);
    }
  }
  if (xs.length < 3) return null;
  const [x0, x1] = span(xs);
  const [z0, z1] = span(zs);
  const lengthAxis: "x" | "z" = x1 - x0 > z1 - z0 ? "x" : "z";
  const mid = lengthAxis === "x" ? (x0 + x1) / 2 : (z0 + z1) / 2;
  // the glasshouse sits behind the middle of nearly every car (long bonnet, short tail): the roof points tell where the front is
  let roof = 0;
  let n = 0;
  for (const { pos } of clouds) {
    for (let i = 0; i + 2 < pos.length; i += 3) {
      if (pos[i + 1] < ground + height * 0.78) continue;
      roof += lengthAxis === "x" ? pos[i] : pos[i + 2];
      n++;
    }
  }
  const front = n && roof / n - mid > 0 ? -1 : 1;
  return { centre: [(x0 + x1) / 2, (z0 + z1) / 2], ground, size: [x1 - x0, height, z1 - z0], lengthAxis, front };
}

/** The first guess: turn the model so its length runs along z and its nose points to +z. */
export function autoCalibration(m: Measure): Calibration {
  // quarter turns about y (three.js): +z stays, +x goes to +z after 3, -z after 2, -x after 1
  const rotY = m.lengthAxis === "z" ? (m.front === 1 ? 0 : 2) : m.front === 1 ? 3 : 1;
  return { ...DEFAULT_CALIB, rotY };
}

export type Fit = {
  yaw: number; // radians, about y
  scale: [number, number, number]; // in the car's frame (after turning)
  yOffset: number;
  centre: [number, number, number]; // native point that ends up at the origin
  differs: boolean; // the shape is more than 6 % off the published size: probably another generation
};

export const quarterTurns = (c: Calibration) => (((c.rotY + (c.flip ? 2 : 0)) % 4) + 4) % 4;

/** How to place a measured model on a car of `dims` (metres): turn it, scale it to the published size, stand it on y = 0. */
export function fitModel(m: Measure, c: Calibration, dims: { w: number; d: number; h: number }): Fit {
  const q = quarterTurns(c);
  const [bx, by, bz] = m.size;
  const [ex, ez] = q % 2 ? [bz, bx] : [bx, bz]; // extents along x and z after turning
  const rw = dims.w / Math.max(ex, 1e-6);
  const rh = dims.h / Math.max(by, 1e-6);
  const rl = dims.d / Math.max(ez, 1e-6);
  const differs = Math.max(Math.abs(rw / rl - 1), Math.abs(rh / rl - 1)) > DIFFERENT_GENERATION;
  // a model of the right proportions fills the published length x width x height exactly; another generation keeps its own proportions at the
  // right length; a model lying the wrong way round (length along x) is shrunk to fit inside the box so it never fills the screen
  const wrongWay = Math.max(rw, rl) / Math.min(rw, rl) > WRONG_WAY;
  const s = clamp(c.scale, SCALE_RANGE[0], SCALE_RANGE[1]);
  const fit = Math.min(rw, rh, rl) * s;
  const scale: [number, number, number] = wrongWay ? [fit, fit, fit] : differs ? [rl * s, rl * s, rl * s] : [rw * s, rh * s, rl * s];
  return { yaw: (q * Math.PI) / 2, scale, yOffset: clamp(c.yOffset, OFFSET_RANGE[0], OFFSET_RANGE[1]), centre: [m.centre[0], m.ground, m.centre[1]], differs: differs && !wrongWay };
}

/** `calib` with a change applied and every number kept in range. */
export function nudge(c: Calibration, change: Partial<Calibration>): Calibration {
  const n = { ...c, ...change };
  return {
    rotY: ((Math.round(n.rotY) % 4) + 4) % 4,
    flip: !!n.flip,
    yOffset: Math.round(clamp(n.yOffset, OFFSET_RANGE[0], OFFSET_RANGE[1]) * 1000) / 1000,
    scale: Math.round(clamp(n.scale, SCALE_RANGE[0], SCALE_RANGE[1]) * 1000) / 1000,
  };
}

const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : fallback);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const https = (v: unknown) => {
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
};
const LICENSES = ["cc0", "by", "by-sa"] as const;

/** A stored attribution is untrusted input (storage, imported plan): plain text, https links, an allowed licence; null when it cannot be trusted. */
export function cleanAttribution(raw: unknown): ModelAttribution | null {
  const a = isRecord(raw) ? raw : {};
  const license = LICENSES.find((l) => l === a.license);
  const uid = typeof a.uid === "string" && /^[a-f0-9]{32}$/.test(a.uid) ? a.uid : "";
  const sourceUrl = https(a.sourceUrl);
  const name = text(a.name, 80);
  const line = text(a.line, 600);
  if (!license || !uid || !sourceUrl || !name || !line) return null;
  return { source: "sketchfab", uid, name, author: text(a.author, 80) || "Unknown author", authorUrl: https(a.authorUrl), license, licenseLabel: text(a.licenseLabel, 60), licenseUrl: https(a.licenseUrl), sourceUrl, line };
}

/** A stored mapping entry, checked; null when unusable (then the car simply draws as the built-in model). */
export function cleanEntry(raw: unknown): CarModelEntry | null {
  const e = isRecord(raw) ? raw : {};
  const attribution = cleanAttribution(e.attribution);
  if (typeof e.resource !== "string" || !ID.test(e.resource) || !attribution) return null;
  const c = isRecord(e.calib) ? e.calib : {};
  return {
    resource: e.resource,
    calib: nudge(DEFAULT_CALIB, { rotY: num(c.rotY, 0, 3, 0), flip: c.flip === true, yOffset: num(c.yOffset, -1, 1, 0), scale: num(c.scale, 0, 10, 1) }),
    ...(typeof e.paintKey === "string" && e.paintKey.length <= 120 ? { paintKey: e.paintKey } : {}),
    ...(e.keepOriginal === true ? { keepOriginal: true } : {}),
    attribution,
    triangles: Math.round(num(e.triangles, 0, 1e8, 0)),
    bytes: Math.round(num(e.bytes, 0, 1e10, 0)),
    addedAt: Math.round(num(e.addedAt, 0, 1e15, 0)),
  };
}

/** Cleans a whole stored map, dropping every entry that cannot be trusted and every key that is not a car id. */
export function cleanMap(raw: unknown): Record<string, CarModelEntry> {
  const out: Record<string, CarModelEntry> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw)) {
    const e = id.startsWith("car_") && ID.test(id) ? cleanEntry(v) : null;
    if (e) out[id] = e;
  }
  return out;
}

/** Regional names of the same car (also used by the automatic pick), so a search finds it under every name it was sold as. */
export const ALSO_SOLD_AS: Record<string, string[]> = {
  "Mitsubishi ASX": ["Mitsubishi Outlander Sport", "Mitsubishi RVR"],
  "Mitsubishi Mirage": ["Mitsubishi Space Star"],
  "Mitsubishi L200": ["Mitsubishi Triton"],
  "Vauxhall Corsa": ["Opel Corsa"],
  "Opel Corsa": ["Vauxhall Corsa"],
  "Opel Astra": ["Vauxhall Astra"],
  "Vauxhall Astra": ["Opel Astra"],
  "Toyota Corolla": ["Toyota Auris"],
  "Nissan Qashqai": ["Nissan Rogue Sport"],
  "Honda Jazz": ["Honda Fit"],
  "Honda HR-V": ["Honda Vezel"],
};

/** Years a catalogue car's body was built, when the label year alone cannot judge a model's generation (the 2016 ASX is the first-generation body, 2010 to 2016 before the restyles). */
export const GENERATIONS: Record<string, [from: number, to: number]> = {
  car_mitsubishi_asx_2016: [2010, 2016],
};

/** The words to start a search with: the full catalogue name ("Mitsubishi ASX 2016"), plus plainer and regional alternatives to try. */
export function searchWords(spec: Pick<CarSpec, "label" | "brand">): { query: string; alternatives: string[] } {
  const query = spec.label.replace(/\s+/g, " ").trim();
  const noYear = query.replace(/\b(19|20)\d{2}\b/g, "").replace(/\s+/g, " ").trim();
  const alts = [noYear, ...(ALSO_SOLD_AS[noYear] ?? []), ...(noYear.split(" ").length > 2 ? [noYear.split(" ").slice(0, 2).join(" ")] : [])];
  return { query, alternatives: [...new Set(alts)].filter((a) => a && a !== query) };
}

/** Credits of every model in use, one line per model even when several cars share it, sorted by name. */
export function creditsOf(map: Record<string, CarModelEntry>): { carIds: string[]; attribution: ModelAttribution }[] {
  const byUid = new Map<string, { carIds: string[]; attribution: ModelAttribution }>();
  for (const [carId, e] of Object.entries(map)) {
    const hit = byUid.get(e.attribution.uid);
    if (hit) hit.carIds.push(carId);
    else byUid.set(e.attribution.uid, { carIds: [carId], attribution: e.attribution });
  }
  return [...byUid.values()].sort((a, b) => a.attribution.name.localeCompare(b.attribution.name));
}


export const LICENSE_SHORT: Record<ModelAttribution["license"], string> = { cc0: "CC0", by: "CC BY", "by-sa": "CC BY-SA" };

/** What to do to be able to download models (shown before the first try and whenever the server says no token is set). */
export const TOKEN_STEPS = [
  "Create a free Sketchfab account (sketchfab.com).",
  "Open sketchfab.com/settings/password and copy your API token.",
  "Add SKETCHFAB_TOKEN=your-token to the .env.local file next to package.json.",
  "Restart the dev server, then press the button again.",
];
