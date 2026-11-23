import { useEffect } from "react";
import { useStore } from "@/lib/store";

/**
 * The editing views always show the interior, whatever cut-away the user chose for the live view; that choice is restored on the way out
 * (also when the tab closes, since the store persists it).
 */
export default function useForceCutaway() {
  useEffect(() => {
    const { setCutaway } = useStore.getState();
    const prev = useStore.getState().cutaway;
    setCutaway(true);
    const unsub = useStore.subscribe((s) => !s.cutaway && s.setCutaway(true));
    const restore = () => useStore.getState().setCutaway(prev);
    window.addEventListener("pagehide", restore);
    return () => {
      unsub();
      window.removeEventListener("pagehide", restore);
      restore();
    };
  }, []);
}
