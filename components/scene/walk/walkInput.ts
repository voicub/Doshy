import type { Intent } from "@/lib/walkMove";

/**
 * What the walker is asking for right now. The listeners (walkEvents.ts, the on-screen joystick) write it, WalkRig reads it once per frame: plain mutable state, because it
 * changes with every pointer move and must not re-render anything.
 */
export const walkInput = {
  /** Physical keys held (`KeyboardEvent.code`). */
  keys: new Set<string>(),
  /** The on-screen joystick. */
  stick: { forward: 0, strafe: 0, sprint: false } as Intent,
  /** Turning asked for since the last frame, in radians: yaw to the right, pitch downward. */
  yaw: 0,
  pitch: 0,
  /** The storey the level button asked to go to (taken once by the next frame). */
  level: null as string | null,
  /** A tapped device's name is on screen until this time (performance.now() ms): the crosshair does not replace it before. */
  aimHold: 0,
};

/** Turn the head by a pointer move of (dx, dy) pixels at `perPixel` radians per pixel. */
export function addLook(dx: number, dy: number, perPixel: number): void {
  walkInput.yaw += dx * perPixel;
  walkInput.pitch += dy * perPixel;
}

export function resetWalkInput(): void {
  walkInput.keys.clear();
  walkInput.stick = { forward: 0, strafe: 0, sprint: false };
  walkInput.yaw = walkInput.pitch = 0;
  walkInput.level = null;
  walkInput.aimHold = 0;
}
