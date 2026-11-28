"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { sceneBridge } from "@/lib/snapshotBridge";

/** Hands the canvas's state to the Share dialog's picture and video features (lib/snapshotBridge.ts) and runs the turntable's per-frame step while one is recording. Renders nothing; free while idle. */
export default function SnapshotBridge() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    sceneBridge.get = get;
    return () => {
      if (sceneBridge.get === get) sceneBridge.get = null;
    };
  }, [get]);
  useFrame((state) => sceneBridge.onFrame?.(state));
  return null;
}
