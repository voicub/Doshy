import type { RootState } from "@react-three/fiber";

/**
 * How the Share dialog's picture and video features reach the running 3D view, which lives inside the react-three-fiber Canvas: `components/scene/SnapshotBridge.tsx` (inside
 * the canvas) fills this in; `components/ui/snapshotCapture.ts` and `turntableRecord.ts` read it. Browser side, not unit tested.
 */
export const sceneBridge: {
  /** The canvas's live state (renderer, scene, camera, controls, size, invalidate, advance): null when no canvas is mounted. */
  get: (() => RootState) | null;
  /** Called once per drawn frame, from inside the frame loop (the turntable moves the camera here); null = nothing to do. */
  onFrame: ((state: RootState) => void) | null;
} = { get: null, onFrame: null };
