"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MathUtils, Spherical, Vector3 } from "three";
import type { OrbitControls } from "three-stdlib";
import { fitIso } from "@/lib/editMath";
import { planBounds } from "@/lib/geometry";
import { useStore } from "@/lib/store";
import { keepAlive } from "@/lib/framePacer";
import { useEditUi, type Preset } from "./editStore";
import { isOrtho } from "../camera";

const EASE = 5; // damp rate: ~0.6 s to settle
const ISO_POLAR = Math.atan2(Math.SQRT2, 1); // the true isometric camera sits on the (1,1,1) diagonal
const ISO_AZIMUTH = Math.PI / 4;
const TOP_POLAR = 0.001; // not 0: the camera's up vector would be parallel to its view direction
const FRONT_POLAR = 1.38; // a low angle, just inside the Rig's max polar limit
const RIG_MIN_POLAR = 0.25; // restored when the top view is left
const ANGLES: Record<Preset, { az: number; pol: number }> = {
  iso: { az: ISO_AZIMUTH, pol: ISO_POLAR },
  reset: { az: ISO_AZIMUTH, pol: ISO_POLAR },
  top: { az: 0, pol: TOP_POLAR }, // azimuth 0 puts plan-up at the top of the screen
  front: { az: 0, pol: FRONT_POLAR },
};

type Goal = { az: number; pol: number; target?: Vector3; zoom?: number };
const wrap = (a: number) => MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI;

/** Eases the orbit camera to ISO / TOP / FRONT / RESET on request from the HUD chips; user input cancels the move. Zoom and pan keep working afterwards. */
export default function CameraPresets() {
  const controls = useThree((s) => s.controls) as OrbitControls | null;
  const camera = useThree((s) => s.camera);
  const get = useThree((s) => s.get);
  const req = useEditUi((s) => s.camera);
  const goal = useRef<Goal | null>(null);
  const first = useRef(req.n);
  const sph = useRef(new Spherical());
  const off = useRef(new Vector3());

  useEffect(() => {
    if (!controls || req.n === first.current) return; // entering the view keeps the user's camera
    first.current = req.n;
    const { az, pol } = ANGLES[req.preset];
    const g: Goal = { az, pol };
    if (req.preset === "reset") {
      const b = planBounds(useStore.getState().plan);
      const { size } = get();
      if (b && size.width) {
        const f = fitIso(b, size.width, size.height);
        g.target = new Vector3(f.x, f.y, f.z);
        g.zoom = f.zoom;
      }
    }
    controls.minPolarAngle = pol < RIG_MIN_POLAR ? 0 : RIG_MIN_POLAR;
    goal.current = g;
  }, [req, controls, get]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => (goal.current = null);
    controls.addEventListener("start", stop);
    return () => {
      controls.removeEventListener("start", stop);
      controls.minPolarAngle = RIG_MIN_POLAR; // the Rig's own limit: the other views never look straight down
    };
  }, [controls]);

  useEffect(() => () => useEditUi.getState().setPreset("iso"), []);

  useFrame((_, dt) => {
    const g = goal.current;
    const cam = camera;
    if (!g || !controls || !isOrtho(cam)) return;
    const k = 1 - Math.exp(-EASE * Math.min(dt, 0.1));
    if (g.target) controls.target.lerp(g.target, k);
    off.current.copy(cam.position).sub(controls.target);
    const s = sph.current.setFromVector3(off.current);
    s.theta += wrap(g.az - s.theta) * k;
    s.phi += (g.pol - s.phi) * k;
    cam.position.copy(controls.target).add(off.current.setFromSpherical(s));
    if (g.zoom !== undefined) cam.zoom += (g.zoom - cam.zoom) * k;
    cam.updateProjectionMatrix();
    const done = Math.abs(wrap(g.az - s.theta)) < 0.002 && Math.abs(g.pol - s.phi) < 0.002 && (!g.zoom || Math.abs(g.zoom - cam.zoom) < 0.05) && (!g.target || controls.target.distanceTo(g.target) < 0.003);
    if (done) goal.current = null;
    else keepAlive(false);
  });

  return null;
}
