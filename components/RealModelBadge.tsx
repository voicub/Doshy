"use client";
import { useCarModels } from "@/lib/carModelStore";
import "./carModelFinder.css";

/** Small "Real model" mark on a catalog card whose car has a real 3D model on this device. */
export default function RealModelBadge({ kind }: { kind: string }) {
  const real = useCarModels((s) => !!s.models[kind]);
  return real ? <span className="cmf-real">Real model</span> : null;
}
