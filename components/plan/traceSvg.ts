import type { Pt } from "@/lib/types";

/** The pointer in plan metres, for a handler on an element inside the plan's SVG (the same maths as usePlanPoint `rawPt`). Null before the SVG is laid out. */
export function svgPoint(e: { clientX: number; clientY: number; currentTarget: SVGElement }): Pt | null {
  const m = e.currentTarget.ownerSVGElement?.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}
