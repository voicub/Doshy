"use client";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentRef, type MutableRefObject, type RefObject } from "react";
import { MathUtils, Vector3, type OrthographicCamera as OrthoCam } from "three";
import { planBounds, roomBounds, type Bounds } from "@/lib/geometry";
import { setCameraYaw } from "@/lib/cameraYaw";
import { useDisplay } from "@/lib/displayStore";
import { findLevel } from "@/lib/levels";
import { useStore } from "@/lib/store";
import { keepAlive } from "@/lib/framePacer";
import { solveRoomView, turnBetween } from "@/lib/roomView";
import { useLevelVisibility } from "./levelState";
import { boxOf } from "./edit/Outlines";
import { useItemFocus } from "./itemFocus";
import { hudInset } from "./hudInset";
import { setIsoFacing, useIsoZone } from "./isoState";
import { useReducedMotion } from "./motion";
import { DEFAULT_AZIMUTH, DEFAULT_ELEVATION } from "@/lib/roomIsolate";
import { isOrtho } from "./camera";
import { wallOrbitStep } from "./wallOrbit";
import { useWalk, useWalkActive } from "@/lib/walkStore";

const { damp, DEG2RAD } = MathUtils;
const CAM_DISTANCE = 40;
const ISO = 1 / Math.sqrt(3); // true isometric: camera on the (1,1,1) diagonal
const MIN_ZOOM = 10;
const MAX_ZOOM = 220;
const FIT_H = 2.2; // metres of height included when fitting a footprint
const FRAME_ZOOM = 90; // px per metre: close enough to read a room's devices
const LETTERBOX = 2.39; // cinema-mode bar aspect (matches the HUD's letterbox)
const PAD_PLAN = 1.3;
const PAD_ROOM = 1.5; // a focused room in the whole-plan view
const PAD_ISO = 1.2; // Room mode fits the free area: the room fills it with a little air round the walls
const EASE = 3.4; // damp rate: ~1.1 s to settle
const TURN_SECONDS = 0.65; // entering or leaving a room: centre, zoom and turn arrive together, on a smooth in-and-out curve
const MAX_STEP = 0.05; // s: a frame that came late must not eat the move
const STILL_TURNED = 2; // degrees: the camera is still where entering the room left it, so leaving the room turns it back
const DRIFT_YAW = 6 * DEG2RAD;
const DRIFT_PERIOD = 42; // s
const BREATHE = 0.012;
const BREATHE_PERIOD = 19; // s

// screen axes of the isometric camera, in world space
const RIGHT = new Vector3(1, 0, -1).normalize();
const UP = new Vector3(-1, 2, -1).normalize();
const UP_Y = new Vector3(0, 1, 0);
const OFFSET = new Vector3();

/** Camera target and ortho zoom (pixels per metre) that frame a footprint of height FIT_H. */
function fit(b: Bounds, width: number, height: number, pad: number, yLow: number, yHigh: number) {
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.y0 + b.y1) / 2;
  const ty = (yLow + yHigh) / 2;
  let u = 0.1;
  let v = 0.1;
  for (const x of [b.x0, b.x1]) {
    for (const z of [b.y0, b.y1]) {
      for (const y of [yLow, yHigh]) {
        const d = new Vector3(x - cx, y - ty, z - cz);
        u = Math.max(u, Math.abs(d.dot(RIGHT)));
        v = Math.max(v, Math.abs(d.dot(UP)));
      }
    }
  }
  const zoom = MathUtils.clamp(Math.min(width / (2 * u * pad), height / (2 * v * pad)), MIN_ZOOM, MAX_ZOOM);
  return { target: new Vector3(cx, ty, cz), zoom };
}

/** Where a timed move started, captured on its first frame. */
type Tween = { t: number; target: Vector3; zoom: number; offset: Vector3 };
/** `turn` (radians round y, signed) set = a timed move that also turns the camera that far about its target; absent = the eased move that keeps the angle. `snap` jumps there. */
type Goal = { target: Vector3; zoom: number; snap: boolean; turn?: number; tween?: Tween };
type Controls = ComponentRef<typeof OrbitControls>;
type Drift = { t0: number; yaw: number; breathe: number; stopped: boolean };
/** Room mode: where the camera looked from before entering the first room, and where entering left it (to tell whether the owner has turned it since). Degrees. */
type Entry = { from: number; solved: number };

const azimuthOf = (c: Controls | null): number => (c ? c.getAzimuthalAngle() / DEG2RAD : DEFAULT_AZIMUTH);
const round1 = (deg: number): number => Math.round(((deg % 360) + 360) % 360 * 10) / 10;

/**
 * Frames the whole plan, one focused room, the isolated Room-mode footprint or a list row's item by setting `goal`, whenever the framing inputs change:
 * Room mode (turned to the side that shows the room best, clear of the HUD panels), focused room, whole plan, or the plan changed shape.
 */
function useFraming(ctl: RefObject<Controls | null>, goal: MutableRefObject<Goal | null>) {
  const get = useThree((s) => s.get);
  const focusRoom = useStore((s) => s.focusRoom);
  const plan = useStore((s) => s.plan);
  const cinema = useStore((s) => s.cinema);
  const faceRoom = useDisplay((s) => s.faceRoom);
  const reduced = useReducedMotion();
  const room = focusRoom ? plan.rooms.find((r) => r.id === focusRoom) : undefined;
  const bounds = useMemo(() => planBounds(plan), [plan]);
  const boundsKey = bounds ? `${bounds.x0},${bounds.y0},${bounds.x1},${bounds.y1}` : "";
  const roomKey = room ? `${room.x},${room.y},${room.w},${room.h}` : "";
  // vertical extent: the plinth (ground) up to the top of the highest storey on show, or one room's own storey
  const { levels, visible } = useLevelVisibility();
  const topElev = Math.max(0, ...levels.filter((l) => visible[l.id]).map((l) => l.elevation));
  const roomElev = room ? findLevel(plan, room.level).elevation : 0;
  const yLow = room ? roomElev : 0;
  const yHigh = (room ? roomElev : topElev) + FIT_H;
  const first = useRef(true);
  const entry = useRef<Entry | null>(null);

  const zone = useIsoZone();
  // Room mode: turn to the side that shows the room best, centre it and fit it into the free area
  useEffect(() => {
    const { size } = get();
    if (!zone || !size.width) return undefined;
    const visibleH = cinema ? Math.min(size.height, size.width / LETTERBOX) : size.height; // keep the subject inside the cinema bars
    // one frame later, so the bar and the device list that appear with Room mode have been laid out and can be measured
    const frame = requestAnimationFrame(() => {
      const c = ctl.current;
      const current = azimuthOf(c);
      const view = solveRoomView(useStore.getState().plan, zone, {
        current,
        candidates: faceRoom ? undefined : [current], // the owner switched turning off: only centre and zoom
        cutaway: true, // Room mode cuts the walls between the camera and the room whatever the Cut-away switch says
        elevation: c ? 90 - c.getPolarAngle() / DEG2RAD : DEFAULT_ELEVATION,
        width: size.width,
        height: visibleH,
        inset: cinema ? undefined : hudInset(size.width, size.height),
        pad: PAD_ISO,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
      });
      entry.current = { from: entry.current?.from ?? current, solved: view.azimuth };
      setIsoFacing(round1(view.azimuth));
      goal.current = { target: new Vector3(...view.framing.target), zoom: view.framing.zoom, snap: reduced, turn: view.turn * DEG2RAD };
      get().invalidate(); // the goal was set between frames
    });
    return () => cancelAnimationFrame(frame);
  }, [zone, cinema, faceRoom, reduced, get, ctl, goal]);

  // the whole plan or one focused room (and the way back out of Room mode)
  useEffect(() => {
    const { size } = get();
    if (zone || !size.width || useWalk.getState().phase !== "off") return; // while somebody walks the isometric camera is parked: what changes then (the storeys on show, a room focus coming back) must not re-frame it, so leaving finds the view as it was
    const visibleH = cinema ? Math.min(size.height, size.width / LETTERBOX) : size.height;
    const b = room ? roomBounds(room) : bounds;
    if (!b) return;
    const f = fit(b, size.width, visibleH, room ? PAD_ROOM : PAD_PLAN, yLow, yHigh);
    // leaving Room mode: look from where the camera was before it turned (unless the owner has turned it since)
    const left = entry.current;
    entry.current = null;
    const now = azimuthOf(ctl.current);
    const back = left && Math.abs(turnBetween(left.solved, now)) < STILL_TURNED ? turnBetween(now, left.from) : 0;
    if (left) setIsoFacing(round1(back ? left.from : now)); // the next room is entered from there: its walls start out right
    if (Math.abs(back) > 0.5) {
      goal.current = { ...f, snap: reduced, turn: back * DEG2RAD };
      return;
    }
    goal.current = { ...f, snap: first.current };
    first.current = false;
    // keyed by the framing inputs (roomKey/boundsKey are stable digests), so a plan edit that moves nothing does not re-frame the camera
  }, [zone, focusRoom, roomKey, boundsKey, cinema, get, yLow, yHigh, reduced]);

  // A list row asked to see one item: ease the camera onto it, zoomed in at least to FRAME_ZOOM.
  const frame = useItemFocus((s) => s.frame);
  useEffect(() => {
    const b = frame && boxOf(useStore.getState().plan, { type: "item", id: frame.id });
    if (!b) return;
    const cam = get().camera;
    goal.current = { target: new Vector3(b.x, (b.y0 + b.y1) / 2, b.z), zoom: Math.max(isOrtho(cam) ? cam.zoom : 0, FRAME_ZOOM), snap: false };
  }, [frame, get]);
}

const smooth = (p: number): number => p * p * (3 - 2 * p);

/** A timed move: centre, zoom and the turn about the target all follow one smooth curve and arrive together; true once there. */
function tweenToGoal(c: Controls, cam: OrthoCam, g: Goal, turn: number, dt: number): boolean {
  const t = (g.tween ??= { t: 0, target: c.target.clone(), zoom: cam.zoom, offset: cam.position.clone().sub(c.target) });
  t.t += Math.min(dt, MAX_STEP);
  const p = g.snap ? 1 : Math.min(1, t.t / TURN_SECONDS);
  const e = smooth(p);
  c.target.lerpVectors(t.target, g.target, e);
  cam.zoom = t.zoom * (g.zoom / t.zoom) ** e; // zoom in ratio: a doubling looks as fast at its start as at its end
  cam.position.copy(c.target).add(OFFSET.copy(t.offset).applyAxisAngle(UP_Y, turn * e));
  return p >= 1;
}

/** Moves the camera toward its goal (or snaps to it); true once it has arrived. */
function easeToGoal(c: Controls, cam: OrthoCam, g: Goal, iso: Vector3, dt: number): boolean {
  if (g.turn !== undefined) return tweenToGoal(c, cam, g, g.turn, dt);
  if (g.snap) {
    c.target.copy(g.target);
    cam.position.copy(g.target).add(iso);
    cam.zoom = g.zoom;
    return true;
  }
  const before = c.target.clone();
  c.target.set(damp(before.x, g.target.x, EASE, dt), damp(before.y, g.target.y, EASE, dt), damp(before.z, g.target.z, EASE, dt));
  cam.position.add(c.target.clone().sub(before));
  cam.zoom = damp(cam.zoom, g.zoom, EASE, dt);
  return c.target.distanceTo(g.target) < 0.003 && Math.abs(cam.zoom - g.zoom) < 0.05;
}

/** Cinema mode: a slow yaw sway and breathing zoom, applied as the change since the last frame. */
function driftCamera(c: Controls, cam: OrthoCam, d: Drift, elapsed: number) {
  if (d.t0 < 0) d.t0 = elapsed;
  const t = elapsed - d.t0;
  const yaw = DRIFT_YAW * Math.sin((2 * Math.PI * t) / DRIFT_PERIOD);
  const breathe = 1 + BREATHE * Math.sin((2 * Math.PI * t) / BREATHE_PERIOD);
  cam.position.sub(c.target).applyAxisAngle(UP_Y, yaw - d.yaw).add(c.target);
  cam.zoom *= breathe / d.breathe;
  cam.updateProjectionMatrix();
  d.yaw = yaw;
  d.breathe = breathe;
}

/**
 * Isometric ortho camera that frames the whole plan (focusRoom = null) or one room, easing between them,
 * and drifts slowly in cinema mode until the user touches the controls.
 */
export default function Rig() {
  const ctl = useRef<Controls>(null);
  const cinema = useStore((s) => s.cinema);
  const goal = useRef<Goal | null>(null);
  const drift = useRef<Drift>({ t0: 0, yaw: 0, breathe: 1, stopped: false });
  const iso = useMemo(() => new Vector3(1, 1, 1).multiplyScalar(ISO * CAM_DISTANCE), []);
  const defaultCam = useThree((s) => s.camera);
  const isoCam = useRef<OrthoCam | null>(null);
  if (isOrtho(defaultCam)) isoCam.current = defaultCam; // a walkthrough makes its own camera the default: the controls stay on this one, with its target, so leaving finds the view as it was
  const walking = useWalkActive();
  useFraming(ctl, goal);

  useEffect(() => {
    drift.current = { t0: -1, yaw: 0, breathe: 1, stopped: false };
  }, [cinema]);

  useFrame((state, dt) => {
    const c = ctl.current;
    const cam = state.camera;
    if (!c || !isOrtho(cam)) return;
    setCameraYaw((c.getAzimuthalAngle() * 180) / Math.PI);
    const g = goal.current;
    if (g) {
      if (easeToGoal(c, cam, g, iso, dt)) goal.current = null;
      cam.updateProjectionMatrix();
      keepAlive(false); // the camera is still easing to its goal
      return;
    }
    if (wallOrbitStep(c, cam, dt)) keepAlive(false); // the wall display turns the home slowly (lib/wallCamera.ts)
    const d = drift.current;
    if (!useStore.getState().cinema || d.stopped) return;
    keepAlive(false); // cinema drift never rests
    driftCamera(c, cam, d, state.clock.elapsedTime);
  });

  return (
    <>
      {/* near below zero: zoomed far out, the ground in front of the camera's own position (the screen's lower edge) is still drawn, not sliced off in a hard line */}
      <OrthographicCamera makeDefault position={[iso.x, iso.y, iso.z]} near={-200} far={300} />
      <OrbitControls
        ref={ctl}
        makeDefault
        camera={isoCam.current ?? undefined}
        enabled={!walking} // the walker's own controls (components/scene/walk) take over until the flight back has landed
        enableDamping
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2.15}
        onStart={() => {
          goal.current = null; // user input beats any animation
          drift.current.stopped = true;
        }}
        onEnd={() => {
          // Room mode draws its near walls cut and its far walls tall for the side the camera looks from: follow the owner's own turning too
          if (useStore.getState().isolatedRoom && ctl.current) setIsoFacing(round1(azimuthOf(ctl.current)));
        }}
      />
    </>
  );
}
