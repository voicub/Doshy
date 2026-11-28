import { create } from "zustand";
import { GROUND_PRESETS, type GroundMode, type GroundPreset } from "@/lib/ground";
import type { FloorKind, GroundEdge } from "@/lib/types";

/** What the Garden tool lays next: a surface, a shape (area or pond) and a rim. Not saved. A preset also carries a stamp size. */
type GroundUi = {
  kind: FloorKind;
  mode: GroundMode;
  edge: GroundEdge;
  /** A stamp: one click drops an area this big (m); a drag still draws a free rectangle. Null = drag to draw. */
  size: { w: number; h: number } | null;
  setKind: (k: FloorKind) => void;
  setMode: (m: GroundMode) => void;
  setEdge: (e: GroundEdge) => void;
  preset: (p: GroundPreset) => void;
};

export const useGroundUi = create<GroundUi>((set) => ({
  kind: "pavers_grey",
  mode: "area",
  edge: "none",
  size: GROUND_PRESETS[0].size,
  setKind: (kind) => set((s) => ({ kind, ...(kind === "water" && s.mode === "area" ? { mode: "pond" as const, edge: "kerb" as const } : kind !== "water" && s.mode === "pond" ? { mode: "area" as const } : {}) })),
  setMode: (mode) => set((s) => ({ mode, size: null, ...(mode === "pond" ? { kind: "water" as const, edge: "kerb" as const } : s.mode === "pond" ? { kind: "pavers_grey" as const, edge: "none" as const } : {}) })),
  setEdge: (edge) => set({ edge }),
  preset: (p) => set({ kind: p.kind, mode: p.mode, edge: p.edge, size: p.size }),
}));
