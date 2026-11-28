// First-person walking: how input becomes motion. Pure; components/scene/walk/WalkRig.tsx runs it each frame and lib/walkCollide.ts decides what the motion may do.
// Directions: `yaw` is radians clockwise from the plan's up (-y), so a walker facing yaw looks along (sin yaw, -cos yaw) in plan metres and their right hand is (cos yaw, sin yaw).
import { clamp } from "./mathUtil.ts";

/** Walking pace (m/s): a relaxed adult indoors. Shift (or the joystick pushed to its rim) doubles it. */
export const WALK_SPEED = 1.4;
export const SPRINT_FACTOR = 2;
/** How quickly velocity follows what is asked for (1/s): full speed in about a third of a second, no snap. */
const ACCEL = 9;

/** Eye height above the floor (m): the "My height" setting. */
export const EYE_DEFAULT = 1.6;
export const EYE_MIN = 1.2;
export const EYE_MAX = 1.9;
export const clampEye = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? clamp(v, EYE_MIN, EYE_MAX) : EYE_DEFAULT);

/** The head may tip this far up or down (radians): never over the top. */
export const PITCH_LIMIT = (80 * Math.PI) / 180;
/** Look speed in radians per pixel dragged or moved. */
export const MOUSE_LOOK = 0.0024;
export const TOUCH_LOOK = 0.0052;

export type Vec = { x: number; y: number };
/** What the person asks for: forward and strafe in -1..1 (back and left are negative), and whether they run. */
export type Intent = { forward: number; strafe: number; sprint: boolean };
export type Look = { yaw: number; pitch: number };

export const headingOf = (yaw: number): Vec => ({ x: Math.sin(yaw), y: -Math.cos(yaw) });

/** The velocity (m/s, plan axes) an intent asks for when facing `yaw`. Diagonals are not faster than straight ahead. */
export function wishVelocity(i: Intent, yaw: number): Vec {
  const m = Math.hypot(i.forward, i.strafe);
  const [f, s] = m > 1 ? [i.forward / m, i.strafe / m] : [i.forward, i.strafe];
  const speed = WALK_SPEED * (i.sprint ? SPRINT_FACTOR : 1);
  const ahead = headingOf(yaw);
  return { x: (ahead.x * f + Math.cos(yaw) * s) * speed, y: (ahead.y * f + Math.sin(yaw) * s) * speed };
}

/** Velocity eased toward the wish: starting and stopping take a moment, like a body. Frame-rate independent. */
export function approach(v: Vec, wish: Vec, dt: number): Vec {
  const k = 1 - Math.exp(-ACCEL * Math.max(0, dt));
  return { x: v.x + (wish.x - v.x) * k, y: v.y + (wish.y - v.y) * k };
}

/** Turn the head by a pointer move of (dx, dy) pixels: right turns clockwise, down looks down. Yaw stays in -pi..pi. */
export function lookStep(l: Look, dx: number, dy: number, perPixel: number): Look {
  const yaw = l.yaw + dx * perPixel;
  return { yaw: yaw - Math.PI * 2 * Math.round(yaw / (Math.PI * 2)), pitch: clamp(l.pitch - dy * perPixel, -PITCH_LIMIT, PITCH_LIMIT) };
}

/** A stride is about this long (m): one up-and-down of the head per step. */
const STRIDE = 0.75;
/** How far the head rises and falls at a walk (m): barely there. */
const BOB = 0.011;

/** The head's small up-and-down (m) after walking `travelled` metres, fading to nothing as the walker slows down. */
export const headBob = (travelled: number, speed: number): number => Math.sin((travelled / STRIDE) * Math.PI * 2) * BOB * clamp(speed / WALK_SPEED, 0, 1.4);

const DEAD_ZONE = 0.15;
/** The on-screen joystick: the thumb is (dx, dy) pixels from the stick's centre (up is negative); `radius` is the stick's reach. Past the rim is a run. */
export function joystickIntent(dx: number, dy: number, radius: number): Intent {
  const dist = Math.hypot(dx, dy);
  const m = dist / radius;
  if (m < DEAD_ZONE) return { forward: 0, strafe: 0, sprint: false };
  const strength = (Math.min(m, 1) - DEAD_ZONE) / (1 - DEAD_ZONE); // out of the dead zone the push grows from nothing
  return { forward: (-dy / dist) * strength, strafe: (dx / dist) * strength, sprint: m >= 1.25 };
}

/** The yaw that looks from one point toward another. */
export const yawToward = (from: Vec, to: Vec): number => Math.atan2(to.x - from.x, -(to.y - from.y));
