import { create } from "zustand";
import { DEFAULT_COLOR } from "@/lib/annotationTools";
import type { AnnotationKind } from "@/lib/designTypes";
import type { Pt } from "@/lib/types";

type AnnotateState = {
  /** What the next click places. */
  kind: AnnotationKind;
  color: string;
  /** Show the next note or zone as a pin in the 3D scene too. */
  pin: boolean;
  /** The words a new zone gets (a preset chip fills them in). */
  zoneText: string;
  /** The annotation being edited (not the plan's own selection: picking one must not open the inspector). */
  sel: string | null;
  /** First point of an arrow or dimension, waiting for its second. */
  first: Pt | null;
  /** The corner and the far corner of the zone being dragged out. */
  zone: { a: Pt; b: Pt } | null;
  set: (p: Partial<Omit<AnnotateState, "set" | "clear">>) => void;
  /** Forget what is half done (the selection stays unless `all`). */
  clear: (all?: boolean) => void;
};

/** What the Notes tool remembers while the page is open; nothing here is saved in the plan (the annotations themselves are). */
export const useAnnotateUi = create<AnnotateState>((set) => ({
  kind: "note",
  color: DEFAULT_COLOR,
  pin: false,
  zoneText: "Radiator here",
  sel: null,
  first: null,
  zone: null,
  set: (p) => set(p),
  clear: (all) => set(all ? { first: null, zone: null, sel: null } : { first: null, zone: null }),
}));
