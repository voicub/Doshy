"use client";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import { foliageLook, foliageLookAt, levelOfFoliage } from "@/lib/vegetation";
import { useKnobs } from "@/lib/quality";
import { keepAlive } from "@/lib/framePacer";
import { windBend } from "@/lib/wind";
import { useStore } from "@/lib/store";
import { useSky } from "@/lib/useSky";
import { FOLIAGE } from "./foliageMaterial";
import { applyFoliageLook } from "./foliageLookApply";
import { useReducedMotion } from "./motion";
import { live } from "./skyLive";

const CALM_STIR = 0.03; // bend in dead calm so crowns are never perfectly frozen

/**
 * Feeds every tree, shrub, hedge, grass tuft and catalog plant: the season look (garden environment; the studio shows summer) and,
 * each frame, the live wind (strength with gusts, direction, phase) and snow cover. Mounted once in the scene; renders nothing.
 */
export default function FoliageDriver() {
  const garden = useStore((s) => s.environment) === "garden";
  const reduced = useReducedMotion();
  const { year } = useSky();
  const k = useKnobs();
  const level = levelOfFoliage(k.foliage);
  // the year only moves by the day (and snow by the weather's temperature): a key of its numbers, so the 30 s sky refresh re-applies nothing
  const key = `${year.phase}|${year.palette.season}${year.palette.mix}|${year.leafy}|${year.blossom}|${Math.round(year.snow * 20)}`;
  const look = useMemo(() => (garden ? foliageLookAt(year, level) : foliageLook("summer", 0)), [garden, level, key]);
  useLayoutEffect(() => applyFoliageLook(look), [look]);
  FOLIAGE.uWindOsc.value = reduced || !k.ambient ? 0 : 1;
  FOLIAGE.uDetail.value = levelOfFoliage(k.foliage) > 0 ? 1 : 0;
  const sway = k.ambient; // a calm tier keeps every plant still, so a still scene needs no frames

  useFrame((state) => {
    FOLIAGE.uTime.value = state.clock.elapsedTime;
    FOLIAGE.uWindBend.value = sway ? Math.max(CALM_STIR, windBend(live.wind, live.gust)) * (reduced ? 0.7 : 1) : 0;
    if (sway && garden) keepAlive(); // crowns move all the time: no idling while plants stand in a garden
    FOLIAGE.uWindDir.value.set(live.windX, live.windZ);
    FOLIAGE.uWindPhase.value = live.windPhase;
    FOLIAGE.uSnow.value = garden ? Math.max(look.snow, live.snowCover * 0.9) : 0;
  });
  return null;
}
