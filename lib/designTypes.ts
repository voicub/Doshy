// Plan fields added by the design tools (measure and annotate, floor plan from an image). Both are optional: plans saved before them have neither.
// Pure types, shared by lib/annotations.ts, lib/trace.ts and the editors. The node test runner loads this file directly.
import type { Pt } from "./types.ts";

/**
 * A note left on the plan. All lengths are plan metres. `level` is the level it belongs to (absent = the first level), like walls and rooms.
 * `pin` shows a small pin for it in the 3D scene too (notes and zones only).
 * - note: a text label at a point ("Ask the electrician about this socket")
 * - arrow: from `a` (the tail) to `b` (the head), with an optional text at the tail
 * - dimension: a measured line from `a` to `b`; its text is always the real length, `off` moves the line sideways off the points (metres, signed)
 * - zone: a rectangle to remember ("Radiator here", "Pipe in the wall"), x, y being its top-left corner
 */
type AnnotationBase = { id: string; color?: string; level?: string; pin?: true };
export type Annotation =
  | (AnnotationBase & { kind: "note"; x: number; y: number; text: string })
  | (AnnotationBase & { kind: "arrow"; a: Pt; b: Pt; text?: string })
  | (AnnotationBase & { kind: "dimension"; a: Pt; b: Pt; off?: number })
  | (AnnotationBase & { kind: "zone"; x: number; y: number; w: number; h: number; text: string });

export type AnnotationKind = Annotation["kind"];

/**
 * A floor plan image shown under the plan to trace over (plan mode only). `resourceId` is a stored image (lib/db/resources.ts, kind "image");
 * `w` and `h` are its size in pixels. The image is placed by its centre: `x`, `y` in plan metres, turned `rotation` degrees clockwise about it,
 * `scale` metres per image pixel. `locked` keeps it from being dragged by accident, `hidden` hides it without forgetting it.
 */
export type Trace = {
  resourceId: string;
  w: number;
  h: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden?: true;
};
