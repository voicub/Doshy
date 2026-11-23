"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { createGovernor } from "@/lib/qualityGovernor";
import { useQuality } from "@/lib/quality";
import { useStore } from "@/lib/store";
import { useGraphicsNotice } from "../ui/graphicsUi";

/** Watches frame times and steps the graphics tier down one notch when the machine cannot keep up (decision logic: lib/qualityGovernor.ts). Renders nothing. */
export default function QualityGovernor() {
  const governor = useMemo(() => createGovernor(), []);
  const environment = useStore((s) => s.environment);
  const view = useStore((s) => s.view);

  // a new environment or mode rebuilds shaders and geometry: measure again from scratch
  useEffect(() => governor.reset(), [governor, environment, view]);
  useEffect(() => {
    const onVisible = () => governor.reset();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [governor]);

  useFrame((_, dt) => {
    if (document.hidden) return;
    const { tier, manual, setTier } = useQuality.getState();
    const next = governor.frame(dt * 1000, tier, manual);
    if (!next) return;
    setTier(next, false);
    useGraphicsNotice.getState().show(next);
  });
  return null;
}
