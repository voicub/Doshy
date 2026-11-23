"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import type { OrbitControls } from "three-stdlib";
import { useVp } from "@/lib/useVp";
import { contentShift, panToFree } from "@/lib/viewInset";
import { useEditUi } from "./editStore";
import { useFreeArea } from "./useFreeArea";
import { useInsets } from "./insetStore";
import { isOrtho } from "../camera";

const EASE = 8; // pan damping: settles in ~0.4 s
const SETTLED = 0.002; // metres


/**
 * Compact screens: the top strip, the bottom bars and the open panel cover part of the canvas. This shifts the picture so the middle of what stays visible shows the middle of the scene,
 * and when a panel opens it pans the camera so the selected piece is not behind it. Inside the Canvas of the furniture and Home Assistant views. Renders nothing; does nothing on bigger screens.
 */
export default function ViewInset() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitControls | null;
  const { vp } = useVp();
  const { panel, free } = useFreeArea(size.width, size.height);
  const pan = useRef(new Vector3()); // world distance still to travel

  useEffect(() => {
    if (!isOrtho(camera)) return;
    if (vp !== "regular") {
      const s = contentShift(size.width, size.height, free);
      camera.setViewOffset(size.width, size.height, -s.x, -s.y, size.width, size.height);
      useInsets.getState().setFree(free);
    } else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    return () => {
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      useInsets.getState().setFree(null);
    };
  }, [camera, vp, size.width, size.height, free]);

  // a panel opened or grew: bring the selected piece into the part that is still visible (next frame, once the selection box is measured through the new picture)
  const covered = panel.left + panel.right + panel.top + panel.bottom > 0;
  const asked = useRef("");
  useFrame((_, dt) => {
    if (!controls || !isOrtho(camera)) return;
    const key = `${free.x0}|${free.y0}|${free.x1}|${free.y1}`;
    if (asked.current !== key) {
      asked.current = key;
      const r = useEditUi.getState().selRect;
      if (vp !== "regular" && covered && r) {
        const d = panToFree(r, free);
        if (d.x || d.y) {
          const perPx = (camera.right - camera.left) / camera.zoom / size.width; // metres per screen px
          const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
          const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
          pan.current.copy(right.multiplyScalar(-d.x * perPx)).addScaledVector(up, d.y * perPx);
        }
      }
    }
    if (pan.current.lengthSq() === 0) return;
    const k = 1 - Math.exp(-EASE * Math.min(dt, 0.1));
    const step = pan.current.clone().multiplyScalar(k);
    camera.position.add(step);
    controls.target.add(step);
    pan.current.sub(step);
    if (pan.current.length() < SETTLED) pan.current.set(0, 0, 0);
    controls.update();
  });
  return null;
}
