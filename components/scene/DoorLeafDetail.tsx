"use client";
import { useEffect, useMemo } from "react";
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, type BufferGeometry } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useKnobs } from "@/lib/quality";
import { barMat } from "./openingParts";
import { sharedMaterial } from "./shellMaterials";

const LEAF_T = 0.04; // the slab the SolidLeaf already draws
const RAISE = 0.006; // how far the rails and stiles stand proud of it
const STILE = 0.11;
const TOP_RAIL = 0.12;
const BOTTOM_RAIL = 0.18;
const MID_RAIL = 0.1;
const GOLD = "#c9a95a";

type Piece = { x: number; y: number; w: number; h: number };

/** Rails and stiles of a four-panel shaker door, in the leaf's own frame (origin in its centre). */
function framePieces(W: number, H: number): Piece[] {
  const inner = W - 2 * STILE;
  const fieldTop = H / 2 - TOP_RAIL;
  const fieldBottom = -H / 2 + BOTTOM_RAIL;
  const mid = fieldBottom + (fieldTop - fieldBottom) * 0.42;
  const pieces: Piece[] = [
    { x: -W / 2 + STILE / 2, y: 0, w: STILE, h: H },
    { x: W / 2 - STILE / 2, y: 0, w: STILE, h: H },
    { x: 0, y: H / 2 - TOP_RAIL / 2, w: inner, h: TOP_RAIL },
    { x: 0, y: -H / 2 + BOTTOM_RAIL / 2, w: inner, h: BOTTOM_RAIL },
    { x: 0, y: mid, w: inner, h: MID_RAIL },
  ];
  if (inner > 0.5 && fieldTop - mid > MID_RAIL) pieces.push({ x: 0, y: (mid + fieldTop) / 2 + MID_RAIL / 4, w: STILE * 0.8, h: fieldTop - mid - MID_RAIL / 2 }); // a muntin splits the upper field
  return pieces.filter((p) => p.w > 0.01 && p.h > 0.01); // a low gate has no room for rails and fields
}

/** Rounded boxes come non-indexed and the stock ones indexed; merging needs them all alike. */
const flat = (g: BufferGeometry) => (g.index ? g.toNonIndexed() : g);

function box(w: number, h: number, d: number, x: number, y: number, z: number, seg: number, r: number): BufferGeometry {
  const g = seg > 0 ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01)) : new BoxGeometry(w, h, d);
  return flat(g).translate(x, y, z);
}

const cyl = (r: number, h: number, x: number, y: number, z: number, axisZ: boolean) => {
  const g = new CylinderGeometry(r, r, h, axisZ ? 16 : 10);
  return flat(axisZ ? g.rotateX(Math.PI / 2) : g).translate(x, y, z);
};

/**
 * Raised rails and stiles on both faces of a solid door leaf, a lever handle with rose and key plate, and three hinge barrels, in the leaf's own frame:
 * `hinge` -1 = hinged on its left edge. Meant to sit inside the leaf's swing group at the leaf centre; two merged meshes (painted wood, brass).
 */
export default function DoorLeafDetail({ width, height, y0, hinge, color, handle = true, x }: { width: number; height: number; y0: number; hinge: 1 | -1; color: string; handle?: boolean; x: number }) {
  const k = useKnobs();
  const seg = k.bevelSegments > 0 ? 1 : 0;
  const wood = useMemo(() => {
    const parts: BufferGeometry[] = [];
    for (const side of [1, -1]) for (const p of framePieces(width, height)) parts.push(box(p.w, p.h, RAISE, p.x, p.y, side * (LEAF_T / 2 + RAISE / 2 - 0.0005), seg, 0.002));
    return mergeGeometries(parts);
  }, [width, height, seg]);
  const brass = useMemo(() => {
    const parts: BufferGeometry[] = [];
    const hx = -hinge * (width / 2 - 0.06); // handle: near the lock edge, lever pointing at the hinge
    const hy = Math.min(1.0, height * 0.48) - height / 2;
    for (const side of [1, -1]) {
      const z = side * (LEAF_T / 2 + RAISE);
      parts.push(cyl(0.027, 0.008, hx, hy, z + side * 0.004, true));
      parts.push(box(0.11, 0.018, 0.018, hx + hinge * 0.04, hy, z + side * 0.02, seg, 0.007));
      parts.push(cyl(0.009, 0.03, hx, hy, z + side * 0.016, true));
      parts.push(box(0.028, 0.075, 0.004, hx, hy - 0.09, z + side * 0.002, 0, 0));
    }
    for (const fy of [0.22, 0.5, 0.78]) parts.push(cyl(0.009, 0.1, hinge * (width / 2 + 0.003), (fy - 0.5) * (height - 0.3), 0, false));
    return mergeGeometries(handle ? parts : parts.slice(-3));
  }, [width, height, hinge, handle, seg]);
  useEffect(() => () => wood?.dispose(), [wood]);
  useEffect(() => () => brass?.dispose(), [brass]);
  const gold = sharedMaterial("brass", () => new MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.3 }));
  return (
    <group position={[x, y0 + height / 2, 0]}>
      {wood && <mesh geometry={wood} material={barMat(color)} castShadow />}
      {brass && <mesh geometry={brass} material={gold} castShadow />}
    </group>
  );
}
