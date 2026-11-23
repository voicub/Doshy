import { useSyncExternalStore } from "react";

/**
 * Camera azimuth around the scene (OrbitControls `getAzimuthalAngle`, degrees): 0 = camera on the +z side looking toward -z (plan up),
 * the default isometric view is 45. Scene3D writes it, HUD compasses read it.
 * Screen position of a plan direction d = (dx, dz) (x east-in-plan, z = plan y, down): right = dx*cos(a) - dz*sin(a), up = -dx*sin(a) - dz*cos(a).
 */
let yaw = 45;
const listeners = new Set<() => void>();

export const getCameraYaw = () => yaw;
export function setCameraYaw(deg: number) {
  if (Math.abs(deg - yaw) < 0.1) return;
  yaw = deg;
  listeners.forEach((l) => l());
}
export const useCameraYaw = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => yaw,
    () => 45,
  );

/** Plan-space unit vector (x, z=y) of a compass bearing, given the compass bearing of the plan's up direction (`Plan.bearing`). */
export const planDirOf = (bearingDeg: number, planBearing = 0): [number, number] => {
  const r = ((bearingDeg - planBearing) * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
};

/** Clockwise angle on screen (degrees, 0 = up) of a plan-space direction for a camera yaw. */
export const screenAngleOf = ([dx, dz]: [number, number], yawDeg: number): number => {
  const a = (yawDeg * Math.PI) / 180;
  const right = dx * Math.cos(a) - dz * Math.sin(a);
  const up = -dx * Math.sin(a) - dz * Math.cos(a);
  return (Math.atan2(right, up) * 180) / Math.PI;
};
