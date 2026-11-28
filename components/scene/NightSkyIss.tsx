"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, LineSegments, Matrix3, Points } from "three";
import { issAt, issLook, issLookAt } from "@/lib/iss";
import { useIss } from "@/lib/issUse";
import { sceneDirection } from "@/lib/nightskyFrame";
import { useNightSkySettings } from "@/lib/nightskySettings";
import type { NightSkyFrame } from "@/lib/nightskyUse";
import { lineLayer, pointLayer, type SkyUniforms } from "./nightSkyShader";

const TRAIL_SECONDS = 90;
const TRAIL_STEP_SECONDS = 5;
const TRAIL_SEGMENTS = TRAIL_SECONDS / TRAIL_STEP_SECONDS;
// Beyond the core's 48-hour prediction horizon the anchored circular model is not useful.
const MODEL_HORIZON_MS = 48 * 3600 * 1000;

/** Geometric orbit marker, not a claim that the station is sunlit or naked-eye visible. */
export default function NightSkyIss({ frame, shared }: { frame: NightSkyFrame; shared: SkyUniforms }) {
  // This component only mounts inside the visible Detailed+ dome. The hook owns polling/visibility.
  const enabled = useNightSkySettings((s) => s.iss);
  const { fix, prevFix, status } = useIss(enabled, frame.place);
  const invalidate = useThree((s) => s.invalidate);
  const animate = useRef<((date: Date) => void) | null>(null);
  const timing = useMemo(() => ({ anchor: 0, last: 0, date: new Date(0), trailDate: new Date(0) }), []);
  useFrame(() => {
    const now = performance.now();
    if (now - timing.last < 1000) return;
    timing.last = now;
    timing.date.setTime(frame.date.getTime() + Math.min(now - timing.anchor, 30_000));
    // A passive subscriber: one orbit sample per second only while some other feature draws.
    animate.current?.(timing.date);
  });
  const layers = useMemo(() => {
    const identity = new Matrix3();
    const dotGeometry = new BufferGeometry();
    dotGeometry.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
    dotGeometry.setAttribute("aRGB", new BufferAttribute(new Float32Array([0.85, 0.95, 1]), 3));
    dotGeometry.setAttribute("aMag", new BufferAttribute(new Float32Array([-2]), 1));
    const trailGeometry = new BufferGeometry();
    trailGeometry.setAttribute("position", new BufferAttribute(new Float32Array(TRAIL_SEGMENTS * 6), 3));
    const dot = new Points(dotGeometry, pointLayer(shared, identity));
    const trail = new LineSegments(trailGeometry, lineLayer(shared, identity, [0.12, 0.2, 0.28]));
    for (const object of [dot, trail]) {
      object.frustumCulled = false;
      object.visible = false;
      object.renderOrder = -9;
      object.onBeforeRender = () => { object.material.uniformsNeedUpdate = true; };
    }
    return { dot, trail };
  }, [shared]);

  useEffect(() => {
    timing.anchor = performance.now();
    timing.last = timing.anchor;
  }, [frame.date, timing]);

  useEffect(() => {
    animate.current = (date) => {
      layers.dot.visible = false;
      layers.trail.visible = false;
      if (!enabled || status !== "ready" || !fix || Math.abs(date.getTime() - fix.timestamp * 1000) > MODEL_HORIZON_MS) return;
      const { lat, lon } = frame.place;
      const look = issLookAt(fix, prevFix, date, lat, lon);
      if (look.elevation <= 0) return;
      const position = layers.dot.geometry.getAttribute("position") as BufferAttribute;
      position.setXYZ(0, ...sceneDirection(look.elevation, look.azimuth, frame.bearing));
      position.needsUpdate = true;
      layers.dot.visible = true;
      const trailPosition = layers.trail.geometry.getAttribute("position") as BufferAttribute;
      const sampleDate = timing.trailDate;
      let count = 0;
      // Only once per second on already-awake frames; GPU buffers remain allocated.
      let previous = look;
      for (let secondsAgo = TRAIL_STEP_SECONDS; secondsAgo <= TRAIL_SECONDS; secondsAgo += TRAIL_STEP_SECONDS) {
        sampleDate.setTime(date.getTime() - secondsAgo * 1000);
        const next = issLook(issAt(fix, prevFix, sampleDate), lat, lon);
        if (previous.elevation > 0 && next.elevation > 0) {
          trailPosition.setXYZ(count++, ...sceneDirection(previous.elevation, previous.azimuth, frame.bearing));
          trailPosition.setXYZ(count++, ...sceneDirection(next.elevation, next.azimuth, frame.bearing));
        }
        previous = next;
      }
      trailPosition.needsUpdate = true;
      layers.trail.geometry.setDrawRange(0, count);
      layers.trail.visible = count > 0;
    };
    timing.date.setTime(frame.date.getTime() + Math.min(performance.now() - timing.anchor, 30_000));
    animate.current(timing.date);
    invalidate();
    return () => { animate.current = null; };
  }, [enabled, status, fix, prevFix, frame, layers, invalidate, timing]);

  useEffect(() => () => {
    layers.dot.geometry.dispose();
    layers.dot.material.dispose();
    layers.trail.geometry.dispose();
    layers.trail.material.dispose();
  }, [layers]);

  return <><primitive object={layers.trail} /><primitive object={layers.dot} /></>;
}
