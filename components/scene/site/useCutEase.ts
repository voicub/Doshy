"use client";
import { useFrame } from "@react-three/fiber";
import { MathUtils } from "three";
import { keepAlive } from "@/lib/framePacer";
import { useStore } from "@/lib/store";
import { cameraAzimuth } from "../facingState";
import { SITE_U } from "./siteShader";

const CUT_RATE = 5; // the neighbours sink and rise at the rate the home's roof lifts off (Roof.tsx FADE_RATE)

/**
 * Keeps the neighbours' cut-away uniforms current. Cut-away on (`uAuto` 0): every neighbour near the plan is lowered. Off (`uAuto` 1, eased): only the ones that stand
 * between the camera and the plan are, by their bearing from the plan against the camera's azimuth (`uAz`, written every frame: the camera moving is what draws the frames).
 * Mounted by whichever layer draws the neighbours (SiteBuildings or SiteCity).
 */
export function useCutEase() {
  useFrame(({ camera }, dt) => {
    SITE_U.uAz.value = (cameraAzimuth(camera) * Math.PI) / 180;
    const to = useStore.getState().cutaway ? 0 : 1;
    const k = SITE_U.uAuto.value;
    if (Math.abs(k - to) < 0.002) SITE_U.uAuto.value = to;
    else {
      SITE_U.uAuto.value = MathUtils.damp(k, to, CUT_RATE, Math.min(dt, 0.1));
      keepAlive();
    }
  });
}
