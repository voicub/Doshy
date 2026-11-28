// The floor plan image under the plan (`plan.trace`): reading it safely out of a saved plan and the edits the editor and the store use. Pure.
// The node test runner loads this file directly: .ts import extensions.
import type { Trace } from "./designTypes.ts";
import { isRecord } from "./guards.ts";
import type { Plan } from "./types.ts";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/; // what the resource store accepts as an id (lib/db/resources.ts)
export const MAX_TRACE_PX = 4096;
/** Metres per image pixel: a 2048 px plan of a flat is about 0.005, of a whole garden about 0.05. */
export const SCALE_RANGE = { min: 0.0001, max: 1 } as const;
export const OPACITY_RANGE = { min: 0.05, max: 1 } as const;
const LIMIT = 1000;

const within = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const clamp = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
/** An angle in degrees, in (-180, 180]. */
export const turnOf = (deg: number): number => {
  const r = ((((deg + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
};

/** The trace of a plan loaded from anywhere (storage, the database, a file), or undefined when it has none or is not usable. Numbers are clamped into range. */
export function sanitizeTrace(v: unknown): Trace | undefined {
  if (!isRecord(v) || typeof v.resourceId !== "string" || !ID_RE.test(v.resourceId)) return undefined;
  if (!within(v.w, 1, MAX_TRACE_PX) || !within(v.h, 1, MAX_TRACE_PX)) return undefined;
  return {
    resourceId: v.resourceId,
    w: Math.round(v.w),
    h: Math.round(v.h),
    x: clamp(v.x, -LIMIT, LIMIT, 0),
    y: clamp(v.y, -LIMIT, LIMIT, 0),
    scale: clamp(v.scale, SCALE_RANGE.min, SCALE_RANGE.max, 0.01),
    rotation: turnOf(clamp(v.rotation, -1e6, 1e6, 0)),
    opacity: clamp(v.opacity, OPACITY_RANGE.min, OPACITY_RANGE.max, 0.5),
    locked: v.locked === true,
    ...(v.hidden === true ? { hidden: true as const } : {}),
  };
}

/** The plan with its trace set (one undo step through `editPlan`), or without one when `trace` is null. */
export function withTrace(plan: Plan, trace: Trace | null): Plan {
  if (trace) return { ...plan, trace };
  const { trace: _gone, ...rest } = plan;
  return rest;
}
