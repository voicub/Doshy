"use client";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { DataTexture, MeshBasicMaterial, NearestFilter, PlaneGeometry, RGBAFormat, SRGBColorSpace, UnsignedByteType } from "three";
import { useDaylightPreview } from "@/lib/daylightPreview";
import { SAMPLE_LIFT } from "@/lib/daylightRay";
import { heatPixels } from "@/lib/daylightRun";
import { useLevelVisibility } from "./levelState";

const LIFT = 0.07; // above the floor plate (0.06), under the light pools (0.075), the live layers (0.088) and the alert outline (0.095)

/** One floor-sized quad, a cell per texel: dim and costless (no frame loop of its own: it repaints only when the panel changes what it shows). */
function Quad({ x, z, w, d, y }: { x: number; z: number; w: number; d: number; y: number }) {
  const result = useDaylightPreview((s) => s.result);
  const mode = useDaylightPreview((s) => s.mode);
  const lit = useDaylightPreview((s) => (s.mode === "now" ? s.lit : null)); // the hours picture does not move with the time of day
  const invalidate = useThree((s) => s.invalidate);

  const geometry = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const pixels = useMemo(() => {
    if (!result) return null;
    const { cols, rows } = result.grid;
    const data = new Uint8Array(cols * rows * 4);
    const texture = new DataTexture(data, cols, rows, RGBAFormat, UnsignedByteType);
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = NearestFilter; // a hard cell edge says what the data is: one sample per cell
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    return { data, texture, material };
  }, [result]);
  useEffect(() => () => {
    geometry.dispose();
  }, [geometry]);
  useEffect(() => () => {
    pixels?.texture.dispose();
    pixels?.material.dispose();
  }, [pixels]);

  useEffect(() => {
    if (!result || !pixels) return;
    pixels.data.set(heatPixels(result, mode, lit, true)); // south row first: a texture's v runs up the plane, which is north here
    pixels.texture.needsUpdate = true;
    invalidate();
  }, [result, pixels, mode, lit, invalidate]);

  if (!pixels) return null;
  return <mesh geometry={geometry} material={pixels.material} position={[x, y, z]} scale={[w, 1, d]} renderOrder={5} raycast={() => null} />;
}

/** Sun hours (or the sunlit patches right now) painted on the analysed room's floor, while "Sunlight in this room" is open. */
export default function SunHeat() {
  const on = useDaylightPreview((s) => s.active && s.heat);
  const grid = useDaylightPreview((s) => s.result?.grid);
  const levelId = useDaylightPreview((s) => s.levelId);
  const { visible } = useLevelVisibility();
  if (!on || !grid || !levelId || visible[levelId] === false) return null; // a storey the level view hides takes its overlay with it
  const w = grid.cols * grid.cell;
  const d = grid.rows * grid.cell;
  // grid.z is the sample height (floor + 2 cm): the quad rides the floor plate of the same storey
  return <Quad x={grid.x0 + w / 2} z={grid.y0 + d / 2} w={w} d={d} y={grid.z - SAMPLE_LIFT + LIFT} />;
}
