import { useLayoutEffect } from "react";
import type { BufferAttribute, BufferGeometry } from "three";
import { metricUv } from "@/lib/shellDetail";

/**
 * Turns a geometry's uvs by `deg` degrees (about the uv origin: the texture repeats, so the pivot only shifts the pattern). A floor photo is turned this way and not with
 * the texture's own `rotation`, so every room can wear the same shared texture at its own angle.
 */
export function turnUv(geo: BufferGeometry, deg: number): void {
  if (!deg) return;
  const uv = geo.getAttribute("uv") as BufferAttribute;
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  const a = uv.array as Float32Array;
  for (let i = 0; i < a.length; i += 2) [a[i], a[i + 1]] = [a[i] * c - a[i + 1] * s, a[i] * s + a[i + 1] * c];
  uv.needsUpdate = true;
}

/** World-metre uvs (one repeat of the photo spans `tile` metres) turned by `deg`, for a floor geometry already in world coordinates (one with holes cut in it). No-op without a geometry or tile. */
export function usePhotoUv(geo: BufferGeometry | null, tile: number | undefined, deg: number) {
  useLayoutEffect(() => {
    if (!geo || !tile) return;
    const uv = geo.getAttribute("uv") as BufferAttribute;
    metricUv(geo.getAttribute("position").array, geo.getAttribute("normal").array, uv.array as Float32Array, [0, 0, 0], () => ({ tile })); // from scratch each time: turning twice would compound
    turnUv(geo, deg);
    uv.needsUpdate = true;
  }, [geo, tile, deg]);
}
