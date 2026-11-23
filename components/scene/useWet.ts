import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { keepAlive } from "@/lib/framePacer";
import { Color, MathUtils, type MeshStandardMaterial } from "three";
import { live } from "./skyLive";

const SNOW = new Color("#e8eef6");

/** Outdoor surfaces darken and go glossy in the rain and whiten under snow. Writes the material in place, only when the weather moved. */
export function useWetSurface(ref: RefObject<MeshStandardMaterial | null>, base: string, dryRoughness: number, wetRoughness: number, darken = 0.35, enabled = true) {
  const baseColor = useMemo(() => new Color(base), [base]);
  const last = useRef({ wet: -1, snow: -1, base: "" });
  useFrame(() => {
    const m = ref.current;
    const l = last.current;
    if (!enabled || !m || (Math.abs(l.wet - live.wet) < 0.002 && Math.abs(l.snow - live.snowCover) < 0.002 && l.base === base)) return;
    l.wet = live.wet;
    l.snow = live.snowCover;
    l.base = base;
    m.color.copy(baseColor).multiplyScalar(1 - darken * live.wet).lerp(SNOW, live.snowCover * 0.55);
    m.roughness = MathUtils.lerp(dryRoughness, wetRoughness, live.wet);
    keepAlive(false);
  });
}
