import { BufferAttribute, BufferGeometry, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import type { MeshData } from "@/lib/carBuilder";
import type { Layer } from "@/lib/carSurf";
import type { Finish } from "@/lib/cars";

// Materials and GPU geometry of the procedural cars. Paint reflects the scene environment (scene.environment from the Studio / garden)
// through a clear coat; glass is dark and strongly reflective with a hint of transparency (no transmission pass); chrome is metal;
// the black layer (trim, tyres, liners) takes its colours from the vertices.

export const AWAY_OPACITY = 0.22; // a car whose device_tracker says not_home stands as a ghost

const PAINT: Record<Finish, { metalness: number; roughness: number; clearcoat: number; clearcoatRoughness: number }> = {
  gloss: { metalness: 0.55, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 },
  metallic: { metalness: 0.85, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 },
  matte: { metalness: 0.2, roughness: 0.7, clearcoat: 0, clearcoatRoughness: 0.4 },
};

const geoCache = new WeakMap<MeshData, BufferGeometry>();

/** One BufferGeometry per layer of a built car, shared by every car of that model. */
export function geometryOf(d: MeshData): BufferGeometry {
  let g = geoCache.get(d);
  if (!g) {
    g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(d.pos, 3));
    g.setAttribute("normal", new BufferAttribute(d.nor, 3));
    g.setAttribute("color", new BufferAttribute(d.col, 3));
    g.setIndex(new BufferAttribute(d.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    geoCache.set(d, g);
  }
  return g;
}

export function makeMaterials(color: string, finish: Finish, ghost: boolean): Record<Layer, MeshStandardMaterial> {
  const fade = ghost ? { transparent: true, opacity: AWAY_OPACITY, depthWrite: false } : {};
  return {
    paint: new MeshPhysicalMaterial({ color, envMapIntensity: 1.2, ...PAINT[finish], ...fade }),
    glass: new MeshPhysicalMaterial({ color: "#0d151c", metalness: 0.9, roughness: 0.05, clearcoat: 1, envMapIntensity: 2.2, transparent: true, opacity: ghost ? AWAY_OPACITY : 0.94, depthWrite: !ghost }),
    chrome: new MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.2, envMapIntensity: 1.3, ...fade }),
    black: new MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.72, ...fade }),
    lamp: new MeshStandardMaterial({ color: "#8f9aa7", metalness: 0.5, roughness: 0.14, emissive: "#e4eefb", emissiveIntensity: 0, toneMapped: false, ...fade }),
    tail: new MeshStandardMaterial({ color: "#5c0d15", metalness: 0.2, roughness: 0.2, emissive: "#ff2a2a", emissiveIntensity: 0, toneMapped: false, ...fade }),
  };
}
