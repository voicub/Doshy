import { Box3, Matrix3, Matrix4, Raycaster, Vector3, type Object3D } from "three";
import type { Fit } from "./carModels.ts";
import type { PlateMount } from "./carSurf.ts";
import { PLATE_LIFT, plateRotation, plateSize, type PlateEnd } from "./plate.ts";

// A real (downloaded) car carries its own baked plate picture, or none at all, so the owner's plate would never show. These mounts are found on
// the model itself: rays are shot at each end of the car along its length. A real plate is screwed to the flattest, most upright part of the
// end (a tailgate, the middle of a bumper), so a column of rays down the centre line finds that zone, and a few more rays across it find the
// most protruding surface; the plate lies on that, tilted with it. Numbers are in the car's frame (lib/cars.ts: front +z, left +x, y up, y = 0 is the ground).

const HEIGHT_SHARE: Record<PlateEnd, number> = { front: 0.27, rear: 0.45 }; // where the search prefers the plate centre, as a share of the car's height: low in the front bumper, on the tailgate or boot lid at the rear (where a model's own baked plate usually is)
const SEARCH = [0.14, 0.62] as const; // the zone searched, as shares of the height: above it are the lamps and the glass, below it the skirt
const STEP = 0.025; // m between the rays of the centre column
const NEAR_DEFAULT = 0.1; // flatness (m of depth) a metre away from the preferred height costs: a clearly flatter zone wins over a nearer one, equal ones go to the nearer
const SPREAD_X = [-0.24, 0, 0.24]; // rays across the plate's width (0.52 m), so a grille opening or a recess in the middle does not sink the plate into the car
const MAX_TILT = 0.45; // rad: a plate is never laid flatter than this (a bumper's lower lip can lean a long way)
const ZONE = plateSize("eu", "rear")[1] + 0.04; // m of height the flat zone must cover: the plate and a margin

type Hit = { p: Vector3; n: Vector3 };
type Caster = (x: number, y: number) => Hit | null;

const cache = new WeakMap<Object3D, Map<string, PlateMount[]>>();

/** The matrix <CarModelMesh> builds from its nested groups: native model coordinates -> the car's frame. */
export function fitMatrix(fit: Fit): Matrix4 {
  const [cx, cy, cz] = fit.centre;
  return new Matrix4()
    .makeTranslation(0, fit.yOffset, 0)
    .multiply(new Matrix4().makeScale(...fit.scale))
    .multiply(new Matrix4().makeRotationY(fit.yaw))
    .multiply(new Matrix4().makeTranslation(-cx, -cy, -cz));
}

/** A ray from outside the car at (x, y), travelling along its length toward the car; the first surface it meets, in the car's frame. */
function caster(model: Object3D, toCar: Matrix4, end: PlateEnd, reach: number): Caster {
  const sign = end === "front" ? 1 : -1;
  const toNative = toCar.clone().invert();
  const normals = new Matrix3().getNormalMatrix(toCar);
  const ray = new Raycaster();
  return (x, y) => {
    const origin = new Vector3(x, y, sign * reach).applyMatrix4(toNative);
    const ahead = new Vector3(x, y, sign * (reach - 1)).applyMatrix4(toNative);
    ray.set(origin, ahead.sub(origin).normalize()); // the model is scaled unevenly, so the direction is rebuilt in native units
    const hit = ray.intersectObject(model, true)[0];
    if (!hit?.face) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).applyNormalMatrix(normals).normalize();
    if (sign * n.z < 0) n.negate(); // a back face (two-sided material) still stands for the outside
    return { p: hit.point.clone().applyMatrix4(toCar), n };
  };
}

/** Height of the centre of the flattest, most upright stretch of the end (at least `ZONE` tall) near the preferred height; the preferred height when no stretch is hit all the way. */
function flatZoneCentre(cast: Caster, end: PlateEnd, height: number): number {
  const sign = end === "front" ? 1 : -1;
  const preferred = HEIGHT_SHARE[end] * height;
  const rows: { y: number; depth: number }[] = [];
  for (let y = SEARCH[0] * height; y <= SEARCH[1] * height; y += STEP) {
    const hit = cast(0, y);
    rows.push({ y, depth: hit ? sign * hit.p.z : Number.NaN });
  }
  const span = Math.max(2, Math.round(ZONE / STEP) + 1);
  let best = preferred;
  let bestScore = Infinity;
  for (let i = 0; i + span <= rows.length; i++) {
    const zone = rows.slice(i, i + span);
    if (zone.some((r) => Number.isNaN(r.depth))) continue;
    const centre = (zone[0].y + zone[span - 1].y) / 2;
    const score = Math.max(...zone.map((r) => r.depth)) - Math.min(...zone.map((r) => r.depth)) + NEAR_DEFAULT * Math.abs(centre - preferred);
    if (score < bestScore) [best, bestScore] = [centre, score];
  }
  return best;
}

/** The mount at height `yc`: a plane tilted like the surface there and resting on the most protruding point of the plate's footprint. */
function mountAt(cast: Caster, end: PlateEnd, yc: number, box: Box3): PlateMount {
  const sign = end === "front" ? 1 : -1;
  const half = plateSize("eu", end)[1] / 2;
  const hits = SPREAD_X.flatMap((x) => [-half, 0, half].map((dy) => cast(x, yc + dy))).filter((h): h is Hit => h !== null);
  if (!hits.length) return { end, p: [0, yc, (sign > 0 ? box.max.z : box.min.z) + sign * PLATE_LIFT], rot: plateRotation(end, 0) }; // a hollow shell: flat on the end of the bounding box
  const lean = hits.reduce((s, h) => s + h.n.y, 0) / hits.length;
  const ny = Math.max(-Math.sin(MAX_TILT), Math.min(Math.sin(MAX_TILT), lean));
  const nz = sign * Math.sqrt(1 - ny * ny);
  const offset = Math.max(...hits.map((h) => ny * h.p.y + nz * h.p.z)); // the plane's distance along its (outward) normal: set by the most protruding hit
  const z = (offset - ny * yc) / nz;
  return { end, p: [0, yc + ny * PLATE_LIFT, z + nz * PLATE_LIFT], rot: plateRotation(end, ny) };
}

/**
 * Front and rear plate mounts of a model placed with `fit` on a car of `dims` (metres). `model` is the template's near or far level, in the
 * model's own (native) coordinates; the lighter far level finds the same surface at a fraction of the cost.
 */
export function modelPlates(model: Object3D, fit: Fit, dims: { d: number; h: number }): PlateMount[] {
  const key = [fit.yaw, fit.yOffset, ...fit.scale, ...fit.centre, dims.d, dims.h].join(",");
  const stored = cache.get(model)?.get(key);
  if (stored) return stored;

  model.updateMatrixWorld(true);
  const toCar = fitMatrix(fit);
  const box = new Box3().setFromObject(model).applyMatrix4(toCar);
  const mounts = (["front", "rear"] as const).map((end) => {
    const cast = caster(model, toCar, end, dims.d);
    return mountAt(cast, end, flatZoneCentre(cast, end, dims.h), box);
  });
  const byKey = cache.get(model) ?? new Map<string, PlateMount[]>();
  byKey.set(key, mounts);
  cache.set(model, byKey);
  return mounts;
}
