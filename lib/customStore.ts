import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CATALOG } from "./catalog";
import { cleanPiece, resizeItems, syncCatalog, touchItems, type CustomPiece } from "./customCatalog";
import { dbStorage } from "./dbClient";
import { deleteModel } from "./modelStore";
import { useStore } from "./store";

/**
 * The user's own pieces (built from shapes, copied and tweaked, or imported 3D models) and their starred catalog pieces.
 * Each piece is kept as a file in the server database (lib/dbClient) with this browser's localStorage as the instant copy; model files go
 * through lib/modelStore. Every change is mirrored into CATALOG before React hears about it, so the 3D scene, plan editor and inspectors
 * see custom pieces exactly like built-in ones.
 */
type CustomState = {
  pieces: CustomPiece[];
  favs: string[];
  /** Add pieces (kinds already present are kept as they are). Items in the plan that were showing a grey stand-in redraw as the real piece. */
  add: (pieces: CustomPiece[]) => void;
  /** Replace a piece; items still at its old size follow the new size. */
  update: (piece: CustomPiece) => void;
  remove: (kind: string) => void;
  toggleFav: (kind: string) => void;
};

/** New item objects for `kinds`, written straight into the plan (no undo step: a piece edit is not a plan edit). */
function redraw(kinds: string[], resized?: { kind: string; from: { w: number; d: number; h: number }; to: { w: number; d: number; h: number } }) {
  useStore.setState((s) => {
    let items = resized ? resizeItems(s.plan.items, resized.kind, resized.from, resized.to) : s.plan.items;
    items = touchItems(items, new Set(kinds));
    return { plan: { ...s.plan, items } };
  });
}

const storage = dbStorage("housey-custom", "pieces", 1);

export const useCustom = create<CustomState>()(
  persist(
    (set, get) => ({
      pieces: [],
      favs: [],
      add: (incoming) => {
        const have = new Set(get().pieces.map((p) => p.kind));
        const fresh = incoming.filter((p) => !have.has(p.kind));
        if (!fresh.length) return;
        set((s) => ({ pieces: [...s.pieces, ...fresh] }));
        redraw(fresh.map((p) => p.kind));
      },
      update: (piece) => {
        const old = get().pieces.find((p) => p.kind === piece.kind);
        set((s) => ({ pieces: s.pieces.map((p) => (p.kind === piece.kind ? piece : p)) }));
        redraw([piece.kind], old ? { kind: piece.kind, from: old, to: piece } : undefined);
      },
      remove: (kind) => {
        const gone = get().pieces.find((p) => p.kind === kind);
        set((s) => ({ pieces: s.pieces.filter((p) => p.kind !== kind), favs: s.favs.filter((k) => k !== kind) }));
        redraw([kind]);
        const id = gone?.model?.id;
        if (id && !get().pieces.some((p) => p.model?.id === id)) void deleteModel(id).catch(() => undefined);
      },
      toggleFav: (kind) => set((s) => ({ favs: s.favs.includes(kind) ? s.favs.filter((k) => k !== kind) : [...s.favs, kind] })),
    }),
    {
      name: "housey-custom",
      storage: createJSONStorage(() => storage),
      version: 1,
      partialize: (s) => ({ pieces: s.pieces, favs: s.favs }),
      // a stored piece is untrusted input like any other file: re-checked on every load
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CustomState>;
        return {
          ...current,
          pieces: (Array.isArray(p.pieces) ? p.pieces : []).map(cleanPiece).filter((x): x is CustomPiece => !!x),
          favs: Array.isArray(p.favs) ? p.favs.filter((k): k is string => typeof k === "string") : [],
        };
      },
    },
  ),
);
storage.bind(() => void useCustom.persist.rehydrate());

const sync = () => syncCatalog(CATALOG, useCustom.getState().pieces, useStore.getState().plan.items);
sync();
useCustom.subscribe(sync);
useStore.subscribe((s, prev) => {
  if (s.plan.items !== prev.plan.items) sync();
});

