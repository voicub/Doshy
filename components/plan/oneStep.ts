import { useStore } from "@/lib/store";

/** Run a one-off edit as a single undo step, or as part of the gesture already open. */
export function inOneStep(fn: () => void) {
  const s = useStore.getState();
  if (s.gesture) return fn();
  s.beginEdit();
  fn();
  s.endEdit();
}
