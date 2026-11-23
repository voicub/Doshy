import { useEffect, useMemo } from "react";
import type { BufferGeometry } from "three";
import { holedSlabGeometry } from "@/lib/holedSlab";
import type { Pt } from "@/lib/types";

type Rect = { x: number; y: number; w: number; h: number };

/** The geometry of a holed slab (null when there are no holes: the caller keeps its plain box), rebuilt when the rectangle or holes change and disposed when replaced. `holes` must be stable between renders. */
export function useHoledSlab(rect: Rect, holes: Pt[][], depth: number): BufferGeometry | null {
  const geo = useMemo(() => (holes.length ? holedSlabGeometry(rect, holes, depth) : null), [rect.x, rect.y, rect.w, rect.h, holes, depth]); // keyed by the rect values, not the rect object
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo;
}
