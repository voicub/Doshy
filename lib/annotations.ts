// Notes, arrows, dimension lines and "zones to remember" stored in `plan.annotations`. Pure: reading them safely out of a saved plan, and the three edits
// (add, change, remove) the editor and the store use. The node test runner loads this file directly: .ts import extensions.
import type { Annotation, AnnotationKind } from "./designTypes.ts";
import { isRecord } from "./guards.ts";
import { COLOR_RE } from "./planIdentity.ts";
import type { Plan, Pt } from "./types.ts";

export const ANNOTATION_KINDS: readonly AnnotationKind[] = ["note", "arrow", "dimension", "zone"];
/** More than this is not a plan anyone drew by hand; it also keeps a hostile file from filling the plan row. */
export const MAX_ANNOTATIONS = 400;
export const MAX_TEXT = 200;
const LIMIT = 1000; // plan metres: far outside any flat or garden
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const metres = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= LIMIT;
const pointOf = (v: unknown): Pt | null => (isRecord(v) && metres(v.x) && metres(v.y) ? { x: v.x, y: v.y } : null);
const textOf = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) : "");

/** One annotation out of untrusted JSON (a saved plan, the database, a plan file), or null when it is not a usable one. Unknown fields are dropped. */
export function annotationOf(v: unknown): Annotation | null {
  if (!isRecord(v) || typeof v.id !== "string" || !ID_RE.test(v.id)) return null;
  const common = {
    id: v.id,
    ...(typeof v.color === "string" && COLOR_RE.test(v.color) ? { color: v.color.toLowerCase() } : {}),
    ...(typeof v.level === "string" && ID_RE.test(v.level) ? { level: v.level } : {}),
  };
  const pin = v.pin === true ? ({ pin: true } as const) : {};
  switch (v.kind) {
    case "note": {
      const text = textOf(v.text);
      return metres(v.x) && metres(v.y) && text ? { ...common, ...pin, kind: "note", x: v.x, y: v.y, text } : null;
    }
    case "arrow": {
      const a = pointOf(v.a);
      const b = pointOf(v.b);
      const text = textOf(v.text);
      return a && b ? { ...common, kind: "arrow", a, b, ...(text ? { text } : {}) } : null;
    }
    case "dimension": {
      const a = pointOf(v.a);
      const b = pointOf(v.b);
      return a && b ? { ...common, kind: "dimension", a, b, ...(metres(v.off) && v.off !== 0 ? { off: v.off } : {}) } : null;
    }
    case "zone": {
      const text = textOf(v.text);
      const size = (n: unknown): n is number => metres(n) && n > 0;
      return metres(v.x) && metres(v.y) && size(v.w) && size(v.h) && text ? { ...common, ...pin, kind: "zone", x: v.x, y: v.y, w: v.w, h: v.h, text } : null;
    }
    default:
      return null;
  }
}

/** The annotations of a plan loaded from anywhere: bad entries and repeated ids are dropped. `undefined` when there are none, so a plan without any stays without the field. */
export function sanitizeAnnotations(v: unknown): Annotation[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const out: Annotation[] = [];
  for (const raw of v) {
    const a = annotationOf(raw);
    if (!a || seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
    if (out.length >= MAX_ANNOTATIONS) break;
  }
  return out.length ? out : undefined;
}

/** The plan with `a` added. Past MAX_ANNOTATIONS the plan comes back unchanged. */
export function addAnnotation(plan: Plan, a: Annotation): Plan {
  const list = plan.annotations ?? [];
  if (list.length >= MAX_ANNOTATIONS || list.some((x) => x.id === a.id) || !annotationOf(a)) return plan;
  return { ...plan, annotations: [...list, a] };
}

/** The plan with annotation `id` changed (kind and id never change). Anything that would make it invalid leaves the plan as it was. */
export function patchAnnotation(plan: Plan, id: string, patch: Partial<Annotation>): Plan {
  const list = plan.annotations ?? [];
  const old = list.find((x) => x.id === id);
  if (!old) return plan;
  const next = annotationOf({ ...old, ...patch, id: old.id, kind: old.kind });
  if (!next || JSON.stringify(next) === JSON.stringify(old)) return plan;
  return { ...plan, annotations: list.map((x) => (x.id === id ? next : x)) };
}

/** The plan without annotation `id`; no annotations left means no field. */
export function removeAnnotation(plan: Plan, id: string): Plan {
  const list = plan.annotations ?? [];
  if (!list.some((x) => x.id === id)) return plan;
  const rest = list.filter((x) => x.id !== id);
  const { annotations: _gone, ...others } = plan;
  return rest.length ? { ...others, annotations: rest } : others;
}
