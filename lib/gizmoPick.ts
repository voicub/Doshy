import type { Ray } from "./pickRank.ts";

/** On-screen size (px) of the grab area of a handle: mouse / touch. The drawn handle is thinner, the grab area is generous. */
export const HANDLE_PX = 36;
export const HANDLE_PX_COARSE = 48;
const RING_GAP_PX = 24; // the ring stays at least this far (px) outside the footprint
const RING_PAD = 0.22; // ... and at least this far (m)
const ARROW_GAP_PX = 28; // the arrow floats this far above the item's top, so its grab area starts clear of the item itself
const ARROW_LEN_PX = 52;
/** Height above the floor (m) of the plane the ring is drawn and dragged in. */
export const RING_Y = 0.09;

/** Zoom (px per metre) as the handles see it: whole numbers, so what is drawn and what is hit always agree. */
export const handleZoom = (zoom: number) => Math.max(1, Math.round(zoom));

type GizmoSizes = { ringGap: number; band: number; arrowGap: number; arrowLen: number; arrowR: number; px: (n: number) => number };

/** Metres of every handle dimension for an ortho camera at `zoom` px per metre. */
export function gizmoSizes(zoom: number, coarse: boolean): GizmoSizes {
  const z = handleZoom(zoom);
  const px = (n: number) => n / z;
  const grab = (coarse ? HANDLE_PX_COARSE : HANDLE_PX) / 2;
  return { ringGap: Math.max(RING_PAD, px(RING_GAP_PX)), band: px(grab), arrowGap: px(ARROW_GAP_PX), arrowLen: px(ARROW_LEN_PX), arrowR: px(grab), px };
}

/** Radius (m) of the rotation ring of a footprint w x d. */
export const ringRadius = (w: number, d: number, s: GizmoSizes) => Math.hypot(w, d) / 2 + s.ringGap;

/** Is the ray within `band` metres (measured on the floor plane, across the ring) of the ring of `radius` around (cx, cz) at height `y`? */
export function hitRing(ray: Ray, cx: number, cz: number, y: number, radius: number, band: number): boolean {
  if (Math.abs(ray.d.y) < 1e-9) return false;
  const t = (y - ray.o.y) / ray.d.y;
  if (t < 0) return false;
  return Math.abs(Math.hypot(ray.o.x + ray.d.x * t - cx, ray.o.z + ray.d.z * t - cz) - radius) <= band;
}

/** Is the ray within `r` metres of the vertical segment from (x, y0, z) up by `len`? */
export function hitArrow(ray: Ray, x: number, y0: number, z: number, len: number, r: number): boolean {
  const { o, d } = ray;
  const wx = o.x - x;
  const wy = o.y - y0;
  const wz = o.z - z;
  const n = Math.hypot(d.x, d.y, d.z) || 1;
  const ux = d.x / n, uy = d.y / n, uz = d.z / n;
  const dd = ux * wx + uy * wy + uz * wz;
  const denom = 1 - uy * uy;
  let s = denom < 1e-9 ? 0 : (wy - uy * dd) / denom; // height along the segment that is closest to the line
  s = Math.min(len, Math.max(0, s));
  const t = uy * s - dd; // the closest point on the line for that height
  const px = wx + ux * t;
  const py = wy + uy * t - s;
  const pz = wz + uz * t;
  return Math.hypot(px, py, pz) <= r;
}

type GizmoBox = { x: number; z: number; y1: number; lv: number; w: number; d: number };
type GizmoKind = "rotate" | "elev";

/** Which handle of the selected item is under the pointer ray: the arrow first (it floats over everything), then the ring. */
export function gizmoAt(ray: Ray, box: GizmoBox, zoom: number, coarse: boolean): GizmoKind | null {
  const s = gizmoSizes(zoom, coarse);
  if (hitArrow(ray, box.x, box.y1 + s.arrowGap, box.z, s.arrowLen, s.arrowR)) return "elev";
  if (hitRing(ray, box.x, box.z, box.lv + RING_Y, ringRadius(box.w, box.d, s), s.band)) return "rotate";
  return null;
}
