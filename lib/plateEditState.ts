import { create } from "zustand";
import type { PlateEnd } from "./plate";

/**
 * Two things the inspector and the 3D scene tell each other about number plates. Not saved.
 * `editing`: which plate the "Number plate position" section is open on, so the scene can outline it.
 * `own`: real models that carry a plate mesh of their own (CarModelMesh keeps that one where the model puts it), which the section cannot move.
 */
type State = {
  editing: { id: string; end: PlateEnd } | null;
  setEditing: (editing: State["editing"]) => void;
  own: readonly string[];
  setOwn: (resource: string, has: boolean) => void;
};

export const usePlateEdit = create<State>()((set) => ({
  editing: null,
  setEditing: (editing) => set({ editing }),
  own: [],
  setOwn: (resource, has) => set((s) => (s.own.includes(resource) === has ? s : { own: has ? [...s.own, resource] : s.own.filter((r) => r !== resource) })),
}));
