import { useEffect } from "react";
import { useActivePlan } from "@/lib/activePlan";
import { toggleReplay, useReplay } from "@/lib/replay";
import { useStore } from "@/lib/store";
import { isTypingTarget } from "./ui/isTypingTarget";

const closeIfOpen = () => {
  if (useReplay.getState().open) useReplay.getState().close();
};

/**
 * History replay's tie-ins to the dashboard: Y opens or closes the time bar (Live mode only); leaving Live, starting cinema or opening another plan ends the replay
 * (the live states come back, nothing keeps running). The bar itself is lazy and only mounted while open.
 */
export function useReplayEffects(live: boolean, modalOpen: boolean) {
  const cinema = useStore((s) => s.cinema);
  const planId = useActivePlan((s) => s.id);
  useEffect(() => {
    if (!live || cinema) closeIfOpen();
  }, [live, cinema]);
  useEffect(() => closeIfOpen, [planId]); // runs when the plan on screen changes (and when the dashboard goes away)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "y" || e.metaKey || e.ctrlKey || e.altKey || modalOpen || isTypingTarget(e.target)) return;
      const s = useStore.getState();
      if (s.view !== "live" || s.cinema) return;
      e.preventDefault();
      toggleReplay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);
}
