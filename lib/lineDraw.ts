import { fenceDefaults, isFence } from "./fences.ts";
import { distinctPoints } from "./lineGeometry.ts";
import { pathFields, type PathKind, type PathLook } from "./lineKinds.ts";
import type { GroundPath, Plan, Pt, WallStyle } from "./types.ts";

/** The fields a drawn road or walkway starts with (the same ones `pathFields` gives). */
export type DrawnPath = Pick<GroundPath, "kind" | "width" | "marks" | "pavement" | "edge" | "ends" | "stones">;

/**
 * The fields of a freshly drawn road or walkway: the kind's own look at `width`, with the markings, pavement and edge the panel overrode.
 * "none" means "leave it out" (a plain path stays minimal), so an override can switch a kind's own marking or pavement off.
 */
export function drawnPathFields(kind: PathKind, width: number, options: Partial<Pick<PathLook, "marks" | "pavement" | "edge">>): DrawnPath {
  const { marks, pavement, edge, ...rest } = { ...pathFields(kind, width), ...options };
  return { ...rest, ...(marks && marks !== "none" ? { marks } : {}), ...(pavement && pavement !== "none" ? { pavement } : {}), ...(edge && edge !== "none" ? { edge } : {}) };
}

/**
 * A fence drawn as one line: a garden wall per segment, each with the style's own height and thickness, on `level`. The corners are the same points
 * (not copies that merely look equal), so the 3D walls meet at the corner. The same plan comes back for a line with fewer than two distinct points.
 */
export function addFenceLine(plan: Plan, points: Pt[], style: WallStyle, level: string, newId: () => string): Plan {
  const line = distinctPoints(points);
  if (line.length < 2) return plan;
  const defaults = isFence(style) ? fenceDefaults(style) : {};
  const walls = line.slice(1).map((b, i) => ({ id: newId(), a: line[i], b, style, ...defaults, level }));
  return { ...plan, walls: [...plan.walls, ...walls] };
}

/** How far a duplicated path sits from the original (m), so the copy can be seen and grabbed. */
const COPY_OFFSET = 1;

/** A copy of path `id` moved by one metre in x and y, named like the original with "copy"; the copy is last in the list. The same plan back when there is no such path. */
export function duplicatePath(plan: Plan, id: string, newId: () => string): { plan: Plan; id: string | null } {
  const src = plan.paths?.find((p) => p.id === id);
  if (!src) return { plan, id: null };
  const copyId = newId();
  const copy: GroundPath = { ...src, id: copyId, points: src.points.map((q) => ({ x: q.x + COPY_OFFSET, y: q.y + COPY_OFFSET })), ...(src.name ? { name: `${src.name} copy` } : {}) };
  return { plan: { ...plan, paths: [...(plan.paths ?? []), copy] }, id: copyId };
}
