import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "@/lib/dbClient";
import type { Guide } from "@/lib/editMath";
import type { Item, Pt, Sel, SelType } from "@/lib/types";

export type Preset = "iso" | "top" | "front" | "reset";
type Gesture = "move" | "rotate" | "elev";
/** Where a catalog item would land right now. */
export type Ghost = { kind: string; x: number; y: number; rot: number; blocked: boolean; elev?: number };
export type Clear = { n: number | null; e: number | null; s: number | null; w: number | null };

const RECENT_MAX = 8;

/** A DOM overlay anchored at a pointer position (px inside the canvas box). */
export type Anchor = { x: number; y: number };
export type Cand = { type: SelType; id: string };

/** Transient state of the 3D editing layer (not part of the plan, never undone). */
type EditUi = {
  hover: Sel;
  gesture: { id: string; mode: Gesture; blocked: boolean } | null;
  clearance: Clear | null;
  ghost: Ghost | null;
  /** Plan point under the pointer on the floor (paste target). */
  cursor: Pt | null;
  /** Module snap in effect (guides in plan x, height, plan y; `lv` = floor height of the level) and its tag. */
  snap: { label: string | null; guides: Guide[]; lv: number } | null;
  /** Catalog card being dragged over the canvas (dataTransfer cannot be read during dragover). */
  dragKind: string | null;
  /** Rotation (degrees) the next placed item gets. */
  placeRot: number;
  /** Camera preset request; `n` re-triggers the same preset. */
  camera: { preset: Preset; n: number };
  recent: string[];
  clip: Item | null;
  /** Hover name tooltip, "N of M" cycle hint and the "what is here" chooser list. */
  tip: (Anchor & { text: string }) | null;
  cycle: (Anchor & { text: string; n: number }) | null;
  chooser: (Anchor & { picks: Cand[] }) | null;
  /** Handle of the selection under the pointer (it lights up), and how many more pieces lie behind what a click would select ("+n behind"). */
  hoverGizmo: "rotate" | "elev" | null;
  hoverMore: number;
  /** Where the selection is on screen (px inside the canvas box): the quick toolbar hangs off it. */
  selRect: { x0: number; y0: number; x1: number; y1: number } | null;
  /** "Pick through": a click selects what lies behind the piece under the pointer. */
  passThrough: boolean;
  /** The last press on the canvas (client px), so "Pick another here" asks the same spot again. */
  lastPress: Pt | null;
  /** Compact screens: the inspector sheet is only open after "Edit" (a tap on a piece must not cover the canvas). Ignored on bigger screens and in Home Assistant mode. */
  inspectorOpen: boolean;
  set: (p: Partial<Pick<EditUi, "hover" | "gesture" | "clearance" | "ghost" | "cursor" | "snap" | "dragKind" | "placeRot" | "clip" | "tip" | "cycle" | "chooser" | "hoverGizmo" | "hoverMore" | "selRect" | "passThrough" | "lastPress" | "inspectorOpen">>) => void;
  setPreset: (p: Preset) => void;
  remember: (kind: string) => void;
};

const storage = dbStorage("housey-recent", "settings", 0);

export const useEditUi = create<EditUi>()(
  persist(
    (set) => ({
      hover: null,
      gesture: null,
      clearance: null,
      ghost: null,
      cursor: null,
      snap: null,
      dragKind: null,
      placeRot: 0,
      camera: { preset: "iso", n: 0 },
      recent: [],
      clip: null,
      tip: null,
      cycle: null,
      chooser: null,
      hoverGizmo: null,
      hoverMore: 0,
      selRect: null,
      passThrough: false,
      lastPress: null,
      inspectorOpen: false,
      set: (p) => set(p),
      setPreset: (preset) => set((s) => ({ camera: { preset, n: s.camera.n + 1 } })),
      remember: (kind) => set((s) => ({ recent: [kind, ...s.recent.filter((k) => k !== kind)].slice(0, RECENT_MAX) })),
    }),
    { name: "housey-recent", storage: createJSONStorage(() => storage), partialize: (s) => ({ recent: s.recent }) },
  ),
);
storage.bind(() => void useEditUi.persist.rehydrate());

