"use client";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentRef, type MutableRefObject, type RefObject } from "react";
import { MathUtils, Vector3, type OrthographicCamera as OrthoCam } from "three";
import { planBounds, roomBounds, type Bounds } from "@/lib/geometry";
import { setCameraYaw } from "@/lib/cameraYaw";
import { findLevel } from "@/lib/levels";
import { useStore } from "@/lib/store";
import { keepAlive } from "@/lib/framePacer";
import { useLevelVisibility } from "./levelState";
import { boxOf } from "./edit/Outlines";
import { useItemFocus } from "./itemFocus";
import { useIsoZone } from "./isoState";
import { DEFAULT_AZIMUTH, DEFAULT_ELEVATION, frameRects, viewAxes } from "@/lib/roomIsolate";
import { isOrtho } from "./camera";

const { damp, DEG2RAD } = MathUtils;
const CAM_DISTANCE = 40;
const ISO = 1 / Math.sqrt(3); // true isometric: camera on the (1,1,1) diagonal
const MIN_ZOOM = 10;
const MAX_ZOOM = 220;
const FIT_H = 2.2; // metres of height included when fitting a footprint
const FRAME_ZOOM = 90; // px per metre: close enough to read a room's devices
const LETTERBOX = 2.39; // cinema-mode bar aspect (matches the HUD's letterbox)
const PAD_PLAN = 1.3;
const PAD_ROOM = 1.5;
const EASE = 3.4; // damp rate: ~1.1 s to settle
const ROOM_PANEL_W = 380; // px: the device list docked at the right in Room mode (matches .rd-dock in roomIsolate.css)
const ROOM_PANEL_MIN_WIDTH = 900; // below this the list is a bottom sheet and the room keeps the whole width
const DRIFT_YAW = 6 * DEG2RAD;
const DRIFT_PERIOD = 42; // s
const BREATHE = 0.012;
const BREATHE_PERIOD = 19; // s

// screen axes of the isometric camera, in world space
const RIGHT = new Vector3(1, 0, -1).normalize();
const UP = new Vector3(-1, 2, -1).normalize();
const UP_Y = new Vector3(0, 1, 0);

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

type Goal = { target: Vector3; zoom: number; snap: boolean };
type Controls = ComponentRef<typeof OrbitControls>;
type Drift = { t0: number; yaw: number; breathe: number; stopped: boolean };

/**
 * Frames the whole plan, one focused room, the isolated Room-mode footprint or a list row's item by setting `goal`, whenever the framing inputs change:
 * Room mode (clear of the docked device list), focused room, whole plan, or the plan changed shape.
 */
function useFraming(ctl: RefObject<Controls | null>, goal: MutableRefObject<Goal | null>) {
  const get = useThree((s) => s.get);
  const focusRoom = useStore((s) => s.focusRoom);
  const plan = useStore((s) => s.plan);
  const cinema = useStore((s) => s.cinema);
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

  const zone = useIsoZone();
  useEffect(() => {
    const { size } = get();
    if (!size.width) return;
    const visibleH = cinema ? Math.min(size.height, size.width / LETTERBOX) : size.height; // keep the subject inside the cinema bars
    if (zone) {
      const c = ctl.current;
      const axes = viewAxes(c ? c.getAzimuthalAngle() / DEG2RAD : DEFAULT_AZIMUTH, c ? 90 - c.getPolarAngle() / DEG2RAD : DEFAULT_ELEVATION);
      const panel = size.width > ROOM_PANEL_MIN_WIDTH ? ROOM_PANEL_W : 0;
      const f = frameRects(zone.rects, size.width, visibleH, { pad: PAD_ROOM, yLow: zone.y0, yHigh: zone.y1, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, axes, inset: { left: 0, right: panel, top: 0, bottom: 0 } });
      goal.current = { target: new Vector3(...f.target), zoom: f.zoom, snap: false };
      return;
    }
    const b = room ? roomBounds(room) : bounds;
    if (!b) return;
    const f = fit(b, size.width, visibleH, room ? PAD_ROOM : PAD_PLAN, yLow, yHigh);
    goal.current = { ...f, snap: first.current };
    first.current = false;
    // keyed by the framing inputs (roomKey/boundsKey are stable digests), so a plan edit that moves nothing does not re-frame the camera
  }, [zone, focusRoom, roomKey, boundsKey, cinema, get, yLow, yHigh]);

  // A list row asked to see one item: ease the camera onto it, zoomed in at least to FRAME_ZOOM.
  const frame = useItemFocus((s) => s.frame);
  useEffect(() => {
    const b = frame && boxOf(useStore.getState().plan, { type: "item", id: frame.id });
    if (!b) return;
    const cam = get().camera;
    goal.current = { target: new Vector3(b.x, (b.y0 + b.y1) / 2, b.z), zoom: Math.max(isOrtho(cam) ? cam.zoom : 0, FRAME_ZOOM), snap: false };
  }, [frame, get]);
}

/** Moves the camera toward its goal (or snaps to it); true once it has arrived. */
function easeToGoal(c: Controls, cam: OrthoCam, g: Goal, iso: Vector3, dt: number): boolean {
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
        enableDamping
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2.15}
        onStart={() => {
          goal.current = null; // user input beats any animation
          drift.current.stopped = true;
        }}
      />
    </>
  );
}
