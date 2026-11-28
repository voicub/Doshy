import { MathUtils, Vector3, type OrthographicCamera } from "three";
import { wallCam } from "@/lib/wallCamera";

const UP_Y = new Vector3(0, 1, 0);
const MAX_STEP = 0.25; // s: a late frame (the scene idles between pictures) must not turn the home by a jump

type Orbit = { target: Vector3; getAzimuthalAngle: () => number };

/**
 * The wall display's part of the camera (lib/wallCamera.ts): a one-off turn to a corner, then a slow steady turn round the home. Returns true while the camera moves,
 * so the caller keeps the scene drawing (at the tier's ambient rate: ten pictures a second on Eco). Nothing happens, and nothing is drawn, when the wall display is not asking.
 */
export function wallOrbitStep(c: Orbit, cam: OrthographicCamera, dt: number): boolean {
  let turn = 0;
  if (wallCam.snap !== null) {
    turn = MathUtils.degToRad(wallCam.snap) - c.getAzimuthalAngle();
    wallCam.snap = null;
  } else if (wallCam.rate !== 0) {
    turn = MathUtils.degToRad(wallCam.rate) * Math.min(dt, MAX_STEP);
  }
  if (turn === 0) return false;
  cam.position.sub(c.target).applyAxisAngle(UP_Y, turn).add(c.target); // turning about y by +a adds a to the azimuth (atan2(x, z))
  cam.updateProjectionMatrix();
  return wallCam.rate !== 0;
}
