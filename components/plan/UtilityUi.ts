import { create } from "zustand";
import { activeLevelId, useStore } from "@/lib/store";
import type { Pt } from "@/lib/types";
import { KINDS, MAX_POINTS, newLineId, type UtilityKind } from "@/lib/utilities";

type UtilityUi = { kind: UtilityKind; h: number; width: number; points: Pt[]; sel: string | null; vertex: number | null; placing: string | null; edit: boolean; set: (p: Partial<Omit<UtilityUi, "set" | "pick">>) => void; pick: (kind: UtilityKind) => void };
export const useUtilityUi = create<UtilityUi>((set) => ({
  kind: "cold", h: KINDS.cold.h, width: KINDS.cold.width, points: [], sel: null, vertex: null, placing: null, edit: false,
  set: (p) => set(p),
  pick: (kind) => set({ kind, h: KINDS[kind].h, width: KINDS[kind].width, sel: null, vertex: null, placing: null, points: [] }),
}));

export function finishUtility(): boolean {
  const ui = useUtilityUi.getState(), store = useStore.getState();
  if (!ui.points.length) return false;
  if (ui.points.length < 2) { ui.set({ points: [] }); return true; }
  const id = newLineId(store.plan);
  store.addUtility({ id, kind: ui.kind, pts: ui.points.slice(0, MAX_POINTS), h: ui.h, width: ui.width, level: activeLevelId(store) });
  ui.set({ points: [], sel: id, vertex: null });
  return true;
}

export function deleteUtility() {
  const ui = useUtilityUi.getState();
  if (ui.sel) useStore.getState().removeUtility(ui.sel);
  ui.set({ sel: null, vertex: null });
}
