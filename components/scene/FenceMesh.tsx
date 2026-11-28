"use client";
import { useEffect, useMemo } from "react";
import { BoxGeometry, Float32BufferAttribute } from "three";
import { fenceParts } from "@/lib/fences";
import type { Box } from "@/lib/geometry";
import type { WallStyle } from "@/lib/types";
import BoxInstances, { type BoxSpec } from "./BoxInstances";
import { useKnobs } from "@/lib/quality";

/** How a style's three draw calls are finished. Posts follow the wall colour unless `post` is set; `extra` is the second colour (finials, bindings). */
type Look = { rough: number; metal: number; post?: string; postRough?: number; postMetal?: number; extra?: string; opacity?: number };
const DEFAULT_LOOK: Look = { rough: 0.8, metal: 0 };
const LOOKS: Partial<Record<WallStyle, Look>> = {
  fence_wire: { rough: 0.45, metal: 0.6, post: "#5b6168", postRough: 0.5, postMetal: 0.5 },
  fence_slat: { rough: 0.75, metal: 0, post: "#2f3338", postRough: 0.5, postMetal: 0.4 },
  fence_bar: { rough: 0.45, metal: 0.6 },
  fence_iron: { rough: 0.5, metal: 0.55 },
  fence_glass: { rough: 0.05, metal: 0.1, post: "#9aa1a8", postRough: 0.35, postMetal: 0.7, opacity: 0.35 },
  fence_electric: { rough: 0.6, metal: 0, post: "#4a4f55", postRough: 0.6 },
  fence_bamboo: { rough: 0.7, metal: 0, extra: "#6f5f33" },
};
const LEAF_CELL = 0.25; // metres per leafy facet along the hedge

/** Smooth-ish noise from position alone, so vertices that share a spot (box faces meet there) move together and the hedge has no cracks. */
const noise = (x: number, y: number, z: number) => (Math.sin(x * 13.1 + y * 7.7) + Math.sin(z * 11.3 + x * 5.3) + Math.sin(y * 17.9 + z * 9.1)) / 3;

/** A rounded, leafy block: a segmented box pulled towards an ellipsoid at its corners and nudged by noise, with a little light and dark per vertex. */
function hedgeGeometry(w: number, h: number, t: number): BoxGeometry {
  const g = new BoxGeometry(w, h, t, Math.max(2, Math.round(w / LEAF_CELL)), 6, 3);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = x / (w / 2);
    const v = y / (h / 2);
    const s = z / (t / 2);
    const k = (0.55 + (0.45 * Math.max(Math.abs(u), Math.abs(v), Math.abs(s))) / (Math.hypot(u, v, s) || 1)) * (1 + 0.06 * noise(x, y, z));
    pos.setXYZ(i, x * k, y * k, z * k);
    const shade = 0.78 + 0.22 * (0.5 + 0.5 * noise(x * 2.3, y * 2.3, z * 2.3));
    col.set([shade, shade, shade], i * 3);
  }
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  return g;
}

function HedgeBlock({ box, len, t, color }: { box: Box; len: number; t: number; color: string }) {
  const s0 = box.s0 === 0 ? -t / 2 : box.s0; // end blocks reach half a thickness further so corners close
  const s1 = box.s1 === len ? len + t / 2 : box.s1;
  const geo = useMemo(() => hedgeGeometry(s1 - s0, box.y1 - box.y0, t), [s0, s1, box.y0, box.y1, t]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[(s0 + s1) / 2 - len / 2, (box.y0 + box.y1) / 2, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} vertexColors flatShading roughness={1} />
    </mesh>
  );
}

/**
 * A fence or hedge drawn as real geometry: posts plus pickets, wire or boards (one draw call per colour), or rounded leafy blocks. `boxes` are the
 * wall's solid stretches between its gates (lib/geometry `wallBoxes`); the part above a gate is left open on a fence and closed on a hedge.
 * Inside the wall's local frame: x along the wall, centred on it.
 */
export default function FenceMesh({ style, boxes, len, t, color }: { style: WallStyle; boxes: Box[]; len: number; t: number; color: string }) {
  const coarse = useKnobs().detail === 0; // Eco: wider pitch and no finials or bindings
  const parts = useMemo(() => {
    const posts: BoxSpec[] = [];
    const fill: BoxSpec[] = [];
    const extra: BoxSpec[] = [];
    if (style === "hedge") return { posts, fill, extra };
    for (const b of boxes) {
      if (b.y0 > 0.01) continue;
      const p = fenceParts(style, b.s0, b.s1, b.y1, t, coarse);
      const at = ({ x, ...r }: (typeof p.posts)[number]): BoxSpec => ({ ...r, x: x - len / 2 });
      posts.push(...p.posts.map(at));
      fill.push(...p.fill.map(at));
      extra.push(...p.extra.map(at));
    }
    return { posts, fill, extra };
  }, [style, boxes, len, t, coarse]);
  if (style === "hedge") return <>{boxes.map((b, i) => <HedgeBlock key={i} box={b} len={len} t={t} color={color} />)}</>;
  const look = LOOKS[style] ?? DEFAULT_LOOK;
  return (
    <>
      <BoxInstances boxes={parts.posts} color={look.post ?? color} roughness={look.postRough ?? look.rough} metalness={look.postMetal ?? look.metal} />
      <BoxInstances boxes={parts.fill} color={color} roughness={look.rough} metalness={look.metal} opacity={look.opacity} shadow={!look.opacity} />
      <BoxInstances boxes={parts.extra} color={look.extra ?? color} roughness={look.rough} metalness={look.metal} />
    </>
  );
}
