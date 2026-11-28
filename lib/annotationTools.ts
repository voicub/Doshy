// What the Notes tool needs on top of lib/annotations.ts: building a new annotation from what was drawn, finding the one under a click, moving it, its words and colours.
// Pure: the node test runner loads this file directly.
import type { Annotation, AnnotationKind } from "./designTypes.ts";
import { annotationOf } from "./annotations.ts";
import { levelIdOf } from "./levels.ts";
import { dist, formatLength } from "./measure.ts";
import type { Plan, Pt } from "./types.ts";

/** Six swatches, bright enough on the blueprint paper: cyan (the accent), amber, red, green, violet, white. */
export const ANNOTATION_COLORS = ["#5ad7ff", "#ffb347", "#ff6b6b", "#6be58a", "#b79cff", "#e8f1f7"] as const;
export const DEFAULT_COLOR = ANNOTATION_COLORS[0];
/** Zones people leave themselves: one tap puts the words in. */
export const ZONE_PRESETS = ["Radiator here", "Pipe in the wall", "Cable run", "Keep clear", "Socket needed"] as const;
const MIN_LINE = 0.05; // shortest dimension or arrow worth keeping (m)
const MIN_ZONE = 0.1;

/** The annotations the plan view shows for one level. */
export const annotationsOnLevel = (plan: Plan, levelId: string): Annotation[] => (plan.annotations ?? []).filter((a) => levelIdOf(plan, a) === levelId);

/** What an annotation says on the plan: the words, or for a dimension its real length. */
export const annotationLabel = (a: Annotation): string => (a.kind === "dimension" ? formatLength(dist(a.a, a.b)) : (a.text ?? ""));

/** The point a 3D pin stands on: the note's point, the middle of a zone. Arrows and dimensions have none. */
export function pinPoint(a: Annotation): Pt | null {
  if (a.kind === "note") return { x: a.x, y: a.y };
  return a.kind === "zone" ? { x: a.x + a.w / 2, y: a.y + a.h / 2 } : null;
}

export type Draft = { kind: AnnotationKind; /** First point (the corner of a zone). */ a: Pt; /** Second point; unused by a note. */ b: Pt; text: string; color: string; pin: boolean };

/** The annotation a finished gesture makes, or null when it is too small to mean anything (a zone dragged by accident, an arrow of zero length). A pin is only for notes and zones. */
export function buildAnnotation(d: Draft, id: string, level: string): Annotation | null {
  const base = { id, level, color: d.color };
  const pin = d.pin ? { pin: true as const } : {};
  const text = d.text.trim();
  let raw: unknown = null;
  if (d.kind === "note") raw = { ...base, ...pin, kind: "note", x: d.a.x, y: d.a.y, text };
  else if (d.kind === "arrow" && dist(d.a, d.b) >= MIN_LINE) raw = { ...base, kind: "arrow", a: d.a, b: d.b, ...(text ? { text } : {}) };
  else if (d.kind === "dimension" && dist(d.a, d.b) >= MIN_LINE) raw = { ...base, kind: "dimension", a: d.a, b: d.b };
  else if (d.kind === "zone" && Math.abs(d.b.x - d.a.x) >= MIN_ZONE && Math.abs(d.b.y - d.a.y) >= MIN_ZONE)
    raw = { ...base, ...pin, kind: "zone", x: Math.min(d.a.x, d.b.x), y: Math.min(d.a.y, d.b.y), w: Math.abs(d.b.x - d.a.x), h: Math.abs(d.b.y - d.a.y), text };
  return annotationOf(raw);
}

/** A measured distance kept in the plan: a dimension line between its two points. */
export const dimensionOf = (a: Pt, b: Pt, id: string, level: string): Annotation | null => annotationOf({ id, level, kind: "dimension", a, b });

/** The fields that move annotation `a` by (dx, dy): a patch for `patchAnnotation`. */
export function movedBy(a: Annotation, dx: number, dy: number): Partial<Annotation> {
  const shift = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy });
  if (a.kind === "arrow" || a.kind === "dimension") return { a: shift(a.a), b: shift(a.b) };
  return { x: a.x + dx, y: a.y + dy };
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** The annotation under a click at `p` (`reach` metres of slack for a finger): the nearest note, arrow or dimension within reach; else the smallest zone containing the point. Newer ones win a tie. */
export function hitAnnotation(list: readonly Annotation[], p: Pt, reach: number): string | null {
  let best: string | null = null;
  let bestD = reach;
  for (const a of list) {
    if (a.kind === "zone") continue;
    const d = a.kind === "note" ? Math.hypot(p.x - a.x, p.y - a.y) : segDist(p, a.a, a.b);
    if (d <= bestD) {
      best = a.id;
      bestD = d;
    }
  }
  if (best) return best;
  let size = Infinity;
  for (const a of list) {
    if (a.kind !== "zone" || p.x < a.x || p.x > a.x + a.w || p.y < a.y || p.y > a.y + a.h || a.w * a.h > size) continue;
    best = a.id;
    size = a.w * a.h;
  }
  return best;
}
