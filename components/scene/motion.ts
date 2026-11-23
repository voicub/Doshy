import { useSyncExternalStore } from "react";

const REDUCE = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True while the user asks for reduced motion. Live: flipping the OS setting updates mounted components. */
export const useReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, () => window.matchMedia(REDUCE).matches, () => false);
