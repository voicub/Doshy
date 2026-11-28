"use client";
import { useEffect, useMemo, useRef } from "react";
import { BufferGeometry, Float32BufferAttribute, type MeshStandardMaterial } from "three";
import { marksOf, pavementOf, pavementWidthOf } from "@/lib/ground";
import type { Tris } from "@/lib/groundGeo";
import { groundGain, groundSurface, scaleColor } from "@/lib/groundLook";
import { FLOORS } from "@/lib/materials";
import { useKnobs } from "@/lib/quality";
import { kerbTris, markTris, pavementTris } from "@/lib/roadGeo";
import type { GroundPath } from "@/lib/types";
import { surfaceProps } from "./shellMaterials";
import { useWetSurface } from "./useWet";

const PAVEMENT_KIND = "slabs" as const; // pale paving slabs: reads as a pavement against any road surface
const KERB_COLOR = "#a09d96";
const MARK_LIFT = 0.003; // over the road surface (itself polygon-offset against the lawn): paint never fights it

/** Flat triangles (see lib/groundGeo.ts Tris) as a geometry: normals computed per face, uvs when the part has them. */
export function trisGeometry(t: Tris): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(t.pos, 3));
  if (t.uv.length) g.setAttribute("uv", new Float32BufferAttribute(t.uv, 2));
  g.computeVertexNormals(); // not indexed: flat normals
  return g;
}

const partOf = (t: Tris): BufferGeometry | null => (t.pos.length ? trisGeometry(t) : null);

/**
 * What a road has on top of its surface (GroundShape draws the surface, fringe and rim): lane markings and the pavements beside it. At most three meshes, whatever the
 * length of the road or the number of dashes: the paint (one mesh, a colour per vertex), the pavement tops and the kerb faces. Eco paints flat colours and gives the pavement
 * a plain tint; Balanced and above lay a slab texture on it and let it cast the sun's shadow.
 */
export default function RoadDetails({ g, lift, bias }: { g: GroundPath; lift: number; bias: number }) {
  const k = useKnobs();
  const marks = marksOf(g);
  const sides = pavementOf(g);
  const pw = pavementWidthOf(g);
  const def = FLOORS[PAVEMENT_KIND];
  const surf = k.textures > 0 ? groundSurface(PAVEMENT_KIND) : undefined;
  const tileM = surf?.tile ?? def.tileM;
  const tint = surf ? scaleColor(def.color, groundGain(PAVEMENT_KIND)) : def.color;
  const maps = useMemo(() => (surf ? surfaceProps(surf, k, def.rough) : null), [surf, k, def.rough]);
  const lineKey = JSON.stringify([g.points, g.width, g.smooth ?? false]); // the shape digest: a recolour or a rename rebuilds nothing

  const paint = useMemo(() => {
    const m = marks === "none" ? null : markTris(g);
    if (!m?.pos.length) return null;
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(m.pos, 3));
    geo.setAttribute("color", new Float32BufferAttribute(m.color, 3));
    geo.computeVertexNormals();
    return geo;
  }, [lineKey, marks]);
  const top = useMemo(() => (sides === "none" ? null : partOf(pavementTris(g, tileM))), [lineKey, sides, pw, tileM]);
  const kerb = useMemo(() => (sides === "none" ? null : partOf(kerbTris(g))), [lineKey, sides, pw]);
  useEffect(() => () => paint?.dispose(), [paint]);
  useEffect(() => () => top?.dispose(), [top]);
  useEffect(() => () => kerb?.dispose(), [kerb]);

  const mat = useRef<MeshStandardMaterial>(null);
  useWetSurface(mat, tint, maps?.roughness ?? def.rough, Math.min(0.3, def.rough), 0.3, top !== null);
  const shade = k.shadows && k.textures > 0; // Balanced and above: the pavement stands proud enough to throw a shadow
  return (
    <>
      {paint && (
        <mesh geometry={paint} position-y={lift + MARK_LIFT} receiveShadow raycast={() => null}>
          <meshStandardMaterial vertexColors roughness={0.75} polygonOffset polygonOffsetFactor={bias - 2} polygonOffsetUnits={bias - 2} />
        </mesh>
      )}
      {top && (
        <mesh geometry={top} position-y={lift} castShadow={shade} receiveShadow raycast={() => null}>
          <meshStandardMaterial key={surf ? "pbr" : "flat"} ref={mat} {...(maps ?? { roughness: def.rough })} color={tint} metalness={def.metal} />
        </mesh>
      )}
      {kerb && (
        <mesh geometry={kerb} position-y={lift} castShadow={shade} receiveShadow raycast={() => null}>
          <meshStandardMaterial color={KERB_COLOR} roughness={0.9} />
        </mesh>
      )}
    </>
  );
}
