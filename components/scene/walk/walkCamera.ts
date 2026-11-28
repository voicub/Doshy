import { Euler, MathUtils, Matrix4, Quaternion, Vector3, type OrthographicCamera, type PerspectiveCamera } from "three";

/** Vertical field of view while walking (degrees): wide enough for a room, not a fish-eye. */
export const WALK_FOV = 72;
/** The flight starts and ends on a camera that looks like the isometric one: a very narrow field of view from far away is nearly parallel projection. */
const FLIGHT_FOV = 10;
export const NEAR = 0.05;
/** The clip planes at the isometric end of the flight: the camera is far away then, and a near plane of centimetres would waste all the depth precision. */
const FLIGHT_NEAR = 12;
const FLIGHT_FAR = 340;
const DEG = Math.PI / 180;

export type Pose = { pos: Vector3; quat: Quaternion; fov: number };
export const newPose = (): Pose => ({ pos: new Vector3(), quat: new Quaternion(), fov: WALK_FOV });

const M = new Matrix4();
const UP = new Vector3(0, 1, 0);
const EULER = new Euler(0, 0, 0, "YXZ");
const DIR = new Vector3();

/** The perspective camera that sees what the isometric camera sees: the same point, from the same side, far enough back for its narrow view to span the same height. */
export function isoPose(ortho: OrthographicCamera, target: Vector3, out: Pose): Pose {
  DIR.copy(ortho.position).sub(target);
  if (DIR.lengthSq() < 1e-9) DIR.set(1, 1, 1);
  DIR.normalize();
  const height = (ortho.top - ortho.bottom) / ortho.zoom; // metres the isometric view spans from top to bottom of the screen
  out.pos.copy(target).addScaledVector(DIR, height / 2 / Math.tan((FLIGHT_FOV * DEG) / 2));
  out.quat.setFromRotationMatrix(M.lookAt(out.pos, target, UP));
  out.fov = FLIGHT_FOV;
  return out;
}

/** The eyes of a walker standing at (x, z) with the eyes `y` metres up, facing `yaw` (clockwise from the plan's up) and tipped `pitch` (up is positive). */
export function eyePose(x: number, y: number, z: number, yaw: number, pitch: number, out: Pose): Pose {
  out.pos.set(x, y, z);
  out.quat.setFromEuler(EULER.set(pitch, -yaw, 0));
  out.fov = WALK_FOV;
  return out;
}

/**
 * Puts the camera `e` of the way (0..1, eased by the caller) from pose `a` to pose `b`. `flight` says how isometric the lens still is (1 = fully, 0 = walking), which
 * sets the clip planes: near and far slide on a log scale so neither the floor under the eyes nor the roof seen from above is ever cut off.
 */
export function blendCamera(cam: PerspectiveCamera, a: Pose, b: Pose, e: number, flight: number, far: number): void {
  cam.position.lerpVectors(a.pos, b.pos, e);
  cam.quaternion.slerpQuaternions(a.quat, b.quat, e);
  cam.fov = MathUtils.lerp(a.fov, b.fov, e);
  cam.near = NEAR * (FLIGHT_NEAR / NEAR) ** flight;
  cam.far = MathUtils.lerp(far, FLIGHT_FAR, flight);
  cam.updateProjectionMatrix();
}

/** The walking lens: field of view and clip planes. */
export function walkLens(cam: PerspectiveCamera, far: number): void {
  cam.fov = WALK_FOV;
  cam.near = NEAR;
  cam.far = far;
  cam.updateProjectionMatrix();
}
