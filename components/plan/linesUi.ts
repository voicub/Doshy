import { create } from "zustand";
import { LIGHT_KINDS, PATH_KINDS, lightKindOf, pathKindOf, type LineFamily, type PathLook } from "@/lib/lineKinds";
import { useStore } from "@/lib/store";
import type { WallStyle } from "@/lib/types";

/** Road options the panel can override for the next road (a missing one = the kind's own). */
export type PathOptions = Partial<Pick<PathLook, "marks" | "pavement" | "edge">>;

/**
 * What the Garden lines tool draws next (not saved): one kind per family and the options a kind shares. The numbers start at the kind's own default
 * and the panel edits them; picking another kind resets them. `face` is the side an arm or lamp head points to, seen walking along the line (1 right, -1 left).
 */
type LinesUi = {
  family: LineFamily;
  pathKind: string;
  fence: WallStyle;
  light: string;
  width: number;
  spacing: number;
  face: 1 | -1;
  smooth: boolean;
  /** Markings, pavements and edge picked under "More options"; reset when another kind is picked. */
  options: PathOptions;
  setFamily: (f: LineFamily) => void;
  pickPath: (id: string) => void;
  pickFence: (style: WallStyle) => void;
  pickLight: (id: string) => void;
  setWidth: (w: number) => void;
  setSpacing: (s: number) => void;
  setFace: (f: 1 | -1) => void;
  setSmooth: (on: boolean) => void;
  setOption: (o: PathOptions) => void;
};

const first = (family: "road" | "walkway") => PATH_KINDS.find((k) => k.family === family) ?? PATH_KINDS[0];

export const useLinesUi = create<LinesUi>((set, get) => ({
  family: "road",
  pathKind: PATH_KINDS[0].id,
  fence: "fence_picket",
  light: LIGHT_KINDS[0].id,
  width: PATH_KINDS[0].look.width,
  spacing: LIGHT_KINDS[0].spacing,
  face: 1,
  smooth: false,
  options: {},
  // switching family keeps what was picked there before, except a path family, which must hold a path kind of that family
  setFamily: (family) => {
    if (family === "road" || family === "walkway") {
      const k = pathKindOf(get().pathKind);
      const next = k?.family === family ? k : first(family);
      set({ family, pathKind: next.id, ...(k?.family === family ? {} : { width: next.look.width, options: {} }) });
    } else if (family === "lights") {
      const k = lightKindOf(get().light);
      set({ family, spacing: k?.spacing ?? get().spacing });
    } else set({ family });
  },
  pickPath: (id) => {
    const k = pathKindOf(id);
    if (k) set({ family: k.family, pathKind: k.id, width: k.look.width, options: {} });
  },
  pickFence: (fence) => set({ family: "fence", fence }),
  pickLight: (id) => {
    const k = lightKindOf(id);
    if (k) set({ family: "lights", light: k.id, spacing: k.spacing });
  },
  setWidth: (width) => set({ width }),
  setSpacing: (spacing) => set({ spacing }),
  setFace: (face) => set({ face }),
  setSmooth: (smooth) => set({ smooth }),
  setOption: (o) => set((s) => ({ options: { ...s.options, ...o } })),
}));

/**
 * Open the Garden lines tool (from the Furniture catalog or the command palette) with `pick` already chosen: go to Plan mode, choose the tool, then the kind.
 * Order matters: `setView` resets the tool.
 */
export function openLines(pick?: (ui: LinesUi) => void) {
  const s = useStore.getState();
  s.setView("plan");
  s.setTool("lines");
  if (pick) pick(useLinesUi.getState());
}
