import { create } from "zustand";
import type { Seg, Sensitivity } from "@/lib/traceDetect";
import type { Rect } from "@/lib/traceGeom";
import type { Pt } from "@/lib/types";

/** A suggested wall: a detected stroke with a number the person can point at (stable until the list is cleared). */
export type Suggestion = Seg & { id: number };

/** Session state of the floor plan image tools (nothing here is saved with the plan): what is being calibrated and the wall suggestions. Points are in image pixels so they follow the image when it moves. */
type TraceUi = {
  /** The panel is open: the handles for moving the image show. */
  panel: boolean;
  /** "Set the scale" is running: the one or two points clicked so far. */
  calib: { a?: Pt; b?: Pt } | null;
  /** Wall suggestions for the image `suggestionsFor`; picked: the one whose Add / Discard buttons show. */
  suggestions: Suggestion[];
  suggestionsFor: string | null;
  picked: number | null;
  sensitivity: Sensitivity;
  setPanel: (open: boolean) => void;
  startCalib: () => void;
  stopCalib: () => void;
  /** The first click sets `a`, the second `b`, later ones move the nearer of the two. */
  placePoint: (p: Pt) => void;
  setSuggestions: (resourceId: string, segs: Seg[]) => void;
  clearSuggestions: () => void;
  pick: (id: number | null) => void;
  drop: (ids: number[]) => void;
  setSensitivity: (s: Sensitivity) => void;
};

const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
const NONE: Pick<TraceUi, "suggestions" | "suggestionsFor" | "picked"> = { suggestions: [], suggestionsFor: null, picked: null };

export const useTraceUi = create<TraceUi>((set) => ({
  panel: false,
  calib: null,
  ...NONE,
  sensitivity: "normal",
  setPanel: (panel) => set({ panel }),
  startCalib: () => set({ calib: {} }),
  stopCalib: () => set({ calib: null }),
  placePoint: (p) =>
    set((s) => {
      const { a, b } = s.calib ?? {};
      if (!a) return { calib: { a: p } };
      if (!b) return { calib: { a, b: p } };
      return { calib: dist(p, a) <= dist(p, b) ? { a: p, b } : { a, b: p } };
    }),
  setSuggestions: (suggestionsFor, segs) => set({ suggestionsFor, suggestions: segs.map((s, id) => ({ ...s, id })), picked: null }),
  clearSuggestions: () => set(NONE),
  pick: (picked) => set({ picked }),
  drop: (ids) => set((s) => ({ suggestions: s.suggestions.filter((x) => !ids.includes(x.id)), picked: null })),
  setSensitivity: (sensitivity) => set({ sensitivity }),
}));

/** The visible rectangle of the plan (metres), kept by the plan view for "fit to the view". Plain data, not state: nothing redraws when it changes. */
export const traceView: { rect: Rect | null } = { rect: null };

/** What to do next in "set the scale", for the panel and for the compact screens' bar. */
export const calibHint = (calib: { a?: Pt; b?: Pt }): string =>
  !calib.a ? "Click one end of something you know the length of, such as a wall or a door." : !calib.b ? "Now click the other end of it." : "Click again to move the nearer point. Then type the real distance between the two points.";
