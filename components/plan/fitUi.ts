import { create } from "zustand";
import type { Piece } from "@/lib/fitCatalog";
import type { Pt } from "@/lib/types";

/** What "Does it fit here?" holds this session: the piece (a catalogue one or a custom size), how it is turned, its doors and where the ghost stands. Not saved. */
type FitState = {
  query: string;
  /** The catalogue piece being tried; null with `custom` on means the typed size. */
  piece: Piece | null;
  custom: boolean;
  /** Custom size in metres. */
  cw: number;
  cd: number;
  /** A quarter turn: 0 or 90 degrees (the piece's own turn stays 0). */
  turned: boolean;
  /** Doors that open outward: null follows the piece (wardrobes, cabinets, cupboards open). */
  opens: boolean | null;
  /** How far the doors swing (m): null = the default for the piece's width. */
  leaf: number | null;
  /** Where the ghost stands, null until the pointer is over the plan. */
  at: Pt | null;
  /** A mouse click holds the ghost still so its numbers can be read; the next click lets it follow again. */
  held: boolean;
  set: (p: Partial<Omit<FitState, "set" | "clear">>) => void;
  /** The ghost leaves the plan (tool or level changed); the piece and its settings stay for the next try. */
  clear: () => void;
};

export const useFitUi = create<FitState>((set) => ({
  query: "",
  piece: null,
  custom: false,
  cw: 1,
  cd: 0.6,
  turned: false,
  opens: null,
  leaf: null,
  at: null,
  held: false,
  set: (p) => set(p),
  clear: () => set({ at: null, held: false }),
}));
