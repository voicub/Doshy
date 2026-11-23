import { useStore } from "@/lib/store";
import { useEditUi } from "../scene/edit/editStore";

/** The X of an inspector. On compact screens (tiny and small) in Plan and Furniture mode it hides the sheet and keeps the selection (Edit in the edit strip brings it back); everywhere else it deselects. */
export function closeInspector() {
  const s = useStore.getState();
  if (document.documentElement.dataset.vp !== "regular" && s.view !== "ha" && s.sel) useEditUi.getState().set({ inspectorOpen: false });
  else s.select(null);
}
