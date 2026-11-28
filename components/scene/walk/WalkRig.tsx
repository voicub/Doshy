"use client";
import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree, type RootState } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { MathUtils, Vector3, type OrthographicCamera, type PerspectiveCamera as PerspectiveCam } from "three";
import { keepAlive } from "@/lib/framePacer";
import { clamp } from "@/lib/mathUtil";
import { isLite, useQuality } from "@/lib/quality";
import { useStore } from "@/lib/store";
import { buildWalkWorld, stepWalker, type Walker, type WalkWorld } from "@/lib/walkCollide";
import { roomNameAt } from "@/lib/walkMap";
import { approach, headBob, lookStep, wishVelocity, type Vec } from "@/lib/walkMove";
import { levelSpot, walkStart } from "@/lib/walkStart";
import { useWalk, useWalkPose } from "@/lib/walkStore";
import type { Plan } from "@/lib/types";
import { isOrtho } from "../camera";
import { useReducedMotion } from "../motion";
import { NEAR, WALK_FOV, blendCamera, eyePose, isoPose, newPose, walkLens, type Pose } from "./walkCamera";
import { attachWalkInput } from "./walkEvents";
import { walkInput } from "./walkInput";
import { REACH_CROSSHAIR, createPicker, describe } from "./walkPick";
import WalkCeiling from "./WalkCeiling";

const FAR = 60; // m: nothing is drawn beyond it
const FAR_ECO = 32;
const MAX_DT = 0.25; // s: the longest frame the walker's clock follows (a tab coming back from sleep must not fling them across the house)
const ENTER_S = 1.5;
const EXIT_S = 1.2;
const TURN_RATE = 1.7; // rad/s: the arrow keys
const FLOOR_T = 0.06; // the finished floor lies this far above its level's origin (RoomFloor)
const HEIGHT_EASE = 12; // damp rate of the eye following the floor on stairs
const POSE_EVERY_MS = 100; // the mini-map and room name are told this often
const AIM_EVERY_MS = 120;
const smooth = (p: number): number => p * p * (3 - 2 * p);

/** Everything about one walk that changes every frame: kept in a ref, never in React state. */
type Session = {
  walker: Walker;
  yaw: number;
  pitch: number;
  v: Vec;
  /** The height the eyes follow the floor to (eased, so a staircase is a glide and not a step). */
  drawH: number;
  travelled: number;
  /** 0..1 progress of the flight in or out. */
  t: number;
  ortho: OrthographicCamera | null;
  /** The isometric end of the flight, the walking end, and where the flight out began. */
  iso: Pose;
  eye: Pose;
  exitFrom: Pose;
  poseAt: number;
  aimAt: number;
  aimDirty: boolean;
};

function controlsTarget(state: RootState): Vector3 | null {
  const c = state.controls;
  return c && "target" in c && c.target instanceof Vector3 ? c.target : null;
}

/** Begin a walk at the chosen start, or null when the plan has nowhere to stand. The camera is still the isometric one at this point. */
function open(state: RootState, plan: Plan, world: WalkWorld, from: string | null, eye: number): Session | null {
  const start = walkStart(plan, world, from);
  if (!start) return null;
  const cam = state.camera;
  const ortho = isOrtho(cam) ? cam : null;
  const target = controlsTarget(state);
  const s: Session = {
    walker: start.walker,
    yaw: start.yaw,
    pitch: 0,
    v: { x: 0, y: 0 },
    drawH: start.walker.h,
    travelled: 0,
    t: 0,
    ortho,
    iso: newPose(),
    eye: newPose(),
    exitFrom: newPose(),
    poseAt: 0,
    aimAt: 0,
    aimDirty: true,
  };
  eyePose(start.walker.x, start.walker.h + FLOOR_T + eye, start.walker.y, start.yaw, 0, s.eye);
  if (ortho && target) isoPose(ortho, target, s.iso);
  else s.t = 1; // no isometric camera to fly from (or no point it looks at): start in place
  return s;
}

const held = (k: ReadonlySet<string>, ...codes: string[]): number => (codes.some((c) => k.has(c)) ? 1 : 0);

/** One frame of walking: turn the head, ease the velocity toward what the keys and joystick ask for, move and slide, follow the floor. Returns whether anything moved. */
function walk(s: Session, world: WalkWorld, plan: Plan, dt: number, reduced: boolean): boolean {
  const k = walkInput.keys;
  const turn = held(k, "ArrowRight") - held(k, "ArrowLeft");
  const asked = walkInput.yaw !== 0 || walkInput.pitch !== 0 || turn !== 0;
  const look = lookStep({ yaw: s.yaw, pitch: s.pitch }, walkInput.yaw + turn * TURN_RATE * dt, walkInput.pitch, 1);
  walkInput.yaw = walkInput.pitch = 0;
  [s.yaw, s.pitch] = [look.yaw, look.pitch];

  const stick = walkInput.stick;
  const intent = {
    forward: clamp(held(k, "KeyW", "ArrowUp") - held(k, "KeyS", "ArrowDown") + stick.forward, -1, 1),
    strafe: clamp(held(k, "KeyD") - held(k, "KeyA") + stick.strafe, -1, 1),
    sprint: k.has("ShiftLeft") || k.has("ShiftRight") || stick.sprint,
  };
  s.v = approach(s.v, wishVelocity(intent, s.yaw), dt);
  const speed = Math.hypot(s.v.x, s.v.y);
  const idle = intent.forward === 0 && intent.strafe === 0;
  if (idle && speed < 0.02) s.v = { x: 0, y: 0 };
  let moved = 0;
  if (speed > 0.01) {
    const next = stepWalker(world, s.walker, s.v.x * dt, s.v.y * dt);
    moved = Math.hypot(next.x - s.walker.x, next.y - s.walker.y);
    s.travelled += moved;
    s.walker = next;
  }
  if (walkInput.level && walkInput.level !== s.walker.level) {
    const spot = levelSpot(plan, world, walkInput.level, s.walker.x, s.walker.y);
    if (spot) [s.walker, s.v] = [spot, { x: 0, y: 0 }];
  }
  walkInput.level = null;
  const settled = Math.abs(s.drawH - s.walker.h) < 0.002;
  s.drawH = reduced || settled ? s.walker.h : MathUtils.damp(s.drawH, s.walker.h, HEIGHT_EASE, dt);
  return asked || moved > 0 || !settled;
}

/** Tell the mini-map, the room name and the level chip where the walker is (a few times a second, and only when it changed). */
function publish(s: Session, plan: Plan, now: number): void {
  if (now < s.poseAt) return;
  s.poseAt = now + POSE_EVERY_MS;
  const { x, y, level } = s.walker;
  const was = useWalkPose.getState();
  if (Math.hypot(was.x - x, was.y - y) > 0.03 || Math.abs(was.yaw - s.yaw) > 0.02) useWalkPose.setState({ x, y, yaw: s.yaw });
  const walk = useWalk.getState();
  walk.setLevel(level);
  walk.setRoom(roomNameAt(plan, level, x, y));
}

/**
 * The first-person camera: mounted for the whole walk (flight in, walking, flight out). It takes over as the scene's camera (and gives the isometric one back when it
 * unmounts, so the Rig finds it exactly as it left it), reads the keys, mouse and joystick (walkEvents.ts, WalkJoystick) and moves a walker through the plan (lib/walkCollide.ts).
 * Frames are asked for only while something moves, so a walker standing still costs the scene nothing.
 */
export default function WalkRig() {
  const get = useThree((s) => s.get);
  const gl = useThree((s) => s.gl);
  const plan = useStore((s) => s.plan);
  const reduced = useReducedMotion();
  const far = useQuality((s) => (isLite(s.tier) ? FAR_ECO : FAR));
  const world = useMemo(() => buildWalkWorld(plan), [plan]);
  const now = useRef({ plan, world, reduced, far });
  now.current = { plan, world, reduced, far };
  const cam = useRef<PerspectiveCam>(null);
  const ses = useRef<Session | null>(null);
  if (ses.current === null) ses.current = open(get(), plan, world, useWalk.getState().from, useWalk.getState().eye);
  if (ses.current && reduced) ses.current.t = 1;
  const picker = useMemo(() => createPicker(get, () => ses.current?.walker.level ?? ""), [get]);
  const phase = useWalk((s) => s.phase);

  useEffect(() => {
    if (!ses.current) {
      useWalk.getState().setNote("There is nowhere to stand in this plan yet. Draw a room first.");
      useWalk.getState().finished();
      return;
    }
    return attachWalkInput(gl.domElement, picker);
  }, [gl, picker]);
  useEffect(() => picker.refresh(), [plan, picker]);
  // the new camera is made the default at mount and sits at the origin until the first frame callback: put it where the flight starts before anything is drawn with it
  useLayoutEffect(() => {
    const c = cam.current;
    const s = ses.current;
    if (c && s) blendCamera(c, s.iso, s.eye, s.t, 1 - s.t, now.current.far);
  }, []);

  useEffect(() => {
    const c = cam.current;
    const s = ses.current;
    if (phase !== "exit" || !c || !s) return;
    if (document.pointerLockElement) document.exitPointerLock();
    s.exitFrom.pos.copy(c.position);
    s.exitFrom.quat.copy(c.quaternion);
    s.exitFrom.fov = c.fov;
    s.t = 0;
  }, [phase]);

  useFrame((state, rawDt) => {
    const s = ses.current;
    const c = cam.current;
    if (!s || !c) return;
    const dt = Math.min(rawDt, MAX_DT); // a slow computer still walks at real speed: stepWalker takes a long move in short pieces, so a long frame cannot tunnel through a wall
    const { phase: ph, eye, bob } = useWalk.getState();
    const { world: w, plan: p, reduced: calm, far: farPlane } = now.current;
    const t = performance.now();
    if (ph === "exit") {
      const target = controlsTarget(state);
      if (!s.ortho || !target || calm) return useWalk.getState().finished();
      isoPose(s.ortho, target, s.iso);
      s.t = Math.min(1, s.t + dt / EXIT_S);
      blendCamera(c, s.exitFrom, s.iso, smooth(s.t), smooth(s.t), farPlane);
      if (s.t >= 1) useWalk.getState().finished();
      else keepAlive(false);
      return;
    }
    const active = ph === "walk" ? walk(s, w, p, dt, calm) : false;
    const speed = Math.hypot(s.v.x, s.v.y);
    const bobY = bob && !calm ? headBob(s.travelled, speed) : 0;
    eyePose(s.walker.x, s.drawH + FLOOR_T + eye + bobY, s.walker.y, s.yaw, s.pitch, s.eye);
    if (ph === "enter") {
      s.t = Math.min(1, s.t + dt / ENTER_S);
      blendCamera(c, s.iso, s.eye, smooth(s.t), 1 - smooth(s.t), farPlane);
      if (s.t >= 1) useWalk.getState().arrived();
      else keepAlive(false);
      return;
    }
    c.position.copy(s.eye.pos);
    c.quaternion.copy(s.eye.quat);
    if (c.fov !== WALK_FOV || c.near !== NEAR || c.far !== farPlane) walkLens(c, farPlane);
    publish(s, p, t);
    s.aimDirty ||= active;
    if (active) keepAlive(false);
    const hold = !window.matchMedia("(pointer: coarse)").matches && t >= walkInput.aimHold;
    if (s.aimDirty && hold) {
      if (t < s.aimAt) return keepAlive(false); // throttled: come back for it, or an aim taken mid-turn would stay on screen
      s.aimAt = t + AIM_EVERY_MS;
      s.aimDirty = false;
      c.updateMatrixWorld(); // the picker's ray starts from the camera's matrix, which is otherwise only brought up to date when the frame is drawn
      const hit = picker.at(0, 0, REACH_CROSSHAIR);
      useWalk.getState().setAim(hit && describe(hit.id));
    }
  });

  return (
    <>
      <PerspectiveCamera ref={cam} makeDefault fov={10} near={12} far={340} />
      {phase === "walk" && <WalkCeiling />}
    </>
  );
}
